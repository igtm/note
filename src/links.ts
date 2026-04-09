export type UrlMatch = {
  from: number
  to: number
  text: string
  href: string
}

const EXPLICIT_URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<]+/gi
const TRAILING_PUNCTUATION_PATTERN = /[),.;!?]+$/g
const BARE_DOMAIN_PATTERN =
  /^(?:localhost(?::\d+)?|(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?|(?:[a-z0-9-]+\.)+[a-z]{2,})(?:[/?#].*)?$/i

export const normalizeUrlHref = (value: string, options?: { allowBareDomain?: boolean }) => {
  const trimmed = value.trim()
  if (!trimmed) return null

  let candidate = trimmed
  if (/^www\./i.test(candidate)) {
    candidate = `https://${candidate}`
  } else if (!/^[a-z][a-z\d+.-]*:\/\//i.test(candidate)) {
    if (!options?.allowBareDomain || !BARE_DOMAIN_PATTERN.test(candidate)) return null
    const prefix = /^(localhost|(?:\d{1,3}\.){3}\d{1,3})(?::\d+)?(?:[/?#].*)?$/i.test(candidate) ? 'http://' : 'https://'
    candidate = `${prefix}${candidate}`
  }

  try {
    const parsed = new URL(candidate)
    if (!/^https?:$/i.test(parsed.protocol)) return null
    return parsed.toString()
  } catch {
    return null
  }
}

export const findDeferredLinkRanges = (text: string) => {
  const matches: UrlMatch[] = []

  EXPLICIT_URL_PATTERN.lastIndex = 0
  for (const match of text.matchAll(EXPLICIT_URL_PATTERN)) {
    const source = match[0]
    const index = match.index ?? -1
    if (index < 0) continue

    const trimmed = source.replace(TRAILING_PUNCTUATION_PATTERN, '')
    if (!trimmed) continue

    const href = normalizeUrlHref(trimmed)
    if (!href) continue

    matches.push({
      from: index,
      to: index + trimmed.length,
      text: trimmed,
      href,
    })
  }

  return matches
}

export const getUrlDisplayLabel = (value: string) => {
  const normalized = normalizeUrlHref(value, { allowBareDomain: true })
  if (!normalized) return value.trim()

  try {
    const parsed = new URL(normalized)
    const host = parsed.host.replace(/^www\./i, '')
    const path = parsed.pathname === '/' ? '' : parsed.pathname
    return `${host}${path}${parsed.search}${parsed.hash}`
  } catch {
    return value.trim()
  }
}
