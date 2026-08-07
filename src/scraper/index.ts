const BASE_URL = 'https://docln.sbs'

import { doclnClient } from './client'
export { extractArticleParagraphs } from './html'
import { fetchImageAsDataUrl } from './image'
import { assertTemplateBookDetail, assertTemplateChapter } from './validation'

function toBookSummary(book: TemplateBook): ScraperBookSummary {
  return {
    book_id: book.id,
    book_name: book.title,
    book_image: book.image ?? '',
    authors: book.author ? [{ author_id: book.author.id, author_name: book.author.name }] : []
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
      volume_id: volume.id,
      volume_name: volume.name,
      volume_number: volume.number,
      created_at: volume.createdAt,
      updated_at: volume.updatedAt,
      chapters: volume.chapters.map(chapter => ({
        chapter_id: chapter.id,
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
    chapter_id: chapter.id,
    chapter_name: chapter.name,
    chapter_number: chapter.number,
    volume_id: chapter.volumeId,
    book_id: chapter.bookId,
    content: chapter.paragraphs,
    total_index: chapter.paragraphs.length,
    status: 'ongoing',
    created_at: chapter.createdAt,
    updated_at: chapter.updatedAt
  }
}

import { executeSearch, getFilterOptions } from './search'

export async function activateScraper(novel: NovelExtensionApi): Promise<void> {
  await novel.scraper.register({
    async search({ filters, page, pageSize }) {
      return executeSearch(filters, page, pageSize)
    },
    async getFilterOptions(request) {
      return getFilterOptions(request)
    },
    async getBookDetail({ bookRef }) {
      const response = await doclnClient.fetchJson<TemplateBookDetail>(`/api/books/${bookRef}`)
      assertTemplateBookDetail(response)
      const detail = toBookDetail(response)
      if (detail.book_image) detail.book_image = await fetchImageAsDataUrl(detail.book_image)
      return detail
    },
    async getChapter({ chapterRef }) {
      const response = await doclnClient.fetchJson<TemplateChapter>(`/api/chapters/${chapterRef}`)
      assertTemplateChapter(response)
      return toChapter(response)
    }
  })
}