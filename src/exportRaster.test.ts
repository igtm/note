import { describe, expect, it } from 'vitest'
import { EXPORT_PREVIEW_MAX_EDGE, createPreviewRenderFingerprint, getRasterRenderSettings } from './exportRaster'

describe('exportRaster', () => {
  it('keeps preview fingerprints stable for the same scene', () => {
    const scene = { width: 640, height: 360, html: '<div>hello</div>' }

    expect(createPreviewRenderFingerprint(scene)).toBe(createPreviewRenderFingerprint(scene))
  })

  it('changes preview fingerprints when the scene changes', () => {
    const baseScene = { width: 640, height: 360, html: '<div>hello</div>' }

    expect(createPreviewRenderFingerprint(baseScene)).not.toBe(
      createPreviewRenderFingerprint({ ...baseScene, html: '<div>world</div>' }),
    )
    expect(createPreviewRenderFingerprint(baseScene)).not.toBe(
      createPreviewRenderFingerprint({ ...baseScene, width: 800 }),
    )
  })

  it('uses a downscaled raster size for previews', () => {
    const settings = getRasterRenderSettings({ width: 4096, height: 2048 }, 'preview', 2)

    expect(settings.width).toBe(4096)
    expect(settings.height).toBe(2048)
    expect(settings.canvasWidth).toBe(EXPORT_PREVIEW_MAX_EDGE)
    expect(settings.canvasHeight).toBe(512)
    expect(settings.cacheBust).toBe(false)
  })

  it('keeps export renders high resolution', () => {
    const settings = getRasterRenderSettings({ width: 1200, height: 800 }, 'export', 3)

    expect(settings.canvasWidth).toBe(2400)
    expect(settings.canvasHeight).toBe(1600)
    expect(settings.pixelRatio).toBe(1)
    expect(settings.cacheBust).toBe(false)
  })
})
