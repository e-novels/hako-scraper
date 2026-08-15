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
  await require('./scraper/auth.test')()
  await require('./scraper/chapter.test')()
  await require('./scraper/comment.test')()
  await require('./scraper/types-ids.test')()
  await require('./scraper/download.test')()
  await require(runner)(root, manifest)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})