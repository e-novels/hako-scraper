import { parseHTML } from 'linkedom'
import { logger } from '../utilities'
import { BASE_URL, doclnClient } from './client'
import { resolveBookUrl } from './bookDetail'
import { resolveChapterUrl } from './chapter'
import { normalizeImageUrl, wrapWeservUrl } from './image'

function parseInteger(str: string | null | undefined): number {
  if (!str) return 0
  const cleaned = str.replace(/[^\d]/g, '')
  const val = parseInt(cleaned, 10)
  return Number.isNaN(val) ? 0 : val
}

function parseHakoDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString()
  const trimmed = dateStr.trim()
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/)
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10)
    const month = parseInt(dmyMatch[2], 10) - 1
    const year = parseInt(dmyMatch[3], 10)
    const hour = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0
    const minute = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0
    const second = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0
    const d = new Date(Date.UTC(year, month, day, hour, minute, second))
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  const parsed = Date.parse(trimmed)
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString()
  return new Date().toISOString()
}

function processContentImages(contentEl: Element | null): string {
  if (!contentEl) return ''
  const imgs = Array.from(contentEl.querySelectorAll('img'))
  imgs.forEach(img => {
    const rawSrc = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original') || ''
    if (rawSrc) {
      const normalized = normalizeImageUrl(rawSrc)
      const weserv = wrapWeservUrl(normalized)
      img.setAttribute('src', weserv)
    }
  })
  return contentEl.textContent?.trim() || contentEl.innerHTML?.trim() || ''
}

function parseSingleCommentItem(itemEl: Element, roomId: number | string = 0): ScraperComment {
  const commentIdAttr = itemEl.getAttribute('data-comment') || itemEl.getAttribute('id') || '0'
  const comment_id = parseInteger(commentIdAttr)

  const usernameEl = itemEl.querySelector('.ln-username')
  const user_name = usernameEl?.textContent?.trim() || 'Vô danh'
  const userHref = usernameEl?.getAttribute('href') || ''
  const userMatch = userHref.match(/\/thanh-vien\/(\d+)/)
  const user_id = userMatch ? parseInt(userMatch[1], 10) : 0

  const imgEl = itemEl.querySelector('img')
  let rawAvatar = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src') || ''
  if (!rawAvatar) rawAvatar = '/img/noava.png'

  const normalizedAvatar = normalizeImageUrl(rawAvatar)
  const avatar = wrapWeservUrl(normalizedAvatar)

  const contentEl = itemEl.querySelector('.ln-comment-content')
  const message = processContentImages(contentEl)

  const timeEl = itemEl.querySelector('time.timeago')
  const dateAttr = timeEl?.getAttribute('datetime') || timeEl?.getAttribute('title') || timeEl?.textContent || ''
  const created_at = parseHakoDate(dateAttr)

  const likeEl = itemEl.querySelector('.likecount')
  const total_like = parseInteger(likeEl?.textContent || '0')

  const doLikeEl = itemEl.querySelector('.do-like')
  const is_like = doLikeEl?.classList.contains('liked') || false

  const chapLinkEl = itemEl.querySelector('span.text-sm a[href*="/c"]')
  const chapter_ref = chapLinkEl?.getAttribute('href') || null
  const chapter_title = chapLinkEl?.textContent?.trim() || null

  const commentObj = {
    id: comment_id,
    comment_id,
    room_id: roomId || comment_id || 0,
    roomId: roomId || comment_id || 0,
    user_id,
    userId: user_id,
    user_name,
    userName: user_name,
    avatar,
    user_avatar: avatar,
    message,
    content: message,
    created_at,
    createdAt: created_at,
    total_like,
    like_count: total_like,
    total_reply: 0,
    reply_count: 0,
    is_like,
    replies: [],
    ...(chapter_ref ? { chapter_ref, chapter_title } : {})
  }

  return commentObj as unknown as ScraperComment
}

