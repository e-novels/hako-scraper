import { logger } from '../utilities'
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

  await logger.info(`[ImageProcess] Original URL: ${originalUrl} | Normalized: ${normalizedUrl} | Weserv URL: ${weservUrl}`)

  try {
    const dataUrl = await doclnClient.fetchDataUrl(weservUrl, IMAGE_ACCEPT_HEADERS)
    if (dataUrl.startsWith('data:')) {
      await logger.info(`[ImageProcess] Successfully converted to Data URI (${dataUrl.length} chars) for Weserv URL: ${weservUrl}`)
      return dataUrl
    }
  } catch (error) {
    await logger.warn(`[ImageProcess] Failed fetching via Weserv (${weservUrl}), attempting fallback to normalized URL: ${normalizedUrl}`, error)
    try {
      const fallbackDataUrl = await doclnClient.fetchDataUrl(normalizedUrl, IMAGE_ACCEPT_HEADERS)
      if (fallbackDataUrl.startsWith('data:')) {
        await logger.info(`[ImageProcess] Fallback succeeded for normalized URL: ${normalizedUrl}`)
        return fallbackDataUrl
      }
    } catch {
      if (normalizedUrl !== originalUrl) {
        try {
          const originalDataUrl = await doclnClient.fetchDataUrl(originalUrl, IMAGE_ACCEPT_HEADERS)
          if (originalDataUrl.startsWith('data:')) {
            await logger.info(`[ImageProcess] Fallback succeeded for original URL: ${originalUrl}`)
            return originalDataUrl
          }
        } catch {
        }
      }
    }
    await logger.warn(`[ImageProcess] Failed all Data URI conversions for: ${originalUrl}, returning normalized URL: ${normalizedUrl}`, error)
  }
  return normalizedUrl
}