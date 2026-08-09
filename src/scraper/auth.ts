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

export function parseConnectionState(html: string): { isLoggedIn: boolean; username?: string; avatar?: string; userId?: string } {
  if (!html) {
    return { isLoggedIn: false }
  }

  const { document } = parseHTML(html)
  const navbarUser = document.querySelector('#navbar-user')
  if (!navbarUser) {
    return { isLoggedIn: false }
  }

  const logoutLink = navbarUser.querySelector('a[href*="/logout"]') || navbarUser.querySelector('a[href="/logout"]')
  if (!logoutLink) {
    return { isLoggedIn: false }
  }

  const avatarEl = navbarUser.querySelector('.nav-user_avatar img') || navbarUser.querySelector('img')
  const profileLink = navbarUser.querySelector('a[href*="/thanh-vien/"]')
  
  let userId: string | undefined
  let username: string | undefined

  if (profileLink) {
    const href = profileLink.getAttribute('href') || ''
    const match = href.match(/\/thanh-vien\/(\d+)/)
    if (match) {
      userId = match[1]
    }
    const linkText = profileLink.textContent?.trim()
    if (linkText && !linkText.toLowerCase().includes('tài khoản')) {
      username = linkText
    }
  }

  const usernameEl = document.querySelector('.ln-username')
  if (!username && usernameEl) {
    username = usernameEl.textContent?.trim()
  }

  return {
    isLoggedIn: true,
    userId,
    username: username || (userId ? `User_${userId}` : undefined),
    avatar: avatarEl?.getAttribute('src') || undefined
  }
}

export async function fetchCsrfTokenAndSession(): Promise<{ csrfToken: string; cookies: string }> {
  try {
    if (typeof globalThis.fetch === 'function') {
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      const res = await globalThis.fetch('https://docln.sbs/login', {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      })
      const html = await res.text()
      const token = extractCsrfToken(html)
      
      const getSetCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : []
      const cookieJar: Record<string, string> = {}
      for (const c of getSetCookies) {
        const parts = c.split(';')[0].split('=')
        if (parts.length >= 2) {
          cookieJar[parts[0].trim()] = parts.slice(1).join('=').trim()
        }
      }
      const cookieHeader = Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ')
      if (cookieHeader) {
        await saveSessionCookies(cookieHeader)
      }
      if (token) return { csrfToken: token, cookies: cookieHeader }
    }
  } catch (err) {
    await logger.warn('[Auth] Direct fetch for CSRF and cookies failed, falling back:', err)
  }

  // Fallback using doclnClient
  try {
    const html = await doclnClient.fetchText('/login')
    const token = extractCsrfToken(html)
    return { csrfToken: token, cookies: doclnClient.getStoredCookies() }
  } catch (err) {
    await logger.warn('[Auth] doclnClient fetchText /login failed:', err)
    return { csrfToken: '', cookies: '' }
  }
}

