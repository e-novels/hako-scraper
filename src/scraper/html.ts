import { parseHTML } from 'linkedom'

function normalizeParagraph(value: string | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function extractParagraphContent(element: Element): string {
  const image = element.querySelector('img')
  const text = normalizeParagraph(element.textContent)
  if (!image) return text

  let source = image.getAttribute('src') || image.getAttribute('data-src') || image.getAttribute('data-original') || image.getAttribute('data-bg') || ''
  source = source.trim()
  if (!source) return text
  if (source.startsWith('//')) source = `https:${source}`
  else if (/^i\d*\.(hako\.vip|docln\.net)\//i.test(source)) source = `https://${source}`
  source = source.replace(/^(https?:\/\/i\d*)\.hako\.vip\//i, '$1.docln.net/')

  const imageHtml = `<img src="${source}" />`
  return text ? `${imageHtml}\n${text}` : imageHtml
}

export function extractArticleParagraphs(html: string, contentSelector: string): string[] {
  const { document } = parseHTML(html)
  const content = document.querySelector(contentSelector)
  if (!content) {
    throw new Error(`Could not find chapter content with selector "${contentSelector}".`)
  }

  const paragraphs = Array.from(content.querySelectorAll('p'))
    .map(extractParagraphContent)
    .filter(Boolean)

  if (paragraphs.length > 0) return paragraphs

  for (const lineBreak of content.querySelectorAll('br')) {
    lineBreak.replaceWith(document.createTextNode('\n'))
  }
  const fallback = (content.textContent ?? '')
    .split(/\r?\n/)
    .map(normalizeParagraph)
    .filter(Boolean)
  if (fallback.length === 0) throw new Error('The chapter content did not contain readable text.')
  return fallback
}