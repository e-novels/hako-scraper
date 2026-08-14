import { parseHTML } from 'linkedom'
import { logger } from '../utilities'
import { parseHakoDate, parseInteger } from './chapter'
import { doclnClient } from './client'
import { fetchImageAsDataUrl, resolveUrl } from './image'

const bookSlugMap = new Map<string, string>()

export function saveBookSlug(bookId: number | string, href: string): void {
  if (!bookId || !href) return
  const idStr = String(bookId).trim()
  const cleanHref = href.startsWith('/') ? href : `/${href}`
  bookSlugMap.set(idStr, cleanHref)
  const numMatch = idStr.match(/^(\d+)/)
  if (numMatch && numMatch[1] !== idStr) {
    bookSlugMap.set(numMatch[1], cleanHref)
  }
  const slugMatch = cleanHref.match(/\/truyen\/([^\s/?#]+)/)
  if (slugMatch && slugMatch[1]) {
    bookSlugMap.set(slugMatch[1], cleanHref)
  }
}



export function parseBookDetailHtml(html: string, bookRef: string): ScraperBookDetail {
  const { document } = parseHTML(html)

  let bookId = ''
  const canonicalLink = document.querySelector('link[rel="canonical"], meta[property="og:url"], .series-name a, h1.series-name a, .series-title a')
  if (canonicalLink) {
    const href = canonicalLink.getAttribute('href') || canonicalLink.getAttribute('content') || ''
    const match = href.match(/\/truyen\/([^\s/?#]+)/)
    if (match) bookId = match[1]
  }
  if (!bookId) {
    const cleanRef = String(bookRef).trim().replace(/^\/+/, '').replace(/^truyen\//, '')
    bookId = cleanRef
  }

  // Name
  const titleEl = document.querySelector('.series-name a, .series-name, h1.series-name, .series-title a')
  const bookName = (titleEl?.textContent || titleEl?.getAttribute('title') || '').trim() || (bookId ? `Truyện ${bookId}` : 'Truyện')

  // Alternate titles
  const bookSubNames: string[] = []
  const subNameEls = document.querySelectorAll('.series-name-group .series-name, .series-name-group span')
  subNameEls.forEach(el => {
    const text = el.textContent?.trim()
    if (text && text !== bookName && !bookSubNames.includes(text)) {
      bookSubNames.push(text)
    }
  })

  // Cover Image
  let bookImage = ''
  const coverEl = document.querySelector('.series-cover .img-in-ratio, .series-cover img, .img-in-ratio')
  if (coverEl) {
    const styleAttr = coverEl.getAttribute('style') || ''
    const bgMatch = styleAttr.match(/url\(['"]?(.*?)['"]?\)/i)
    if (bgMatch && bgMatch[1]) {
      bookImage = bgMatch[1]
    } else {
      bookImage = coverEl.getAttribute('src') || coverEl.getAttribute('data-src') || coverEl.getAttribute('data-bg') || ''
    }
  }
  bookImage = resolveUrl(bookImage)

  // Information items (Authors, Artists, Status)
  const authors: Array<{ author_id?: string; author_name: string }> = []
  const artists: Array<{ artist_id?: string; artist_name: string }> = []
  let status: 'show' | 'hidden' | 'ongoing' | 'completed' = 'ongoing'

  const infoItems = Array.from(document.querySelectorAll('.info-item, .series-information .info-name, .series-info .info-item, .series-owner'))
  infoItems.forEach((item) => {
    const labelEl = item.querySelector('.info-name, font')
    const valueEl = item.querySelector('.info-value')
    const textContent = item.textContent || ''

    if (textContent.includes('Tác giả') || labelEl?.textContent?.includes('Tác giả')) {
      const name = (valueEl?.textContent || textContent.replace(/tác giả:?/i, '')).trim()
      if (name && !authors.some(a => a.author_name === name)) {
        authors.push({ author_name: name })
      }
    }
    if (textContent.includes('Họa sĩ') || labelEl?.textContent?.includes('Họa sĩ')) {
      const name = (valueEl?.textContent || textContent.replace(/họa sĩ:?/i, '')).trim()
      if (name && !artists.some(a => a.artist_name === name)) {
        artists.push({ artist_name: name })
      }
    }
    if (textContent.includes('Tên khác') && valueEl?.textContent) {
      const altNames = valueEl.textContent.split(';').map(s => s.trim()).filter(Boolean)
      altNames.forEach(name => {
        if (!bookSubNames.includes(name)) bookSubNames.push(name)
      })
    }
    if (textContent.includes('Tình trạng') || labelEl?.textContent?.includes('Tình trạng')) {
      const statusText = (valueEl?.textContent || textContent).toLowerCase()
      if (statusText.includes('hoàn thành')) status = 'completed'
      else if (statusText.includes('tạm ngưng')) status = 'hidden'
      else if (statusText.includes('đang tiến hành')) status = 'ongoing'
    }
  })

  if (authors.length === 0) {
    const authorEl = document.querySelector('.series-owner, .author')
    if (authorEl) {
      const name = authorEl.textContent?.replace(/tác giả:?/i, '').trim()
      if (name) authors.push({ author_name: name })
    }
  }

  // Genres
  const bookGenre: Array<{ category_id?: string; category_name: string }> = []
  const genreEls = document.querySelectorAll('.series-gernes .series-gerne-item, .series-gernes a, .genre_label')
  genreEls.forEach((el) => {
    const genreName = el.textContent?.trim()
    const genreIdStr = el.getAttribute('data-genre-id') || el.getAttribute('data-id')
    if (genreName && !bookGenre.some(g => g.category_name === genreName)) {
      if (genreIdStr) {
        bookGenre.push({ category_id: String(genreIdStr), category_name: genreName })
      } else {
        bookGenre.push({ category_name: genreName })
      }
    }
  })

  // Description
  const summaryContainer = document.querySelector('.series-summary .summary-content, .summary-content') || document.querySelector('.series-summary')
  let description = ''
  if (summaryContainer) {
    const clone = summaryContainer.cloneNode(true) as Element
    const titleEls = clone.querySelectorAll('.series-summary-title, .sect-title, .summary-title, header, h3, h4, h5')
    titleEls.forEach(el => el.remove())

    const paragraphs = Array.from(clone.querySelectorAll('p'))
      .map(p => p.textContent?.trim() || '')
      .filter(Boolean)

    if (paragraphs.length > 0) {
      description = paragraphs.join('\n\n')
    } else {
      description = (clone.textContent || '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .join('\n')
    }
  }

  // Total Comments Count
  let totalComment = 0
  const commentCountEl = document.querySelector('.comments-count, .tab-title .comments-count, span.comments-count')
  if (commentCountEl) {
    totalComment = parseInteger(commentCountEl.textContent || '')
  } else {
    const commentTabEl = Array.from(document.querySelectorAll('.tab-title, .sect-title')).find(el => (el.textContent || '').includes('bình luận'))
    if (commentTabEl) {
      totalComment = parseInteger(commentTabEl.textContent || '')
    }
  }

  // Statistics
  let follow = 0
  const followEl = document.querySelector('#collect .feature-name, .side-feature-button.follow .feature-name, .feature-name')
  if (followEl) follow = parseInteger(followEl.textContent || '')

  let views = 0
  let totalIndex = 0
  let averageRating = 0
  let ratingCount = 0

  const statItems = document.querySelectorAll('.statistic-item')
  statItems.forEach(stat => {
    const statName = stat.querySelector('.statistic-name')?.textContent?.trim() || ''
    const statValue = stat.querySelector('.statistic-value')?.textContent?.trim() || ''

    if (statName.includes('Số từ')) {
      totalIndex = parseInteger(statValue)
    } else if (statName.includes('Lượt xem')) {
      views = parseInteger(statValue)
    } else if (statName.includes('Đánh giá')) {
      const parts = statValue.split('/')
      if (parts.length >= 1) {
        const ratingVal = parseFloat(parts[0].replace(',', '.'))
        if (!Number.isNaN(ratingVal)) averageRating = ratingVal
      }
      if (parts.length >= 2) {
        ratingCount = parseInteger(parts[1])
      }
    }
  })

  // Volumes & Chapters
  const volumes: ScraperBookDetail['volumes'] = []
  const volumeNodes = document.querySelectorAll('.volume-list, .sect-volume, .volume-content')

  volumeNodes.forEach((volNode, volIdx) => {
    const volTitleEl = volNode.querySelector('.sect-title, .volume-name, .sect-header')
    const volumeName = volTitleEl?.textContent?.trim() || `Tập ${volIdx + 1}`
    const rawVolId = volNode.getAttribute('data-id') || volNode.getAttribute('id') || volNode.querySelector('.sect-header')?.getAttribute('id') || ''
    const cleanVolId = rawVolId.replace(/^volume_/, '').trim()
    const volumeId = cleanVolId ? cleanVolId : undefined
    const volumeNumber = volIdx + 1

    const chapters: ScraperBookDetail['volumes'][number]['chapters'] = []
    const chapterEls = volNode.querySelectorAll('li')

    chapterEls.forEach((chapEl, chapIdx) => {
      const chapLinkEl = chapEl.querySelector('.chapter-name a, a')
      if (!chapLinkEl) return

      const chapName = (chapLinkEl.textContent || chapLinkEl.getAttribute('title') || '').trim()
      let chapHref = chapLinkEl.getAttribute('href') || ''
      if (chapHref.startsWith('http://') || chapHref.startsWith('https://')) {
        try {
          chapHref = new URL(chapHref).pathname
        } catch {}
      }
      if (!chapHref.startsWith('/')) {
        chapHref = `/${chapHref}`
      }

      // Chapter number belongs strictly to its parent volume, starting from 1 per volume
      const chapterNumber = chapIdx + 1

      const timeEl = chapEl.querySelector('.chapter-time')
      const timeStr = timeEl?.getAttribute('datetime') || timeEl?.getAttribute('title') || timeEl?.textContent?.trim() || ''
      const isoDate = parseHakoDate(timeStr)

      chapters.push({
        chapter_id: chapHref,
        chapter_name: chapName,
        chapter_number: chapterNumber,
        created_at: isoDate,
        updated_at: isoDate
      })
    })

    // Sort chapters within volume by chapter_number ascending
    chapters.sort((a, b) => a.chapter_number - b.chapter_number)

    const firstChapDate = chapters[0]?.created_at || new Date().toISOString()
    const lastChapDate = chapters[chapters.length - 1]?.created_at || firstChapDate

    volumes.push({
      ...(volumeId ? { volume_id: volumeId } : {}),
      volume_name: volumeName,
      volume_number: volumeNumber,
      created_at: firstChapDate,
      updated_at: lastChapDate,
      chapters
    })
  })

  // Fallback for flat chapter list if no volume container matched
  if (volumes.length === 0) {
    const chapterEls = document.querySelectorAll('.chapter-name a, .list-chapters a')
    if (chapterEls.length > 0) {
      const chapters: ScraperBookDetail['volumes'][number]['chapters'] = []
      chapterEls.forEach((chapLinkEl, chapIdx) => {
        const chapName = (chapLinkEl.textContent || chapLinkEl.getAttribute('title') || '').trim()
        let chapHref = chapLinkEl.getAttribute('href') || ''
        if (chapHref.startsWith('http://') || chapHref.startsWith('https://')) {
          try {
            chapHref = new URL(chapHref).pathname
          } catch {}
        }
        if (!chapHref.startsWith('/')) {
          chapHref = `/${chapHref}`
        }

        const isoDate = new Date().toISOString()
        chapters.push({
          chapter_id: chapHref,
          chapter_name: chapName,
          chapter_number: chapIdx + 1,
          created_at: isoDate,
          updated_at: isoDate
        })
      })

      const firstChapDate = chapters[0]?.created_at || new Date().toISOString()
      volumes.push({
        volume_name: 'Mặc định',
        volume_number: 1,
        created_at: firstChapDate,
        updated_at: firstChapDate,
        chapters
      })
    }
  }

  // Sort volumes by volume_number ascending
  volumes.sort((a, b) => a.volume_number - b.volume_number)

  return {
    book_id: bookId,
    book_name: bookName,
    book_sub_name: bookSubNames,
    book_image: bookImage,
    authors,
    artists,
    book_genre: bookGenre,
    status,
    description,
    volumes,
    follow,
    latest_update: volumes.length > 0 && volumes[volumes.length - 1].chapters.length > 0
      ? volumes[volumes.length - 1].chapters[volumes[volumes.length - 1].chapters.length - 1].created_at
      : null,
    rating_count: ratingCount,
    total_index: totalIndex,
    views,
    total_comment: totalComment,
    average_rating: averageRating
  }
}

export async function resolveBookUrl(bookRef: string): Promise<string> {
  const cleanRef = String(bookRef).trim()
  if (cleanRef.startsWith('http://') || cleanRef.startsWith('https://')) return cleanRef
  if (cleanRef.startsWith('/') && cleanRef.includes('-')) return cleanRef
  if (cleanRef.includes('-')) return `/truyen/${cleanRef.replace(/^\/+/, '').replace(/^truyen\//, '')}`

  const cleanId = cleanRef.replace(/^\/+/, '').replace(/^truyen\//, '')

  if (bookSlugMap.has(cleanId)) {
    const cached = bookSlugMap.get(cleanId)!
    return cached
  }

  try {
    const searchHtml = await doclnClient.fetchText(`/tim-kiem-nang-cao?title=${encodeURIComponent(cleanId)}`)
    const { document } = parseHTML(searchHtml)
    const links = Array.from(document.querySelectorAll('a[href*="/truyen/"]'))
    for (const link of links) {
      const href = link.getAttribute('href') || ''
      const match = href.match(/\/truyen\/([^\s/?#]+)/)
      if (match && (match[1] === cleanId || match[1].startsWith(`${cleanId}-`))) {
        saveBookSlug(cleanId, href)
        saveBookSlug(match[1], href)
        return href
      }
    }
  } catch (err) {
    await logger.warn(`[BookDetail] Search resolution failed for bookRef ${cleanId}:`, err)
  }

  return `/truyen/${cleanId}`
}

export async function resolveBookRatingUrl(bookRef: string): Promise<string> {
  const bookUrl = await resolveBookUrl(bookRef)
  const cleanUrl = bookUrl.replace(/\/+$/, '').replace(/\/danh-gia$/i, '')
  return `${cleanUrl}/danh-gia`
}

export async function fetchBookDetail(bookRef: string): Promise<ScraperBookDetail> {
  const targetPath = await resolveBookUrl(bookRef)
  const html = await doclnClient.fetchText(targetPath)
  const detail = parseBookDetailHtml(html, bookRef)
  if (detail.book_image) {
    detail.book_image = await fetchImageAsDataUrl(detail.book_image)
  }
  return detail
}