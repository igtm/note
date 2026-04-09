import { describe, expect, it } from 'vitest'
import { findDeferredLinkRanges, getUrlDisplayLabel, normalizeUrlHref } from './links'

describe('links', () => {
  it('normalizes explicit and bare-domain URLs', () => {
    expect(normalizeUrlHref('https://example.com/path?q=1')).toBe('https://example.com/path?q=1')
    expect(normalizeUrlHref('www.example.com/test')).toBe('https://www.example.com/test')
    expect(normalizeUrlHref('example.com/test', { allowBareDomain: true })).toBe('https://example.com/test')
    expect(normalizeUrlHref('localhost:5173/app', { allowBareDomain: true })).toBe('http://localhost:5173/app')
  })

  it('finds deferred link ranges and strips trailing punctuation', () => {
    expect(findDeferredLinkRanges('See https://example.com/docs, then https://openai.com/.')).toEqual([
      {
        from: 4,
        to: 28,
        text: 'https://example.com/docs',
        href: 'https://example.com/docs',
      },
      {
        from: 35,
        to: 54,
        text: 'https://openai.com/',
        href: 'https://openai.com/',
      },
    ])
  })

  it('creates display labels for embed headers', () => {
    expect(getUrlDisplayLabel('https://www.example.com/embed?id=1')).toBe('example.com/embed?id=1')
    expect(getUrlDisplayLabel('not a url')).toBe('not a url')
  })
})