export function parseCommentGroupHtml(html: string, roomId: number | string = 0): ScraperComment[] {
  if (!html || !html.trim()) return []

  const { document } = parseHTML(`<div>${html}</div>`)
  const groups = Array.from(document.querySelectorAll('.ln-comment-group'))
  const comments: ScraperComment[] = []

  if (groups.length === 0) {
    const items = Array.from(document.querySelectorAll('.ln-comment-item'))
    items.forEach(item => {
      comments.push(parseSingleCommentItem(item, roomId))
    })
    return comments
  }

  for (const group of groups) {
    const parentItem = group.querySelector('.ln-comment-item')
    if (!parentItem) continue

    const parentComment = parseSingleCommentItem(parentItem, roomId)

    const replyContainer = group.querySelector('.ln-comment-reply')
    if (replyContainer) {
      const replyItems = Array.from(replyContainer.querySelectorAll('.ln-comment-item'))
      const replies: ScraperComment[] = replyItems.map(item => parseSingleCommentItem(item, roomId))
      parentComment.replies = replies
      parentComment.total_reply = replies.length
      ;(parentComment as any).reply_count = replies.length
    }

    comments.push(parentComment)
  }

  return comments
}

export async function fetchCsrfToken(targetPath: string): Promise<{ token: string; html: string }> {
  try {
    const html = await doclnClient.fetchText(targetPath)
    const { document } = parseHTML(html)
    const metaToken = document.querySelector('meta[name="csrf-token"]')
    let token = metaToken?.getAttribute('content') || ''
    if (!token) {
      const match = html.match(/csrf-token['"]\s*content=['"]([^'"]+)['"]/i) ||
                    html.match(/_token\s*=\s*['"]([^'"]+)['"]/i)
      if (match && match[1]) token = match[1]
    }
    return { token, html }
  } catch (err) {
    await logger.warn('[Comment] Failed to fetch CSRF token page:', err)
    return { token: '', html: '' }
  }
}

export async function fetchRepliesForComment(
  parentComment: ScraperComment,
  token: string,
  targetPath: string,
  roomId: number | string = 0
): Promise<void> {
  if (!parentComment.replies) parentComment.replies = []
  let offset = parentComment.replies.length
  if (offset === 0) return

  let lastReplyId = parentComment.replies[parentComment.replies.length - 1]?.comment_id || 0
  let maxLoop = 10

  const refererUrl = `${BASE_URL}${targetPath}`
  const customHeaders: Record<string, string> = {
    'Referer': refererUrl,
    'Origin': BASE_URL,
    'X-Requested-With': 'XMLHttpRequest'
  }
  if (token) {
    customHeaders['X-CSRF-TOKEN'] = token
    customHeaders['X-XSRF-TOKEN'] = token
  }

  while (maxLoop > 0) {
    maxLoop--
    try {
      const resp = await doclnClient.postForm<{ status?: string; html?: string; remaining?: number }>(
        '/comment/fetch_reply',
        {
          _token: token,
          parent_id: String(parentComment.comment_id),
          offset: String(offset),
          after: String(lastReplyId)
        },
        customHeaders
      )

      if (!resp || resp.status !== 'success' || !resp.html) break

      const newReplies = parseCommentGroupHtml(resp.html, roomId)
      if (newReplies.length === 0) break

      for (const reply of newReplies) {
        if (!parentComment.replies.some(r => r.comment_id === reply.comment_id)) {
          parentComment.replies.push(reply)
        }
      }

      offset = parentComment.replies.length
      lastReplyId = parentComment.replies[parentComment.replies.length - 1].comment_id

      if (!resp.remaining || resp.remaining <= 0) break
    } catch (err) {
      await logger.warn(`[Comment] Error fetching replies for comment ${parentComment.comment_id}:`, err)
      break
    }
  }

  parentComment.total_reply = parentComment.replies.length
  ;(parentComment as any).reply_count = parentComment.replies.length
}

export async function fetchComments(request: ScraperBookDetailRequest): Promise<ScraperCommentsPage> {
  const page = request.page || 1
  const isChapterTarget = request.commentTarget === 'chapter' || Boolean(request.targetRef)

  let type: 'series' | 'chapter' = 'series'
  let typeId = 0
  let targetPath = ''

  if (isChapterTarget && request.targetRef) {
    type = 'chapter'
    targetPath = await resolveChapterUrl(request.targetRef)
    const chapMatch = request.targetRef.match(/(\d+)/)
    if (chapMatch) typeId = parseInt(chapMatch[1], 10)
  } else {
    type = 'series'
    targetPath = await resolveBookUrl(request.bookRef)
    const bookMatch = request.bookRef.match(/(\d+)/)
    if (bookMatch) typeId = parseInt(bookMatch[1], 10)
  }

  await logger.info(`[Comment] Fetching ${type} comments for ID ${typeId}, page ${page}...`)

  const { token, html: pageHtml } = await fetchCsrfToken(targetPath)

  if (!typeId && pageHtml) {
    const { document } = parseHTML(pageHtml)
    const canonicalLink = document.querySelector('link[rel="canonical"], meta[property="og:url"]')
    if (canonicalLink) {
      const href = canonicalLink.getAttribute('href') || canonicalLink.getAttribute('content') || ''
      const match = href.match(/\/truyen\/(\d+)/) || href.match(/\/c(\d+)/)
      if (match) typeId = parseInt(match[1], 10)
    }
  }

  const refererUrl = `${BASE_URL}${targetPath}`
  const customHeaders: Record<string, string> = {
    'Referer': refererUrl,
    'Origin': BASE_URL,
    'X-Requested-With': 'XMLHttpRequest'
  }
  if (token) {
    customHeaders['X-CSRF-TOKEN'] = token
    customHeaders['X-XSRF-TOKEN'] = token
  }

  let jsonResp: { status?: string; html?: string } = {}
  try {
    jsonResp = await doclnClient.postForm<{ status?: string; html?: string }>(
      '/comment/ajax_paging',
      {
        _token: token,
        type,
        type_id: String(typeId),
        page: String(page)
      },
      customHeaders
    )
  } catch (err: any) {
    if (String(err?.message || err).includes('419')) {
      await logger.warn(`[Comment] HTTP 419 detected, retrying with fresh token session...`)
      const fresh = await fetchCsrfToken(targetPath)
      if (fresh.token) {
        customHeaders['X-CSRF-TOKEN'] = fresh.token
        customHeaders['X-XSRF-TOKEN'] = fresh.token
        try {
          jsonResp = await doclnClient.postForm<{ status?: string; html?: string }>(
            '/comment/ajax_paging',
            {
              _token: fresh.token,
              type,
              type_id: String(typeId),
              page: String(page)
            },
            customHeaders
          )
        } catch (retryErr) {
          await logger.warn(`[Comment] Retry ajax_paging failed for ${type} ${typeId}:`, retryErr)
        }
      }
    } else {
      await logger.warn(`[Comment] ajax_paging request failed for ${type} ${typeId}:`, err)
    }
  }

  const comments = parseCommentGroupHtml(jsonResp.html || '', typeId)

  for (const comment of comments) {
    if (comment.replies && comment.replies.length > 0) {
      await fetchRepliesForComment(comment, token, targetPath, typeId)
    }
  }

  let hasNextPage = comments.length >= 10
  if (jsonResp.html) {
    const { document } = parseHTML(`<div>${jsonResp.html}</div>`)
    const nextEl = document.querySelector('.paging_item.next, .paging_prevnext.next, .pagination_wrap .next, .pagination .next, a.next')
    if (nextEl) {
      hasNextPage = !nextEl.classList.contains('disabled')
    } else {
      const pageLinks = Array.from(document.querySelectorAll('.pagination a, .pagination_wrap a, .paging_simple a'))
      for (const link of pageLinks) {
        const href = link.getAttribute('href') || ''
        const pageMatch = href.match(/page=(\d+)/)
        if (pageMatch && parseInt(pageMatch[1], 10) > page) {
          hasNextPage = true
          break
        }
      }
    }
  }

  const pagination: ScraperPagination = {
    page,
    pageSize: comments.length || 10,
    hasNextPage
  }

  await logger.info('[Comment] Pagination:', pagination)

  return {
    data: comments,
    pagination
  } as unknown as ScraperCommentsPage
}