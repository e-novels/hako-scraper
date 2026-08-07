import { parseHTML } from 'linkedom'
import { logger } from '../utilities'
import { resolveBookRatingUrl } from './bookDetail'
import { BASE_URL, doclnClient } from './client'
import { fetchImageAsDataUrl } from './image'

function resolveUrl(urlStr: string): string {
  if (!urlStr) return ''
  try {
    return new URL(urlStr, BASE_URL).toString()
  } catch {
    return urlStr
  }
}

function parseHakoDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString()
  const trimmed = dateStr.trim()
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/)
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10)
    const month = parseInt(dmyMatch[2], 10) - 1
    const year = parseInt(dmyMatch[3], 10)
    const hour = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0
    const minute = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0
    const second = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0
    const d = new Date(Date.UTC(year, month, day, hour, minute, second))
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  const parsed = Date.parse(trimmed)
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString()
  return new Date().toISOString()
}

export function parseReviewsHtml(html: string): ScraperReview[] {
  const { document } = parseHTML(html)
  const reviews: ScraperReview[] = []
  const seenIds = new Set<number>()

  const candidateNodes = Array.from(document.querySelectorAll('[wire\\:snapshot], .mt-5'))
  const items = candidateNodes.filter(node => {
    return node.querySelector('a[href*="/thanh-vien/"], .ln-username, .ln-comment-content') !== null
  })

  items.forEach((node, index) => {
    const snapshot = node.getAttribute('wire:snapshot') || ''
    let interactionId = 0
    if (snapshot) {
      const keyMatch = snapshot.match(/&quot;key&quot;\s*:\s*(\d+)/) || snapshot.match(/"key"\s*:\s*(\d+)/)
      if (keyMatch) {
        interactionId = parseInt(keyMatch[1], 10)
      }
    }

    const userLink = node.querySelector('a[href*="/thanh-vien/"], .ln-username')
    const href = userLink?.getAttribute('href') || ''
    const userMatch = href.match(/\/thanh-vien\/(\d+)/)
    const userId = userMatch ? parseInt(userMatch[1], 10) : 0
    const userName = userLink?.textContent?.trim() || 'Ẩn danh'

    if (!interactionId) {
      interactionId = userId ? (userId * 100 + index + 1) : index + 1
    }
    while (seenIds.has(interactionId)) {
      interactionId += 1
    }
    seenIds.add(interactionId)

    const imgEl = node.querySelector('img.rounded-full, img[src*="noava"], img')
    const avatarSrc = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src') || ''
    const avatar = resolveUrl(avatarSrc)

    // Calculate rating value (number of yellow stars)
    const yellowStarEls = node.querySelectorAll('.text-yellow-400')
    let value = yellowStarEls.length
    if (value <= 0 || value > 5) {
      const yellowIcons = node.querySelectorAll('.fas.fa-star:not(.text-gray-300 *)')
      value = yellowIcons.length > 0 && yellowIcons.length <= 5 ? yellowIcons.length : 5
    }

    // Extract comment message without "Xem thêm"
    const contentEl = node.querySelector('.ln-comment-content, .long-text') || node.querySelector('.ln-comment-wrapper')
    let message = ''
    if (contentEl) {
      const clone = contentEl.cloneNode(true) as Element
      clone.querySelectorAll('.comment_see_more, .see-more, .expand').forEach(el => el.remove())
      message = (clone.textContent || '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0 && line.toLowerCase() !== 'xem thêm')
        .join('\n')
    }

    const timeEl = node.querySelector('time.timeago, time')
    const timeStr = timeEl?.getAttribute('datetime') || timeEl?.getAttribute('title') || timeEl?.textContent || ''
    const createdAt = parseHakoDate(timeStr)

    reviews.push({
      interaction_id: interactionId,
      user_id: userId,
      user_name: userName,
      avatar,
      value,
      message,
      created_at: createdAt
    })
  })

  return reviews
}

export async function fetchReviews(bookRef: string): Promise<ScraperReview[]> {
  const ratingUrl = await resolveBookRatingUrl(bookRef)
  const html = await doclnClient.fetchText(ratingUrl)
  const reviews = parseReviewsHtml(html)

  await Promise.all(
    reviews.map(async review => {
      if (review.avatar) {
        try {
          review.avatar = await fetchImageAsDataUrl(review.avatar)
        } catch {
          // ignore avatar fetch errors
        }
      }
    })
  )

  return reviews
}
