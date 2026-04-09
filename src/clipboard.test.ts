import { describe, expect, it } from 'vitest'
import { parseCanvasItemsFromClipboardPayload, serializeCanvasItemsForClipboard } from './clipboard'
import { createEmptyContent, type CanvasItem } from './notebook'

const sampleItems = (): CanvasItem[] => [
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
  {
    id: 'path-1',
    type: 'path',
    x: 120,
    y: 180,
    w: 40,
    h: 20,
    points: [
      { x: 0, y: 10 },
      { x: 40, y: 10 },
    ],
    color: 'transparent',
    stroke: '#1f1f1f',
    strokeWidth: 'medium',
    strokeStyle: 'solid',
    fontFamily: 'hand',
    fontSize: 'md',
    textAlign: 'center',
  },
]

describe('clipboard', () => {
  it('round-trips canvas items through clipboard payload', () => {
    const items = sampleItems()
    const payload = serializeCanvasItemsForClipboard(items)

    expect(parseCanvasItemsFromClipboardPayload(payload)).toEqual(items)
  })

  it('rejects invalid clipboard payloads', () => {
    expect(parseCanvasItemsFromClipboardPayload('broken')).toBeNull()
  })
})
