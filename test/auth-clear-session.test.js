'use strict';

const assert = require('node:assert/strict');
const { clearSession, saveSessionCookies, loadStoredSession, doclnClient, initExtensionApi } = require('../dist/index');

module.exports = async function runClearSessionTests() {
  console.log('[Test Clear Session] Testing logout and session removal...');

  const storageMap = new Map();
  const mockNetworkRequests = [];

  const mockNovelApi = {
    version: '1.0.0',
    extension: { id: 'test-extension' },
    logger: {
      info: async () => undefined,
      warn: async () => undefined,
      error: async () => undefined
    },
    network: {
      fetchText: async (url, options) => {
        mockNetworkRequests.push({ url, options });
        return '<html><body>Logged out</body></html>';
      },
      fetchJson: async () => ({}),
      fetchDataUrl: async () => ''
    },
    storage: {
      get: async key => storageMap.get(key) || null,
      set: async (key, value) => { storageMap.set(key, value); },
      remove: async key => { storageMap.delete(key); },
      createAssetUrl: async () => null
    }
  };

  initExtensionApi(mockNovelApi);

  // 1. Save session cookies
  const testCookie = 'XSRF-TOKEN=test_xsrf; ln_session=test_session_12345';
  await saveSessionCookies(testCookie);

  assert.equal(doclnClient.getStoredCookies(), testCookie, 'Memory cookie should match saved cookie');
  assert.equal(storageMap.get('hako_session_cookie'), testCookie, 'Storage should contain hako_session_cookie');

  // Load session
  const loaded = await loadStoredSession();
  assert.equal(loaded, testCookie, 'loadStoredSession should return saved cookie');

  // Set mock profile & credentials in storage
  storageMap.set('hako_user_profile', { isLoggedIn: true, username: 'TestUser' });
  storageMap.set('hako_credentials', { email: 'test@example.com', password: 'secret' });

  assert.ok(storageMap.has('hako_session_cookie'), 'hako_session_cookie exists before clear');
  assert.ok(storageMap.has('hako_user_profile'), 'hako_user_profile exists before clear');
  assert.ok(storageMap.has('hako_credentials'), 'hako_credentials exists before clear');

  // 2. Perform clearSession (Logout)
  const result = await clearSession();

  assert.equal(result.success, true, 'clearSession should return success: true');
  assert.equal(doclnClient.getStoredCookies(), '', 'Memory cookies must be reset to empty string after clearSession');
  assert.equal(storageMap.has('hako_session_cookie'), false, 'hako_session_cookie MUST be removed from storage');
  assert.equal(storageMap.has('hako_user_profile'), false, 'hako_user_profile MUST be removed from storage');
  assert.equal(storageMap.has('hako_credentials'), false, 'hako_credentials MUST be removed from storage');

  // Check if /logout endpoint was requested to invalidate remote session
  const logoutReq = mockNetworkRequests.find(r => r.url.endsWith('/logout'));
  assert.ok(logoutReq, 'Remote /logout GET request should have been dispatched to invalidate server session');

  console.log('[Test Clear Session] All logout and session removal assertions passed! 🚀');
}