export async function fetchCsrfToken(): Promise<string> {
  const { csrfToken } = await fetchCsrfTokenAndSession()
  return csrfToken
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
    const currentCookies = doclnClient.getStoredCookies()
    if (currentCookies) {
      try {
        await doclnClient.fetchText('/logout', { 'Referer': 'https://docln.sbs/' })
      } catch (err) {
        // Ignore network errors on remote logout if session already invalidated
      }
    }
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

export async function checkConnection(): Promise<{ isLoggedIn: boolean; username?: string; avatar?: string; userId?: string }> {
  try {
    await loadStoredSession()
    const html = await doclnClient.fetchText('/')
    const state = parseConnectionState(html)
    await logger.info(`[Auth] Check Connection -> isLoggedIn: ${state.isLoggedIn}, Username: ${state.username || state.userId || 'N/A'}`)
    if (state.isLoggedIn) {
      await storage.set(STORAGE_USER_PROFILE_KEY, state)
    } else {
      await storage.remove(STORAGE_USER_PROFILE_KEY)
    }
    return state
  } catch (err) {
    await logger.warn('[Auth] checkConnection failed:', err)
    return { isLoggedIn: false }
  }
}

export async function login(email?: string, password?: string): Promise<boolean> {
  await logger.info(`[Auth] Attempting login for account: "${email || ''}"`)

  if (!email || !password) {
    await logger.warn('[Auth] Missing email or password for login')
    return false
  }

  doclnClient.setStoredCookies('')
  await storage.remove(STORAGE_SESSION_COOKIE_KEY)
  await storage.remove(STORAGE_USER_PROFILE_KEY)

  try {
    const { csrfToken, cookies } = await fetchCsrfTokenAndSession()
    if (!csrfToken) {
      await logger.warn('[Auth] Unable to retrieve CSRF token for login request')
      return false
    }

    if (typeof globalThis.fetch === 'function') {
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      const bodyParams = new URLSearchParams()
      bodyParams.append('_token', csrfToken)
      bodyParams.append('name', email)
      bodyParams.append('password', password)
      bodyParams.append('remember', 'on')

      const resPost = await globalThis.fetch('https://docln.sbs/login', {
        method: 'POST',
        headers: {
          'User-Agent': userAgent,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': cookies || doclnClient.getStoredCookies(),
          'Referer': 'https://docln.sbs/login',
          'Origin': 'https://docln.sbs'
        },
        body: bodyParams.toString(),
        redirect: 'manual'
      })

      const setCookiesB = resPost.headers.getSetCookie ? resPost.headers.getSetCookie() : []
      if (setCookiesB.length > 0) {
        const cookieJar: Record<string, string> = {}
        const existingParts = (cookies || '').split(';')
        for (const p of existingParts) {
          const keyVal = p.split('=')
          if (keyVal.length >= 2) cookieJar[keyVal[0].trim()] = keyVal.slice(1).join('=').trim()
        }
        for (const c of setCookiesB) {
          const parts = c.split(';')[0].split('=')
          if (parts.length >= 2) cookieJar[parts[0].trim()] = parts.slice(1).join('=').trim()
        }
        const authenticatedCookie = Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ')
        if (authenticatedCookie) {
          await saveSessionCookies(authenticatedCookie)
        }
      }
    } else {
      await doclnClient.postFormText('/login', {
        _token: csrfToken,
        name: email,
        password: password
      }, {
        'Referer': 'https://docln.sbs/login',
        'Cookie': cookies || doclnClient.getStoredCookies()
      })
    }

    const state = await checkConnection()
    await logger.info(`[Auth] Login Result -> isLoggedIn: ${state.isLoggedIn}, Username: ${state.username || state.userId || 'N/A'}`)
    return state.isLoggedIn
  } catch (err: any) {
    if (String(err?.message || err).includes('Redirect')) {
      const state = await checkConnection()
      await logger.info(`[Auth] Login Result (Redirect) -> isLoggedIn: ${state.isLoggedIn}, Username: ${state.username || state.userId || 'N/A'}`)
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

  await logger.info(`[Auth] Settings Action -> Attempting login for account: "${email}"`)

  if (!email || !password) {
    await logger.warn('[Auth] Missing email or password in settings action')
    return {
      success: false,
      message: 'Vui lòng nhập đầy đủ Email và Mật khẩu.'
    }
  }

  try {
    await storage.set(STORAGE_CREDENTIALS_KEY, { email, password })
    const isSuccess = await login(email, password)
    const state = await checkConnection()

    if (isSuccess && state.isLoggedIn) {
      const usernameInfo = state.username ? ` (${state.username})` : (state.userId ? ` (ID: ${state.userId})` : '')
      return {
        success: true,
        message: `Đăng nhập & Kết nối Hako thành công!${usernameInfo}`
      }
    } else {
      await storage.remove(STORAGE_CREDENTIALS_KEY)
      await storage.remove(STORAGE_USER_PROFILE_KEY)
      return {
        success: false,
        message: 'Đăng nhập không thành công. Vui lòng kiểm tra lại Email và Mật khẩu.'
      }
    }
  } catch (err) {
    await logger.warn('[Auth] Error in loginAndCheckConnection:', err)
    return {
      success: false,
      message: `Lỗi kết nối Hako: ${String(err)}`
    }
  }
}
