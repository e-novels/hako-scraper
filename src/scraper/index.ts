export const BASE_URL = 'https://docln.sbs'

import { fetchBookDetail } from './bookDetail'
import { fetchChapter } from './chapter'
import { fetchComments } from './comment'
import { fetchReviews } from './rating'
import { executeSearch, getFilterOptions } from './search'
import { ensureAuthenticatedSession } from './auth'
import { fetchDownloadContent } from './download'

export { extractArticleParagraphs, extractNotesMap, splitTextWithNotes } from './html'
export { decryptChapterContent } from './decrypt'
export { parseBookDetailHtml, fetchBookDetail, resolveBookUrl, resolveBookRatingUrl } from './bookDetail'
export { convertChapterImagesToBase64, parseChapterHtml, fetchChapter, resolveChapterUrl, parseHakoDate, parseChapterNameFromDoc } from './chapter'
export { parseReviewsHtml, fetchReviews } from './rating'
export { parseCommentGroupHtml, fetchComments, parseTotalCommentsFromHtml } from './comment'
export { parseSearchResultsHtml, executeSearch, getFilterOptions } from './search'
export { login, checkConnection, fetchCsrfToken as fetchAuthCsrfToken, extractCsrfToken, parseConnectionState, loginAndCheckConnection, clearSession, ensureAuthenticatedSession } from './auth'
export { ensureChapterCommentState, getLivewireSnapshot, parseToggleSetting } from './livewire'
export { fetchDownloadContent } from './download'
export { resolveUrl, normalizeImageUrl, toProxyImageUrl, wrapWeservUrl, toArchiveImageUrl, firstImage, fetchImageAsDataUrl, proxyBookImages } from './image'

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
      return fetchBookDetail(bookRef)
    },
    async getChapter({ chapterRef }) {
      await ensureAuthenticatedSession()
      return fetchChapter(chapterRef)
    },
    async getReviews({ bookRef }) {
      await ensureAuthenticatedSession()
      return fetchReviews(bookRef)
    },
    async getComments(request) {
      await ensureAuthenticatedSession()
      return fetchComments(request)
    },
    async download(request) {
      await ensureAuthenticatedSession()
      return fetchDownloadContent(request)
    }
  })
}