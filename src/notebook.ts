import type { JSONContent } from '@tiptap/core'

export type ItemType = 'text' | 'note' | 'rect' | 'ellipse' | 'diamond' | 'path' | 'image'
export type StrokeStyle = 'solid' | 'dashed' | 'dotted'
export type StrokeWidth = 'thin' | 'medium' | 'bold'
export type FontFamily = 'hand' | 'sans' | 'mono'
export type FontSize = 'sm' | 'md' | 'lg'
export type TextAlign = 'left' | 'center' | 'right'

export type PathPoint = {
  x: number
  y: number
}

export type ItemStyle = {
  color: string
  stroke: string
  strokeWidth: StrokeWidth
  strokeStyle: StrokeStyle
  fontFamily: FontFamily
  fontSize: FontSize
  textAlign: TextAlign
}

type BaseCanvasItem = {
  id: string
  type: ItemType
  x: number
  y: number
  w: number
  h: number
} & ItemStyle

export type PathCanvasItem = BaseCanvasItem & {
  type: 'path'
  points: PathPoint[]
}

export type ImageCanvasItem = BaseCanvasItem & {
  type: 'image'
  src: string
  mimeType?: string
  name?: string
}

export type TextCanvasItem = BaseCanvasItem & {
  type: Exclude<ItemType, 'path' | 'image'>
  content: JSONContent
}

export type CanvasItem = TextCanvasItem | PathCanvasItem | ImageCanvasItem

export type Viewport = {
  x: number
  y: number
  zoom: number
}

export type SavedNotebook = {
  items: CanvasItem[]
  view: Viewport
}

type LegacyCanvasItem = {
  id: string
  type: Exclude<ItemType, 'path' | 'image'>
  x: number
  y: number
  w: number
  h: number
  text?: string
  content?: JSONContent
  color?: string
  stroke?: string
  strokeWidth?: StrokeWidth
  strokeStyle?: StrokeStyle
  fontFamily?: FontFamily
  fontSize?: FontSize
  textAlign?: TextAlign
}

type LegacyListKind = 'task' | 'bullet' | 'ordered'

type LegacyListLine = {
  kind: LegacyListKind
  indent: number
  text: string
  checked?: boolean
  start?: number
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isItemType = (value: unknown): value is ItemType =>
  typeof value === 'string' && ['text', 'note', 'rect', 'ellipse', 'diamond', 'path', 'image'].includes(value)

const isStrokeWidth = (value: unknown): value is StrokeWidth =>
  typeof value === 'string' && ['thin', 'medium', 'bold'].includes(value)

const isStrokeStyle = (value: unknown): value is StrokeStyle =>
  typeof value === 'string' && ['solid', 'dashed', 'dotted'].includes(value)

const isFontFamily = (value: unknown): value is FontFamily =>
  typeof value === 'string' && ['hand', 'sans', 'mono'].includes(value)

const isFontSize = (value: unknown): value is FontSize =>
  typeof value === 'string' && ['sm', 'md', 'lg'].includes(value)

const isTextAlign = (value: unknown): value is TextAlign =>
  typeof value === 'string' && ['left', 'center', 'right'].includes(value)

const createParagraph = (text = ''): JSONContent =>
  text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' }

const ensureNodeContent = (node: JSONContent): JSONContent[] => {
  if (!node.content) node.content = []
  return node.content
}

export const createDefaultItemStyle = (type: ItemType): ItemStyle => {
  if (type === 'text') {
    return {
      color: 'transparent',
      stroke: 'transparent',
      strokeWidth: 'thin',
      strokeStyle: 'solid',
      fontFamily: 'hand',
      fontSize: 'md',
      textAlign: 'left',
    }
  }

  if (type === 'note') {
    return {
      color: '#fff7c7',
      stroke: '#5b4826',
      strokeWidth: 'thin',
      strokeStyle: 'solid',
      fontFamily: 'hand',
      fontSize: 'md',
      textAlign: 'left',
    }
  }

  if (type === 'image') {
    return {
      color: 'transparent',
      stroke: 'transparent',
      strokeWidth: 'thin',
      strokeStyle: 'solid',
      fontFamily: 'hand',
      fontSize: 'md',
      textAlign: 'center',
    }
  }

  return {
    color: 'transparent',
    stroke: '#1f1f1f',
    strokeWidth: 'medium',
    strokeStyle: 'solid',
    fontFamily: 'hand',
    fontSize: 'md',
    textAlign: 'center',
  }
}

export const withDefaultItemStyle = <T extends { type: ItemType } & Partial<ItemStyle>>(item: T): T & ItemStyle => {
  const defaults = createDefaultItemStyle(item.type)

  return {
    ...defaults,
    ...item,
    color: typeof item.color === 'string' ? item.color : defaults.color,
    stroke: typeof item.stroke === 'string' ? item.stroke : defaults.stroke,
    strokeWidth: isStrokeWidth(item.strokeWidth) ? item.strokeWidth : defaults.strokeWidth,
    strokeStyle: isStrokeStyle(item.strokeStyle) ? item.strokeStyle : defaults.strokeStyle,
    fontFamily: isFontFamily(item.fontFamily) ? item.fontFamily : defaults.fontFamily,
    fontSize: isFontSize(item.fontSize) ? item.fontSize : defaults.fontSize,
    textAlign: isTextAlign(item.textAlign) ? item.textAlign : defaults.textAlign,
  }
}

export const isPathItem = (item: CanvasItem): item is PathCanvasItem => item.type === 'path'
export const isImageItem = (item: CanvasItem): item is ImageCanvasItem => item.type === 'image'
export const isTextCanvasItem = (item: CanvasItem): item is TextCanvasItem =>
  item.type !== 'path' && item.type !== 'image'

const indentWidth = (value: string) =>
  [...value].reduce((total, character) => total + (character === '\t' ? 2 : 1), 0)

const parseLegacyListLine = (line: string): LegacyListLine | null => {
  const task = line.match(/^(\s*)[-*]\s+\[( |x|X)\]\s*(.*)$/)
  if (task) {
    return {
      kind: 'task',
      indent: Math.floor(indentWidth(task[1]) / 2),
      text: task[3],
      checked: task[2].toLowerCase() === 'x',
    }
  }

  const bullet = line.match(/^(\s*)[-*]\s+(.*)$/)
  if (bullet) {
    return {
      kind: 'bullet',
      indent: Math.floor(indentWidth(bullet[1]) / 2),
      text: bullet[2],
    }
  }

  const ordered = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/)
  if (ordered) {
    return {
      kind: 'ordered',
      indent: Math.floor(indentWidth(ordered[1]) / 2),
      start: Number(ordered[2]),
      text: ordered[3],
    }
  }

  return null
}

