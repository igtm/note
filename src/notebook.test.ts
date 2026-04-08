import { describe, expect, it } from 'vitest'
import { legacyTextToContent, normalizeStoredNotebook } from './notebook'

describe('legacyTextToContent', () => {
  it('converts paragraphs and blank lines into a Tiptap document', () => {
    expect(legacyTextToContent('hello\n\nworld')).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: 'world' }] },
      ],
    })
  })

  it('converts nested bullets and tasks into nested list nodes', () => {
    expect(legacyTextToContent('- top\n  - child\n  - [x] done\n1. count')).toEqual({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'top' }] },
                {
                  type: 'bulletList',
                  content: [
                    {
                      type: 'listItem',
                      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'child' }] }],
                    },
                  ],
                },
                {
                  type: 'taskList',
                  content: [
                    {
                      type: 'taskItem',
                      attrs: { checked: true },
                      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'done' }] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: 'orderedList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'count' }] }],
            },
          ],
        },
      ],
    })
  })
})

describe('normalizeStoredNotebook', () => {
  it('migrates legacy string content, injects defaults, and clamps zoom', () => {
    const notebook = normalizeStoredNotebook({
      items: [
        {
          id: 'item-1',
          type: 'note',
          x: 12,
          y: 24,
          w: 320,
          h: 180,
          text: 'legacy note',
        },
      ],
      view: { x: 10, y: 20, zoom: 4 },
    })

    expect(notebook).toEqual({
      items: [
        {
          id: 'item-1',
          type: 'note',
          x: 12,
          y: 24,
          w: 320,
          h: 180,
          color: '#fff7c7',
          stroke: '#5b4826',
          strokeWidth: 'thin',
          strokeStyle: 'solid',
          fontFamily: 'hand',
          fontSize: 'md',
          textAlign: 'left',
          content: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'legacy note' }] }],
          },
        },
      ],
      view: { x: 10, y: 20, zoom: 3 },
    })
  })

  it('accepts path items with points', () => {
    const notebook = normalizeStoredNotebook({
      items: [
        {
          id: 'path-1',
          type: 'path',
          x: 5,
          y: 7,
          w: 40,
          h: 20,
          points: [
            { x: 2, y: 3 },
            { x: 14, y: 12 },
          ],
        },
      ],
      view: { x: 0, y: 0, zoom: 1 },
    })

    expect(notebook).toEqual({
      items: [
        {
          id: 'path-1',
          type: 'path',
          x: 5,
          y: 7,
          w: 40,
          h: 20,
          points: [
            { x: 2, y: 3 },
            { x: 14, y: 12 },
          ],
          color: 'transparent',
          stroke: '#1f1f1f',
          strokeWidth: 'medium',
          strokeStyle: 'solid',
          fontFamily: 'hand',
          fontSize: 'md',
          textAlign: 'center',
        },
      ],
      view: { x: 0, y: 0, zoom: 1 },
    })
  })
})
