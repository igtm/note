import { describe, expect, it } from 'vitest'
import { createEmptyContent, type SavedNotebook } from './notebook'
import { parseNoteFile, serializeNoteFile } from './noteFile'

describe('noteFile', () => {
  it('round-trips a saved notebook', () => {
    const notebook: SavedNotebook = {
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
    }

    expect(parseNoteFile(serializeNoteFile(notebook))).toEqual(notebook)
  })

  it('rejects invalid note payloads', () => {
    expect(parseNoteFile('not-json')).toBeNull()
    expect(parseNoteFile(JSON.stringify({ items: 'broken', view: null }))).toBeNull()
  })
})
