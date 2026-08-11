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

  let chapterId = parseInteger(chapterRef)
  if (!chapterId) chapterId = 1

  let bookId = 1
  const canonicalLink = document.querySelector('link[rel="canonical"], meta[property="og:url"]')
  if (canonicalLink) {
    const href = canonicalLink.getAttribute('href') || canonicalLink.getAttribute('content') || ''
    logger.info("canonicalLink", href);

    const bMatch = href.match(/\/truyen\/(\d+)/)
    if (bMatch) bookId = parseInt(bMatch[1], 10)
    const cMatch = href.match(/\/c(\d+)/)
    if (cMatch) chapterId = parseInt(cMatch[1], 10)
  }

  const now = new Date().toISOString()

  return {
    chapter_id: chapterId,
    chapter_name: chapterName,
    chapter_number: 1,
    volume_id: 1,
    book_id: bookId,
    content: paragraphs,
    total_index: paragraphs.length,
    status: 'ongoing',
    created_at: now,
    updated_at: now
  }
}

export async function resolveChapterUrl(chapterRef: string): Promise<string> {
  const cleanRef = String(chapterRef).trim()
  if (cleanRef.startsWith('http://') || cleanRef.startsWith('https://')) return cleanRef
  if (cleanRef.startsWith('/') && cleanRef.includes('-')) return cleanRef

  const cleanId = cleanRef.replace(/^\/+/, '').replace(/^c/, '')
  const directPath = `/c${cleanId}`

  try {
    const html = await doclnClient.fetchText(directPath)
    if (html && !html.trim().startsWith('{')) return directPath
  } catch {
    // direct fetch failed
  }

  return directPath
}

export async function fetchChapter(chapterRef: string): Promise<ScraperChapter> {
  const targetPath = await resolveChapterUrl(chapterRef)
  const html = await doclnClient.fetchText(targetPath)
  return parseChapterHtml(html, chapterRef)
}
