import { parseHTML } from 'linkedom'
import { logger } from '../utilities'
import { BASE_URL, doclnClient } from './client'
import { decryptChapterContent } from './decrypt'
import { extractArticleParagraphs, extractNotesMap } from './html'

function parseInteger(str: string): number {
  if (!str) return 0
  const cleaned = str.replace(/[^\d]/g, '')
  const val = parseInt(cleaned, 10)
  return Number.isNaN(val) ? 0 : val
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
  const titleEl = document.querySelector('.title-top, .chapter-title, h2, h1')
  const chapterName = titleEl?.textContent?.trim() || `Chương ${chapterRef}`

  let chapterId = resolveChapterUrl(chapterRef)
  let bookId = ''
  const canonicalLink = document.querySelector('link[rel="canonical"], meta[property="og:url"]')
  if (canonicalLink) {
    const href = canonicalLink.getAttribute('href') || canonicalLink.getAttribute('content') || ''
    const bMatch = href.match(/\/truyen\/([^\s/?#]+)/)
    if (bMatch) bookId = bMatch[1]

    const pathMatch = href.match(/\/truyen\/[^/]+\/c[^/?#]+/)
    if (pathMatch) {
      chapterId = pathMatch[0]
    }
  }

  const now = new Date().toISOString()

  return {
    chapter_id: chapterId,
    chapter_name: chapterName,
    chapter_number: 1,
    ...(bookId ? { book_id: bookId } : {}),
    content: paragraphs,
    total_index: paragraphs.length,
    status: 'ongoing',
    created_at: now,
    updated_at: now
  }
}

export function resolveChapterUrl(chapterRef: string): string {
  const cleanRef = String(chapterRef).trim()
  if (cleanRef.startsWith('http://') || cleanRef.startsWith('https://')) return cleanRef
  return cleanRef.startsWith('/') ? cleanRef : `/${cleanRef}`
}

export async function fetchChapter(chapterRef: string): Promise<ScraperChapter> {
  const targetPath = resolveChapterUrl(chapterRef)
  const html = await doclnClient.fetchText(targetPath)
  return parseChapterHtml(html, chapterRef)
}
