import { describe, expect, it } from 'vitest'
import { normalizeStoredNotebook } from './notebook'
import { NOTE_TEMPLATE_SECTIONS } from './templates'

describe('templates', () => {
  it('covers business, engineering, and education scenarios', () => {
    expect(NOTE_TEMPLATE_SECTIONS.map((section) => section.id)).toEqual(['business', 'engineering', 'education'])
    expect(NOTE_TEMPLATE_SECTIONS.flatMap((section) => section.templates)).toHaveLength(6)
  })

  it('builds valid notebook items for every template', () => {
    NOTE_TEMPLATE_SECTIONS.forEach((section) => {
      section.templates.forEach((template) => {
        const items = template.buildItems()
        const ids = new Set(items.map((item) => item.id))
        const normalized = normalizeStoredNotebook({
          items: JSON.parse(JSON.stringify(items)),
          view: { x: 0, y: 0, zoom: 1 },
        })

        expect(items.length).toBeGreaterThan(2)
        expect(ids.size).toBe(items.length)
        expect(normalized?.items).toEqual(items)
      })
    })
  })
})
