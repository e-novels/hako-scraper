import { initExtensionApi, logger, settings } from './utilities'
import { activateScraper } from './scraper'
import { loginAndCheckConnection, clearSession, loadStoredSession } from './scraper/auth'

export { extractArticleParagraphs } from './scraper/html'
export { parseCommentGroupHtml, fetchComments } from './scraper/comment'
export { login, checkConnection, extractCsrfToken, parseConnectionState, loginAndCheckConnection, clearSession, saveSessionCookies, loadStoredSession } from './scraper/auth'
export { doclnClient } from './scraper/client'
export { ensureChapterCommentState, getLivewireSnapshot, parseToggleSetting } from './scraper/livewire'
export * from './utilities'

export async function activate(novel: NovelExtensionApi): Promise<void> {
  initExtensionApi(novel)
  await activateScraper(novel)
  await loadStoredSession()
  await settings.register({
    loginAndCheckConnection,
    clearSession
  })
  await logger.info(`Activated ${novel.extension.id}`)
}

export async function deactivate(): Promise<void> {
  return
}
