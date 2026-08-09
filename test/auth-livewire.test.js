'use strict'

const assert = require('node:assert')
const { extractCsrfToken, parseConnectionState, getLivewireSnapshot, parseToggleSetting, loginAndCheckConnection, initExtensionApi } = require('../dist/index')

initExtensionApi({
  version: '1.0.0',
  extension: { id: 'test' },
  logger: { info: async () => {}, warn: async () => {}, error: async () => {} },
  network: { fetchText: async () => '', fetchJson: async () => ({}), fetchDataUrl: async () => '' },
  storage: { get: async () => null, set: async () => {}, remove: async () => {}, createAssetUrl: async () => null }
})

console.log('[Test Auth & Livewire] Starting unit tests...')

// 1. Test CSRF Token extraction
const htmlMetaToken = `<html><head><meta name="csrf-token" content="TEST_CSRF_TOKEN_12345"></head><body></body></html>`
assert.strictEqual(extractCsrfToken(htmlMetaToken), 'TEST_CSRF_TOKEN_12345', 'CSRF meta token extraction failed')

const htmlInputToken = `<html><body><form><input name="_token" value="TEST_INPUT_TOKEN_67890"></form></body></html>`
assert.strictEqual(extractCsrfToken(htmlInputToken), 'TEST_INPUT_TOKEN_67890', 'CSRF input token extraction failed')

// 2. Test parseConnectionState
const guestHtml = `
<html>
  <body>
    <div class="ln-comment_sign-in">
      Bạn phải <a href="/login">đăng nhập</a> hoặc <a href="/register">tạo tài khoản</a> để bình luận.
    </div>
  </body>
</html>
`
const guestState = parseConnectionState(guestHtml)
assert.strictEqual(guestState.isLoggedIn, false, 'Guest user should have isLoggedIn: false')

const loggedInHtml = `
<html>
  <body>
    <div id="navbar-user">
      <div class="nav-user_icon">
        <div class="nav-user_avatar">
          <img src="https://i.hako.vip/lightnovel/users/ua12345-avatar.jpg" alt="Your avatar">
        </div>
        <ul class="account-sidebar hidden-block unstyled none">
          <li>
            <a href="/thanh-vien/12345"><i class="fas fa-user"></i><span>HaiDoan</span></a>
          </li>
          <li>
            <a href="/logout"><i class="fas fa-sign-out-alt"></i><span>Thoát</span></a>
          </li>
        </ul> 
      </div>
    </div>
  </body>
</html>
`
const loggedInState = parseConnectionState(loggedInHtml)
assert.strictEqual(loggedInState.isLoggedIn, true, 'Logged-in user with #navbar-user should have isLoggedIn: true')
assert.strictEqual(loggedInState.userId, '12345', 'User ID extraction failed')

// 3. Test getLivewireSnapshot & parseToggleSetting
const livewireHtmlTrue = `
<div wire:snapshot="{&quot;data&quot;:{&quot;setting&quot;:true},&quot;memo&quot;:{&quot;id&quot;:&quot;xyz123&quot;,&quot;name&quot;:&quot;pub.comment.view.components.toggle-chapter-comment&quot;}}" wire:id="xyz123">
  <button role="switch"></button>
</div>
`
const snapTrue = getLivewireSnapshot(livewireHtmlTrue)
assert.ok(snapTrue, 'Snapshot should be extracted')
assert.strictEqual(parseToggleSetting(snapTrue), true, 'Setting should be true')

const livewireHtmlFalse = `
<div wire:snapshot="{&quot;data&quot;:{&quot;setting&quot;:false},&quot;memo&quot;:{&quot;id&quot;:&quot;abc456&quot;,&quot;name&quot;:&quot;pub.comment.view.components.toggle-chapter-comment&quot;}}" wire:id="abc456">
  <button role="switch"></button>
</div>
`
const snapFalse = getLivewireSnapshot(livewireHtmlFalse)
assert.ok(snapFalse, 'Snapshot should be extracted')
assert.strictEqual(parseToggleSetting(snapFalse), false, 'Setting should be false')

// 4. Test loginAndCheckConnection validation
loginAndCheckConnection({}).then(res => {
  assert.strictEqual(res.success, false, 'Empty credentials should return success: false')
  console.log('[Test Auth & Livewire] Settings Action validation test passed!')
}).catch(err => {
  console.error(err)
  process.exit(1)
})

console.log('[Test Auth & Livewire] All unit tests passed successfully! 🚀')
