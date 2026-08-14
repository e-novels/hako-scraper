type ScraperCapability =
  | 'search'
  | 'getBookDetail'
  | 'getChapter'
  | 'getFilterOptions'
  | 'suggest'
  | 'getComments'
  | 'getReviews'

type ScraperFilterValue = string | number | boolean | string[] | null

interface ScraperSearchRequest {
  filters: Record<string, ScraperFilterValue>
  page: number
  pageSize: number
}

interface ScraperBookDetailRequest {
  /** Book identifier or reference on the target site */
  bookRef: string
  /**
   * If supplied, indicates a request for reply comments belonging to a specific parent comment ID.
   * Extensions should handle pagination using request.page when returning reply threads.
   */
  parentRef?: string
  /** Comment scope filter: 'series' or 'all' */
  commentScope?: 'series' | 'all'
  /** Target scope: 'book' for book detail comments or 'chapter' for specific chapter comments */
  commentTarget?: 'book' | 'chapter'
  /** Chapter identifier/reference when commentTarget is 'chapter' */
  targetRef?: string
  /** Requested page number for pagination (1-indexed, for both root comments and parent replies) */
  page?: number
}

interface ScraperChapterRequest {
  chapterRef: string
  bookRef?: string
}

interface ScraperFilterOptionsRequest {
  fieldId: string
  query?: string
  filters: Record<string, ScraperFilterValue>
}

interface ScraperFilterOption {
  label: string
  value: string
}

interface ScraperFilterOptionsResponse {
  options: ScraperFilterOption[]
}

interface ScraperPagination {
  page: number
  pageSize: number
  totalItems?: number
  totalPages?: number
  hasNextPage: boolean
}

interface ScraperSearchResponse {
  items: ScraperBookSummary[]
  pagination: ScraperPagination
}

interface ScraperHandlers {
  search?: (request: ScraperSearchRequest) => ExtensionMaybePromise<ScraperSearchResponse>
  getBookDetail?: (request: ScraperBookDetailRequest) => ExtensionMaybePromise<ScraperBookDetail>
  getChapter?: (request: ScraperChapterRequest) => ExtensionMaybePromise<ScraperChapter>
  getFilterOptions?: (
    request: ScraperFilterOptionsRequest
  ) => ExtensionMaybePromise<ScraperFilterOptionsResponse>
  suggest?: (request: ScraperFilterOptionsRequest) => ExtensionMaybePromise<string[]>
  getComments?: (request: ScraperBookDetailRequest) => ExtensionMaybePromise<ScraperCommentsPage>
  getReviews?: (request: ScraperBookDetailRequest) => ExtensionMaybePromise<ScraperReview[]>
}

interface ExtensionScraperApi {
  register(handlers: ScraperHandlers): Promise<void>
}

interface ScraperBookSummary {
  book_id?: number | string
  book_name: string
  book_image?: string
  authors?: Array<{ author_id?: number | string; author_name: string }>
}

interface ScraperBookDetail extends ScraperBookSummary {
  book_sub_name?: string[]
  status?: string
  description?: string
  artists?: Array<{ artist_id?: number | string; artist_name: string }>
  book_genre?: Array<{ category_id?: number | string; category_name: string }>
  volumes: Array<{
    volume_id?: number | string
    volume_name: string
    volume_number: number
    created_at?: string
    updated_at?: string
    chapters: Array<{
      chapter_id?: number | string
      chapter_name: string
      chapter_number: number
      created_at?: string
      updated_at?: string
    }>
  }>
  follow?: number
  latest_update?: string | null
  rating_count?: number
  total_index?: number
  views?: number
  total_comment?: number
  average_rating?: number
}

interface ScraperChapter {
  chapter_id?: number | string
  chapter_name: string
  chapter_number: number
  volume_id?: number | string
  book_id?: number | string
  content: string[]
  total_index?: number
  status?: string
  created_at?: string
  updated_at?: string
}

interface ScraperComment {
  /** Optional unique identifier string or number for the comment entity */
  socket_id?: number | string
  user_id?: number | string
  user_name: string
  avatar?: string
  /** Required comment text content */
  content: string
  created_at?: string
  total_like?: number
  total_reply?: number
  is_like?: boolean
  /** Optional display name of chapter when comment belongs to a chapter */
  chapter_name?: string
  /** Optional chapter ID when comment belongs to a chapter */
  chapter_id?: number | string
  /**
   * Note: Child reply comments should be served on-demand via getComments handler
   * when request.parentRef is passed, rather than returned inlined in this array.
   */
  replies?: ScraperComment[]
}

interface ScraperCommentsPage {
  data: ScraperComment[]
  pagination: ScraperPagination
}

interface ScraperReview {
  interaction_id?: number | string
  user_id?: number | string
  user_name: string
  avatar?: string
  value: number | string
  message: string
  created_at?: string
}
