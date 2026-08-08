# Scraper Authoring Guide

This folder contains a complete scraper extension template. Start with the default JSON API example, then replace it with a source you are allowed to access. Scrapers run in the Electron application because the host mediates their network access; they are not supported in a web-only deployment. Do not use Electron APIs, Node IPC, or direct `fetch` calls.

## Before Writing Code

Choose one source and confirm that you have permission to access its content. Read its terms of service, respect copyright, request limits, login requirements, and anti-bot controls. Do not bypass CAPTCHA, MFA, paywalls, access controls, or robots protections.

The starter does not call a real source. `example.com` exists only so its local tests can prove URL construction and response mapping.

## Initialize A Profile

Initialize a copy of this starter before changing routes or fixtures:

```bash
npm run init -- --name my-source --display-name "My Source" --publisher your-name --kind scraper --base-url https://books.example.org
```

The command writes the manifest identity, scraper contribution, allowed source host, and `BASE_URL`. It deliberately does not guess the site's endpoint paths or response schema. It refuses to replace a non-template manifest unless you add `--force`.

## Required Manifest

For every scraper, `extension.json` must contain the following structure. Replace all placeholder values before packaging.

```json
{
  "starter": { "kind": "scraper" },
  "permissions": ["network", "reader"],
  "network": {
    "allowedHosts": ["books.example.org", "cdn.books.example.org"]
  },
  "contributes": {
    "scraper": {
      "name": "Example Books",
      "description": "Search and read books from Example Books.",
      "version": 2,
      "site": {
        "name": "Example Books",
        "baseUrl": "https://books.example.org"
      },
      "capabilities": ["search", "getBookDetail", "getChapter"],
      "search": {
        "pageSize": 20,
        "fields": [
          { "id": "query", "type": "text", "label": "Search" }
        ]
      }
    }
  }
}
```

| Field | What to set |
| --- | --- |
| `name` | A unique lowercase ID containing only letters, numbers, and hyphens. |
| `site.baseUrl` | The public HTTP(S) URL for the source. Its hostname must appear in `network.allowedHosts`. |
| `network.allowedHosts` | Every exact hostname the extension requests: the site API, image CDN, or other permitted source-owned host. Wildcards are not allowed. |
| `permissions` | Always use `network` and `reader` for a scraper. Add `storage` only when you need persistent extension-local data. |
| `capabilities` | Declare every handler that `novel.scraper.register()` provides. `search`, `getBookDetail`, and `getChapter` are required. |
| `search.fields` | Inputs displayed in the source search form. The field `id` becomes a key in `request.filters`. |

The build runs `npm run validate` first. It rejects a scraper combined with a theme contribution or `ui.theme` permission.

## How Requests Work

The host provides `novel.network`; it sends approved HTTP(S) requests on behalf of the extension. Never call `window.fetch`, Electron APIs, or direct IPC.

| Method | Use it for | Returns |
| --- | --- | --- |
| `novel.network.fetchJson<T>(url, options)` | A source API that returns JSON. | Parsed JSON, typed as `T`. |
| `novel.network.fetchText(url, options)` | HTML pages, plain text, or markup that you will parse. | A string. |
| `novel.network.fetchDataUrl(url, options)` | An image that must be delivered to the UI as a data URL. | A data URL string. |

Build query strings using `URL` and `URLSearchParams`; do not concatenate unescaped user text into a URL:

```ts
const url = new URL('/api/books', BASE_URL)
url.searchParams.set('query', query)
url.searchParams.set('page', String(page))
const response = await novel.network!.fetchJson<SourceSearchResponse>(url.toString())
```

For an HTML source, request the page then parse it with a bundled parsing library or your own safe parser:

```ts
const html = await novel.network!.fetchText(new URL(`/books/${bookRef}`, BASE_URL).toString())
// Parse `html`, then map the result to ScraperBookDetail.
```

