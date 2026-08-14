'use strict'

const assert = require('node:assert/strict')
const { parseTotalCommentsFromHtml, parseCommentGroupHtml } = require('../dist/index')

console.log('[Test Chapter Comment] Starting unit tests...')

// 1. Test parsing total comment count from chapter page HTML header
const chapterHeaderHtml = `
  <header class="sect-header tab-list dark:bg-[#2a2a2a] dark:border-[#2a2a2a]">
    <span class="sect-title tab-title" data-tab-index="1">Bình luận <span class="comments-count">(12)</span></span>
  </header>
`
const totalCount = parseTotalCommentsFromHtml(chapterHeaderHtml)
assert.strictEqual(totalCount, 12, 'Should correctly extract 12 from .comments-count in chapter header')

// 2. Test fallback/variant HTML structures
const variantHtml1 = `<span class="comments-count">(150)</span>`
assert.strictEqual(parseTotalCommentsFromHtml(variantHtml1), 150, 'Should extract 150 from isolated .comments-count')

const emptyHtml = `<div>No comments header</div>`
assert.strictEqual(parseTotalCommentsFromHtml(emptyHtml), 0, 'Should return 0 when no .comments-count is present')

// 3. Test regex matching of chapter ref URL (/truyen/253-overlord/c10235-minh-hoa)
const targetRef = '/truyen/253-overlord/c10235-minh-hoa'
const chapMatch = targetRef.match(/\/c(\d+)/) || targetRef.match(/c(\d+)/)
assert.ok(chapMatch, 'Should match chapter slug')
assert.strictEqual(parseInt(chapMatch[1], 10), 10235, 'Should parse chapter ID as 10235')

// 4. Test parsing comments for chapter ID 10235
const sampleCommentsHtml = `
  <div class="ln-comment-group">
    <div id="ln-comment-102" class="ln-comment-item mt-3 clear" data-comment="102">
      <a class="ln-username" href="/thanh-vien/999">Ains Ooal Gown</a>
      <div class="ln-comment-content long-text">Subarashii!</div>
      <time class="timeago" datetime="2026-08-14T21:00:00+07:00">14-08-2026</time>
      <span class="likecount">5</span>
    </div>
  </div>
`
const comments = parseCommentGroupHtml(sampleCommentsHtml, 10235)
assert.strictEqual(comments.length, 1, 'Should parse 1 comment group')
assert.strictEqual(comments[0].user_name, 'Ains Ooal Gown', 'Username should be Ains Ooal Gown')
assert.strictEqual(comments[0].total_like, 5, 'Total like count should be 5')

console.log('[Test Chapter Comment] All chapter comment unit tests passed successfully! 🚀')
