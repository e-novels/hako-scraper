import { parseHTML } from 'linkedom'
import { logger, storage } from '../utilities'
import { BASE_URL, doclnClient } from './client'
import { decryptChapterContent } from './decrypt'
import { extractArticleParagraphs, extractNotesMap } from './html'

export function parseInteger(str: string): number {
  if (!str) return 0
  const cleaned = str.replace(/[^\d]/g, '')
  const val = parseInt(cleaned, 10)
  return Number.isNaN(val) ? 0 : val
}

export function parseHakoDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString()
  const trimmed = dateStr.trim()
  if (trimmed.includes('T') || (trimmed.includes('-') && trimmed.includes(':') && !trimmed.match(/^\d{1,2}-/))) {
    const parsed = Date.parse(trimmed)
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString()
  }
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/)
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10)
    const month = parseInt(dmyMatch[2], 10) - 1
    const year = parseInt(dmyMatch[3], 10)
    const hour = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0
    const minute = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0
    const second = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0
    // Hako dates without timezone are UTC+7 (Vietnam time)
    const d = new Date(Date.UTC(year, month, day, hour - 7, minute, second))
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  const parsed = Date.parse(trimmed)
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString()
  return new Date().toISOString()
}

export function parseChapterNameFromDoc(document: any, chapterRef: string): string {
  const titleTop = document.querySelector('.title-top, #chapter-title')
  if (titleTop) {
    const h4 = titleTop.querySelector('h4, .text-base')
    if (h4 && h4.textContent?.trim()) {
      return h4.textContent.trim()
    }
    const headers = Array.from(titleTop.querySelectorAll('h1, h2, h3, h4, h5, h6'))
      .filter((h: any) => h.tagName !== 'H6' && !h.classList?.contains('text-xl'))
    if (headers.length > 0 && (headers[0] as any).textContent?.trim()) {
      return (headers[0] as any).textContent.trim()
    }
    const allHeaders = titleTop.querySelectorAll('h1, h2, h3, h4, h5, h6')
    if (allHeaders.length === 1 && (allHeaders[0] as any).textContent?.trim()) {
      return (allHeaders[0] as any).textContent.trim()
    }
    if (allHeaders.length === 0 && titleTop.textContent?.trim()) {
      return titleTop.textContent.trim()
    }
  }

  const explicitTitle = document.querySelector('.chapter-title, .chapter-name, h4.title-item')
  if (explicitTitle && explicitTitle.textContent?.trim()) {
    return explicitTitle.textContent.trim()
  }

  const pageTitle = document.querySelector('title')?.textContent?.trim() || ''
  const titleMatch = pageTitle.match(/Đọc\s+(?:".*?"|.*?)\s*-\s*(.*?)\s*-\s*Cổng Light Novel/i)
  if (titleMatch && titleMatch[1]?.trim()) {
    return titleMatch[1].trim()
  }

  const fallback = document.querySelector('h4, h3, h2, h1')?.textContent?.trim()
  if (fallback) return fallback

  const cleanRef = String(chapterRef || '').replace(/^\/+/, '').replace(/^truyen\/[^/]+\//, '')
  return cleanRef ? `Chương ${cleanRef}` : 'Chương'
}

export function parseChapterHtml(html: string, chapterRef: string): ScraperChapter {
  // Step 1: Try to decrypt encrypted chapter content
  const decryptedContent = decryptChapterContent(html)

  // Step 2: Extract notes from the original HTML (notes are not encrypted)
  const notesMap = extractNotesMap(html)

  // Step 3: Parse paragraphs
  let paragraphs: string[]

  if (decryptedContent) {
    // Encrypted chapter: wrap decrypted content in a container and parse
    const wrappedHtml = `<div class="chapter-content">${decryptedContent}</div>`
    paragraphs = extractArticleParagraphs(wrappedHtml, '.chapter-content', notesMap)
  } else {
    // Non-encrypted chapter: parse directly from original HTML
    paragraphs = extractArticleParagraphs(html, '#chapter-content, .chapter-content, article', notesMap)
  }

  const { document } = parseHTML(html)
  const chapterName = parseChapterNameFromDoc(document, chapterRef)

  let cleanChapterRef = String(chapterRef || '').trim().replace(/^\/+/, '')
  let chapterId = cleanChapterRef
  let bookId = ''

  const canonicalLink = document.querySelector('link[rel="canonical"], meta[property="og:url"]')
  if (canonicalLink) {
    const href = canonicalLink.getAttribute('href') || canonicalLink.getAttribute('content') || ''
    const bMatch = href.match(/\/truyen\/([^\s/?#]+)/)
    if (bMatch) bookId = `truyen/${bMatch[1]}`

    const pathMatch = href.match(/\/truyen\/[^/]+\/c[^/?#]+/)
    if (pathMatch) {
      chapterId = pathMatch[0].replace(/^\/+/, '')
    }
  }

  if (!bookId) {
    const sidebarBookLink = document.querySelector('.rd_sidebar-name h5 a, .rd_sidebar-header a.img')
    const sidebarHref = sidebarBookLink?.getAttribute('href') || ''
    const sbMatch = sidebarHref.match(/\/truyen\/([^\s/?#]+)/)
    if (sbMatch) bookId = `truyen/${sbMatch[1]}`
  }

  if (!bookId && chapterRef) {
    const refMatch = String(chapterRef).match(/\/truyen\/([^\s/?#]+)/) || String(chapterRef).match(/^truyen\/([^\s/?#]+)/)
    if (refMatch) bookId = `truyen/${refMatch[1]}`
  }

  if (!chapterId.startsWith('truyen/') && bookId) {
    const cMatch = chapterId.match(/c\d+[^\s/?#]*/)
    if (cMatch) {
      chapterId = `${bookId}/${cMatch[0]}`
    }
  }

  // Volume ID: calculate volume index and format as ${bookId}/${volumeNumber}
  let volumeNumber = 1
  const volLis = Array.from(document.querySelectorAll('#chap_list > li, .rd_sidebar-sub > li'))
  if (volLis.length > 0) {
    const curIdx = volLis.findIndex((li: any) => li.classList?.contains('current'))
    if (curIdx >= 0) {
      volumeNumber = curIdx + 1
    }
  }
  const volumeId = bookId ? `${bookId}/${volumeNumber}` : undefined

  // Chapter Number
  let chapterNumber = 1
  const subChaps = Array.from(document.querySelectorAll('#chap_list .sub-chap_list li a, .rd_sidebar-sub .sub-chap_list li a'))
  if (subChaps.length > 0) {
    const chapSlug = chapterId.split('/').pop() || ''
    const idx = subChaps.findIndex((a: any) => {
      const href = (a.getAttribute('href') || '').replace(/^\/+/, '')
      return (
        (chapSlug && href.includes(chapSlug)) ||
        (chapterId && (href === chapterId || href.endsWith(chapterId))) ||
        (cleanChapterRef && href.includes(cleanChapterRef))
      )
    })
    if (idx >= 0) {
      chapterNumber = idx + 1
    }
  } else {
    const numMatch = chapterName.match(/(?:chương|chap|c|tập)\s*(\d+(?:\.\d+)?)/i)
    if (numMatch) {
      const parsedNum = parseInt(numMatch[1], 10)
      if (!Number.isNaN(parsedNum) && parsedNum > 0) {
        chapterNumber = parsedNum
      }
    }
  }

  // Date / Time
  const timeEl = document.querySelector('.title-top time, .topic-time, time.timeago, time, [itemprop="datePublished"]')
  const timeStr =
    timeEl?.getAttribute('datetime') ||
    timeEl?.getAttribute('title') ||
    timeEl?.getAttribute('data-time') ||
    timeEl?.textContent?.trim() ||
    ''
  const isoDate = parseHakoDate(timeStr)

  // Word count / total index
  let totalIndex = paragraphs.length
  const titleTop = document.querySelector('.title-top, #chapter-title')
  const wordCountMatch = (titleTop?.textContent || '').match(/Độ dài:\s*([\d,.]+)\s*từ/i)
  if (wordCountMatch) {
    const parsedWordCount = parseInteger(wordCountMatch[1])
    if (parsedWordCount > 0) {
      totalIndex = parsedWordCount
    }
  }

  return {
    chapter_id: chapterId,
    chapter_name: chapterName,
    chapter_number: chapterNumber,
    ...(volumeId ? { volume_id: volumeId } : {}),
    ...(bookId ? { book_id: bookId } : {}),
    content: paragraphs,
    total_index: totalIndex,
    status: 'ongoing',
    created_at: isoDate,
    updated_at: isoDate
  }
}

export function resolveChapterUrl(chapterRef: string): string {
  const cleanRef = String(chapterRef).trim()
  if (cleanRef.startsWith('http://') || cleanRef.startsWith('https://')) return cleanRef
  return cleanRef.startsWith('/') ? cleanRef : `/${cleanRef}`
}

const CHAPTER_IMAGE_ACCEPT_HEADERS = {
  Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
}

function getStorageKeyForImage(imageUrl: string): string {
  const clean = imageUrl.split('?')[0].split('#')[0]
  const filename = clean.split('/').pop() || 'image.jpg'
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  return `chapter_images/${safeFilename}`
}

export async function convertChapterImagesToBase64(paragraphs: string[]): Promise<string[]> {
  if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
    return paragraphs
  }
  return Promise.all(
    paragraphs.map(async paragraph => {
      if (typeof paragraph === 'string' && paragraph.startsWith('@{') && paragraph.endsWith('}')) {
        const imageUrl = paragraph.slice(2, -1).trim()
        if (imageUrl && !imageUrl.startsWith('data:') && !imageUrl.startsWith('novel-ext:')) {
          try {
            const dataUrl = await doclnClient.fetchDataUrl(imageUrl, CHAPTER_IMAGE_ACCEPT_HEADERS)
            if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
              const storageKey = getStorageKeyForImage(imageUrl)
              try {
                await storage.set(storageKey, dataUrl)
                const assetUrl = await storage.createAssetUrl(storageKey)
                if (typeof assetUrl === 'string' && assetUrl.trim()) {
                  return `@{${assetUrl}}`
                }
              } catch (err) {
                await logger.warn(`[convertChapterImagesToBase64] Storage asset URL creation failed for ${imageUrl}:`, err)
              }
              if (dataUrl.length <= 95000) {
                return `@{${dataUrl}}`
              }
            }
          } catch (err) {
            await logger.warn(`[convertChapterImagesToBase64] Failed to fetch image as data URL for ${imageUrl}:`, err)
          }
        }
      }
      return paragraph
    })
  )
}

export async function fetchChapter(chapterRef: string): Promise<ScraperChapter> {
  const targetPath = resolveChapterUrl(chapterRef)
  const html = await doclnClient.fetchText(targetPath)
  const chapter = parseChapterHtml(html, chapterRef)
  chapter.content = await convertChapterImagesToBase64(chapter.content)
  return chapter
}

