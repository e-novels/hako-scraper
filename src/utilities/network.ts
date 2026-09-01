import { getNovelApi } from './context'

export function getNetwork(): ExtensionNetworkApi {
  const api = getNovelApi()
  if (!api.network) {
    throw new Error('This extension requires the network permission.')
  }
  return api.network
}

export const network = {
  fetchText(url: string, options?: ExtensionFetchOptions): Promise<string> {
    return getNetwork().fetchText(url, options)
  },
  fetchJson<T = unknown>(url: string, options?: ExtensionFetchOptions): Promise<T> {
    return getNetwork().fetchJson<T>(url, options)
  },
  fetchDataUrl(url: string, options?: ExtensionFetchOptions): Promise<string> {
    return getNetwork().fetchDataUrl(url, options)
  },
  fetchAssetUrl(url: string, options?: ExtensionFetchOptions): Promise<string> {
    return getNetwork().fetchAssetUrl(url, options)
  }
}
