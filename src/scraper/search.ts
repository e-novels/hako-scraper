import { parseHTML } from 'linkedom'
import { logger } from '../utilities'
import { saveBookSlug } from './bookDetail'
import { BASE_URL, doclnClient } from './client'
import { fetchImageAsDataUrl } from './image'

export const HAKO_CATEGORIES: Array<{ label: string; value: string }> = [
  { label: 'Action', value: '1' },
  { label: 'Adapted to Anime', value: '49' },
  { label: 'Adapted to Drama CD', value: '51' },
  { label: 'Adapted to Manga', value: '50' },
  { label: 'Adapted to Manhua', value: '64' },
  { label: 'Adapted to Manhwa', value: '65' },
  { label: 'Adventure', value: '2' },
  { label: 'Age Gap', value: '52' },
  { label: 'Boys Love', value: '60' },
  { label: 'Character Growth', value: '54' },
  { label: 'Chinese Novel', value: '39' },
  { label: 'Comedy', value: '3' },
  { label: 'Cooking', value: '43' },
  { label: 'Different Social Status', value: '56' },
  { label: 'Drama', value: '4' },
  { label: 'Ecchi', value: '5' },
  { label: 'English Novel', value: '40' },
  { label: 'Fanfiction', value: '62' },
  { label: 'Fantasy', value: '6' },
  { label: 'Female Protagonist', value: '59' },
  { label: 'Game', value: '45' },
  { label: 'Gender Bender', value: '7' },
  { label: 'Harem', value: '8' },
  { label: 'Historical', value: '35' },
  { label: 'Horror', value: '9' },
  { label: 'Isekai', value: '30' },
  { label: 'Josei', value: '33' },
  { label: 'Korean Novel', value: '34' },
  { label: 'Magic', value: '44' },
  { label: 'Martial Arts', value: '37' },
  { label: 'Mecha', value: '11' },
  { label: 'Military', value: '36' },
  { label: 'Misunderstanding', value: '58' },
  { label: 'Mystery', value: '12' },
  { label: 'Netorare', value: '32' },
  { label: 'Obsession', value: '69' },
  { label: 'One shot', value: '38' },
  { label: 'Otome Game', value: '46' },
  { label: 'Parody', value: '61' },
  { label: 'Psychological', value: '23' },
  { label: 'Reverse Harem', value: '47' },
  { label: 'Romance', value: '22' },
  { label: 'Satire', value: '66' },
  { label: 'School Life', value: '13' },
  { label: 'Science Fiction', value: '14' },
  { label: 'Seinen', value: '31' },
  { label: 'Shoujo', value: '15' },
  { label: 'Shoujo ai', value: '16' },
  { label: 'Shounen', value: '26' },
  { label: 'Shounen ai', value: '17' },
  { label: 'Slice of Life', value: '18' },
  { label: 'Slow Life', value: '55' },
  { label: 'Sports', value: '19' },
  { label: 'Super Power', value: '24' },
  { label: 'Supernatural', value: '20' },
  { label: 'Suspense', value: '25' },
  { label: 'Tragedy', value: '21' },
  { label: 'Wars', value: '53' },
  { label: 'Web Novel', value: '29' },
  { label: 'Workplace', value: '57' },
  { label: 'Wuxia', value: '67' },
  { label: 'Xianxia', value: '68' },
  { label: 'Yandere', value: '63' },
  { label: 'Yuri', value: '48' }
]

function formatFilterParam(value: ScraperFilterValue | undefined): string {
  if (value === undefined || value === null) return ''
  if (Array.isArray(value)) return value.join(',')
  return String(value)
}

function resolveUrl(urlStr: string): string {
  if (!urlStr) return ''
  try {
    return new URL(urlStr, BASE_URL).toString()
  } catch {
    return urlStr
  }
}

export function parseCategoriesFromHtml(html: string): Array<{ label: string; value: string }> {
  try {
    const { document } = parseHTML(html)
    const options: Array<{ label: string; value: string }> = []
    const seenValues = new Set<string>()

    const elements = document.querySelectorAll('.genre_label, [data-genre-id], .search-advance input[type="checkbox"], .search-advance_genre, .search-advance option')
    elements.forEach(el => {
      const val = el.getAttribute('value') || el.getAttribute('data-genre-id') || el.getAttribute('data-id')
      let text = el.textContent?.trim() || ''
      if (el.tagName.toLowerCase() === 'input') {
        const id = el.getAttribute('id')
        if (id) {
          const labelEl = document.querySelector(`label[for="${id}"]`)
          if (labelEl) text = labelEl.textContent?.trim() || text
        }
        if (!text && el.parentElement) {
          text = el.parentElement.textContent?.trim() || ''
        }
      }
      if (val && text && !seenValues.has(val)) {
        seenValues.add(val)
        options.push({ label: text, value: val })
      }
    })

    if (options.length > 0) return options
  } catch {
    // ignore parse error, fallback
  }
  return HAKO_CATEGORIES
}

