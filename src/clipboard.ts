import { encodeEmbeddedExportPayload, parseEmbeddedExportPayload } from './exportImage'
import { normalizeStoredNotebook, type CanvasItem } from './notebook'

export const NOTE_CLIPBOARD_MIME = 'application/x-pencil-note-items'
export const NOTE_CLIPBOARD_FALLBACK_TEXT = '[[pencil-note-items]]'

export const serializeCanvasItemsForClipboard = (items: CanvasItem[]) => encodeEmbeddedExportPayload(items)

export const parseCanvasItemsFromClipboardPayload = (payload: string): CanvasItem[] | null => {
  const parsed = parseEmbeddedExportPayload(payload)
  if (!parsed || typeof parsed !== 'object' || !('items' in parsed)) return null

  const normalized = normalizeStoredNotebook({
    items: (parsed as { items: unknown }).items,
    view: { x: 0, y: 0, zoom: 1 },
  })

  return normalized?.items ?? null
}
