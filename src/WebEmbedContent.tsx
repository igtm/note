import { Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import type { WebEmbedSpec } from './webEmbeds'

declare global {
  interface Window {
    twttr?: {
      widgets?: {
        load?: (root?: HTMLElement) => void
      }
    }
  }
}

let twitterWidgetsPromise: Promise<void> | null = null

const ensureTwitterWidgets = () => {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.twttr?.widgets?.load) return Promise.resolve()
  if (twitterWidgetsPromise) return twitterWidgetsPromise

  twitterWidgetsPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-x-widgets-script="true"]')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Failed to load X widgets')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = 'https://platform.twitter.com/widgets.js'
    script.async = true
    script.charset = 'utf-8'
    script.dataset.xWidgetsScript = 'true'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load X widgets'))
    document.head.append(script)
  }).catch((error) => {
    twitterWidgetsPromise = null
    throw error
  })

  return twitterWidgetsPromise
}

const XStatusEmbed = (props: { spec: Extract<WebEmbedSpec, { kind: 'x' }>; darkMode: boolean }) => {
  let containerRef!: HTMLDivElement
  const [markup, setMarkup] = createSignal<string | null>(null)
  const [failed, setFailed] = createSignal(false)

  const endpoint = createMemo(
    () =>
      `https://publish.x.com/oembed?omit_script=true&dnt=true&theme=${props.darkMode ? 'dark' : 'light'}&url=${encodeURIComponent(props.spec.canonicalUrl)}`,
  )

  createEffect(() => {
    const controller = new AbortController()
    setMarkup(null)
    setFailed(false)

    void fetch(endpoint(), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`X oEmbed failed with ${response.status}`)
        return (await response.json()) as { html?: string }
      })
      .then((payload) => {
        if (typeof payload.html !== 'string' || !payload.html) throw new Error('X oEmbed did not return HTML')
        setMarkup(payload.html)
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        console.error(error)
        setFailed(true)
      })

    onCleanup(() => controller.abort())
  })

  createEffect(() => {
    const html = markup()
    if (!containerRef) return

    if (!html) {
      containerRef.innerHTML = ''
      return
    }

    containerRef.innerHTML = html
    void ensureTwitterWidgets()
      .then(() => window.twttr?.widgets?.load?.(containerRef))
      .catch((error) => {
        console.error(error)
        setFailed(true)
      })
  })

  return (
    <Show
      when={!failed() && markup()}
      fallback={
        <div class="web-embed-placeholder">
          <strong>{failed() ? 'X embed unavailable' : 'Loading X post'}</strong>
          <span>
            {failed() ? 'This post could not be loaded right now. Use Open to view it directly.' : 'Fetching the official X embed…'}
          </span>
        </div>
      }
    >
      <div ref={containerRef} class="web-embed-social web-embed-social-x" />
    </Show>
  )
}

export const WebEmbedContent = (props: { spec: WebEmbedSpec; darkMode: boolean }) => {
  if (props.spec.kind === 'x') {
    return <XStatusEmbed spec={props.spec} darkMode={props.darkMode} />
  }

  return (
    <iframe
      class={`web-embed-frame web-embed-frame-${props.spec.kind}`}
      src={props.spec.embedUrl}
      title={props.spec.title}
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
      allow={
        props.spec.kind === 'youtube'
          ? 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
          : undefined
      }
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
    />
  )
}