export async function getFilterOptions(
  request: ScraperFilterOptionsRequest
): Promise<ScraperFilterOptionsResponse> {
  const { fieldId, query } = request
  if (fieldId === 'selectgenres' || fieldId === 'rejectgenres') {
    let categories = HAKO_CATEGORIES
    try {
      const html = await doclnClient.fetchText('/tim-kiem-nang-cao')
      const parsed = parseCategoriesFromHtml(html)
      if (parsed.length > 0) categories = parsed
    } catch {
      // Use fallback list if network call fails
    }

    if (query) {
      const q = query.toLowerCase()
      categories = categories.filter(c => c.label.toLowerCase().includes(q))
    }
    return { options: categories }
  }
  return { options: [] }
}

export function parseSearchResultsHtml(html: string, page: number, pageSize: number): ScraperSearchResponse {
  const { document } = parseHTML(html)
  const items: ScraperBookSummary[] = []
  const seenIds = new Set<number>()

  const itemNodes = Array.from(document.querySelectorAll('.thumb-item-flow, .thumb-section-flow, .series-detail, .series-item'))

  for (const node of itemNodes) {
    const titleEl = node.querySelector('.series-title a, .series-title')
    if (!titleEl) continue

    const bookName = (titleEl.textContent || titleEl.getAttribute('title') || '').trim()
    if (!bookName) continue

    const href = titleEl.getAttribute('href') || titleEl.querySelector('a')?.getAttribute('href') || ''
    const match = href.match(/\/truyen\/(\d+)/)
    if (!match) continue

    const bookId = parseInt(match[1], 10)
    if (!bookId || seenIds.has(bookId)) continue

    seenIds.add(bookId)
    saveBookSlug(bookId, href)

    let bookImage = ''
    const imgEl = node.querySelector('.img-in-ratio, img')
    if (imgEl) {
      const styleAttr = imgEl.getAttribute('style') || ''
      const bgMatch = styleAttr.match(/url\(['"]?(.*?)['"]?\)/i)
      if (bgMatch && bgMatch[1]) {
        bookImage = bgMatch[1]
      } else {
        bookImage = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || imgEl.getAttribute('data-bg') || ''
      }
    }
    bookImage = resolveUrl(bookImage)

    const authors: Array<{ author_id: number; author_name: string }> = []
    const authorEl = node.querySelector('.series-owner, .author, .thumb-detail .author')
    if (authorEl) {
      const authorText = authorEl.textContent?.replace(/tác giả:?/i, '').trim()
      if (authorText) {
        authors.push({ author_id: 1, author_name: authorText })
      }
    }

    items.push({
      book_id: bookId,
      book_name: bookName,
      book_image: bookImage,
      authors
    })
  }

  const pageLinks = Array.from(document.querySelectorAll('.pagination a, .pagination_wrap a, .paging_simple a'))
  let maxPage = page
  let hasNextPage = false

  for (const link of pageLinks) {
    const href = link.getAttribute('href') || ''
    const pageMatch = href.match(/page=(\d+)/)
    if (pageMatch) {
      const p = parseInt(pageMatch[1], 10)
      if (p > maxPage) maxPage = p
      if (p > page) hasNextPage = true
    }
    const textPage = parseInt(link.textContent?.trim() || '', 10)
    if (!isNaN(textPage) && textPage > maxPage) {
      maxPage = textPage
    }
  }

  const totalPages = maxPage > 1 ? maxPage : undefined

  return {
    items,
    pagination: {
      page,
      pageSize,
      totalPages,
      hasNextPage: hasNextPage || (totalPages !== undefined && page < totalPages)
    }
  }
}

export async function executeSearch(
  filters: Record<string, ScraperFilterValue>,
  page: number,
  pageSize: number
): Promise<ScraperSearchResponse> {
  const url = new URL('/tim-kiem-nang-cao', BASE_URL)

  const titleVal = formatFilterParam(filters.title) || formatFilterParam(filters.query)
  url.searchParams.set('title', titleVal)
  url.searchParams.set('author', formatFilterParam(filters.author))
  url.searchParams.set('illustrator', formatFilterParam(filters.illustrator))
  url.searchParams.set('selectgenres', formatFilterParam(filters.selectgenres))
  url.searchParams.set('rejectgenres', formatFilterParam(filters.rejectgenres))
  url.searchParams.set('status', formatFilterParam(filters.status) || '0')
  const sapxepVal = formatFilterParam(filters.sapxep)
  url.searchParams.set('sapxep', (sapxepVal === 'az' || sapxepVal === 'default') ? '' : sapxepVal)
  url.searchParams.set('seriestype', formatFilterParam(filters.seriestype) || '0')
  const searchUrl = url.toString()
  await logger.info(`Search URL: ${searchUrl}`)

  const html = await doclnClient.fetchText(searchUrl)
  const response = parseSearchResultsHtml(html, page, pageSize)
  await Promise.all(response.items.map(async (item) => {
    if (item.book_image) item.book_image = await fetchImageAsDataUrl(item.book_image)
  }))
  return response
}