Keep all request URLs on the hostnames declared in `network.allowedHosts`. A missing host is a configuration error, not something to work around in code.

## Register The Required Handlers

`activateScraper` registers handlers once when the extension starts. The handler names must exactly match the manifest capability names.

```ts
await novel.scraper.register({
  async search({ filters, page, pageSize }) {
    // Request and return a search response.
  },
  async getBookDetail({ bookRef }) {
    // Request and return one book with volumes and chapters.
  },
  async getChapter({ chapterRef, bookRef }) {
    // Request and return the chapter paragraphs.
  }
})
```

| Handler | Input | Must return |
| --- | --- | --- |
| `search` | `filters`, `page`, `pageSize` | `{ items, pagination }` with positive numeric `book_id` values. |
| `getBookDetail` | `bookRef` | A `ScraperBookDetail` with volumes and chapter summaries. |
| `getChapter` | `chapterRef`, optional `bookRef` | A `ScraperChapter` with non-empty paragraph strings in `content`. |

Use the contracts in `src/types/scraper.d.ts` while mapping your source response. The template types named `Template*` are examples only; replace them with types matching the API or parsed HTML of your source.

## Validate Untrusted Responses

`fetchJson<T>()` only gives TypeScript a compile-time type; a live source can still omit fields or change data formats. The template calls the assertions in `validation.ts` immediately after every request, before running a mapper. Extend or replace these assertions alongside your source types.

Reject malformed data with a useful `Error`. At minimum, validate IDs, titles, image URLs, dates, pagination, volume and chapter metadata, and non-empty chapter text. This prevents invalid reader objects from being returned when a source changes unexpectedly.

## Add Search Filters

Each manifest field appears in `filters` with its `id`. Static choice fields keep their options in the manifest:

```json
{
  "id": "status",
  "type": "select",
  "label": "Status",
  "options": [
    { "label": "Any", "value": "any" },
    { "label": "Ongoing", "value": "ongoing" },
    { "label": "Complete", "value": "complete" }
  ],
  "defaultValue": "any"
}
```

Read filter values defensively because every filter is optional:

```ts
const status = typeof filters.status === 'string' ? filters.status : 'any'
url.searchParams.set('status', status)
```

For dynamic options, declare the `getFilterOptions` capability and a select field with `optionsMethod: "getFilterOptions"`. Then register `getFilterOptions({ fieldId, query, filters })`, returning `{ options: [{ label, value }] }`.

## Persist Extension-Local Data

Storage is optional and isolated per installed extension. Use it for non-sensitive state such as route caches, the last selected filter, or an ETag. Do not store passwords, access tokens, cookies, personal data, or copyrighted book content.

First add `storage` to the manifest permissions:

```json
"permissions": ["network", "reader", "storage"]
```

Then use the optional `novel.storage` bridge:

```ts
const routeCacheKey = 'book-routes-v1'

async function loadRoutes(novel: NovelExtensionApi): Promise<Record<string, string>> {
  return (await novel.storage?.get<Record<string, string>>(routeCacheKey)) ?? {}
}

async function saveRoutes(novel: NovelExtensionApi, routes: Record<string, string>): Promise<void> {
  await novel.storage?.set(routeCacheKey, routes)
}

async function clearRoutes(novel: NovelExtensionApi): Promise<void> {
  await novel.storage?.remove(routeCacheKey)
}
```

Treat cached values as untrusted input: verify their shape and ensure any restored URL still belongs to an allowed source host before using it.

## Settings And User Input

Only add settings when the source genuinely needs user-controlled non-secret configuration. Declare fields and actions in `contributes.settings`, then register an action handler with the same action ID through `novel.settings.register()`.

```json
{
  "contributes": {
    "settings": {
      "fields": [
        { "id": "page_size", "type": "number", "label": "Results per page", "defaultValue": 20, "min": 5, "max": 50 }
      ],
      "actions": [
        { "id": "savePreferences", "label": "Save", "fields": ["page_size"], "style": "primary" }
      ]
    }
  }
}
```

