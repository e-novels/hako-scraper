import { parseHTML } from 'linkedom'
import { logger } from '../utilities'
import { BASE_URL, doclnClient } from './client'
import { fetchImageAsDataUrl } from './image'

const bookSlugMap = new Map<string, string>()

export function saveBookSlug(bookId: number | string, href: string): void {
  if (!bookId || !href) return
  const idStr = String(bookId).trim()
  const cleanHref = href.startsWith('/') ? href : `/${href}`
  bookSlugMap.set(idStr, cleanHref)
}

function resolveUrl(urlStr: string): string {
  if (!urlStr) return ''
  try {
    return new URL(urlStr, BASE_URL).toString()
  } catch {
    return urlStr
  }
}

function parseInteger(str: string): number {
  if (!str) return 0
  const cleaned = str.replace(/[^\d]/g, '')
  const val = parseInt(cleaned, 10)
  return Number.isNaN(val) ? 0 : val
}

function parseHakoDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString()
  const trimmed = dateStr.trim()
  const dmyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2}))?$/)
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10)
    const month = parseInt(dmyMatch[2], 10) - 1
    const year = parseInt(dmyMatch[3], 10)
    const hour = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0
    const minute = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0
    const d = new Date(Date.UTC(year, month, day, hour, minute))
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  const parsed = Date.parse(trimmed)
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString()
  return new Date().toISOString()
}

export function parseBookDetailHtml(html: string, bookRef: string): ScraperBookDetail {
  const { document } = parseHTML(html)

  let bookId = 0
  if (typeof bookRef === 'number') {
    bookId = bookRef
  } else if (typeof bookRef === 'string') {
    const numMatch = bookRef.match(/(\d+)/)
    if (numMatch) bookId = parseInt(numMatch[1], 10)
  }

  const canonicalLink = document.querySelector('link[rel="canonical"], meta[property="og:url"]')
  if (canonicalLink) {
    const href = canonicalLink.getAttribute('href') || canonicalLink.getAttribute('content') || ''
    const match = href.match(/\/truyen\/(\d+)/)
    if (match) bookId = parseInt(match[1], 10)
  }

  // Name
  const titleEl = document.querySelector('.series-name a, .series-name, h1.series-name, .series-title a')
  const bookName = (titleEl?.textContent || titleEl?.getAttribute('title') || '').trim() || `Truyện ${bookId}`

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
  const authors: Array<{ author_id: number; author_name: string }> = []
  const artists: Array<{ artist_id: number; artist_name: string }> = []
  let status: 'show' | 'hidden' | 'ongoing' | 'completed' = 'ongoing'

  const infoItems = Array.from(document.querySelectorAll('.info-item, .series-information .info-name, .series-info .info-item, .series-owner'))
  infoItems.forEach((item, index) => {
    const labelEl = item.querySelector('.info-name, font')
    const valueEl = item.querySelector('.info-value')
    const textContent = item.textContent || ''

    if (textContent.includes('Tác giả') || labelEl?.textContent?.includes('Tác giả')) {
      const name = (valueEl?.textContent || textContent.replace(/tác giả:?/i, '')).trim()
      if (name && !authors.some(a => a.author_name === name)) {
        authors.push({ author_id: index + 1, author_name: name })
      }
    }
    if (textContent.includes('Họa sĩ') || labelEl?.textContent?.includes('Họa sĩ')) {
      const name = (valueEl?.textContent || textContent.replace(/họa sĩ:?/i, '')).trim()
      if (name && !artists.some(a => a.artist_name === name)) {
        artists.push({ artist_id: index + 1, artist_name: name })
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
      if (name) authors.push({ author_id: 1, author_name: name })
    }
  }

  // Genres
  const bookGenre: Array<{ category_id: number; category_name: string }> = []
  const genreEls = document.querySelectorAll('.series-gernes .series-gerne-item, .series-gernes a, .genre_label')
  genreEls.forEach((el, index) => {
    const genreName = el.textContent?.trim()
    const genreIdStr = el.getAttribute('data-genre-id') || el.getAttribute('data-id') || String(index + 1)
    const genreId = parseInteger(genreIdStr) || (index + 1)
    if (genreName && !bookGenre.some(g => g.category_name === genreName)) {
      bookGenre.push({ category_id: genreId, category_name: genreName })
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
    const volIdAttr = volNode.getAttribute('data-id') || volNode.getAttribute('id')
    const volumeId = parseInteger(volIdAttr || '') || (volIdx + 1)
    const volumeNumber = volIdx + 1

    const chapters: ScraperBookDetail['volumes'][number]['chapters'] = []
    const chapterEls = volNode.querySelectorAll('li')

    chapterEls.forEach((chapEl, chapIdx) => {
      const chapLinkEl = chapEl.querySelector('.chapter-name a, a')
      if (!chapLinkEl) return

      const chapName = (chapLinkEl.textContent || chapLinkEl.getAttribute('title') || '').trim()
      const chapHref = chapLinkEl.getAttribute('href') || ''
      const chapMatch = chapHref.match(/\/c(\d+)/)
      const chapterId = chapMatch ? parseInt(chapMatch[1], 10) : (volIdx * 1000 + chapIdx + 1)

      // Chapter number belongs strictly to its parent volume, starting from 1 per volume
      const chapterNumber = chapIdx + 1

      const timeEl = chapEl.querySelector('.chapter-time')
      const timeStr = timeEl?.textContent?.trim() || ''
      const isoDate = parseHakoDate(timeStr)

      chapters.push({
        chapter_id: chapterId,
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
      volume_id: volumeId,
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
        const chapHref = chapLinkEl.getAttribute('href') || ''
        const chapMatch = chapHref.match(/\/c(\d+)/)
        const chapterId = chapMatch ? parseInt(chapMatch[1], 10) : chapIdx + 1

        const isoDate = new Date().toISOString()
        chapters.push({
          chapter_id: chapterId,
          chapter_name: chapName,
          chapter_number: chapIdx + 1,
          created_at: isoDate,
          updated_at: isoDate
        })
      })

      const firstChapDate = chapters[0]?.created_at || new Date().toISOString()
      volumes.push({
        volume_id: 1,
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
    await logger.info(`[BookDetail] Resolved slug for ID ${cleanId} from memory cache: ${cached}`)
    return cached
  }

  try {
    await logger.info(`[BookDetail] Searching slug for bookRef ${cleanId} via /tim-kiem-nang-cao...`)
    const searchHtml = await doclnClient.fetchText(`/tim-kiem-nang-cao?title=${encodeURIComponent(cleanId)}`)
    const { document } = parseHTML(searchHtml)
    const links = Array.from(document.querySelectorAll('a[href*="/truyen/"]'))
    for (const link of links) {
      const href = link.getAttribute('href') || ''
      const match = href.match(/\/truyen\/(\d+)/)
      if (match && match[1] === cleanId && href.includes('-')) {
        saveBookSlug(cleanId, href)
        await logger.info(`[BookDetail] Found resolved URL for bookRef ${cleanId}: ${href}`)
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
  await logger.info(`[BookDetail] Fetching book detail for ref: ${bookRef} -> ${targetPath}`)
  const html = await doclnClient.fetchText(targetPath)
  const detail = parseBookDetailHtml(html, bookRef)
  if (detail.book_image) {
    detail.book_image = await fetchImageAsDataUrl(detail.book_image)
  }
  return detail
}