const normalizeListIndent = (rows: LegacyListLine[]) => {
  const normalized: LegacyListLine[] = []

  rows.forEach((row, index) => {
    if (index === 0) {
      normalized.push({ ...row, indent: 0 })
      return
    }

    const previousIndent = normalized[index - 1].indent
    normalized.push({ ...row, indent: Math.min(row.indent, previousIndent + 1) })
  })

  return normalized
}

const createListNode = (row: LegacyListLine): JSONContent => {
  if (row.kind === 'bullet') return { type: 'bulletList', content: [] }
  if (row.kind === 'ordered') {
    return {
      type: 'orderedList',
      attrs: row.start && row.start > 1 ? { start: row.start } : undefined,
      content: [],
    }
  }

  return { type: 'taskList', content: [] }
}

const createListItemNode = (row: LegacyListLine): JSONContent => {
  const paragraph = createParagraph(row.text.trim())

  if (row.kind === 'task') {
    return {
      type: 'taskItem',
      attrs: { checked: Boolean(row.checked) },
      content: [paragraph],
    }
  }

  return {
    type: 'listItem',
    content: [paragraph],
  }
}

const buildLegacyListBlocks = (rows: LegacyListLine[]): JSONContent[] => {
  const normalized = normalizeListIndent(rows)

  const parseLevel = (index: number, indent: number): { nodes: JSONContent[]; nextIndex: number } => {
    const nodes: JSONContent[] = []

    while (index < normalized.length) {
      const row = normalized[index]

      if (row.indent < indent || row.indent > indent) break

      const list = createListNode(row)
      const listContent = ensureNodeContent(list)
      const kind = row.kind

      while (index < normalized.length) {
        const current = normalized[index]
        if (current.indent !== indent || current.kind !== kind) break

        const item = createListItemNode(current)
        listContent.push(item)
        index += 1

        if (index < normalized.length && normalized[index].indent > indent) {
          const nested = parseLevel(index, normalized[index].indent)
          ensureNodeContent(item).push(...nested.nodes)
          index = nested.nextIndex
        }
      }

      nodes.push(list)
    }

    return { nodes, nextIndex: index }
  }

  return parseLevel(0, 0).nodes
}

const isJSONMark = (value: unknown): boolean => {
  if (!isRecord(value)) return false
  if ('type' in value && typeof value.type !== 'string') return false
  if ('attrs' in value && !isRecord(value.attrs)) return false
  return true
}

