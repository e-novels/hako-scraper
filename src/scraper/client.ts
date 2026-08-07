import { network, logger } from '../utilities'

const BASE_URL = 'https://docln.sbs'

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
  private baseUrl: string

  constructor(baseUrl: string = BASE_URL) {
    this.baseUrl = baseUrl
  }

  public async fetchText(pathnameOrUrl: string, customHeaders?: Record<string, string>): Promise<string> {
    const targetUrl = pathnameOrUrl.startsWith('http') ? pathnameOrUrl : buildEndpointUrl(pathnameOrUrl)
    const headers = { ...DEFAULT_HEADERS, ...customHeaders }
    await logger.info(`[DoclnClient] Fetching text from: ${targetUrl}`)
    return network.fetchText(targetUrl, { headers })
  }

  public async fetchJson<T = unknown>(pathnameOrUrl: string, customHeaders?: Record<string, string>): Promise<T> {
    const targetUrl = pathnameOrUrl.startsWith('http') ? pathnameOrUrl : buildEndpointUrl(pathnameOrUrl)
    const headers = { ...DEFAULT_HEADERS, ...customHeaders }
    await logger.info(`[DoclnClient] Fetching JSON from: ${targetUrl}`)
    return network.fetchJson<T>(targetUrl, { headers })
  }
}

export const doclnClient = new DoclnClient()
