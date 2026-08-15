'use strict'

const assert = require('node:assert/strict')
const {
  fetchDownloadContent,
  initExtensionApi,
  resetExtensionApiForTest
} = require('../../dist/index')

module.exports = async function runDownloadTests() {
  console.log('[Test Scraper Download] Starting download capability unit tests...')

  const progressReports = []
  const fetchedUrls = []

  const mockBookHtml = `
    <html>
      <head><meta name="csrf-token" content="mock-token"></head>
      <body>
        <h1 class="series-name"><a href="/truyen/500-overlord-vn">Overlord Test</a></h1>
        <div class="series-cover"><div class="img-in-ratio" style="background-image: url('/img/cover.jpg')"></div></div>
        <div class="info-item"><span class="info-name">Tác giả:</span> <span class="info-value">Maruyama Kugane</span></div>
        <div class="summary-content"><p>Tóm tắt Overlord test</p></div>
        <div class="volume-list" data-id="101">
          <div class="sect-title">Tập 01: Vua Bất Tử</div>
          <ul>
            <li>
              <div class="chapter-name"><a href="/truyen/500-overlord-vn/c1001-mo-dau" title="Mở đầu">Mở đầu</a></div>
              <div class="chapter-time">01/01/2026</div>
            </li>
            <li>
              <div class="chapter-name"><a href="/truyen/500-overlord-vn/c1002-chuong-1" title="Chương 1">Chương 1</a></div>
              <div class="chapter-time">02/01/2026</div>
            </li>
          </ul>
        </div>
        <div class="volume-list" data-id="102">
          <div class="sect-title">Tập 02: Chiến Binh Bóng Đêm</div>
          <ul>
            <li>
              <div class="chapter-name"><a href="/truyen/500-overlord-vn/c1003-chuong-2" title="Chương 2">Chương 2</a></div>
              <div class="chapter-time">03/01/2026</div>
            </li>
          </ul>
        </div>
      </body>
    </html>
  `

  const mockChapterHtmlMap = {
    '/truyen/500-overlord-vn/c1001-mo-dau': `
      <html>
        <body>
          <div class="title-top">Mở đầu</div>
          <div class="chapter-content">
            <p>Nội dung đoạn mở đầu tập 1.</p>
          </div>
        </body>
      </html>
    `,
    '/truyen/500-overlord-vn/c1002-chuong-1': `
      <html>
        <body>
          <div class="title-top">Chương 1</div>
          <div class="chapter-content">
            <p>Nội dung chương 1 tập 1.</p>
            <p>Đoạn văn thứ 2 của chương 1.</p>
          </div>
        </body>
      </html>
    `,
    '/truyen/500-overlord-vn/c1003-chuong-2': `
      <html>
        <body>
          <div class="title-top">Chương 2</div>
          <div class="chapter-content">
            <p>Nội dung chương 2 tập 2.</p>
          </div>
        </body>
      </html>
    `
  }

  resetExtensionApiForTest()
  initExtensionApi({
    version: '1.0.0',
    extension: { id: 'test-download' },
    logger: {
      info: async () => undefined,
      warn: async () => undefined,
      error: async () => undefined
    },
    progress: {
      report: async data => {
        progressReports.push(data)
      }
    },
    network: {
      fetchText: async (url) => {
        fetchedUrls.push(url)
        const parsedUrl = new URL(url)
        if (parsedUrl.pathname === '/truyen/500-overlord-vn') {
          return mockBookHtml
        }
        if (mockChapterHtmlMap[parsedUrl.pathname]) {
          return mockChapterHtmlMap[parsedUrl.pathname]
        }
        return '<html><body><div class="chapter-content"><p>Default chapter</p></div></body></html>'
      },
      fetchJson: async () => ({}),
      fetchDataUrl: async () => 'data:image/jpeg;base64,Y292ZXI='
    },
    storage: {
      get: async () => null,
      set: async () => undefined,
      remove: async () => undefined,
      createAssetUrl: async () => null
    }
  })

  // 1. Test downloading entire book (all volumes & chapters)
  progressReports.length = 0
  const fullBookDownload = await fetchDownloadContent({ book_id: 'truyen/500-overlord-vn' })
  assert.equal(fullBookDownload.book_id, 'truyen/500-overlord-vn', 'book_id must be slug format')
  assert.equal(fullBookDownload.book_name, 'Overlord Test')
  assert.equal(fullBookDownload.volumes.length, 2, 'Should download both volumes')

  // Validate Volume 1
  assert.equal(fullBookDownload.volumes[0].volume_id, 'truyen/500-overlord-vn/1')
  assert.equal(fullBookDownload.volumes[0].volume_name, 'Tập 01: Vua Bất Tử')
  assert.equal(fullBookDownload.volumes[0].chapters.length, 2)
  assert.equal(fullBookDownload.volumes[0].chapters[0].chapter_id, 'truyen/500-overlord-vn/c1001-mo-dau')
  assert.deepEqual(fullBookDownload.volumes[0].chapters[0].content, ['Nội dung đoạn mở đầu tập 1.'])
  assert.equal(fullBookDownload.volumes[0].chapters[1].chapter_id, 'truyen/500-overlord-vn/c1002-chuong-1')
  assert.equal(fullBookDownload.volumes[0].chapters[1].content.length, 2)

  // Validate Volume 2
  assert.equal(fullBookDownload.volumes[1].volume_id, 'truyen/500-overlord-vn/2')
  assert.equal(fullBookDownload.volumes[1].chapters.length, 1)
  assert.equal(fullBookDownload.volumes[1].chapters[0].chapter_id, 'truyen/500-overlord-vn/c1003-chuong-2')
  assert.deepEqual(fullBookDownload.volumes[1].chapters[0].content, ['Nội dung chương 2 tập 2.'])

  // Validate progress reporting occurred
  assert.ok(progressReports.length >= 3, 'Progress report should be called for each chapter')
  assert.equal(progressReports[progressReports.length - 1].percentage, 100, 'Final progress should be 100%')

  // 2. Test downloading single volume by volume_id (e.g. 'truyen/500-overlord-vn/2')
  progressReports.length = 0
  const singleVolDownload = await fetchDownloadContent({
    book_id: 'truyen/500-overlord-vn',
    volume_id: 'truyen/500-overlord-vn/2'
  })
  assert.equal(singleVolDownload.volumes.length, 1, 'Should download only 1 volume')
  assert.equal(singleVolDownload.volumes[0].volume_id, 'truyen/500-overlord-vn/2')
  assert.equal(singleVolDownload.volumes[0].chapters.length, 1)
  assert.equal(singleVolDownload.volumes[0].chapters[0].chapter_id, 'truyen/500-overlord-vn/c1003-chuong-2')

  // 3. Test downloading single volume by volume number index ('1')
  const volNumDownload = await fetchDownloadContent({
    book_id: 'truyen/500-overlord-vn',
    volume_id: '1'
  })
  assert.equal(volNumDownload.volumes.length, 1)
  assert.equal(volNumDownload.volumes[0].volume_number, 1)

  // 4. Test error when volume_id does not exist
  await assert.rejects(
    () => fetchDownloadContent({ book_id: 'truyen/500-overlord-vn', volume_id: '999' }),
    /not found/i
  )

  // 5. Test error when book_id is missing
  await assert.rejects(
    () => fetchDownloadContent({ book_id: '' }),
    /Missing book_id/i
  )

  console.log('[Test Scraper Download] All download unit tests passed! 🚀')
}
