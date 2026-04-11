import { describe, expect, it } from 'vitest'
import {
  EXPORT_PNG_TEXT_KEY,
  EXPORT_SVG_METADATA_ID,
  buildExportSvg,
  injectPngTextChunk,
  readPngTextChunk,
} from './exportImage'
import { DEFAULT_SLIDE_FILL, DEFAULT_SLIDE_STROKE, createEmptyContent, createDefaultItemStyle, type CanvasItem } from './notebook'

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn2kVwAAAAASUVORK5CYII='

describe('exportImage', () => {
  it('round-trips custom PNG text metadata', () => {
    const source = Uint8Array.from(atob(PNG_BASE64), (character) => character.charCodeAt(0)).buffer
    const encoded = injectPngTextChunk(source, EXPORT_PNG_TEXT_KEY, 'hello world')
    expect(readPngTextChunk(encoded, EXPORT_PNG_TEXT_KEY)).toBe('hello world')
  })

  it('embeds SVG metadata when requested', () => {
    const item: CanvasItem = {
      id: 'text-1',
      type: 'text',
      x: 0,
      y: 0,
      w: 320,
      h: 120,
      content: createEmptyContent(),
      color: 'transparent',
      stroke: 'transparent',
      strokeWidth: 'thin',
      strokeStyle: 'solid',
      fontFamily: 'hand',
      fontSize: 'md',
      textAlign: 'left',
    }

    const scene = buildExportSvg({
      items: [item],
      onlySelected: false,
      includeBackground: false,
      darkMode: false,
      embedPayload: 'encoded-payload',
    })

    expect(scene?.svg).toContain(`id="${EXPORT_SVG_METADATA_ID}"`)
    expect(scene?.svg).toContain('encoded-payload')
  })

  it('renders default slide colors with the dark export palette', () => {
    const item: CanvasItem = {
      id: 'slide-1',
      type: 'slide',
      x: 0,
      y: 0,
      w: 1280,
      h: 720,
      ...createDefaultItemStyle('slide'),
    }

    const scene = buildExportSvg({
      items: [item],
      onlySelected: false,
      includeBackground: true,
      darkMode: true,
    })

    expect(scene?.html).toContain('--item-fill:#211a14')
    expect(scene?.html).toContain('--item-stroke:#f4eadb')
    expect(scene?.html).not.toContain(`--item-fill:${DEFAULT_SLIDE_FILL}`)
    expect(scene?.html).not.toContain(`--item-stroke:${DEFAULT_SLIDE_STROKE}`)
  })
})
