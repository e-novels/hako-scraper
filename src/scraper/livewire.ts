import { logger } from '../utilities'
import { doclnClient } from './client'
import { extractCsrfToken } from './auth'

export function getLivewireSnapshot(html: string): string | null {
  if (!html) return null
  const regex = /wire:snapshot="([^"]+)"/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(html)) !== null) {
    const rawSnap = match[1].replace(/&quot;/g, '"')
    if (rawSnap.includes('toggle-chapter-comment')) {
      return rawSnap
    }
  }
  return null
}

export function parseToggleSetting(snapshotJson: string): boolean {
  try {
    const parsed = JSON.parse(snapshotJson)
    return parsed?.data?.setting === true
  } catch {
    return false
  }
}

export async function ensureChapterCommentState(bookPathOrUrl: string, hideChapterComments: boolean): Promise<boolean> {
  try {
    const pageHtml = await doclnClient.fetchText(bookPathOrUrl)
    const snapshot = getLivewireSnapshot(pageHtml)

    if (!snapshot) {
      // Snapshot not found (guest user or page without toggle)
      return false
    }

    const currentSetting = parseToggleSetting(snapshot)

    if (currentSetting === hideChapterComments) {
      // Already in desired state
      return true
    }

    const csrfToken = extractCsrfToken(pageHtml)
    if (!csrfToken) {
      await logger.warn('[Livewire] CSRF token missing for Livewire update')
      return false
    }

    const payload = {
      _token: csrfToken,
      components: [
        {
          snapshot: snapshot,
          updates: {},
          calls: [
            {
              path: '',
              method: 'toggle',
              params: []
            }
          ]
        }
      ]
    }

    const refererUrl = bookPathOrUrl.startsWith('http') ? bookPathOrUrl : `https://docln.sbs${bookPathOrUrl.startsWith('/') ? '' : '/'}${bookPathOrUrl}`

    await doclnClient.postJson('/livewire/update', payload, {
      'Referer': refererUrl
    })

    return true
  } catch (err) {
    await logger.warn('[Livewire] ensureChapterCommentState failed:', err)
    return false
  }
}
