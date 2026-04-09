import { describe, expect, it } from 'vitest'
import { EXPORT_SVG_METADATA_ID, encodeEmbeddedExportPayload, injectPngTextChunk } from './exportImage'
import { createEmptyContent, type SavedNotebook } from './notebook'
import { parseNoteFile, readEmbeddedItemsFromFile, serializeNoteFile } from './noteFile'

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn2kVwAAAAASUVORK5CYII='

const createNotebook = (): SavedNotebook => ({
  items: [
    {
      id: 'text-1',
      type: 'text',
      x: 32,
      y: 48,
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
    },
  ],
  view: { x: 140, y: 120, zoom: 1.25 },
})

describe('noteFile', () => {
  it('round-trips a saved notebook', () => {
    const notebook = createNotebook()

    expect(parseNoteFile(serializeNoteFile(notebook))).toEqual(notebook)
  })

  it('rejects invalid note payloads', () => {
    expect(parseNoteFile('not-json')).toBeNull()
    expect(parseNoteFile(JSON.stringify({ items: 'broken', view: null }))).toBeNull()
  })

  it('restores embedded PNG items even when mime type is missing', async () => {
    const notebook = createNotebook()
    const payload = encodeEmbeddedExportPayload(notebook.items)
    const source = Uint8Array.from(atob(PNG_BASE64), (character) => character.charCodeAt(0)).buffer
    const encoded = injectPngTextChunk(source, 'pencil-note', payload)

    const items = await readEmbeddedItemsFromFile({
      name: 'export.PNG',
      type: '',
      text: async () => '',
      arrayBuffer: async () => encoded,
    })

    expect(items).toEqual(notebook.items)
  })

  it('restores embedded SVG items', async () => {
    const notebook = createNotebook()
    const payload = encodeEmbeddedExportPayload(notebook.items)
    const items = await readEmbeddedItemsFromFile({
      name: 'export.svg',
      type: 'image/svg+xml',
      text: async () => `<svg><metadata id="${EXPORT_SVG_METADATA_ID}">${payload}</metadata></svg>`,
      arrayBuffer: async () => new ArrayBuffer(0),
    })

    expect(items).toEqual(notebook.items)
  })
})
