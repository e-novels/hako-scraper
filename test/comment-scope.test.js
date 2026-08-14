'use strict'

const assert = require('node:assert/strict')
const { parseCommentGroupHtml } = require('../dist/index')

console.log('[Test Comment Scope] Starting unit tests...')

// HTML containing both series comment and chapter comment
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

assert.strictEqual(comments.length, 2, 'Should parse 2 comments total')
assert.strictEqual(comments[0].chapter_id, undefined, 'Series comment should not have chapter_id')
assert.strictEqual(comments[1].chapter_id, '/truyen/100/c500-chuong-1', 'Chapter comment should parse chapter_id as full path')
assert.strictEqual(comments[1].chapter_name, 'Chương 01', 'Chapter comment should parse chapter_name')

// Filter for series scope:
const seriesOnly = comments.filter(c => c.chapter_id === undefined)
assert.strictEqual(seriesOnly.length, 1, 'Series scope filter should yield only 1 series comment')
assert.strictEqual(seriesOnly[0].socket_id, '1', 'Filtered series comment ID should be string 1')

console.log('[Test Comment Scope] All comment scope unit tests passed successfully! 🚀')
