import { logger } from '../utilities'
import { doclnClient } from './client'

function normalizeImageUrl(imageUrl: string): string {
  let normalizedUrl = imageUrl.trim()
  if (normalizedUrl.startsWith('//')) {
    normalizedUrl = `https:${normalizedUrl}`
  } else if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
    normalizedUrl = normalizedUrl.startsWith('/')
      ? `https://docln.net${normalizedUrl}`
      : `https://docln.net/${normalizedUrl}`
  }
  return normalizedUrl.replace(/^(https?:\/\/i\d*)\.hako\.vip\//i, '$1.docln.net/')
}

export async function fetchImageAsDataUrl(imageUrl: string): Promise<string> {
  if (!imageUrl.trim() || imageUrl.startsWith('data:')) return imageUrl

  const originalUrl = imageUrl.trim()
  const normalizedUrl = normalizeImageUrl(originalUrl)
  try {
    const dataUrl = await doclnClient.fetchDataUrl(normalizedUrl, {
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
    })
    if (dataUrl.startsWith('data:')) return dataUrl
  } catch (error) {
    if (normalizedUrl !== originalUrl) {
      try {
        const fallbackDataUrl = await doclnClient.fetchDataUrl(originalUrl, {
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        })
        if (fallbackDataUrl.startsWith('data:')) return fallbackDataUrl
      } catch {
      }
    }
    await logger.warn(`Failed to convert image to data URL, falling back to original URL: ${normalizedUrl}`, error)
  }
  return normalizedUrl
}