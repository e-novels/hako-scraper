import { initExtensionApi, logger, settings } from './utilities'
import { activateScraper } from './scraper'
import { loginAndCheckConnection, checkConnectionAction, clearSession, loadStoredSession } from './scraper/auth'

export { extractArticleParagraphs, extractNotesMap, splitTextWithNotes } from './scraper/html'
export { decryptChapterContent } from './scraper/decrypt'
export { parseSearchResultsHtml, executeSearch, getFilterOptions } from './scraper/search'
export { parseBookDetailHtml, fetchBookDetail, resolveBookUrl, resolveBookRatingUrl } from './scraper/bookDetail'
export { parseChapterHtml, fetchChapter, resolveChapterUrl } from './scraper/chapter'
export { parseReviewsHtml, fetchReviews } from './scraper/rating'
export { parseCommentGroupHtml, fetchComments } from './scraper/comment'
export { login, checkConnection, checkConnectionAction, fetchUserProfileName, ensureAuthenticatedSession, extractCsrfToken, parseConnectionState, loginAndCheckConnection, clearSession, saveSessionCookies, loadStoredSession } from './scraper/auth'
export { doclnClient } from './scraper/client'
export { ensureChapterCommentState, getLivewireSnapshot, parseToggleSetting } from './scraper/livewire'
export * from './utilities'

export async function activate(novel: NovelExtensionApi): Promise<void> {
  initExtensionApi(novel)
  await activateScraper(novel)
  await loadStoredSession()
  await settings.register({
    loginAndCheckConnection,
    checkConnectionAction,
    clearSession
  })
}

export async function deactivate(): Promise<void> {
  return
}
