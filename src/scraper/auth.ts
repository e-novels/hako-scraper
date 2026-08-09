import { parseHTML } from 'linkedom'
import { logger, storage } from '../utilities'
import { doclnClient } from './client'

export const STORAGE_SESSION_COOKIE_KEY = 'hako_session_cookie'
export const STORAGE_USER_PROFILE_KEY = 'hako_user_profile'
export const STORAGE_CREDENTIALS_KEY = 'hako_credentials'

export function extractCsrfToken(html: string): string {
  if (!html) return ''
  const metaMatch = html.match(/<meta name="csrf-token" content="([^"]+)"/i)
  if (metaMatch && metaMatch[1]) return metaMatch[1]
  const inputMatch = html.match(/name="_token"\s+value="([^"]+)"/i) || html.match(/value="([^"]+)"\s+name="_token"/i)
  if (inputMatch && inputMatch[1]) return inputMatch[1]
  return ''
}

export function parseConnectionState(html: string): { isLoggedIn: boolean; username?: string; avatar?: string } {
  if (!html) {
    return { isLoggedIn: false }
  }

  const { document } = parseHTML(html)
  
  const usernameEl = document.querySelector('.ln-username') || document.querySelector('a[href*="/thanh-vien/"]')
  const userAvatarEl = document.querySelector('img[src*="/users/avatars/"]') || document.querySelector('.ln-comment_sign-in img')

  const signInNotice = html.includes('Bạn phải <a href="/login">đăng nhập</a>') || (html.includes('href="/login"') && !usernameEl)

  if (usernameEl && !signInNotice) {
    return {
      isLoggedIn: true,
      username: usernameEl.textContent?.trim() || undefined,
      avatar: userAvatarEl?.getAttribute('src') || undefined
    }
  }

  const hasLogout = html.includes('/logout') || html.includes('action="/logout"')
  if (hasLogout) {
    return {
      isLoggedIn: true,
      username: usernameEl?.textContent?.trim()
    }
  }

  return { isLoggedIn: false }
}

export async function fetchCsrfToken(): Promise<string> {
  // First attempt: try GET / (home page) which never redirects and contains meta csrf-token
  try {
    const html = await doclnClient.fetchText('/')
    const token = extractCsrfToken(html)
    if (token) return token
  } catch (err) {
    await logger.warn('[Auth] GET / failed while fetching CSRF token:', err)
  }

  // Second attempt: try GET /login as fallback
  try {
    const html = await doclnClient.fetchText('/login')
    const token = extractCsrfToken(html)
    if (token) return token
  } catch (err) {
    await logger.warn('[Auth] GET /login failed/redirected while fetching CSRF token:', err)
  }

  return ''
}

export async function loadStoredSession(): Promise<string | null> {
  try {
    const cookies = await storage.get<string>(STORAGE_SESSION_COOKIE_KEY)
    if (typeof cookies === 'string' && cookies.trim()) {
      doclnClient.setStoredCookies(cookies)
      return cookies
    }
  } catch (err) {
    await logger.warn('[Auth] Failed to load stored session cookies:', err)
  }
  return null
}

export async function saveSessionCookies(cookieHeaderString: string): Promise<void> {
  try {
    doclnClient.setStoredCookies(cookieHeaderString)
    await storage.set(STORAGE_SESSION_COOKIE_KEY, cookieHeaderString)
  } catch (err) {
    await logger.warn('[Auth] Failed to save session cookies:', err)
  }
}

export async function clearSession(): Promise<ExtensionSettingsActionResult> {
  try {
    doclnClient.setStoredCookies('')
    await storage.remove(STORAGE_SESSION_COOKIE_KEY)
    await storage.remove(STORAGE_USER_PROFILE_KEY)
    await storage.remove(STORAGE_CREDENTIALS_KEY)
    await logger.info('[Auth] Session cleared successfully')
    return {
      success: true,
      message: 'Đã đăng xuất và xóa Session lưu trữ.'
    }
  } catch (err) {
    await logger.warn('[Auth] Failed to clear session:', err)
    return {
      success: false,
      message: 'Lỗi khi xóa Session: ' + String(err)
    }
  }
}

export async function checkConnection(): Promise<{ isLoggedIn: boolean; username?: string; avatar?: string }> {
  try {
    await loadStoredSession()
    const html = await doclnClient.fetchText('/')
    const state = parseConnectionState(html)
    if (state.isLoggedIn) {
      await storage.set(STORAGE_USER_PROFILE_KEY, state)
    }
    return state
  } catch (err) {
    await logger.warn('[Auth] checkConnection failed:', err)
    return { isLoggedIn: false }
  }
}

export async function login(email?: string, password?: string): Promise<boolean> {
  if (!email || !password) {
    await logger.warn('[Auth] Missing email or password for login')
    return false
  }

  try {
    const csrfToken = await fetchCsrfToken()
    if (!csrfToken) {
      await logger.warn('[Auth] Unable to retrieve CSRF token for login request')
      return false
    }

    await doclnClient.postFormText('/login', {
      _token: csrfToken,
      name: email,
      password: password
    }, {
      'Referer': 'https://docln.sbs/login'
    })

    const state = await checkConnection()
    return state.isLoggedIn
  } catch (err: any) {
    // If error is redirect (e.g. 302 redirect after successful login POST)
    if (String(err?.message || err).includes('Redirect')) {
      const state = await checkConnection()
      if (state.isLoggedIn) return true
    }
    await logger.warn('[Auth] Login request failed:', err)
    return false
  }
}

export async function loginAndCheckConnection(values: Record<string, unknown> = {}): Promise<ExtensionSettingsActionResult> {
  let email = typeof values.email === 'string' ? values.email.trim() : ''
  if (!email && typeof values.name === 'string') email = values.name.trim()
  if (!email && typeof values.username === 'string') email = values.username.trim()

  let password = typeof values.password === 'string' ? values.password.trim() : ''

  // Fallback to storage credentials if empty in values
  if (!email || !password) {
    try {
      const storedCreds = await storage.get<{ email?: string; password?: string }>(STORAGE_CREDENTIALS_KEY)
      if (storedCreds && typeof storedCreds === 'object' && !('arrayBuffer' in storedCreds)) {
        const creds = storedCreds as { email?: string; password?: string }
        if (!email && creds.email) email = creds.email.trim()
        if (!password && creds.password) password = creds.password.trim()
      }
    } catch {}
  }

  if (!email || !password) {
    return {
      success: false,
      message: 'Vui lòng nhập đầy đủ Email và Mật khẩu.'
    }
  }

  try {
    await storage.set(STORAGE_CREDENTIALS_KEY, { email, password })
    const isSuccess = await login(email, password)
    if (isSuccess) {
      const state = await checkConnection()
      const usernameInfo = state.username ? ` (${state.username})` : ''
      return {
        success: true,
        message: `Đăng nhập & Kết nối Hako thành công!${usernameInfo}`
      }
    } else {
      return {
        success: false,
        message: 'Đăng nhập không thành công. Vui lòng kiểm tra lại Email và Mật khẩu.'
      }
    }
  } catch (err) {
    return {
      success: false,
      message: `Lỗi kết nối Hako: ${String(err)}`
    }
  }
}
