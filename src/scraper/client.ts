import { network, logger } from '../utilities'
import { BASE_URL } from './index'

export { BASE_URL }

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
  'Referer': 'https://docln.sbs/'
}

export function buildEndpointUrl(pathname: string): string {
  return new URL(pathname, BASE_URL).toString()
}

export class DoclnClient {
  private prepareRequest(pathnameOrUrl: string, customHeaders?: Record<string, string>) {
    const targetUrl = pathnameOrUrl.startsWith('http') ? pathnameOrUrl : buildEndpointUrl(pathnameOrUrl)
    const headers = { ...DEFAULT_HEADERS, ...customHeaders }
    return { targetUrl, headers }
  }

  public async fetchText(pathnameOrUrl: string, customHeaders?: Record<string, string>): Promise<string> {
    const { targetUrl, headers } = this.prepareRequest(pathnameOrUrl, customHeaders)
    return network.fetchText(targetUrl, { headers, credentials: 'include' })
  }

  public async fetchJson<T = unknown>(pathnameOrUrl: string, customHeaders?: Record<string, string>): Promise<T> {
    const { targetUrl, headers } = this.prepareRequest(pathnameOrUrl, customHeaders)
    return network.fetchJson<T>(targetUrl, { headers, credentials: 'include' })
  }

  public async fetchDataUrl(pathnameOrUrl: string, customHeaders?: Record<string, string>): Promise<string> {
    const { targetUrl, headers } = this.prepareRequest(pathnameOrUrl, customHeaders)
    return network.fetchDataUrl(targetUrl, { headers, credentials: 'include' })
  }

  public async postForm<T = unknown>(pathnameOrUrl: string, formData: Record<string, string>, customHeaders?: Record<string, string>): Promise<T> {
    const { targetUrl, headers } = this.prepareRequest(pathnameOrUrl, {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      ...customHeaders
    })
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(formData)) {
      params.set(key, value)
    }
    const body = params.toString()
    return network.fetchJson<T>(targetUrl, { method: 'POST', headers, body, credentials: 'include' })
  }
}

export const doclnClient = new DoclnClient()


