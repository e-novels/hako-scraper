import { parseHTML } from 'linkedom'

/**
 * Decode a base64 string into a Uint8Array.
 */
function base64Decode(encoded: string): Uint8Array {
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * XOR each byte of data with the corresponding byte of the key (cycling).
 */
function xorWithKey(data: Uint8Array, key: string): Uint8Array {
  const keyLength = key.length
  const result = new Uint8Array(data.length)
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ key.charCodeAt(i % keyLength)
  }
  return result
}

/**
 * Decode a Uint8Array into a UTF-8 string.
 */
function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes)
}

/**
 * Decrypt a single chunk using the xor_shuffle strategy.
 * Each chunk is: base64 encoded → XOR with key → UTF-8 string.
 */
function decryptXorShuffle(encoded: string, key: string): string {
  const decoded = base64Decode(encoded)
  const xored = xorWithKey(decoded, key)
  return bytesToString(xored)
}

/**
 * Decrypt a single chunk using base64_reverse strategy.
 * The encoded string is reversed, then base64 decoded.
 */
function decryptBase64Reverse(encoded: string): string {
  const reversed = encoded.split('').reverse().join('')
  const decoded = base64Decode(reversed)
  return bytesToString(decoded)
}

/**
 * Decrypt a single chunk using plain base64 strategy.
 */
function decryptBase64(encoded: string): string {
  const decoded = base64Decode(encoded)
  return bytesToString(decoded)
}

/**
 * Attempt to decrypt chapter content from the page HTML.
 *
 * On docln.sbs, chapter content is encrypted inside a `div#chapter-c-protected`
 * element with attributes:
 * - `data-s`: encryption strategy ("xor_shuffle", "base64_reverse", or plain base64)
 * - `data-k`: encryption key (used for XOR)
 * - `data-c`: JSON array of encrypted chunks, each prefixed with a 4-digit sort index
 *
 * Returns the decrypted HTML string, or `null` if no encrypted content is found.
 */
export function decryptChapterContent(html: string): string | null {
  const { document } = parseHTML(html)
  const protectedEl = document.getElementById('chapter-c-protected')
  if (!protectedEl) return null

  const strategy = protectedEl.getAttribute('data-s') || 'none'
  const key = protectedEl.getAttribute('data-k') || ''

  let chunks: string[]
  try {
    chunks = JSON.parse(protectedEl.getAttribute('data-c') || '[]')
  } catch {
    return null
  }

  if (!Array.isArray(chunks) || chunks.length === 0) return null

  // Sort chunks by their 4-digit index prefix
  chunks.sort((a, b) => parseInt(a.substring(0, 4), 10) - parseInt(b.substring(0, 4), 10))

  const decryptedParts: string[] = []
  for (const chunk of chunks) {
    const encoded = chunk.substring(4) // Remove 4-digit index prefix
    let decrypted: string

    if (strategy === 'xor_shuffle') {
      decrypted = decryptXorShuffle(encoded, key)
    } else if (strategy === 'base64_reverse') {
      decrypted = decryptBase64Reverse(encoded)
    } else {
      decrypted = decryptBase64(encoded)
    }

    decryptedParts.push(decrypted)
  }

  return decryptedParts.join('')
}
