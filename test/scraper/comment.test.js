'use strict'

const assert = require('node:assert/strict')
const {
  parseTotalCommentsFromHtml,
  parseCommentGroupHtml,
  getLivewireSnapshot,
  parseToggleSetting,
  ensureChapterCommentState,
  fetchComments,
  initExtensionApi,
  resetExtensionApiForTest
} = require('../../dist/index')

module.exports = async function runCommentTests() {
  console.log('[Test Scraper Comment] Starting comment unit tests...')

  // 1. Test parsing total comment count from HTML header
  const chapterHeaderHtml = `
    <header class="sect-header tab-list dark:bg-[#2a2a2a] dark:border-[#2a2a2a]">
      <span class="sect-title tab-title" data-tab-index="1">Bình luận <span class="comments-count">(12)</span></span>
    </header>
  `
  assert.equal(parseTotalCommentsFromHtml(chapterHeaderHtml), 12, 'Should extract 12 from .comments-count in chapter header')
  assert.equal(parseTotalCommentsFromHtml('<span class="comments-count">(150)</span>'), 150)
  assert.equal(parseTotalCommentsFromHtml('<div>No comments</div>'), 0)

  // 2. Test comment group parsing & scope filtering (series vs chapter comment)
  const sampleHtml = `
    <div class="ln-comment-group">
      <div id="ln-comment-1" class="ln-comment-item mt-3 clear" data-comment="1">
        <a class="ln-username" href="/thanh-vien/1">User A</a>
        <div class="ln-comment-content long-text">Series comment text</div>
        <time class="timeago" datetime="2026-01-01T00:00:00+07:00">01-01-2026</time>
      </div>
    </div>
    <div class="ln-comment-group">
      <div id="ln-comment-2" class="ln-comment-item mt-3 clear" data-comment="2">
        <a class="ln-username" href="/thanh-vien/2">User B</a>
        <span class="text-sm"><a href="/truyen/100/c500-chuong-1">Chương 01</a></span>
        <div class="ln-comment-content long-text">Chapter comment text</div>
        <time class="timeago" datetime="2026-01-02T00:00:00+07:00">02-01-2026</time>
      </div>
    </div>
  `
  const comments = parseCommentGroupHtml(sampleHtml, 100)
  assert.equal(comments.length, 2, 'Should parse 2 comments total')
  assert.equal(comments[0].chapter_id, undefined, 'Series comment should not have chapter_id')
  assert.equal(comments[1].chapter_id, 'truyen/100/c500-chuong-1', 'Chapter comment should parse chapter_id as slug path without leading slash')
  assert.equal(comments[1].chapter_name, 'Chương 01', 'Chapter comment should parse chapter_name')

  const seriesOnly = comments.filter(c => c.chapter_id === undefined)
  assert.equal(seriesOnly.length, 1, 'Series scope filter should yield only 1 series comment')
  assert.equal(seriesOnly[0].socket_id, '1', 'Filtered series comment ID should be string 1')

  // 3. Test Livewire Snapshot & Toggle Setting Parsing
  const livewireHtmlTrue = `
    <html>
      <head><meta name="csrf-token" content="CSRF_TOKEN_TEST"></head>
      <body>
        <div wire:snapshot="{&quot;data&quot;:{&quot;setting&quot;:true},&quot;memo&quot;:{&quot;id&quot;:&quot;xyz123&quot;,&quot;name&quot;:&quot;pub.comment.view.components.toggle-chapter-comment&quot;}}" wire:id="xyz123">
          <button role="switch"></button>
        </div>
      </body>
    </html>
  `
  const snapTrue = getLivewireSnapshot(livewireHtmlTrue)
  assert.ok(snapTrue, 'Snapshot should be extracted')
  assert.equal(parseToggleSetting(snapTrue), true, 'Setting should be true')

  // 4. Test Livewire comment toggle state & reverse switching
  const postedPayloads = []
  resetExtensionApiForTest()
  initExtensionApi({
    version: '1.0.0',
    extension: { id: 'test-comment' },
    logger: { info: async () => {}, warn: async () => {}, error: async () => {} },
    network: {
      fetchText: async () => livewireHtmlTrue,
      fetchJson: async (url, options) => {
        if (options && options.body) postedPayloads.push(options.body)
        return { status: 'success', html: sampleHtml }
      },
      fetchDataUrl: async () => ''
    },
    storage: { get: async () => null, set: async () => {}, remove: async () => {}, createAssetUrl: async () => null }
  })

  // hideChapterComments = false when current setting is true -> should trigger Livewire update toggle
  postedPayloads.length = 0
  const resRevert = await ensureChapterCommentState('/truyen/100-test', false, livewireHtmlTrue)
  assert.equal(resRevert, true)
  assert.equal(postedPayloads.length, 1)
  assert.ok(postedPayloads[0].includes('"method":"toggle"'))

  // hideChapterComments = true when current setting is true -> should NOT send Livewire update
  postedPayloads.length = 0
  const resAlreadyTrue = await ensureChapterCommentState('/truyen/100-test', true, livewireHtmlTrue)
  assert.equal(resAlreadyTrue, true)
  assert.equal(postedPayloads.length, 0)

  // fetchComments with commentScope = 'all' when setting is true -> should trigger Livewire update toggle
  postedPayloads.length = 0
  const commentsRes = await fetchComments({ bookRef: '100-test', commentScope: 'all', page: 1 })
  assert.ok(commentsRes.data)
  assert.ok(postedPayloads.some(body => body.includes('"method":"toggle"')))

  console.log('[Test Scraper Comment] All comment unit tests passed! 🚀')
}
