'use strict'

const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension.json'), 'utf8'))

const runners = {
  scraper: './scraper/run-tests',
  theme: './theme/run-tests',
  translator: './translator/run-tests',
  tts: './tts/run-tests'
}
const runUtilitiesTests = require('./utilities.test')

const runner = runners[manifest.starter?.kind]
if (!runner) {
  throw new Error('extension.json starter.kind must be "scraper", "theme", "translator", or "tts".')
}

async function main() {
  await runUtilitiesTests(root)
  await require('./auth-livewire.test')()
  require('./comment-scope.test')
  await require('./comment-switch-reverse.test')()
  await require('./auth-clear-session.test')()
  await require('./auth-check-connection.test')()
  await require('./comment-guest-session.test')()
  await require('./string-ids.test')()
  await require('./chapter-parsing.test')()
  await require(runner)(root, manifest)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})