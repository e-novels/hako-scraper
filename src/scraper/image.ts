import { doclnClient } from './client'

const IMAGE_ACCEPT_HEADERS = {
  Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
}

export function normalizeImageUrl(imageUrl: string): string {
  const normalizedUrl = imageUrl.trim()
  if (!normalizedUrl) return ''
  if (normalizedUrl.startsWith('//')) {
    return `https:${normalizedUrl}`
  }
  if (/^i\d*\.(hako\.vip|docln\.net)\//i.test(normalizedUrl)) {
    return `https://${normalizedUrl}`
  }
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    return `https://docln.net/${normalizedUrl.replace(/^\//, '')}`
  }
  return normalizedUrl
}

export function wrapWeservUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed || trimmed.startsWith('data:') || /^https?:\/\/images\.weserv\.nl\//i.test(trimmed)) {
    return trimmed
  }
  return `https://images.weserv.nl/?url=${encodeURIComponent(trimmed)}`
}

export async function fetchImageAsDataUrl(imageUrl: string): Promise<string> {
  if (!imageUrl.trim() || imageUrl.startsWith('data:')) return imageUrl

  const originalUrl = imageUrl.trim()
  const normalizedUrl = normalizeImageUrl(originalUrl)
  const weservUrl = wrapWeservUrl(normalizedUrl)

  try {
    const dataUrl = await doclnClient.fetchDataUrl(weservUrl, IMAGE_ACCEPT_HEADERS)
    if (dataUrl.startsWith('data:')) {
      return dataUrl
    }
  } catch {
    try {
      const fallbackDataUrl = await doclnClient.fetchDataUrl(normalizedUrl, IMAGE_ACCEPT_HEADERS)
      if (fallbackDataUrl.startsWith('data:')) {
        return fallbackDataUrl
      }
    } catch {
      if (normalizedUrl !== originalUrl) {
        try {
          const originalDataUrl = await doclnClient.fetchDataUrl(originalUrl, IMAGE_ACCEPT_HEADERS)
          if (originalDataUrl.startsWith('data:')) {
            return originalDataUrl
          }
        } catch {
        }
      }
    }
  }
  return normalizedUrl
}