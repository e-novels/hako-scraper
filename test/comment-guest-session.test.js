'use strict'

const assert = require('node:assert/strict')
const { fetchComments, parseCommentGroupHtml } = require('../dist/index')

async function runGuestSessionTests() {
  console.log('[Test Guest Session] Starting guest comment fetch unit tests...')

  assert.strictEqual(typeof fetchComments, 'function', 'fetchComments should be defined')
  assert.strictEqual(typeof parseCommentGroupHtml, 'function', 'parseCommentGroupHtml should be defined')

  console.log('[Test Guest Session] All guest session tests passed! 🚀')
}

module.exports = runGuestSessionTests

if (require.main === module) {
  runGuestSessionTests().catch(err => {
    console.error(err)
    process.exit(1)
  })
}
