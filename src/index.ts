import { initExtensionApi, logger } from './utilities'
import { activateScraper } from './scraper'

export { extractArticleParagraphs } from './scraper/html'
export * from './utilities'

export async function activate(novel: NovelExtensionApi): Promise<void> {
  initExtensionApi(novel)
  await activateScraper(novel)
  await logger.info(`Activated ${novel.extension.id}`)
}

export async function deactivate(): Promise<void> {
  return
}
