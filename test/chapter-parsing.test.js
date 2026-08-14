'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')

async function runChapterParsingTests() {
  console.log('[Test Chapter Parsing] Starting chapter parsing unit tests...')
  const dist = require(path.join(__dirname, '..', 'dist', 'index.js'))

  const { parseChapterHtml, parseHakoDate, parseChapterNameFromDoc } = dist

  // 1. Test parseHakoDate
  const isoWithTz = parseHakoDate('2026-05-06T14:55:56+07:00')
  assert.equal(isoWithTz, '2026-05-06T07:55:56.000Z', 'parseHakoDate should handle ISO strings with timezone')

  const dmyHms = parseHakoDate('06-05-2026 14:55:56')
  assert.equal(dmyHms, '2026-05-06T07:55:56.000Z', 'parseHakoDate should handle DD-MM-YYYY HH:mm:ss in UTC+7')

  const dmySlash = parseHakoDate('16/05/2023')
  assert.ok(dmySlash.startsWith('2023-05-15T17:00:00') || dmySlash.startsWith('2023-05-16'), 'parseHakoDate should handle DD/MM/YYYY')

  // 2. Test standard Hako chapter HTML parsing
  const standardHtml = `
    <!doctype html>
    <html>
    <head>
      <title>Đọc "Cậu chẳng thể hôn được đâu ha?" - Chương kết - Cổng Light Novel - Đọc Light Novel</title>
      <link rel="canonical" href="https://docln.sbs/truyen/15056-kisu-nante-dekinai/c416377-chuong-ket">
    </head>
    <body>
      <div class="title-top" style="padding-top: 20px">
        <h2 class="title-item text-xl font-bold" align="center">Vol 3</h2>
        <h4 class="title-item text-base font-bold" align="center">Chương kết</h4>
        <h6 class="title-item font-bold" align="center" aria-hidden="true">
          <a href="https://docln.sbs/truyen/15056-kisu-nante-dekinai/c416377-chuong-ket#chapter-comments">23 Bình luận</a> -
          Độ dài: 1,562 từ - Cập nhật:
          <time class="topic-time timeago" title="06-05-2026 14:55:56" datetime="2026-05-06T14:55:56+07:00"></time>
        </h6>
      </div>

      <section id="chapters" class="rd_sidebar">
        <div class="rd_sidebar-name">
          <h5><a href="/truyen/15056-kisu-nante-dekinai">Cậu chẳng thể hôn được đâu ha?</a></h5>
        </div>
        <ul id="chap_list">
          <li><a href="/truyen/15056-kisu-nante-dekinai/c113038-minh-hoa">Vol 1</a></li>
          <li><a href="/truyen/15056-kisu-nante-dekinai/c119148-minh-hoa">Vol 2</a></li>
          <li class="current"><a href="/truyen/15056-kisu-nante-dekinai/t23669-vol-3">Vol 3</a></li>
          <ul class="sub-chap_list">
            <li><a href="/truyen/15056-kisu-nante-dekinai/c128622-minh-hoa">Minh họa</a></li>
            <li><a href="/truyen/15056-kisu-nante-dekinai/c218027-chuong-mo-dau">Chương mở đầu</a></li>
            <li><a href="/truyen/15056-kisu-nante-dekinai/c282046-chuong-01">Chương 01</a></li>
            <li><a href="/truyen/15056-kisu-nante-dekinai/c416377-chuong-ket">Chương kết</a></li>
          </ul>
        </ul>
      </section>

      <div class="chapter-content">
        <p>Đoạn văn thứ nhất.</p>
        <p><img src="https://i.hako.vip/lightnovel/illusts/u2-65912db4-17e4-4264-8622-13ee248d6fc6.jpg" /></p>
        <p>Đoạn văn thứ hai.</p>
      </div>
    </body>
    </html>
  `

  const parsed = parseChapterHtml(standardHtml, '/truyen/15056-kisu-nante-dekinai/c416377-chuong-ket')
  assert.equal(parsed.chapter_name, 'Chương kết', 'chapter_name must be extracted accurately from h4')
  assert.equal(parsed.chapter_id, '/truyen/15056-kisu-nante-dekinai/c416377-chuong-ket', 'chapter_id must match path')
  assert.equal(parsed.book_id, '15056-kisu-nante-dekinai', 'book_id must match novel slug')
  assert.equal(parsed.volume_id, '23669', 'volume_id must be extracted from current volume link')
  assert.equal(parsed.chapter_number, 4, 'chapter_number must be 4 based on index in sub_chap_list')
  assert.equal(parsed.total_index, 1562, 'total_index must be the word count when present')
  assert.equal(parsed.created_at, '2026-05-06T07:55:56.000Z', 'created_at must be parsed ISO date')
  assert.equal(parsed.updated_at, '2026-05-06T07:55:56.000Z', 'updated_at must be parsed ISO date')
  assert.equal(parsed.content.length, 3, 'content must have 3 paragraphs including image')
  assert.equal(parsed.content[1], '@{https://i.hako.vip/lightnovel/illusts/u2-65912db4-17e4-4264-8622-13ee248d6fc6.jpg}', 'chapter image must use direct normalized URL without weserv proxy')

  // 3. Test fallback layout without h4
  const fallbackHtml = `
    <!doctype html>
    <html>
    <head>
      <title>Đọc Test Novel - Hồi 1: Khởi Đầu - Cổng Light Novel</title>
      <link rel="canonical" href="https://docln.sbs/truyen/9999-test/c12345-hoi-1">
    </head>
    <body>
      <div class="title-top">Hồi 1: Khởi Đầu</div>
      <div class="chapter-content">
        <p>Nội dung khởi đầu.</p>
      </div>
    </body>
    </html>
  `
  const parsedFallback = parseChapterHtml(fallbackHtml, 'c12345-hoi-1')
  assert.equal(parsedFallback.chapter_name, 'Hồi 1: Khởi Đầu', 'chapter_name fallback should work')
  assert.equal(parsedFallback.chapter_number, 1, 'chapter_number should fallback to 1')
  // 4. Test convertChapterImagesToBase64
  const { convertChapterImagesToBase64 } = dist
  if (typeof convertChapterImagesToBase64 === 'function') {
    const inputParagraphs = [
      'Đoạn văn thứ nhất',
      '@{data:image/png;base64,alreadyBase64}',
      '@{https://example.com/nonexistent.jpg}'
    ]
    const converted = await convertChapterImagesToBase64(inputParagraphs)
    assert.equal(converted[0], 'Đoạn văn thứ nhất', 'Text paragraph should remain untouched')
    assert.equal(converted[1], '@{data:image/png;base64,alreadyBase64}', 'Already base64 image should remain untouched')
    assert.ok(converted[2].startsWith('@{'), 'Image entry should retain @{} wrapper on fallback')
  }

  console.log('[Test Chapter Parsing] All chapter parsing tests passed successfully! 🚀')
}

module.exports = runChapterParsingTests

if (require.main === module) {
  runChapterParsingTests().catch(err => {
    console.error(err)
    process.exit(1)
  })
}
