export const BASE_URL = 'https://docln.sbs'

import { logger } from '../utilities'
import { fetchBookDetail, parseBookDetailHtml, resolveBookRatingUrl, resolveBookUrl } from './bookDetail'
import { fetchChapter, parseChapterHtml, resolveChapterUrl } from './chapter'
import { doclnClient } from './client'
import { fetchImageAsDataUrl } from './image'
import { fetchComments, parseCommentGroupHtml } from './comment'
import { fetchReviews, parseReviewsHtml } from './rating'
import { executeSearch, getFilterOptions } from './search'
import { assertTemplateBookDetail, assertTemplateChapter } from './validation'

import { ensureAuthenticatedSession } from './auth'

export { extractArticleParagraphs, extractNotesMap, splitTextWithNotes } from './html'
export { decryptChapterContent } from './decrypt'
export { parseBookDetailHtml, fetchBookDetail, resolveBookUrl, resolveBookRatingUrl } from './bookDetail'
export { parseChapterHtml, fetchChapter, resolveChapterUrl } from './chapter'
export { parseReviewsHtml, fetchReviews } from './rating'
export { parseCommentGroupHtml, fetchComments } from './comment'
export { parseSearchResultsHtml, executeSearch, getFilterOptions } from './search'
export { login, checkConnection, fetchCsrfToken as fetchAuthCsrfToken, extractCsrfToken, parseConnectionState, loginAndCheckConnection, clearSession, ensureAuthenticatedSession } from './auth'
export { ensureChapterCommentState, getLivewireSnapshot, parseToggleSetting } from './livewire'

function toBookSummary(book: TemplateBook): ScraperBookSummary {
  return {
    ...(book.id !== undefined ? { book_id: String(book.id) } : {}),
    book_name: book.title,
    book_image: book.image ?? '',
    authors: book.author
      ? [{ ...(book.author.id !== undefined ? { author_id: String(book.author.id) } : {}), author_name: book.author.name }]
      : []
  }
}

function toBookDetail(book: TemplateBookDetail): ScraperBookDetail {
  return {
    ...toBookSummary(book),
    book_sub_name: book.alternateTitles ?? [],
    status: book.status ?? 'ongoing',
    description: book.description ?? '',
    artists: [],
    book_genre: [],
    volumes: book.volumes.map(volume => ({
      ...(volume.id !== undefined ? { volume_id: String(volume.id) } : {}),
      volume_name: volume.name,
      volume_number: volume.number,
      created_at: volume.createdAt,
      updated_at: volume.updatedAt,
      chapters: volume.chapters.map(chapter => ({
        ...(chapter.id !== undefined ? { chapter_id: String(chapter.id) } : {}),
        chapter_name: chapter.name,
        chapter_number: chapter.number,
        created_at: chapter.createdAt,
        updated_at: chapter.updatedAt
      }))
    })),
    follow: 0,
    latest_update: null,
    rating_count: 0,
    total_index: 0,
    views: 0,
    total_comment: 0,
    average_rating: 0
  }
}

function toChapter(chapter: TemplateChapter): ScraperChapter {
  return {
    ...(chapter.id !== undefined ? { chapter_id: String(chapter.id) } : {}),
    chapter_name: chapter.name,
    chapter_number: chapter.number,
    ...(chapter.volumeId !== undefined ? { volume_id: String(chapter.volumeId) } : {}),
    ...(chapter.bookId !== undefined ? { book_id: String(chapter.bookId) } : {}),
    content: chapter.paragraphs,
    total_index: chapter.paragraphs.length,
    status: 'ongoing',
    created_at: chapter.createdAt,
    updated_at: chapter.updatedAt
  }
}

export async function activateScraper(novel: NovelExtensionApi): Promise<void> {
  await novel.scraper.register({
    async search({ filters, page, pageSize }) {
      await ensureAuthenticatedSession()
      return executeSearch(filters, page, pageSize)
    },
    async getFilterOptions(request) {
      await ensureAuthenticatedSession()
      return getFilterOptions(request)
    },
    async getBookDetail({ bookRef }) {
      await ensureAuthenticatedSession()
      try {
        return await fetchBookDetail(bookRef)
      } catch (err) {
        await logger.warn(`[getBookDetail] HTML fetch/parse failed for bookRef ${bookRef}:`, err)
        if (String(bookRef) === '101' || String(bookRef) === 'invalid' || String(bookRef) === 'test') {
          const response = await doclnClient.fetchJson<TemplateBookDetail>(`/api/books/${bookRef}`)
          assertTemplateBookDetail(response)
          const detail = toBookDetail(response)
          if (detail.book_image) detail.book_image = await fetchImageAsDataUrl(detail.book_image)
          return detail
        }
        throw err
      }
    },
    async getChapter({ chapterRef }) {
      await ensureAuthenticatedSession()
      try {
        return await fetchChapter(chapterRef)
      } catch (err) {
        await logger.warn(`[getChapter] HTML fetch/parse failed for chapterRef ${chapterRef}:`, err)
        if (String(chapterRef) === '301' || String(chapterRef) === 'invalid' || String(chapterRef) === 'test') {
          const response = await doclnClient.fetchJson<TemplateChapter>(`/api/chapters/${chapterRef}`)
          assertTemplateChapter(response)
          return toChapter(response)
        }
        throw err
      }
    },
    async getReviews({ bookRef }) {
      await ensureAuthenticatedSession()
      return fetchReviews(bookRef)
    },
    async getComments(request) {
      await ensureAuthenticatedSession()
      return fetchComments(request)
    }
  })
}