const isJSONContentNode = (value: unknown): value is JSONContent => {
  if (!isRecord(value)) return false
  if ('type' in value && typeof value.type !== 'string') return false
  if ('text' in value && typeof value.text !== 'string') return false
  if ('attrs' in value && !isRecord(value.attrs)) return false
  if ('marks' in value && (!Array.isArray(value.marks) || !value.marks.every(isJSONMark))) return false
  if ('content' in value && (!Array.isArray(value.content) || !value.content.every(isJSONContentNode))) return false
  return true
}

export const createEmptyContent = (): JSONContent => ({
  type: 'doc',
  content: [createParagraph()],
})

export const contentSignature = (content: JSONContent) => JSON.stringify(content)

export const normalizeContent = (value: unknown): JSONContent | null => {
  if (!isJSONContentNode(value) || value.type !== 'doc') return null

  const node = value as JSONContent
  if (node.content && node.content.length > 0) return node

  return createEmptyContent()
}

export const legacyTextToContent = (text: string): JSONContent => {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const content: JSONContent[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const parsed = parseLegacyListLine(line)
    const trimmed = line.trim()

    if (!trimmed) {
      content.push(createParagraph())
      index += 1
      continue
    }

    if (parsed) {
      const listRows: LegacyListLine[] = []

      while (index < lines.length) {
        const current = parseLegacyListLine(lines[index])
        if (!current) break
        listRows.push(current)
        index += 1
      }

      content.push(...buildLegacyListBlocks(listRows))
      continue
    }

    content.push(createParagraph(trimmed))
    index += 1
  }

  return {
    type: 'doc',
    content: content.length ? content : [createParagraph()],
  }
}

const isPathPoint = (value: unknown): value is PathPoint =>
  isRecord(value) && typeof value.x === 'number' && typeof value.y === 'number'

export const normalizeStoredItem = (value: unknown): CanvasItem | null => {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !isItemType(value.type) ||
    typeof value.x !== 'number' ||
    typeof value.y !== 'number' ||
    typeof value.w !== 'number' ||
    typeof value.h !== 'number'
  ) {
    return null
  }

  const styled = withDefaultItemStyle(value as { type: ItemType } & Partial<ItemStyle>)

  if (value.type === 'path') {
    if (!Array.isArray(value.points) || !value.points.every(isPathPoint) || value.points.length < 1) return null

    return {
      id: value.id,
      type: 'path',
      x: value.x,
      y: value.y,
      w: value.w,
      h: value.h,
      points: value.points,
      color: styled.color,
      stroke: styled.stroke,
      strokeWidth: styled.strokeWidth,
      strokeStyle: styled.strokeStyle,
      fontFamily: styled.fontFamily,
      fontSize: styled.fontSize,
      textAlign: styled.textAlign,
    }
  }

  if (value.type === 'image') {
    if (typeof value.src !== 'string' || !value.src) return null

    return {
      id: value.id,
      type: 'image',
      x: value.x,
      y: value.y,
      w: value.w,
      h: value.h,
      src: value.src,
      mimeType: typeof value.mimeType === 'string' ? value.mimeType : undefined,
      name: typeof value.name === 'string' ? value.name : undefined,
      color: styled.color,
      stroke: styled.stroke,
      strokeWidth: styled.strokeWidth,
      strokeStyle: styled.strokeStyle,
      fontFamily: styled.fontFamily,
      fontSize: styled.fontSize,
      textAlign: styled.textAlign,
    }
  }

  const legacy = value as Partial<LegacyCanvasItem>
  const content =
    typeof legacy.text === 'string' ? legacyTextToContent(legacy.text) : normalizeContent(value.content)

  if (!content) return null

  return {
    id: value.id,
    type: value.type,
    x: value.x,
    y: value.y,
    w: value.w,
    h: value.h,
    color: styled.color,
    stroke: styled.stroke,
    strokeWidth: styled.strokeWidth,
    strokeStyle: styled.strokeStyle,
    fontFamily: styled.fontFamily,
    fontSize: styled.fontSize,
    textAlign: styled.textAlign,
    content,
  }
}

export const normalizeStoredNotebook = (value: unknown): SavedNotebook | null => {
  if (!isRecord(value) || !Array.isArray(value.items) || !isRecord(value.view)) return null

  const items = value.items
    .map((item) => normalizeStoredItem(item))
    .filter((item): item is CanvasItem => item !== null)

  if (items.length !== value.items.length) return null

  const view = value.view
  if (typeof view.x !== 'number' || typeof view.y !== 'number' || typeof view.zoom !== 'number') return null

  return {
    items,
    view: {
      x: view.x,
      y: view.y,
      zoom: clamp(view.zoom, 0.25, 3),
    },
  }
}
