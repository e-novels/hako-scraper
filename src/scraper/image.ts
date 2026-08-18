import { network } from '../utilities'
import { BASE_URL, doclnClient } from './client'

const IMAGE_ACCEPT_HEADERS: Record<string, string> = {
  Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
}

export function toArchiveImageUrl(url: string): string {
  if (!url) return ''
  const trimmed = url.trim()
  if (!trimmed || trimmed.startsWith('data:') || /^https?:\/\/web\.archive\.org\//i.test(trimmed)) {
    return trimmed
  }
  return `https://web.archive.org/web/20210609011352im_/${trimmed}`
}

export function normalizeImageUrl(imageUrl: string, baseUrl = BASE_URL): string {
  const normalizedUrl = (imageUrl || '').trim()
  if (!normalizedUrl) return ''
  if (normalizedUrl.startsWith('data:')) {
    return normalizedUrl
  }
  if (normalizedUrl.startsWith('//')) {
    return normalizeImageUrl(`https:${normalizedUrl}`, baseUrl)
  }
  if (
    /^https?:\/\/[^/]*\.?bp\.blogspot\.com\//i.test(normalizedUrl) ||
    /^https?:\/\/lh\d+\.googleusercontent\.com\//i.test(normalizedUrl) ||
    /^https?:\/\/blogger\.googleusercontent\.com\//i.test(normalizedUrl)
  ) {
    return toArchiveImageUrl(normalizedUrl)
  }
  if (/^i\d*\.(hako\.vip|docln\.net|docln\.sbs)\//i.test(normalizedUrl)) {
    return `https://${normalizedUrl}`
  }
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    try {
      return new URL(normalizedUrl, baseUrl).toString()
    } catch {
      return `${baseUrl.replace(/\/+$/, '')}/${normalizedUrl.replace(/^\/+/, '')}`
    }
  }
  return normalizedUrl
}

export function resolveUrl(urlStr: string, baseUrl = BASE_URL): string {
  if (!urlStr) return ''
  const trimmed = urlStr.trim()
  if (!trimmed) return ''
  return normalizeImageUrl(trimmed, baseUrl)
}

export function toProxyImageUrl(url: string, baseUrl = BASE_URL): string {
  if (!url) return ''
  const trimmed = url.trim()
  if (!trimmed || trimmed.startsWith('data:') || /^https?:\/\/(?:images\.weserv\.nl|web\.archive\.org)\//i.test(trimmed)) {
    return trimmed
  }
  try {
    const normalized = normalizeImageUrl(trimmed, baseUrl)
    if (/^https?:\/\/web\.archive\.org\//i.test(normalized)) {
      return normalized
    }
    const parsed = new URL(normalized)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return trimmed
    let baseHost = ''
    try {
      baseHost = new URL(baseUrl).hostname
    } catch {
      baseHost = 'docln.sbs'
    }
    if (parsed.hostname === baseHost) return parsed.href
    return `https://images.weserv.nl/?url=${encodeURIComponent(`${parsed.hostname}${parsed.pathname}${parsed.search}`)}&output=webp`
  } catch {
    return trimmed
  }
}

export function wrapWeservUrl(url: string): string {
  return toProxyImageUrl(url)
}

