import { parseHTML } from 'linkedom'
import { logger } from '../utilities'
import { resolveBookRatingUrl } from './bookDetail'
import { parseHakoDate } from './chapter'
import { doclnClient } from './client'
import { fetchImageAsDataUrl, resolveUrl } from './image'


export function parseReviewsHtml(html: string): ScraperReview[] {
  const { document } = parseHTML(html)
  const reviews: ScraperReview[] = []
  const seenIds = new Set<string>()

  const candidateNodes = Array.from(document.querySelectorAll('[wire\\:snapshot], .mt-5'))
  const items = candidateNodes.filter(node => {
    return node.querySelector('a[href*="/thanh-vien/"], .ln-username, .ln-comment-content') !== null
  })

  items.forEach((node) => {
    const snapshot = node.getAttribute('wire:snapshot') || ''
    let interactionId: string | undefined
    if (snapshot) {
      const keyMatch = snapshot.match(/&quot;key&quot;\s*:\s*(\d+)/) || snapshot.match(/"key"\s*:\s*(\d+)/)
      if (keyMatch) {
        interactionId = keyMatch[1]
      }
    }

    if (interactionId) {
      if (seenIds.has(interactionId)) return
      seenIds.add(interactionId)
    }

    const userLink = node.querySelector('a[href*="/thanh-vien/"], .ln-username')
    const href = userLink?.getAttribute('href') || ''
    const userMatch = href.match(/\/thanh-vien\/(\d+)/)
    const userId = userMatch ? userMatch[1] : undefined
    const userName = userLink?.textContent?.trim() || 'Ẩn danh'

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
      ...(interactionId !== undefined ? { interaction_id: interactionId } : {}),
      ...(userId !== undefined ? { user_id: userId } : {}),
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
