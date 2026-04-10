import type { ExportScene } from './exportImage'

export type RasterRenderMode = 'preview' | 'export'

export type RasterRenderSettings = {
  width: number
  height: number
  canvasWidth: number
  canvasHeight: number
  pixelRatio: number
  cacheBust: boolean
}

export const EXPORT_PREVIEW_DEBOUNCE_MS = 120
export const EXPORT_PREVIEW_MAX_EDGE = 1024

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const hashString = (value: string) => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export const createPreviewRenderFingerprint = (scene: Pick<ExportScene, 'width' | 'height' | 'html'>) =>
  `${scene.width}x${scene.height}:${scene.html.length}:${hashString(scene.html)}`

export const getRasterRenderSettings = (
  scene: Pick<ExportScene, 'width' | 'height'>,
  mode: RasterRenderMode,
  devicePixelRatio = 1,
): RasterRenderSettings => {
  const width = Math.max(1, Math.ceil(scene.width))
  const height = Math.max(1, Math.ceil(scene.height))

  if (mode === 'preview') {
    const scale = Math.min(1, EXPORT_PREVIEW_MAX_EDGE / Math.max(width, height))
    return {
      width,
      height,
      canvasWidth: Math.max(1, Math.round(width * scale)),
      canvasHeight: Math.max(1, Math.round(height * scale)),
      pixelRatio: 1,
      cacheBust: false,
    }
  }

  const scale = clamp(devicePixelRatio || 1, 1, 2)
  return {
    width,
    height,
    canvasWidth: Math.max(1, Math.ceil(width * scale)),
    canvasHeight: Math.max(1, Math.ceil(height * scale)),
    pixelRatio: 1,
    cacheBust: false,
  }
}
