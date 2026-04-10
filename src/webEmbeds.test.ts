import { describe, expect, it } from 'vitest'
import { resolveWebEmbed } from './webEmbeds'

describe('resolveWebEmbed', () => {
  it('builds YouTube embed URLs from watch links', () => {
    expect(resolveWebEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=43s')).toEqual({
      kind: 'youtube',
      providerLabel: 'YouTube',
      openUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=43s',
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=43',
      title: 'YouTube · youtube.com/watch?v=dQw4w9WgXcQ&t=43s',
    })
  })

  it('builds X specs from tweet URLs', () => {
    expect(resolveWebEmbed('https://x.com/jack/status/20')).toEqual({
      kind: 'x',
      providerLabel: 'X',
      openUrl: 'https://x.com/jack/status/20',
      canonicalUrl: 'https://x.com/jack/status/20',
      title: 'X · jack/status/20',
    })
  })

  it('builds Facebook and Instagram specialized embeds', () => {
    expect(resolveWebEmbed('https://www.facebook.com/zuck/posts/10102577175875681')).toEqual({
      kind: 'facebook',
      providerLabel: 'Facebook',
      openUrl: 'https://www.facebook.com/zuck/posts/10102577175875681',
      embedUrl:
        'https://www.facebook.com/plugins/post.php?href=https%3A%2F%2Fwww.facebook.com%2Fzuck%2Fposts%2F10102577175875681&show_text=true&width=500',
      title: 'Facebook · facebook.com/zuck/posts/10102577175875681',
    })

    expect(resolveWebEmbed('https://www.instagram.com/p/CuE2WNfJxV1/')).toEqual({
      kind: 'instagram',
      providerLabel: 'Instagram',
      openUrl: 'https://www.instagram.com/p/CuE2WNfJxV1/',
      embedUrl: 'https://www.instagram.com/p/CuE2WNfJxV1/embed/captioned/',
      title: 'Instagram · p/CuE2WNfJxV1',
    })
  })

  it('falls back to generic websites', () => {
    expect(resolveWebEmbed('example.com/docs')).toEqual({
      kind: 'generic',
      providerLabel: 'Website',
      openUrl: 'https://example.com/docs',
      embedUrl: 'https://example.com/docs',
      title: 'example.com/docs',
    })
  })
})
