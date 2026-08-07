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
  assert.deepEqual(manifest.contributes.scraper.capabilities.slice().sort(), ['getBookDetail', 'getChapter', 'getFilterOptions', 'search'])

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
          throw new Error(`Unexpected text request: ${url}`)
        },
        fetchJson: async url => {
          requests.push(url)
          const requestUrl = new URL(url)
          const pathname = requestUrl.pathname
          if (pathname === '/api/books/101') return detail
          if (pathname === '/api/chapters/301') return chapter
          if (pathname === '/api/chapters/invalid') return { ...chapter, paragraphs: ['  '] }
          throw new Error(`Unexpected fixture request: ${url}`)
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
      'Second HTML fixture paragraph.'
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
    assert.equal(searchResult.items[0].book_image, 'https://docln.sbs/img/cover.jpg')
    const lastSearchUrl = new URL(requests[requests.length - 1])
    assert.equal(lastSearchUrl.searchParams.get('title'), 'fixture')
    assert.equal(lastSearchUrl.searchParams.get('selectgenres'), '1,2')
    assert.equal(lastSearchUrl.searchParams.get('rejectgenres'), '3,4')

    assert.equal((await handlers.getBookDetail({ bookRef: '101' })).volumes[0].chapters[0].chapter_id, 301)
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