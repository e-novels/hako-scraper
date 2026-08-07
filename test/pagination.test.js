'use strict'

const assert = require('node:assert/strict')
const { parseHTML } = require('linkedom')

function checkHasNextPage(htmlString) {
  const { document } = parseHTML(`<div>${htmlString}</div>`)
  const nextEl = document.querySelector('.paging_item.next, .paging_prevnext.next, .pagination_wrap .next, .pagination .next, a.next')
  if (nextEl) {
    return !nextEl.classList.contains('disabled')
  }
  return false
}

async function runPaginationUnitTests() {
  // Test case 1: Next button exists and is enabled
  const enabledHtml = `
    <div class="pagination-footer">
      <div class="pagination_wrap">
        <a href="" class="paging_item paging_prevnext prev disabled">Trước</a>
        <a href="https://docln.net/truyen/139-that-nghiep-tai-sinh?page=2" class="paging_item paging_prevnext next">Sau</a>
      </div>
    </div>
  `
  assert.equal(checkHasNextPage(enabledHtml), true, 'hasNextPage should be true when next button is not disabled')

  // Test case 2: Next button exists and is disabled
  const disabledHtml = `
    <div class="pagination-footer">
      <div class="pagination_wrap">
        <a href="https://docln.net/truyen/139-that-nghiep-tai-sinh?page=1" class="paging_item paging_prevnext prev">Trước</a>
        <a href="" class="paging_item paging_prevnext next disabled">Sau</a>
      </div>
    </div>
  `
  assert.equal(checkHasNextPage(disabledHtml), false, 'hasNextPage should be false when next button has disabled class')

  console.log('[Pagination] Unit tests passed successfully')
}

runPaginationUnitTests().catch(err => {
  console.error(err)
  process.exitCode = 1
})
