'use strict'

const assert = require('node:assert/strict')
const { ensureChapterCommentState, fetchComments, initExtensionApi, resetExtensionApiForTest } = require('../dist/index')

module.exports = async function runCommentSwitchReverseTests() {
  console.log('[Test Comment Switch Reverse] Starting unit tests...')

  const postedPayloads = []

  resetExtensionApiForTest()
  initExtensionApi({
    version: '1.0.0',
    extension: { id: 'test-reverse' },
    logger: {
      info: async () => {},
      warn: async () => {},
      error: async () => {}
    },
    network: {
      fetchText: async (url) => {
        return `
          <html>
            <head><meta name="csrf-token" content="CSRF_TOKEN_TEST"></head>
            <body>
              <div wire:snapshot="{&quot;data&quot;:{&quot;setting&quot;:true},&quot;memo&quot;:{&quot;id&quot;:&quot;snap123&quot;,&quot;name&quot;:&quot;pub.comment.view.components.toggle-chapter-comment&quot;}}" wire:id="snap123">
                <button role="switch"></button>
              </div>
            </body>
          </html>
        `
      },
      fetchJson: async (url, options) => {
        if (options && options.body) {
          postedPayloads.push(options.body)
        }
        return { status: 'success', html: '<div class="ln-comment-group"><div id="ln-comment-1" class="ln-comment-item" data-comment="1"><a class="ln-username" href="/thanh-vien/1">User A</a><div class="ln-comment-content">Comment 1</div></div></div>' }
      },
      fetchDataUrl: async () => ''
    },
    storage: { get: async () => null, set: async () => {}, remove: async () => {}, createAssetUrl: async () => null }
  })

  const htmlSettingTrue = `
    <html>
      <head><meta name="csrf-token" content="CSRF_TOKEN_TEST"></head>
      <body>
        <div wire:snapshot="{&quot;data&quot;:{&quot;setting&quot;:true},&quot;memo&quot;:{&quot;id&quot;:&quot;snap123&quot;,&quot;name&quot;:&quot;pub.comment.view.components.toggle-chapter-comment&quot;}}" wire:id="snap123">
          <button role="switch"></button>
        </div>
      </body>
    </html>
  `

  // Test 1: ensureChapterCommentState with hideChapterComments = false when current setting is true
  // Should trigger Livewire update to toggle setting to false
  postedPayloads.length = 0
  const resRevert = await ensureChapterCommentState('/truyen/100-test', false, htmlSettingTrue)
  assert.strictEqual(resRevert, true, 'ensureChapterCommentState should return true on success')
  assert.strictEqual(postedPayloads.length, 1, 'Should issue 1 Livewire toggle update call to revert setting')
  assert.ok(postedPayloads[0].includes('"method":"toggle"'), 'Payload should call toggle method')

  // Test 2: ensureChapterCommentState with hideChapterComments = true when current setting is true
  // Should NOT send Livewire update since already in desired state
  postedPayloads.length = 0
  const resAlreadyTrue = await ensureChapterCommentState('/truyen/100-test', true, htmlSettingTrue)
  assert.strictEqual(resAlreadyTrue, true, 'ensureChapterCommentState should return true')
  assert.strictEqual(postedPayloads.length, 0, 'No Livewire toggle should be sent when setting matches hideChapterComments')

  // Test 3: fetchComments with commentScope = 'all' when Hako session has hideChapterComments = true
  // Should trigger Livewire update to toggle setting to false
  postedPayloads.length = 0
  const commentsRes = await fetchComments({ bookRef: '100-test', commentScope: 'all', page: 1 })
  assert.ok(commentsRes.data, 'fetchComments should return data')
  assert.ok(postedPayloads.some(body => body.includes('"method":"toggle"')), 'fetchComments with commentScope all must trigger toggle to show all comments')

  console.log('[Test Comment Switch Reverse] All reverse comment switching tests passed successfully! 🚀')
}
