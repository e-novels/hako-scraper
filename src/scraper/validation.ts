type UnknownRecord = Record<string, unknown>

const statuses = new Set(['show', 'hidden', 'ongoing', 'completed'])
const dataImagePattern = /^data:image\/(?:avif|gif|jpeg|png|webp);base64,[a-z0-9+/]+={0,2}$/i
const maxDataImageLength = 7 * 1024 * 1024

function fail(path: string, message: string): never {
  throw new Error(`Invalid source response at ${path}: ${message}`)
}

function asRecord(value: unknown, path: string): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected an object.')
  return value as UnknownRecord
}

function requireString(value: unknown, path: string, allowEmpty = false): void {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) fail(path, 'expected a non-empty string.')
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function requirePositiveInteger(value: unknown, path: string): void {
  if (!isPositiveSafeInteger(value)) fail(path, 'expected a positive safe integer.')
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function requireNonNegativeInteger(value: unknown, path: string): void {
  if (!isNonNegativeSafeInteger(value)) fail(path, 'expected a non-negative safe integer.')
}

function requireDate(value: unknown, path: string): void {
  requireString(value, path)
  if (Number.isNaN(Date.parse(value as string))) fail(path, 'expected an ISO-compatible date.')
}

function requireImageUrl(value: unknown, path: string): void {
  requireString(value, path, true)
  if (value === '') return
  if (dataImagePattern.test(value as string)) {
    if ((value as string).length > maxDataImageLength) fail(path, 'data image exceeds the 7 MB limit.')
    return
  }
  try {
    const url = new URL(value as string)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') fail(path, 'expected an absolute HTTP(S) URL.')
  } catch {
    fail(path, 'expected an absolute HTTP(S) URL or supported data image.')
  }
}

function requireBook(value: unknown, path: string): void {
  const book = asRecord(value, path)
  requirePositiveInteger(book.id, `${path}.id`)
  requireString(book.title, `${path}.title`)
  if (book.image !== undefined) requireImageUrl(book.image, `${path}.image`)
  if (book.author !== undefined) {
    const author = asRecord(book.author, `${path}.author`)
    requirePositiveInteger(author.id, `${path}.author.id`)
    requireString(author.name, `${path}.author.name`)
  }
}

function requirePagination(value: unknown, path: string): void {
  const pagination = asRecord(value, path)
  requirePositiveInteger(pagination.page, `${path}.page`)
  requirePositiveInteger(pagination.pageSize, `${path}.pageSize`)
  if (typeof pagination.hasNextPage !== 'boolean') fail(`${path}.hasNextPage`, 'expected a boolean.')
  if (pagination.totalItems !== undefined) requireNonNegativeInteger(pagination.totalItems, `${path}.totalItems`)
  if (pagination.totalPages !== undefined) requireNonNegativeInteger(pagination.totalPages, `${path}.totalPages`)
}

export function assertTemplateSearchResponse(value: unknown): asserts value is TemplateSearchResponse {
  const response = asRecord(value, 'search')
  if (!Array.isArray(response.items)) fail('search.items', 'expected an array.')
  response.items.forEach((book, index) => requireBook(book, `search.items[${index}]`))
  requirePagination(response.pagination, 'search.pagination')
}

export function assertTemplateBookDetail(value: unknown): asserts value is TemplateBookDetail {
  const book = asRecord(value, 'book')
  requireBook(book, 'book')
  if (!Array.isArray(book.volumes)) fail('book.volumes', 'expected an array.')
  if (book.alternateTitles !== undefined) {
    if (!Array.isArray(book.alternateTitles)) fail('book.alternateTitles', 'expected an array.')
    book.alternateTitles.forEach((title, index) => requireString(title, `book.alternateTitles[${index}]`))
  }
  if (book.status !== undefined) requireString(book.status, 'book.status', true)
  if (book.description !== undefined) requireString(book.description, 'book.description', true)

  book.volumes.forEach((volume, volumeIndex) => {
    const volumePath = `book.volumes[${volumeIndex}]`
    const volumeRecord = asRecord(volume, volumePath)
    requirePositiveInteger(volumeRecord.id, `${volumePath}.id`)
    requireString(volumeRecord.name, `${volumePath}.name`)
    requirePositiveInteger(volumeRecord.number, `${volumePath}.number`)
    requireDate(volumeRecord.createdAt, `${volumePath}.createdAt`)
    requireDate(volumeRecord.updatedAt, `${volumePath}.updatedAt`)
    if (!Array.isArray(volumeRecord.chapters)) fail(`${volumePath}.chapters`, 'expected an array.')
    volumeRecord.chapters.forEach((chapter, chapterIndex) => {
      const chapterPath = `${volumePath}.chapters[${chapterIndex}]`
      const chapterRecord = asRecord(chapter, chapterPath)
      requirePositiveInteger(chapterRecord.id, `${chapterPath}.id`)
      requireString(chapterRecord.name, `${chapterPath}.name`)
      requirePositiveInteger(chapterRecord.number, `${chapterPath}.number`)
      requireDate(chapterRecord.createdAt, `${chapterPath}.createdAt`)
      requireDate(chapterRecord.updatedAt, `${chapterPath}.updatedAt`)
    })
  })
}

export function assertTemplateChapter(value: unknown): asserts value is TemplateChapter {
  const chapter = asRecord(value, 'chapter')
  requirePositiveInteger(chapter.id, 'chapter.id')
  requireString(chapter.name, 'chapter.name')
  requirePositiveInteger(chapter.number, 'chapter.number')
  requirePositiveInteger(chapter.volumeId, 'chapter.volumeId')
  requirePositiveInteger(chapter.bookId, 'chapter.bookId')
  requireDate(chapter.createdAt, 'chapter.createdAt')
  requireDate(chapter.updatedAt, 'chapter.updatedAt')
  if (!Array.isArray(chapter.paragraphs) || chapter.paragraphs.length === 0) {
    fail('chapter.paragraphs', 'expected a non-empty array.')
  }
  chapter.paragraphs.forEach((paragraph, index) => requireString(paragraph, `chapter.paragraphs[${index}]`))
}