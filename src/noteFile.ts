import {
  EXPORT_PNG_TEXT_KEY,
  EXPORT_SVG_METADATA_ID,
  parseEmbeddedExportPayload,
  readPngTextChunk,
} from './exportImage'
import { normalizeStoredNotebook, type CanvasItem, type SavedNotebook } from './notebook'

export const NOTE_FILE_EXTENSION = '.note'
export const NOTE_FILE_MIME = 'application/x-pencil-note+json'
export const NOTE_FILE_NAME = `pencil-note${NOTE_FILE_EXTENSION}`

export const serializeNoteFile = (notebook: SavedNotebook) => JSON.stringify(notebook)

export const parseNoteFile = (source: string): SavedNotebook | null => {
  try {
    return normalizeStoredNotebook(JSON.parse(source))
  } catch {
    return null
  }
}

const parseEmbeddedItems = (encoded: string): CanvasItem[] | null => {
  const parsed = parseEmbeddedExportPayload(encoded)
  if (!parsed || typeof parsed !== 'object' || !('items' in parsed)) return null
  const normalized = normalizeStoredNotebook({
    items: (parsed as { items: unknown }).items,
    view: { x: 0, y: 0, zoom: 1 },
  })
  return normalized?.items ?? null
}

const readEmbeddedPayloadFromSvg = (source: string) => {
  const match = source.match(
    new RegExp(`<metadata\\b[^>]*\\bid=(['"])${EXPORT_SVG_METADATA_ID}\\1[^>]*>([\\s\\S]*?)<\\/metadata>`, 'i'),
  )
  return match?.[2] ?? null
}

export const readEmbeddedItemsFromFile = async (
  file: Pick<File, 'name' | 'type' | 'text' | 'arrayBuffer'>,
): Promise<CanvasItem[] | null> => {
  const lowerName = file.name.toLowerCase()

  if (file.type === 'image/png' || lowerName.endsWith('.png')) {
    const payload = readPngTextChunk(await file.arrayBuffer(), EXPORT_PNG_TEXT_KEY)
    return payload ? parseEmbeddedItems(payload) : null
  }

  if (file.type === 'image/svg+xml' || lowerName.endsWith('.svg')) {
    const payload = readEmbeddedPayloadFromSvg(await file.text())
    return payload ? parseEmbeddedItems(payload) : null
  }

  return null
}
