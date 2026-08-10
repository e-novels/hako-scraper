'use strict'

const assert = require('node:assert')
const {
  fetchUserProfileName,
  checkConnectionAction,
  checkConnection,
  doclnClient,
  initExtensionApi
} = require('../dist/index')

module.exports = async function runAuthCheckConnectionTests() {
  console.log('[Test Auth & Check Connection] Starting unit tests...')

  let fetchedRequests = []
  const storageMap = new Map()
  storageMap.set('hako_session_cookie', 'session_cookie=abc123val')

  initExtensionApi({
    version: '1.0.0',
    extension: { id: 'test' },
    logger: { info: async () => {}, warn: async () => {}, error: async () => {} },
    network: {
      fetchText: async (url, options) => {
        fetchedRequests.push({ url, options })
        if (url.includes('/thanh-vien/12345')) {
          return `
            <html>
              <body>
                <h3 class="profile-intro_name text-lg font-bold ">
                  HaiDoan Hako User
                </h3>
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
        return ''
      },
      fetchJson: async (url, options) => {
        fetchedRequests.push({ url, options })
        return {}
      },
      fetchDataUrl: async (url, options) => {
        fetchedRequests.push({ url, options })
        return ''
      }
    },
    storage: {
      get: async key => storageMap.get(key) || null,
      set: async (key, val) => { storageMap.set(key, val) },
      remove: async key => { storageMap.delete(key) },
      createAssetUrl: async () => null
    }
  })

  doclnClient.setStoredCookies('')
  fetchedRequests = []
  
  // 1. Test profile name extraction from h3.profile-intro_name
  const name = await fetchUserProfileName('12345')
  assert.strictEqual(name, 'HaiDoan Hako User', 'fetchUserProfileName should extract name from h3.profile-intro_name')
  
  // 2. Test checkConnection includes profile name fetched from /thanh-vien/<id>
  const state = await checkConnection()
  assert.strictEqual(state.isLoggedIn, true, 'checkConnection should report isLoggedIn: true')
  assert.strictEqual(state.userId, '12345', 'checkConnection should report userId: 12345')
  assert.strictEqual(state.username, 'HaiDoan Hako User', 'checkConnection should resolve username from profile page')

  // 3. Test checkConnectionAction
  const actionRes = await checkConnectionAction()
  assert.strictEqual(actionRes.success, true, 'checkConnectionAction should return success: true')
  assert.ok(actionRes.message.includes('HaiDoan Hako User'), 'checkConnectionAction message should contain profile username')

  // 4. Verify credentials: 'omit' was passed in fetch options to prevent inheriting host app browser cookies
  assert.ok(fetchedRequests.length > 0, 'Requests should have been recorded')
  for (const req of fetchedRequests) {
    assert.strictEqual(req.options.credentials, 'omit', `Request to ${req.url} must specify credentials: 'omit'`)
  }

  doclnClient.setStoredCookies('')
  console.log('[Test Auth & Check Connection] All check connection unit tests passed! 🚀')
}
