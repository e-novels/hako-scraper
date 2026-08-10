'use strict'

const fs = require('node:fs')
const path = require('node:path')

const usage = `Usage:
  npm run init -- --name <extension-id> --display-name <name> --publisher <publisher> --kind <scraper|theme|tts|translator> [--tts-mode <process|cloud|wasm>] [--base-url <https-url>] [--description <text>] [--force]

The scraper profile requires --base-url. --force allows replacing an existing non-template manifest.`

function requireOption(options, key) {
  const value = options[key]
  if (typeof value !== 'string' || !value.trim()) throw new Error(`--${key} is required.\n\n${usage}`)
  return value.trim()
}

function parseOptions(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--help') return { help: true }
    if (argument === '--force') {
      options.force = true
      continue
    }
    if (!argument.startsWith('--')) throw new Error(`Unexpected argument "${argument}".\n\n${usage}`)
    const key = argument.slice(2)
    if (!['name', 'display-name', 'publisher', 'kind', 'tts-mode', 'base-url', 'description'].includes(key)) {
      throw new Error(`Unsupported option "${argument}".\n\n${usage}`)
    }
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.\n\n${usage}`)
    options[key] = value
    index += 1
  }
  return options
}

function isPrivateIpv4(hostname) {
  const parts = hostname.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }
  const [first, second] = parts
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  )
}

function isPrivateIpv6(hostname) {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    /^fe[89ab]/.test(normalized)
  )
}

function isUnsafeHostname(hostname) {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return normalized === 'localhost' || isPrivateIpv4(normalized) || isPrivateIpv6(normalized)
}

function validateOptions(options) {
  const name = requireOption(options, 'name')
  const displayName = requireOption(options, 'display-name')
  const publisher = requireOption(options, 'publisher')
  const kind = requireOption(options, 'kind')
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error('--name may contain only lowercase letters, digits, and hyphens.')
  if (kind !== 'scraper' && kind !== 'theme' && kind !== 'tts' && kind !== 'translator') {
    throw new Error('--kind must be "scraper", "theme", "tts", or "translator".')
  }

  let ttsMode = 'process'
  if (kind === 'tts' && options['tts-mode']) {
    ttsMode = options['tts-mode'].trim()
    if (!['process', 'cloud', 'wasm'].includes(ttsMode)) {
      throw new Error('--tts-mode must be "process", "cloud", or "wasm".')
    }
  }

  let baseUrl
  if (kind === 'scraper') {
    baseUrl = requireOption(options, 'base-url')
    const parsedUrl = new URL(baseUrl)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('--base-url must use HTTP(S).')
    if (parsedUrl.username || parsedUrl.password) {
      throw new Error('--base-url must not include credentials.')
    }
    if (isUnsafeHostname(parsedUrl.hostname)) {
      throw new Error('--base-url must not use localhost or a private network address.')
    }
    baseUrl = parsedUrl.toString().replace(/\/$/, '')
  }

  return {
    name,
    displayName,
    publisher,
    kind,
    ttsMode,
    baseUrl,
    description: typeof options.description === 'string' && options.description.trim()
      ? options.description.trim()
      : kind === 'scraper'
        ? `Search and read books from ${displayName}.`
        : kind === 'tts'
          ? `TTS Engine extension for e-novels by ${publisher}.`
          : kind === 'translator'
            ? `Translator extension for e-novels by ${publisher}.`
            : `A programmatic theme for e-novels by ${publisher}.`,
    force: options.force === true
  }
}

function initialize(root, rawOptions) {
  const options = validateOptions(rawOptions)
  const manifestPath = path.join(root, 'extension.json')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  if (manifest.name !== 'example-extension' && !options.force) {
    throw new Error('Refusing to replace an existing extension. Re-run with --force after reviewing the changes.')
  }

  manifest.name = options.name
  manifest.displayName = options.displayName
  manifest.publisher = options.publisher
  manifest.description = options.description
  manifest.starter = { kind: options.kind }
  manifest.categories = [
    options.kind === 'scraper'
      ? 'Scrapers'
      : options.kind === 'tts'
        ? 'TTS'
        : options.kind === 'translator'
          ? 'Translator'
          : 'Themes'
  ]
  manifest.keywords = ['e-novels', options.kind, 'typescript']

  if (options.kind === 'scraper') {
    const sourceUrl = new URL(options.baseUrl)
    manifest.permissions = ['network', 'reader']
    manifest.network = { allowedHosts: [sourceUrl.hostname] }
    manifest.contributes = {
      scraper: {
        name: options.displayName,
        description: options.description,
        version: 2,
        site: { name: options.displayName, baseUrl: options.baseUrl },
        capabilities: ['search', 'getBookDetail', 'getChapter'],
        search: {
          pageSize: 20,
          fields: [{ id: 'query', type: 'text', label: 'Search' }]
        }
      }
    }

    const scraperPath = path.join(root, 'src', 'scraper', 'index.ts')
    const scraperSource = fs.readFileSync(scraperPath, 'utf8')
    const nextScraperSource = scraperSource.replace(
      /const BASE_URL = ['"][^'"]+['"]/,
      `const BASE_URL = ${JSON.stringify(options.baseUrl)}`
    )
    if (nextScraperSource === scraperSource) throw new Error('Could not find BASE_URL in src/scraper/index.ts.')
    fs.writeFileSync(scraperPath, nextScraperSource)
  } else if (options.kind === 'tts') {
    manifest.permissions = options.ttsMode === 'cloud' ? ['tts', 'network', 'storage'] : ['tts', 'storage']
    delete manifest.network
    manifest.contributes = {
      tts: {
        name: options.displayName,
        description: options.description,
        mode: options.ttsMode,
        capabilities: ['getVoices', 'speak', 'stop']
      }
    }
  } else if (options.kind === 'translator') {
    manifest.permissions = ['translate', 'network', 'storage']
    delete manifest.network
    manifest.contributes = {
      translator: {
        name: options.displayName,
        description: options.description,
        capabilities: ['translate', 'getLanguages'],
        sourceLanguages: ['auto', 'en', 'zh', 'ja', 'ko'],
        targetLanguages: ['en', 'vi']
      }
    }
  } else {
    manifest.permissions = ['ui.theme']
    delete manifest.network
    manifest.contributes = {}
  }

  cleanUnusedKinds(root, options.kind)
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

const ALL_KINDS = ['scraper', 'theme', 'tts', 'translator']

function cleanUnusedKinds(root, activeKind) {
  for (const kind of ALL_KINDS) {
    if (kind === activeKind) continue

    const srcDir = path.join(root, 'src', kind)
    if (fs.existsSync(srcDir)) {
      fs.rmSync(srcDir, { recursive: true, force: true })
    }

    const typeFile = path.join(root, 'src', 'types', `${kind}.d.ts`)
    if (fs.existsSync(typeFile)) {
      fs.rmSync(typeFile, { force: true })
    }

    const testDir = path.join(root, 'test', kind)
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
  }

  updateIndexTs(root, activeKind)
}

function updateIndexTs(root, kind) {
  const indexPath = path.join(root, 'src', 'index.ts')
  let content = ''
  if (kind === 'scraper') {
    content = `import { initExtensionApi, logger } from './utilities'
import { activateScraper } from './scraper'

export { extractArticleParagraphs } from './scraper/html'
export * from './utilities'

export async function activate(novel: NovelExtensionApi): Promise<void> {
  initExtensionApi(novel)
  await activateScraper(novel)
}

export async function deactivate(): Promise<void> {
  return
}
`
  } else if (kind === 'theme') {
    content = `import { initExtensionApi, logger } from './utilities'
import { activateTheme } from './theme'

export * from './utilities'

export async function activate(novel: NovelExtensionApi): Promise<void> {
  initExtensionApi(novel)
  await activateTheme(novel)
}

export async function deactivate(): Promise<void> {
  return
}
`
  } else if (kind === 'translator') {
    content = `import { initExtensionApi, logger } from './utilities'
import { registerTranslatorProfile } from './translator'

export * from './utilities'

export async function activate(novel: NovelExtensionApi): Promise<void> {
  initExtensionApi(novel)
  registerTranslatorProfile(novel)
}

export async function deactivate(): Promise<void> {
  return
}
`
  } else if (kind === 'tts') {
    content = `import { initExtensionApi, logger } from './utilities'
import { activateTTS } from './tts'

export * from './utilities'

export async function activate(novel: NovelExtensionApi): Promise<void> {
  initExtensionApi(novel)
  await activateTTS(novel)
}

export async function deactivate(): Promise<void> {
  return
}
`
  }

  fs.writeFileSync(indexPath, content, 'utf8')
}


function main() {
  const options = parseOptions(process.argv.slice(2))
  if (options.help) {
    console.log(usage)
    return
  }
  const manifest = initialize(__dirname, options)
  console.log(`[${manifest.displayName}] Initialized ${manifest.starter.kind} profile.`)
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

module.exports = { initialize, parseOptions, usage }