import { parseHTML } from 'linkedom'
import { normalizeImageUrl, wrapWeservUrl } from './image'

function normalizeParagraph(value: string | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * Extract image URL from an element, returning it wrapped as `@{weservUrl}`.
 * Returns null if no image is found.
 */
function extractImageEntry(element: Element): string | null {
  const image = element.querySelector('img')
  if (!image) return null

  const rawSource = (
    image.getAttribute('src') ||
    image.getAttribute('data-src') ||
    image.getAttribute('data-original') ||
    image.getAttribute('data-bg') ||
    ''
  ).trim()
  if (!rawSource) return null

  const source = normalizeImageUrl(rawSource)
  const weservSource = wrapWeservUrl(source)
  return `@{${weservSource}}`
}

/**
 * Extract content entries from a single paragraph element.
 * Returns an array of content strings:
 * - `@{url}` for images
 * - `!{noteContent}` for notes
 * - plain text for regular paragraphs
 *
 * A paragraph may produce multiple entries if it contains note markers.
 */
function extractParagraphEntries(
  element: Element,
  notesMap: Map<string, string>
): string[] {
  const entries: string[] = []

  const imageEntry = extractImageEntry(element)
  const text = normalizeParagraph(element.textContent)

  if (imageEntry) {
    entries.push(imageEntry)
    // If there's also text alongside the image (rare), add it separately
    if (text) entries.push(text)
    return entries
  }

  if (!text) return entries

  // Split text by note markers [noteXXXXX] and interleave with note entries
  return splitTextWithNotes(text, notesMap)
}

/**
 * Split a text string by `[noteXXXXX]` markers and return an array of:
 * - text segments (trimmed, non-empty)
 * - `!{noteContent}` entries for each matched note
 */
export function splitTextWithNotes(
  text: string,
  notesMap: Map<string, string>
): string[] {
  const notePattern = /\[note(\d+)\]/gi
  const entries: string[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = notePattern.exec(text)) !== null) {
    // Add text before the note marker
    const before = text.substring(lastIndex, match.index).trim()
    if (before) entries.push(before)

    // Add the note content
    const noteId = `note${match[1]}`
    const noteContent = notesMap.get(noteId)
    if (noteContent) {
      entries.push(`!{${noteContent}}`)
    }

    lastIndex = match.index + match[0].length
  }

  // Add remaining text after the last note marker
  const remaining = text.substring(lastIndex).trim()
  if (remaining) entries.push(remaining)

  return entries
}

/**
 * Extract a map of note ID → note content from the HTML page.
 *
 * Notes on docln.sbs are in a `div.note-reg` section with structure:
 * ```html
 * <div id="note41421">
 *   <span class="note-content_real long-text">Note content here</span>
 * </div>
 * ```
 */
export function extractNotesMap(html: string): Map<string, string> {
  const { document } = parseHTML(html)
  const notesMap = new Map<string, string>()

  // Look for note divs with id starting with "note"
  const noteRegSection = document.querySelector('.note-reg')
  if (!noteRegSection) return notesMap

  const noteDivs = noteRegSection.querySelectorAll('div[id^="note"]')
  for (const noteDiv of noteDivs) {
    const noteId = noteDiv.getAttribute('id')
    if (!noteId) continue

    // Prefer note-content_real, fallback to note-content
    const contentEl =
      noteDiv.querySelector('.note-content_real') ||
      noteDiv.querySelector('.note-content')
    if (!contentEl) continue

    const content = normalizeParagraph(contentEl.textContent)
    if (content) {
      notesMap.set(noteId, content)
    }
  }

  return notesMap
}

/**
 * Extract chapter paragraphs from HTML content.
 *
 * Each entry in the returned array is one of:
 * - `@{imageUrl}` — an illustration image
 * - `!{noteText}` — a translator's note
 * - plain text — a regular paragraph
 *
 * @param html The full HTML string (either raw page or decrypted content wrapped in a container)
 * @param contentSelector CSS selector for the chapter content container
 * @param notesMap Optional pre-extracted notes map. If not provided, notes are extracted from the HTML.
 */
export function extractArticleParagraphs(
  html: string,
  contentSelector: string,
  notesMap?: Map<string, string>
): string[] {
  const { document } = parseHTML(html)
  const content = document.querySelector(contentSelector)
  if (!content) {
    throw new Error(`Could not find chapter content with selector "${contentSelector}".`)
  }

  const resolvedNotesMap = notesMap ?? new Map<string, string>()

  const paragraphs = Array.from(content.querySelectorAll('p'))
    .flatMap(p => extractParagraphEntries(p, resolvedNotesMap))
    .filter(Boolean)

  if (paragraphs.length > 0) return paragraphs

  for (const lineBreak of content.querySelectorAll('br')) {
    lineBreak.replaceWith(document.createTextNode('\n'))
  }
  const fallback = (content.textContent ?? '')
    .split(/\r?\n/)
    .map(normalizeParagraph)
    .filter(Boolean)
  if (fallback.length === 0) throw new Error('The chapter content did not contain readable text.')
  return fallback
}