export function firstImage(fragment: string, baseUrl = BASE_URL): string {
  if (!fragment || typeof fragment !== 'string') return ''
  const imgTags = Array.from(fragment.matchAll(/<img\b[^>]*>/gi))
  for (const match of imgTags) {
    const tag = match[0]
    const srcMatch = tag.match(/(?:data-src|data-bg|src)\s*=\s*(['"])(.*?)\1/i)
    if (srcMatch && srcMatch[2]) {
      const resolved = resolveUrl(srcMatch[2], baseUrl)
      if (resolved) return resolved
    }
  }
  const bgMatch = fragment.match(/background-image\s*:\s*url\((['"]?)([^)'"\s]+)\1\)/i) ||
    fragment.match(/data-bg\s*=\s*(['"])([^'"\s]+)\1/i) ||
    fragment.match(/(?:background-image\s*:\s*url\(|data-bg\s*=\s*['"])([^)'"\s]+)[)'"]?/i)
  if (bgMatch && (bgMatch[2] || bgMatch[1])) {
    return resolveUrl(bgMatch[2] || bgMatch[1], baseUrl)
  }
  return ''
}

export async function fetchImageAsDataUrl(imageUrl: string, baseUrl = BASE_URL): Promise<string> {
  const trimmed = (imageUrl || '').trim()
  if (!trimmed || trimmed.startsWith('data:')) return trimmed

  const normalizedUrl = normalizeImageUrl(trimmed, baseUrl)

  // Nếu là link web.archive.org, tải trực tiếp bằng network.fetchDataUrl với clean headers
  if (/^https?:\/\/web\.archive\.org\//i.test(normalizedUrl)) {
    try {
      const archiveDataUrl = await network.fetchDataUrl(normalizedUrl, {
        headers: IMAGE_ACCEPT_HEADERS,
        credentials: 'omit'
      })
      if (typeof archiveDataUrl === 'string' && archiveDataUrl.startsWith('data:')) {
        return archiveDataUrl
      }
    } catch {
      // ignore
    }
    return normalizedUrl
  }

  const proxyUrl = toProxyImageUrl(normalizedUrl, baseUrl)

  // 1. Thử tải qua Weserv CDN proxy
  if (proxyUrl && proxyUrl !== normalizedUrl) {
    try {
      const dataUrl = await doclnClient.fetchDataUrl(proxyUrl, IMAGE_ACCEPT_HEADERS)
      if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
        return dataUrl
      }
    } catch {
      // Bỏ qua lỗi weserv proxy
    }
  }

  // 2. Thử tải trực tiếp từ link normalized
  try {
    const fallbackDataUrl = await doclnClient.fetchDataUrl(normalizedUrl, IMAGE_ACCEPT_HEADERS)
    if (typeof fallbackDataUrl === 'string' && fallbackDataUrl.startsWith('data:')) {
      return fallbackDataUrl
    }
  } catch {
    // 3. Thử tải từ link trimmed nếu khác normalized
    if (normalizedUrl !== trimmed) {
      try {
        const originalDataUrl = await doclnClient.fetchDataUrl(trimmed, IMAGE_ACCEPT_HEADERS)
        if (typeof originalDataUrl === 'string' && originalDataUrl.startsWith('data:')) {
          return originalDataUrl
        }
      } catch {
        // ignore
      }
    }
  }

  // 4. Fallback Web Archive
  try {
    const archiveUrl = toArchiveImageUrl(normalizedUrl)
    if (archiveUrl && archiveUrl !== normalizedUrl) {
      const archiveDataUrl = await network.fetchDataUrl(archiveUrl, {
        headers: IMAGE_ACCEPT_HEADERS,
        credentials: 'omit'
      })
      if (typeof archiveDataUrl === 'string' && archiveDataUrl.startsWith('data:')) {
        return archiveDataUrl
      }
      return archiveUrl
    }
  } catch {
    // ignore
  }

  return normalizedUrl
}

export async function proxyBookImages<T extends { book_image?: string }>(
  items: T[],
  concurrency = 8,
  baseUrl = BASE_URL
): Promise<T[]> {
  if (!Array.isArray(items) || items.length === 0) return items
  const result = items.map(item => ({ ...item }))
  let nextIndex = 0

  const worker = async () => {
    while (nextIndex < result.length) {
      const index = nextIndex
      nextIndex += 1
      if (result[index].book_image) {
        result[index].book_image = await fetchImageAsDataUrl(result[index].book_image!, baseUrl)
      }
    }
  }

  const workerCount = Math.min(concurrency, result.length)
  await Promise.all(Array.from({ length: workerCount }, worker))
  return result
}