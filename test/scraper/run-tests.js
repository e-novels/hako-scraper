'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

function readJsonFixture(root, filename) {
  const fixturePath = path.join(root, 'test', 'scraper', 'fixtures', filename)
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
}

module.exports = async function runScraperTests(root, manifest) {
  const searchFixture = readJsonFixture(root, 'search.json')
  const detail = readJsonFixture(root, 'book-detail.json')
  const chapter = readJsonFixture(root, 'chapter.json')
  const html = fs.readFileSync(path.join(root, 'test', 'scraper', 'fixtures', 'chapter.html'), 'utf8')
  assert.equal(manifest.icon, './public/icon.png')
  assert.ok(manifest.permissions.includes('network'))
  assert.ok(manifest.permissions.includes('reader'))
  assert.ok(Array.isArray(manifest.network?.allowedHosts) && manifest.network.allowedHosts.length > 0)
  assert.equal(
    manifest.network.allowedHosts.includes(new URL(manifest.contributes.scraper.site.baseUrl).hostname),
    true
  )
  assert.deepEqual(manifest.contributes.scraper.capabilities.slice().sort(), ['getBookDetail', 'getChapter', 'getComments', 'getFilterOptions', 'getReviews', 'search'])

  async function smokeBundle(filename) {
    const entryPath = path.join(root, 'dist', filename)
    assert.ok(fs.existsSync(entryPath), `${filename} must be built before testing`)
    delete require.cache[require.resolve(entryPath)]
    const extension = require(entryPath)
    const logs = []
    const requests = []
    let handlers

    const mockSearchHtml = `
      <div class="search-advance">
        <div class="search-advance_genre" data-genre-id="1">Action</div>
        <div class="search-advance_genre" data-genre-id="8">Fantasy</div>
      </div>
      <div class="thumb-item-flow">
        <div class="thumb-wrapper">
          <div class="thumb_attr series-title"><a href="/truyen/101-test-book" title="Test Book">Test Book</a></div>
          <div class="img-in-ratio" style="background-image: url('/img/cover.jpg')"></div>
          <div class="series-owner">Tác giả: Author Test</div>
        </div>
      </div>
      <div class="pagination_wrap">
        <a href="/tim-kiem-nang-cao?page=1">1</a>
        <a href="/tim-kiem-nang-cao?page=2">2</a>
      </div>
    `

    const mockNovel = {
      version: '1.0.0',
      extension: { id: manifest.name },
      logger: {
        info: async value => logs.push(value),
        warn: async () => undefined,
        error: async () => undefined
      },
      network: {
        fetchText: async url => {
          requests.push(url)
          const requestUrl = new URL(url)
          if (requestUrl.pathname === '/tim-kiem-nang-cao') {
            if (requestUrl.searchParams.get('title') === 'rate-limited') {
              throw new Error('Source request failed with HTTP 429.')
            }
            return mockSearchHtml
          }
          if (requestUrl.pathname.endsWith('/danh-gia')) {
            return `
              <html>
              <body>
                <div wire:snapshot="{&quot;data&quot;:{&quot;review&quot;:[null,{&quot;class&quot;:&quot;App\\\\Models\\\\SeriesReview&quot;,&quot;key&quot;:1536}]}}" class="mt-5">
                  <div class="flex">
                    <img class="rounded-full" src="/img/noava.png">
                    <a class="ln-username" href="/thanh-vien/148873">Miyazumiiiiiii</a>
                    <span class="text-yellow-400"><i class="fas fa-star"></i></span>
                    <span class="text-yellow-400"><i class="fas fa-star"></i></span>
                    <span class="text-yellow-400"><i class="fas fa-star"></i></span>
                    <span class="text-yellow-400"><i class="fas fa-star"></i></span>
                    <span class="text-gray-300"><i class="fas fa-star"></i></span>
                    <time class="timeago" datetime="2023-07-12T08:24:14+07:00">3 năm</time>
                  </div>
                  <div class="ln-comment-group">
                    <div class="ln-comment-wrapper">
                      <div class="ln-comment-content long-text">nội dung ổn</div>
                      <div class="comment_see_more expand none">Xem thêm</div>
                    </div>
                  </div>
                </div>
              </body>
              </html>
            `
          }
          if (requestUrl.pathname.startsWith('/truyen/27926')) {
            return `
              <html>
              <head><meta name="csrf-token" content="mock-csrf-token"></head>
              <body>
                <h1 class="series-name"><a href="/truyen/27926-test-book">HTML Test Book</a></h1>
                <div class="series-cover"><div class="img-in-ratio" style="background-image: url('/img/cover.jpg')"></div></div>
                <div class="info-item"><span class="info-name">Tác giả:</span> <span class="info-value">Author Test</span></div>
                <div class="info-item"><span class="info-name">Tình trạng:</span> <span class="info-value">Đang tiến hành</span></div>
                <div class="summary-content"><p>HTML summary text</p></div>
                <div class="statistic-item"><div class="statistic-name">Số từ</div><div class="statistic-value">12.345</div></div>
                <div class="statistic-item"><div class="statistic-name">Lượt xem</div><div class="statistic-value">67.890</div></div>
                <div class="volume-list" data-id="1">
                  <div class="sect-title">Volume 1</div>
                  <ul>
                    <li>
                      <div class="chapter-name"><a href="/truyen/27926-test-book/c558990-chuong-1" title="Chương 1">Chương 1</a></div>
                      <div class="chapter-time">05/08/2026</div>
                    </li>
                  </ul>
                </div>
              </body>
              </html>
            `
          }
          if (requestUrl.pathname.startsWith('/c558990')) {
            return `
              <html>
              <head><meta name="csrf-token" content="mock-csrf-token"></head>
              <body>
                <div class="title-top">Chương 1: Mưa Lời Khen</div>
                <div class="chapter-content">
                  <p>Paragraph 1 from HTML chapter.</p>
                  <p>Paragraph 2 from HTML chapter.</p>
                </div>
              </body>
              </html>
            `
          }
          throw new Error(`Unexpected text request: ${url}`)
        },
        fetchJson: async (url, options) => {
          requests.push(url)
          const requestUrl = new URL(url)
          const pathname = requestUrl.pathname
          if (pathname === '/comment/ajax_paging') {
            return {
              status: 'success',
              html: '<div class="ln-comment-group"><div id="ln-comment-3086692" class="ln-comment-item mt-3 clear" data-comment="3086692" data-parent="3086692"><a class="ln-username" href="/thanh-vien/10395">kaguki</a><div class="ln-comment-content long-text">Bình luận test</div><time class="timeago" datetime="2025-11-11T05:59:21+07:00">11-11-2025</time><span class="likecount">5</span></div><div class="ln-comment-reply"><div id="ln-comment-3127671" class="ln-comment-item mt-3 clear" data-comment="3127671" data-parent="3086692"><a class="ln-username" href="/thanh-vien/92265">Reltih Lieh</a><div class="ln-comment-content long-text">Reply test</div><time class="timeago" datetime="2025-12-17T00:55:41+07:00">17-12-2025</time><span class="likecount">1</span></div></div></div>'
            }
          }
          if (pathname === '/comment/fetch_reply') {
            return {
              status: 'success',
              html: '<div id="ln-comment-3127672" class="ln-comment-item mt-3 clear" data-comment="3127672" data-parent="3086692"><a class="ln-username" href="/thanh-vien/92266">Extra User</a><div class="ln-comment-content long-text">Extra reply test</div><time class="timeago" datetime="2025-12-18T00:55:41+07:00">18-12-2025</time><span class="likecount">0</span></div>',
              remaining: 0
            }
          }
          if (pathname === '/api/books/101') return detail
          if (pathname === '/api/chapters/301') return chapter
          if (pathname === '/api/chapters/invalid') return { ...chapter, paragraphs: ['  '] }
          throw new Error(`Unexpected fixture request: ${url}`)
        },
        fetchDataUrl: async url => {
          requests.push(url)
          if (
            url === 'https://images.weserv.nl/?url=' + encodeURIComponent('https://docln.net/img/cover.jpg') ||
            url === 'https://docln.sbs/img/cover.jpg'
          ) return 'data:image/jpeg;base64,Y292ZXI='
          if (
            url === 'https://images.weserv.nl/?url=' + encodeURIComponent('https://i.hako.vip/covers/example-book.jpg') ||
            url === 'https://i.hako.vip/covers/example-book.jpg'
          ) return 'data:image/jpeg;base64,ZGV0YWls'
          if (
            url === 'https://images.weserv.nl/?url=' + encodeURIComponent('https://i.docln.net/covers/example-book.jpg') ||
            url === 'https://i.docln.net/covers/example-book.jpg'
          ) throw new Error('Extension request timeout')
          throw new Error(`Unexpected image request: ${url}`)
        }
      },
      scraper: { register: async registered => { handlers = registered } },
      settings: { register: async () => undefined },
      storage: {
        get: async key => (key === 'models/voice.onnx' ? { name: 'voice.onnx' } : null),
        set: async () => undefined,
        remove: async () => undefined,
        createAssetUrl: async path => (path === 'models/voice.onnx' ? 'novel-ext://mock-token/voice.onnx' : null)
      }
    }
    await extension.activate(mockNovel)

    assert.equal(await mockNovel.storage.createAssetUrl('models/voice.onnx'), 'novel-ext://mock-token/voice.onnx')
    assert.deepEqual(logs, [`Activated ${manifest.name}`])
    assert.deepEqual(extension.extractArticleParagraphs(html, '.chapter-content'), [
      'First HTML fixture paragraph.',
      '<img src="https://images.weserv.nl/?url=https%3A%2F%2Fi1.hako.vip%2Fimages%2Fillustration.jpg" />\nSecond HTML fixture paragraph.'
    ])
    assert.deepEqual(
      extension.extractArticleParagraphs('<article class="chapter-content">One<br>Two</article>', '.chapter-content'),
      ['One', 'Two']
    )
    assert.deepEqual(Object.keys(handlers).sort(), manifest.contributes.scraper.capabilities.slice().sort())

    // Test getFilterOptions
    const filterOptionsRes = await handlers.getFilterOptions({ fieldId: 'selectgenres' })
    assert.ok(filterOptionsRes.options.length > 0)
    assert.ok(filterOptionsRes.options.some(opt => opt.label === 'Action'))

    // Test search
    const searchResult = await handlers.search({ filters: { query: 'fixture', selectgenres: ['1', '2'], rejectgenres: ['3', '4'] }, page: 1, pageSize: 20 })
    assert.equal(searchResult.items[0].book_id, 101)
    assert.equal(searchResult.items[0].book_name, 'Test Book')
    assert.equal(searchResult.items[0].book_image, 'data:image/jpeg;base64,Y292ZXI=')
    const lastSearchUrl = new URL(requests.find(url => new URL(url).pathname === '/tim-kiem-nang-cao' && new URL(url).searchParams.get('title') === 'fixture'))
    assert.equal(lastSearchUrl.searchParams.get('title'), 'fixture')
    assert.equal(lastSearchUrl.searchParams.get('selectgenres'), '1,2')
    assert.equal(lastSearchUrl.searchParams.get('rejectgenres'), '3,4')

    const bookDetail = await handlers.getBookDetail({ bookRef: '101' })
    assert.equal(bookDetail.volumes[0].chapters[0].chapter_id, 301)
    assert.equal(bookDetail.book_image, 'data:image/jpeg;base64,ZGV0YWls')

    const htmlBookDetail = await handlers.getBookDetail({ bookRef: '27926' })
    assert.equal(htmlBookDetail.book_name, 'HTML Test Book')
    assert.equal(htmlBookDetail.volumes[0].chapters[0].chapter_id, 558990)
    assert.equal(htmlBookDetail.total_index, 12345)
    assert.equal(htmlBookDetail.views, 67890)

    const htmlChapter = await handlers.getChapter({ chapterRef: '558990' })
    assert.equal(htmlChapter.content.length, 2)
    assert.equal(htmlChapter.content[0], 'Paragraph 1 from HTML chapter.')

    const reviews = await handlers.getReviews({ bookRef: '27926' })
    assert.equal(reviews.length, 1)
    assert.equal(reviews[0].interaction_id, 1536)
    assert.equal(reviews[0].user_id, 148873)
    assert.equal(reviews[0].user_name, 'Miyazumiiiiiii')
    assert.equal(reviews[0].value, 4)
    assert.equal(reviews[0].message, 'nội dung ổn')

    const commentsRes = await handlers.getComments({ bookRef: '27926' })
    assert.equal(commentsRes.data.length, 1)
    assert.equal(commentsRes.data[0].comment_id, 3086692)
    assert.equal(commentsRes.data[0].user_name, 'kaguki')
    assert.equal(commentsRes.data[0].message, 'Bình luận test')
    assert.equal(commentsRes.data[0].total_like, 5)
    assert.equal(commentsRes.data[0].replies.length, 2)
    assert.equal(commentsRes.data[0].replies[0].comment_id, 3127671)
    assert.equal(commentsRes.data[0].replies[0].user_name, 'Reltih Lieh')
    assert.equal(commentsRes.data[0].replies[1].comment_id, 3127672)
    assert.equal(commentsRes.data[0].replies[1].user_name, 'Extra User')


    assert.equal((await handlers.getChapter({ chapterRef: '301' })).content.length, 2)
    await assert.rejects(
      () => handlers.getChapter({ chapterRef: 'invalid' }),
      /chapter\.paragraphs\[0\]/
    )
    await assert.rejects(
      () => handlers.search({ filters: { title: 'rate-limited' }, page: 1, pageSize: 20 }),
      /HTTP 429/
    )
    await extension.deactivate()
  }

  try {
    await Promise.all([smokeBundle('index.js'), smokeBundle('browser.js')])
    console.log(`[${manifest.displayName}] Scraper profile tests passed`)
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}