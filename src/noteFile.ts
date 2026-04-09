import { normalizeStoredNotebook, type SavedNotebook } from './notebook'

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