```ts
await novel.settings.register({
  async savePreferences(values) {
    const pageSize = typeof values.page_size === 'number' ? values.page_size : 20
    await novel.storage?.set('page-size', pageSize)
    return { success: true, message: 'Preferences saved.' }
  }
})
```

Adding settings that use storage requires the `storage` permission. Do not implement a settings form for credentials unless the source explicitly supports that flow and you can avoid persisting the credentials.

## Test Before Contacting A Live Source

`test/scraper/run-tests.js` mocks the bridge, so it never contacts `example.com`. Replace its fixture objects with realistic scrubbed responses from your source, then assert:

1. The generated request URL, query parameters, and HTTP method are correct.
2. Every registered handler has the same name as a manifest capability.
3. Mapped IDs are positive integers, dates are valid, and chapter paragraphs are non-empty.
4. Failure responses, including invalid payloads, selector changes, and HTTP 403/429, produce a useful error instead of an invalid object.

Run these commands before packaging:

```bash
npm test
npm run test:package
```

`npm test` validates the manifest, type-checks the source, builds both entries, and runs the selected profile test. `npm run test:package` also verifies that the ZIP contains the canonical manifest, declared assets, and only release files. The browser entry is not a supported scraper runtime.

## Common Problems

| Symptom | Cause | Fix |
| --- | --- | --- |
| A request is rejected | The hostname is absent from `network.allowedHosts`. | Add the exact hostname, rebuild, and retest. |
| `novel.network` is missing | The manifest has no `network` permission. | Add `network` and keep the scraper profile. |
| `novel.storage` is missing | The manifest has no `storage` permission. | Add `storage`; always keep storage usage optional with `?.`. |
| Activation fails | Handler and capability names do not match. | Declare and register each capability exactly once. |
| The UI shows no books | Source response fields were not mapped to the scraper contract. | Compare your mapper with `ScraperBookSummary`, `ScraperBookDetail`, and `ScraperChapter`. |
| Tests call the live source | The mock was replaced by direct network code. | Keep fixture responses in the test and mock `network.fetchJson` or `fetchText`. |

## HTML Sources

The default `index.ts` demonstrates a JSON API. For HTML, call `fetchText` and use a parser that esbuild can bundle for both outputs. This starter includes `linkedom` and exports the tested `extractArticleParagraphs` recipe from `html.ts`:

```ts
import { extractArticleParagraphs } from './html'

const html = await network.fetchText(endpoint(`/chapters/${chapterRef}`))
const content = extractArticleParagraphs(html, '.chapter-content')
```

The helper selects an article container, returns normalized non-empty `<p>` text, and throws a readable error when the selector no longer matches. Replace the selector and mapper for your source. Keep a scrubbed response in `test/scraper/fixtures/chapter.html`; `npm test` parses it in both bundles. Do not use regular expressions as a general HTML parser.

## Optional Capabilities

Declare an optional capability in `contributes.scraper.capabilities`, then register a handler with exactly the same name. `src/types/scraper.d.ts` contains the public request and response types.

| Capability | Manifest declaration | Response |
| --- | --- | --- |
| `getFilterOptions` | A select/radio/multi-select field sets `optionsMethod: "getFilterOptions"`. | `{ options: [{ label, value }] }` with non-empty unique values. |
| `suggest` | A text field sets `suggestMethod: "suggest"`. | Non-empty suggestion strings. |
| `getComments` | Add only for a permitted reader-comment endpoint. | `{ data, pagination }` with `ScraperComment` records. |
| `getReviews` | Add only for a permitted rating/review endpoint. | `ScraperReview[]`, each rating from 1 through 5. |

```ts
await novel.scraper.register({
  async search(request) { /* required */ },
  async getBookDetail(request) { /* required */ },
  async getChapter(request) { /* required */ },
  async getFilterOptions() {
    return { options: [{ label: 'Any', value: 'any' }] }
  },
  async suggest({ query }) {
    return query ? [query] : []
  }
})
```

