'use strict'

const assert = require('node:assert/strict')
const {
  resolveUrl,
  normalizeImageUrl,
  toProxyImageUrl,
  wrapWeservUrl,
  toArchiveImageUrl,
  firstImage,
  fetchImageAsDataUrl,
  proxyBookImages,
  parseSearchResultsHtml,
  parseBookDetailHtml,
  initExtensionApi,
  resetExtensionApiForTest
} = require('../../dist/index')

module.exports = async function runImageTests() {
  console.log('[Test Scraper Image] Starting image proxying, extraction and Web Archive fallback unit tests...')

  // 1. Test URL resolution and normalization
  assert.equal(resolveUrl('/img/cover.jpg', 'https://docln.sbs'), 'https://docln.sbs/img/cover.jpg')
  assert.equal(resolveUrl('//i.hako.vip/novel/c/1.jpg'), 'https://i.hako.vip/novel/c/1.jpg')
  assert.equal(resolveUrl(''), '')

  assert.equal(normalizeImageUrl('//i.hako.vip/novel/c/1.jpg'), 'https://i.hako.vip/novel/c/1.jpg')
  assert.equal(normalizeImageUrl('i2.hako.vip/novel/c/2.jpg'), 'https://i2.hako.vip/novel/c/2.jpg')
  assert.equal(normalizeImageUrl('/covers/test.png', 'https://docln.sbs'), 'https://docln.sbs/covers/test.png')
  assert.equal(normalizeImageUrl('data:image/png;base64,123'), 'data:image/png;base64,123')

  // 2. Test toProxyImageUrl and wrapWeseryUrl
  const proxied = toProxyImageUrl('https://i.hako.vip/novel/c/1.jpg?v=2')
  assert.equal(proxied, 'https://images.weserv.nl/?url=i.hako.vip%2Fnovel%2Fc%2F1.jpg%3Fv%3D2&output=webp')
  assert.equal(wrapWeservUrl('https://i.hako.vip/novel/c/1.jpg'), 'https://images.weserv.nl/?url=i.hako.vip%2Fnovel%2Fc%2F1.jpg&output=webp')
  assert.equal(toProxyImageUrl('https://docln.sbs/img/logo.png', 'https://docln.sbs'), 'https://docln.sbs/img/logo.png')
  assert.equal(toProxyImageUrl('data:image/webp;base64,xyz'), 'data:image/webp;base64,xyz')
  assert.equal(toProxyImageUrl('https://images.weserv.nl/?url=abc'), 'https://images.weserv.nl/?url=abc')

  // 3. Test toArchiveImageUrl (Giải pháp 1)
  const blogspotUrl = 'https://3.bp.blogspot.com/-coc62nTZN9M/WO2v-JFMCuI/AAAAAAAAKBE/Kb8JLmHVElw/w215/series_259.jpg'
  const expectedArchiveUrl = 'https://web.archive.org/web/20210609011352im_/https://3.bp.blogspot.com/-coc62nTZN9M/WO2v-JFMCuI/AAAAAAAAKBE/Kb8JLmHVElw/w215/series_259.jpg'
  assert.equal(
    toArchiveImageUrl(blogspotUrl),
    expectedArchiveUrl
  )
  assert.equal(normalizeImageUrl(blogspotUrl), expectedArchiveUrl)
  assert.equal(resolveUrl(blogspotUrl), expectedArchiveUrl)
  assert.equal(toArchiveImageUrl(''), '')
  assert.equal(toArchiveImageUrl('data:image/png;base64,123'), 'data:image/png;base64,123')
  assert.equal(
    toArchiveImageUrl(expectedArchiveUrl),
    expectedArchiveUrl
  )

  // 4. Test firstImage extraction
  const frag1 = '<div class="head"><img data-src="/img/lazy.jpg" alt="test"></div>'
  assert.equal(firstImage(frag1, 'https://docln.sbs'), 'https://docln.sbs/img/lazy.jpg')
  const frag2 = '<div class="banner" style="background-image: url(\'/img/bg.png\')"></div>'
  assert.equal(firstImage(frag2, 'https://docln.sbs'), 'https://docln.sbs/img/bg.png')

  // 5. Test parseBookDetailHtml with cover extraction fallbacks
  const htmlWithStyle = `
    <div class="series-cover">
      <div class="img-in-ratio" style="background-image: url('https://3.bp.blogspot.com/-coc62nTZN9M/WO2v-JFMCuI/AAAAAAAAKBE/Kb8JLmHVElw/w215/series_259.jpg')"></div>
    </div>
  `
  const detail = parseBookDetailHtml(htmlWithStyle, '259')
  assert.equal(detail.book_image, expectedArchiveUrl)

  // 6. Test fetchImageAsDataUrl with Web Archive mock fallback
  const fetchedCalls = []
  resetExtensionApiForTest()
  initExtensionApi({
    version: '1.0.0',
    extension: { id: 'test-image' },
    logger: {
      info: async () => undefined,
      warn: async () => undefined,
      error: async () => undefined
    },
    network: {
      fetchText: async () => '',
      fetchJson: async () => ({}),
      fetchDataUrl: async (url) => {
        fetchedCalls.push(url)
        if (url.startsWith('https://web.archive.org/')) {
          return 'data:image/jpeg;base64,mockArchiveJpegData'
        }
        if (url.includes('images.weserv.nl') || url.includes('blogspot.com')) {
          throw new Error('403 Forbidden on direct / 404 on weserv')
        }
        return 'data:image/webp;base64,mockData'
      }
    }
  })

  const blogspotResult = await fetchImageAsDataUrl(blogspotUrl)
  assert.equal(blogspotResult, 'data:image/jpeg;base64,mockArchiveJpegData', 'fetchImageAsDataUrl should succeed via Web Archive for 403 blogspot links')
  assert.ok(fetchedCalls.some(u => u.startsWith('https://web.archive.org/')), 'Should have queried web.archive.org')

  // 7. Test proxyBookImages worker pool
  const bookItems = [
    { book_id: '1', book_image: blogspotUrl },
    { book_id: '2', book_image: 'https://i.hako.vip/covers/book2.jpg' },
    { book_id: '3', book_image: '' }
  ]
  const proxiedBooks = await proxyBookImages(bookItems, 2)
  assert.equal(proxiedBooks.length, 3)
  assert.equal(proxiedBooks[0].book_image, 'data:image/jpeg;base64,mockArchiveJpegData')
  assert.equal(proxiedBooks[1].book_image, 'data:image/webp;base64,mockData')
  assert.equal(proxiedBooks[2].book_image, '')

  console.log('[Test Scraper Image] All image unit tests passed! 🙀')
}
