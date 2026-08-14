'use strict'

const assert = require('node:assert/strict')
const {
  extractCsrfToken,
  parseConnectionState,
  fetchUserProfileName,
  checkConnection,
  checkConnectionAction,
  clearSession,
  saveSessionCookies,
  loadStoredSession,
  loginAndCheckConnection,
  doclnClient,
  initExtensionApi
} = require('../../dist/index')

module.exports = async function runAuthTests() {
  console.log('[Test Scraper Auth] Starting authentication unit tests...')

  const storageMap = new Map()
  const mockNetworkRequests = []

  initExtensionApi({
    version: '1.0.0',
    extension: { id: 'test-auth' },
    logger: {
      info: async () => undefined,
      warn: async () => undefined,
      error: async () => undefined
    },
    network: {
      fetchText: async (url, options) => {
        mockNetworkRequests.push({ url, options })
        if (url.includes('/thanh-vien/12345')) {
          return `
            <html>
              <body>
                <h3 class="profile-intro_name text-lg font-bold">HaiDoan Hako User</h3>
              </body>
            </html>
          `
        }
        if (url.endsWith('/')) {
          return `
            <html>
              <body>
                <div id="navbar-user">
                  <div class="nav-user_icon">
                    <div class="nav-user_avatar"><img src="/avatar.jpg"></div>
                    <ul class="account-sidebar">
                      <li><a href="/thanh-vien/12345"><span>HaiDoan</span></a></li>
                      <li><a href="/logout">Thoát</a></li>
                    </ul>
                  </div>
                </div>
              </body>
            </html>
          `
        }
        return '<html><body>OK</body></html>'
      },
      fetchJson: async () => ({}),
      fetchDataUrl: async () => ''
    },
    storage: {
      get: async key => storageMap.get(key) || null,
      set: async (key, val) => { storageMap.set(key, val) },
      remove: async key => { storageMap.delete(key) },
      createAssetUrl: async () => null
    }
  })

  // 1. Test CSRF Token extraction
  const htmlMetaToken = `<html><head><meta name="csrf-token" content="TEST_CSRF_TOKEN_12345"></head><body></body></html>`
  assert.equal(extractCsrfToken(htmlMetaToken), 'TEST_CSRF_TOKEN_12345', 'CSRF meta token extraction failed')

  const htmlInputToken = `<html><body><form><input name="_token" value="TEST_INPUT_TOKEN_67890"></form></body></html>`
  assert.equal(extractCsrfToken(htmlInputToken), 'TEST_INPUT_TOKEN_67890', 'CSRF input token extraction failed')

  // 2. Test parseConnectionState
  const guestHtml = `<html><body><div class="ln-comment_sign-in">Bạn phải <a href="/login">đăng nhập</a></div></body></html>`
  assert.equal(parseConnectionState(guestHtml).isLoggedIn, false, 'Guest user should have isLoggedIn: false')

  const loggedInHtml = `
    <html>
      <body>
        <div id="navbar-user">
          <div class="nav-user_avatar"><img src="/avatar.jpg"></div>
          <a href="/thanh-vien/12345">HaiDoan</a>
          <a href="/logout">Thoát</a>
        </div>
      </body>
    </html>
  `
  const loggedInState = parseConnectionState(loggedInHtml)
  assert.equal(loggedInState.isLoggedIn, true, 'Logged in user should be recognized')
  assert.equal(loggedInState.userId, '12345', 'User ID should be extracted')

  // 3. Test profile name extraction & connection checks
  storageMap.set('hako_session_cookie', 'session_cookie=abc123val')
  doclnClient.setStoredCookies('')
  mockNetworkRequests.length = 0

  const name = await fetchUserProfileName('12345')
  assert.equal(name, 'HaiDoan Hako User', 'fetchUserProfileName should extract name from h3.profile-intro_name')

  const state = await checkConnection()
  assert.equal(state.isLoggedIn, true, 'checkConnection should report isLoggedIn: true')
  assert.equal(state.userId, '12345', 'checkConnection should report userId: 12345')
  assert.equal(state.username, 'HaiDoan Hako User', 'checkConnection should resolve profile username')

  const actionRes = await checkConnectionAction()
  assert.equal(actionRes.success, true, 'checkConnectionAction should succeed')
  assert.ok(actionRes.message.includes('HaiDoan Hako User'), 'Message should contain username')

  // 4. Test credentials: 'omit' option in network requests
  for (const req of mockNetworkRequests) {
    assert.equal(req.options.credentials, 'omit', `Request to ${req.url} must specify credentials: 'omit'`)
  }

  // 5. Test saveSessionCookies, loadStoredSession, & clearSession
  const testCookie = 'XSRF-TOKEN=test_xsrf; ln_session=test_session_12345'
  await saveSessionCookies(testCookie)
  assert.equal(doclnClient.getStoredCookies(), testCookie)
  assert.equal(await loadStoredSession(), testCookie)

  storageMap.set('hako_user_profile', { isLoggedIn: true, username: 'TestUser' })
  storageMap.set('hako_credentials', { email: 'test@example.com', password: 'secret' })

  const clearRes = await clearSession()
  assert.equal(clearRes.success, true)
  assert.equal(doclnClient.getStoredCookies(), '')
  assert.equal(storageMap.has('hako_session_cookie'), false)
  assert.equal(storageMap.has('hako_user_profile'), false)
  assert.equal(storageMap.has('hako_credentials'), false)

  // 6. Test loginAndCheckConnection validation
  const emptyRes = await loginAndCheckConnection({})
  assert.equal(emptyRes.success, false, 'Empty login should fail')

  doclnClient.setStoredCookies('')
  console.log('[Test Scraper Auth] All authentication unit tests passed! 🚀')
}