Preserve the opaque `bookRef`, `chapterRef`, `parentRef`, and `targetRef` values supplied to handlers. They belong to the source integration; do not convert them to application database IDs.

### Implementing `getComments` (Comments and Replies)

When your extension declares the `getComments` capability, register a `getComments(request)` handler. The host calls this method to retrieve both top-level comments and paginated reply threads for comments.

#### Request Parameters (`ScraperBookDetailRequest`)

| Field | Type | Description |
| --- | --- | --- |
| `bookRef` | `string` | The opaque book reference ID. |
| `commentTarget` | `'book' \| 'chapter'` | Target scope: `'book'` for book-level comments, or `'chapter'` for chapter-level comments. |
| `targetRef` | `string` (optional) | The chapter reference ID when `commentTarget` is `'chapter'`. |
| `parentRef` | `string` (optional) | When supplied, the host is requesting reply comments for a specific parent comment ID. |
| `page` | `number` (optional) | The 1-indexed page number requested (defaults to 1). Extensions should respect `page` for both root comments and nested replies when pagination is available. |

#### Comment Data Structure (`ScraperComment`)

Each comment item in the `data` array must provide:
- `socket_id` (optional): Unique identifier string or number for the comment entity. If omitted (e.g. source web page does not provide comment IDs), the host automatically generates a surrogate ID.
- `content`: **REQUIRED** text content string of the comment.
- `user_name`: Display name of the commenter.
- `avatar`: Valid image URL for author avatar.
- `created_at`: ISO 8601 date string or timestamp.
- `total_like`: Number of likes (non-negative integer).
- `total_reply`: Number of replies under this comment (non-negative integer).
- `is_like`: Boolean indicating whether the user liked the comment.
- `chapter_name` (optional): Display title of the chapter (e.g. `"Chương 12"`).
- `chapter_id` (optional): Chapter ID string or number when comment belongs to a chapter. When provided along with `chapter_name`, a clickable link badge will appear allowing users to navigate directly to that chapter.

> **Note on Removed Fields**: Legacy fields `comment_id`, `message`, `room_id`, and `chapter_ref` have been removed. Use `socket_id` for comment IDs, `content` for comment text, and `chapter_id` for chapter link references.

#### Mandatory Response Field Constraints
- `volume_number` (**REQUIRED** integer): Every volume in `ScraperBookDetail.volumes` must include a valid positive `volume_number` for sorting.
- `chapter_number` (**REQUIRED** integer): Every chapter in `volume.chapters` and `ScraperChapter` must include a valid positive `chapter_number` for sorting.
- `status` (optional string): Status can be any free-form status string (e.g. `"ongoing"`, `"completed"`, `"suspended"`, or custom text). If omitted, the host defaults to `"suspended"` ("Tạm hoãn").

#### Servicing Reply Threads and Pagination

When a user clicks "Phản hồi" or "Hiển thị thêm phản hồi" (Load more replies), the host calls `getComments` passing `parentRef` (the parent comment ID) and the target `page`. Your handler should:
1. Detect if `request.parentRef` is present.
2. Request the corresponding reply page from your source.
3. Return `{ data: ScraperComment[], pagination: { page, pageSize, totalItems, totalPages, hasNextPage } }`.

## Fixture Workflow And Failures

`test/scraper/fixtures/` is the local source of truth for author tests. Replace `search.json`, `book-detail.json`, `chapter.json`, and optionally `chapter.html` with scrubbed representative payloads. The runner never contacts a live source and proves URL construction, registration, mapping, and HTML extraction in both desktop and browser bundles.

Use storage only for small, non-sensitive state such as a route cache. Validate restored values and never store credentials, cookies, tokens, personal data, or chapter content. On source changes or malformed responses, throw an actionable `Error` instead of returning empty reader objects. Use `novel.logger` for safe operation metadata only.