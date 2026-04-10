import { getUrlDisplayLabel, normalizeUrlHref } from './links'

export type WebEmbedSpec =
  | {
      kind: 'youtube'
      providerLabel: 'YouTube'
      openUrl: string
      embedUrl: string
      title: string
    }
  | {
      kind: 'x'
      providerLabel: 'X'
      openUrl: string
      canonicalUrl: string
      title: string
    }
  | {
      kind: 'facebook'
      providerLabel: 'Facebook'
      openUrl: string
      embedUrl: string
      title: string
    }
  | {
      kind: 'instagram'
      providerLabel: 'Instagram'
      openUrl: string
      embedUrl: string
      title: string
    }
  | {
      kind: 'generic'
      providerLabel: 'Website'
      openUrl: string
      embedUrl: string
      title: string
    }

const trimWww = (value: string) => value.replace(/^www\./i, '')

const parseTimeToSeconds = (value: string | null) => {
  if (!value) return null
  if (/^\d+$/.test(value)) return Number.parseInt(value, 10)

  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i)
  if (!match) return null

  const hours = Number.parseInt(match[1] ?? '0', 10)
  const minutes = Number.parseInt(match[2] ?? '0', 10)
  const seconds = Number.parseInt(match[3] ?? '0', 10)
  const total = hours * 3600 + minutes * 60 + seconds
  return total > 0 ? total : null
}

const buildYoutubeSpec = (url: URL): WebEmbedSpec | null => {
  const host = trimWww(url.hostname).toLowerCase()
  if (!['youtube.com', 'youtu.be', 'youtube-nocookie.com', 'm.youtube.com'].includes(host)) return null

  const segments = url.pathname.split('/').filter(Boolean)
  const listId = url.searchParams.get('list')?.trim() || null
  const start =
    parseTimeToSeconds(url.searchParams.get('start')) ??
    parseTimeToSeconds(url.searchParams.get('t')) ??
    parseTimeToSeconds(url.searchParams.get('time_continue'))

  let videoId: string | null = null
  if (host === 'youtu.be') {
    videoId = segments[0] ?? null
  } else if (segments[0] === 'watch') {
    videoId = url.searchParams.get('v')?.trim() || null
  } else if (['embed', 'shorts', 'live'].includes(segments[0] ?? '')) {
    videoId = segments[1] ?? null
  }

  if (videoId) {
    const embedUrl = new URL(`https://www.youtube-nocookie.com/embed/${videoId}`)
    if (listId) embedUrl.searchParams.set('list', listId)
    if (start !== null) embedUrl.searchParams.set('start', String(start))

    return {
      kind: 'youtube',
      providerLabel: 'YouTube',
      openUrl: normalizeUrlHref(url.toString()) ?? url.toString(),
      embedUrl: embedUrl.toString(),
      title: `YouTube · ${getUrlDisplayLabel(url.toString())}`,
    }
  }

  if (listId) {
    const embedUrl = new URL('https://www.youtube-nocookie.com/embed/videoseries')
    embedUrl.searchParams.set('list', listId)
    if (start !== null) embedUrl.searchParams.set('start', String(start))

    return {
      kind: 'youtube',
      providerLabel: 'YouTube',
      openUrl: normalizeUrlHref(url.toString()) ?? url.toString(),
      embedUrl: embedUrl.toString(),
      title: `YouTube · ${getUrlDisplayLabel(url.toString())}`,
    }
  }

  return null
}

const buildXSpec = (url: URL): WebEmbedSpec | null => {
  const host = trimWww(url.hostname).toLowerCase()
  if (!['x.com', 'twitter.com', 'mobile.twitter.com'].includes(host)) return null

  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length < 3 || !['status', 'statuses'].includes(segments[1] ?? '')) return null

  const username = segments[0]
  const statusId = segments[2]
  if (!username || !statusId) return null

  const canonicalUrl = `https://x.com/${username}/status/${statusId}`
  return {
    kind: 'x',
    providerLabel: 'X',
    openUrl: canonicalUrl,
    canonicalUrl,
    title: `X · ${username}/status/${statusId}`,
  }
}

const buildFacebookSpec = (url: URL): WebEmbedSpec | null => {
  const host = trimWww(url.hostname).toLowerCase()
  if (!['facebook.com', 'm.facebook.com', 'fb.watch'].includes(host)) return null

  const openUrl = normalizeUrlHref(url.toString()) ?? url.toString()
  const isVideo = host === 'fb.watch' || /\/videos\/|\/watch\//i.test(url.pathname)
  const embedUrl = new URL(isVideo ? 'https://www.facebook.com/plugins/video.php' : 'https://www.facebook.com/plugins/post.php')
  embedUrl.searchParams.set('href', openUrl)
  embedUrl.searchParams.set('show_text', isVideo ? 'false' : 'true')
  embedUrl.searchParams.set('width', '500')

  return {
    kind: 'facebook',
    providerLabel: 'Facebook',
    openUrl,
    embedUrl: embedUrl.toString(),
    title: `Facebook · ${getUrlDisplayLabel(openUrl)}`,
  }
}

const buildInstagramSpec = (url: URL): WebEmbedSpec | null => {
  const host = trimWww(url.hostname).toLowerCase()
  if (!['instagram.com', 'm.instagram.com'].includes(host)) return null

  const segments = url.pathname.split('/').filter(Boolean)
  const type = segments[0]
  const id = segments[1]
  if (!type || !id || !['p', 'reel', 'reels', 'tv'].includes(type)) return null

  const embedType = type === 'reels' ? 'reel' : type
  const openUrl = normalizeUrlHref(url.toString()) ?? url.toString()
  return {
    kind: 'instagram',
    providerLabel: 'Instagram',
    openUrl,
    embedUrl: `https://www.instagram.com/${embedType}/${id}/embed/captioned/`,
    title: `Instagram · ${embedType}/${id}`,
  }
}

export const resolveWebEmbed = (value: string): WebEmbedSpec | null => {
  const normalized = normalizeUrlHref(value, { allowBareDomain: true })
  if (!normalized) return null

  try {
    const url = new URL(normalized)

    return (
      buildYoutubeSpec(url) ??
      buildXSpec(url) ??
      buildFacebookSpec(url) ??
      buildInstagramSpec(url) ?? {
        kind: 'generic',
        providerLabel: 'Website',
        openUrl: normalized,
        embedUrl: normalized,
        title: getUrlDisplayLabel(normalized) || 'Embedded website',
      }
    )
  } catch {
    return null
  }
}
