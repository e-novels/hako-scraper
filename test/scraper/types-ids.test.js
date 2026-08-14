'use strict'

const assert = require('node:assert/strict')
const {
  parseSearchResultsHtml,
  parseBookDetailHtml,
  parseChapterHtml,
  parseCommentGroupHtml,
  parseReviewsHtml,
  resolveChapterUrl
} = require('../../dist/index')

module.exports = async function runTypesIdsTests() {
  console.log('[Test Scraper Types & IDs] Starting string ID parsing and omission unit tests...')

  // 1. Test parseSearchResultsHtml
  const sampleSearchHtml = `
    <div class="thumb-item-flow">
      <div class="thumb_attr series-title">
        <a href="/truyen/28094-ta-ro-rang-la-hoang-mao-sao-cac-nang-lai-goi-ta-la-dong-minh-cua-chinh-nghia" title="Ta Rõ Ràng Là Hoàng Mao">Ta Rõ Ràng Là Hoàng Mao</a>
      </div>
      <div class="img-in-ratio" style="background-image: url('/img/cover.jpg')"></div>
      <div class="series-owner">Tác giả: Tác Giả A</div>
    </div>
  `
  const searchRes = parseSearchResultsHtml(sampleSearchHtml, 1, 20)
  assert.equal(searchRes.items.length, 1)
  assert.equal(
    searchRes.items[0].book_id,
    '28094-ta-ro-rang-la-hoang-mao-sao-cac-nang-lai-goi-ta-la-dong-minh-cua-chinh-nghia',
    'book_id in search results must be full string slug'
  )
  assert.equal(typeof searchRes.items[0].book_id, 'string')
  assert.deepEqual(searchRes.items[0].authors, [{ author_name: 'Tác Giả A' }], 'authors should not have fake author_id')

  // 2. Test parseBookDetailHtml
  const sampleDetailHtml = `
    <h1 class="series-name">
      <a href="/truyen/28094-ta-ro-rang-la-hoang-mao-sao-cac-nang-lai-goi-ta-la-dong-minh-cua-chinh-nghia">Ta Rõ Ràng Là Hoàng Mao</a>
    </h1>
    <div class="series-cover"><div class="img-in-ratio" style="background-image: url('/img/cover.jpg')"></div></div>
    <div class="info-item"><span class="info-name">Tác giả:</span> <span class="info-value">Tác Giả A</span></div>
    <div class="info-item"><span class="info-name">Họa sĩ:</span> <span class="info-value">Họa Sĩ B</span></div>
    <div class="series-gernes">
      <a class="series-gerne-item" data-genre-id="1">Action</a>
      <a class="series-gerne-item">NoIdGenre</a>
    </div>
    <div class="volume-list" data-id="1001">
      <div class="sect-title">Tập 1</div>
      <ul>
        <li>
          <div class="chapter-name"><a href="/truyen/28094-slug/c12345-chuong-1">Chương 1</a></div>
          <div class="chapter-time">01/01/2026</div>
        </li>
      </ul>
    </div>
    <div class="volume-list">
      <div class="sect-title">Tập 2 (No ID)</div>
      <ul>
        <li>
          <div class="chapter-name"><a href="/c12346-chuong-2">Chương 2</a></div>
          <div class="chapter-time">02/01/2026</div>
        </li>
      </ul>
    </div>
  `
  const detailRes = parseBookDetailHtml(sampleDetailHtml, '28094-slug')
  assert.equal(
    detailRes.book_id,
    '28094-ta-ro-rang-la-hoang-mao-sao-cac-nang-lai-goi-ta-la-dong-minh-cua-chinh-nghia'
  )
  assert.deepEqual(detailRes.authors, [{ author_name: 'Tác Giả A' }], 'detail authors should omit author_id')
  assert.deepEqual(detailRes.artists, [{ artist_name: 'Họa Sĩ B' }], 'detail artists should omit artist_id')
  assert.deepEqual(detailRes.book_genre, [
    { category_id: '1', category_name: 'Action' },
    { category_name: 'NoIdGenre' }
  ], 'category_id should be string or omitted when not present')
  assert.equal(detailRes.volumes[0].volume_id, '1001', 'volume_id should be string when data-id exists')
  assert.equal(detailRes.volumes[0].chapters[0].chapter_id, '/truyen/28094-slug/c12345-chuong-1', 'chapter_id should be full truyen path')
  assert.equal(detailRes.volumes[1].volume_id, undefined, 'volume_id should be omitted when data-id is missing')
  assert.equal(detailRes.volumes[1].chapters[0].chapter_id, '/c12346-chuong-2', 'chapter_id should be string path')

  // 3. Test parseChapterHtml
  const sampleChapterHtml = `
    <html>
      <head>
        <link rel="canonical" href="https://docln.sbs/truyen/28094-ta-ro-rang-la-hoang-mao-sao-cac-nang-lai-goi-ta-la-dong-minh-cua-chinh-nghia/c12345-chuong-1">
      </head>
      <body>
        <div class="title-top">Chương 1</div>
        <div class="chapter-content">
          <p>Nội dung đoạn văn chương 1.</p>
        </div>
      </body>
    </html>
  `
  const chapterRes = parseChapterHtml(sampleChapterHtml, '/truyen/28094-slug/c12345-chuong-1')
  assert.equal(chapterRes.chapter_id, '/truyen/28094-ta-ro-rang-la-hoang-mao-sao-cac-nang-lai-goi-ta-la-dong-minh-cua-chinh-nghia/c12345-chuong-1')
  assert.equal(
    chapterRes.book_id,
    '28094-ta-ro-rang-la-hoang-mao-sao-cac-nang-lai-goi-ta-la-dong-minh-cua-chinh-nghia'
  )
  assert.equal(chapterRes.volume_id, undefined)

  // 4. Test parseCommentGroupHtml
  const sampleCommentHtml = `
    <div class="ln-comment-group">
      <div id="ln-comment-3086692" class="ln-comment-item mt-3 clear" data-comment="3086692">
        <a class="ln-username" href="/thanh-vien/10395">User X</a>
        <span class="text-sm"><a href="/truyen/28094-slug/c558990-chuong-1">Chương 1</a></span>
        <div class="ln-comment-content long-text">Nội dung bình luận</div>
      </div>
    </div>
  `
  const comments = parseCommentGroupHtml(sampleCommentHtml)
  assert.equal(comments[0].socket_id, '3086692')
  assert.equal(comments[0].user_id, '10395')

  // 5. Test parseReviewsHtml
  const sampleReviewHtml = `
    <div wire:snapshot="{&quot;data&quot;:{&quot;review&quot;:[null,{&quot;class&quot;:&quot;App\\\\Models\\\\SeriesReview&quot;,&quot;key&quot;:1536}]}}" class="mt-5">
      <a class="ln-username" href="/thanh-vien/148873">User Review</a>
      <span class="text-yellow-400"><i class="fas fa-star"></i></span>
      <div class="ln-comment-content long-text">Đánh giá tốt</div>
    </div>
    <div class="mt-5">
      <a class="ln-username" href="/thanh-vien/99999">User Without Key</a>
      <span class="text-yellow-400"><i class="fas fa-star"></i></span>
      <div class="ln-comment-content long-text">Đánh giá không snapshot</div>
    </div>
  `
  const reviews = parseReviewsHtml(sampleReviewHtml)
  assert.equal(reviews[0].interaction_id, '1536')
  assert.equal(reviews[0].user_id, '148873')
  assert.equal(reviews[1].interaction_id, undefined)

  // 6. Test resolveChapterUrl
  assert.equal(resolveChapterUrl('/truyen/253-overlord/c10236-mo-dau'), '/truyen/253-overlord/c10236-mo-dau')
  assert.equal(resolveChapterUrl('truyen/253-overlord/c10236-mo-dau'), '/truyen/253-overlord/c10236-mo-dau')

  console.log('[Test Scraper Types & IDs] All string ID unit tests passed! 🚀')
}
