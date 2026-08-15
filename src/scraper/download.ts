import { getNovelApi, logger } from '../utilities'
import { fetchBookDetail } from './bookDetail'
import { fetchChapter } from './chapter'

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 300): Promise<T> {
  let lastError: unknown
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (i < retries) {
        await delay(delayMs * (i + 1))
      }
    }
  }
  throw lastError
}

export async function fetchDownloadContent(
  request: ScraperDownloadRequest
): Promise<ScraperBookDetailWithContent> {
  const { book_id, volume_id } = request
  if (!book_id) {
    throw new Error('Missing book_id in download request.')
  }

  const bookIdStr = String(book_id).trim()
  const bookDetail = await fetchBookDetail(bookIdStr)

  if (!bookDetail.volumes || bookDetail.volumes.length === 0) {
    throw new Error(`No volumes found for book '${bookIdStr}'.`)
  }

  // Filter volumes if volume_id is specified
  let targetVolumes = bookDetail.volumes
  if (volume_id !== undefined && volume_id !== null && String(volume_id).trim() !== '') {
    const volIdStr = String(volume_id).trim()
    targetVolumes = bookDetail.volumes.filter(v => {
      if (v.volume_id !== undefined && String(v.volume_id) === volIdStr) return true
      if (v.volume_id !== undefined && String(v.volume_id).endsWith(`/${volIdStr}`)) return true
      if (String(v.volume_number) === volIdStr) return true
      return false
    })

    if (targetVolumes.length === 0) {
      throw new Error(`Volume '${volIdStr}' not found in book '${bookIdStr}'.`)
    }
  }

  const totalChapters = targetVolumes.reduce((sum, vol) => sum + vol.chapters.length, 0)
  let completedChapters = 0

  const novelApi = getNovelApi()

  await logger.info(
    `[Download] Starting download for book '${bookDetail.book_name}' (${bookDetail.book_id}): ${targetVolumes.length} volume(s), ${totalChapters} chapter(s).`
  )

  const downloadedVolumes: ScraperVolumeWithContent[] = []

  for (const vol of targetVolumes) {
    const downloadedChapters: ScraperChapter[] = []

    for (const chapMeta of vol.chapters) {
      if (novelApi?.progress) {
        const percentage = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0
        try {
          await novelApi.progress.report({
            message: `Đang tải: ${chapMeta.chapter_name} (${completedChapters + 1}/${totalChapters})`,
            percentage
          })
        } catch {
          // Progress report errors should not break download
        }
      }

      // Fetch chapter content with retry and rate-limiting delay
      const chapterData = await withRetry(async () => {
        return fetchChapter(String(chapMeta.chapter_id))
      })

      downloadedChapters.push({
        ...chapMeta,
        ...chapterData,
        volume_id: vol.volume_id,
        book_id: bookDetail.book_id
      })

      completedChapters++

      // Polite throttle between requests to avoid HTTP 429
      await delay(150)
    }

    downloadedVolumes.push({
      volume_id: vol.volume_id ?? `${bookDetail.book_id}/${vol.volume_number}`,
      volume_name: vol.volume_name,
      volume_number: vol.volume_number,
      created_at: vol.created_at,
      updated_at: vol.updated_at,
      chapters: downloadedChapters
    })
  }

  if (novelApi?.progress) {
    try {
      await novelApi.progress.report({
        message: `Hoàn tất tải truyện: ${bookDetail.book_name}`,
        percentage: 100
      })
    } catch {}
  }

  await logger.info(`[Download] Successfully downloaded book '${bookDetail.book_name}'.`)

  const { volumes: _rawVolumes, ...bookMeta } = bookDetail
  return {
    ...bookMeta,
    book_id: bookDetail.book_id || bookIdStr,
    volumes: downloadedVolumes
  }
}
