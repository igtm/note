import type { JSONContent } from '@tiptap/core'

export type ItemType =
  | 'text'
  | 'note'
  | 'rect'
  | 'ellipse'
  | 'diamond'
  | 'slide'
  | 'webEmbed'
  | 'path'
  | 'line'
  | 'arrow'
  | 'image'
export type StrokeItemType = 'path' | 'line' | 'arrow'
export type StrokeStyle = 'solid' | 'dashed' | 'dotted'
export type StrokeWidth = 'thin' | 'medium' | 'bold'
export type FontFamily = 'hand' | 'sans' | 'mono'
export type FontSize = 'sm' | 'md' | 'lg'
export type TextAlign = 'left' | 'center' | 'right'

export const DEFAULT_SLIDE_FILL = '#fffdf8'
export const DEFAULT_SLIDE_STROKE = '#5b4826'

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

export type StrokeCanvasItem = BaseCanvasItem & {
  type: StrokeItemType
  points: PathPoint[]
}

export type PathCanvasItem = StrokeCanvasItem & {
  type: 'path'
}

export type LineCanvasItem = StrokeCanvasItem & {
  type: 'line'
}

export type ArrowCanvasItem = StrokeCanvasItem & {
  type: 'arrow'
}

export type ImageCanvasItem = BaseCanvasItem & {
  type: 'image'
  src: string
  mimeType?: string
  name?: string
}

export type SlideCanvasItem = BaseCanvasItem & {
  type: 'slide'
}

export type WebEmbedCanvasItem = BaseCanvasItem & {
  type: 'webEmbed'
  url: string
}

type TextItemType = Exclude<ItemType, StrokeItemType | 'image' | 'slide' | 'webEmbed'>

export type TextCanvasItem = BaseCanvasItem & {
  type: TextItemType
  content: JSONContent
}

export type CanvasItem =
  | TextCanvasItem
  | PathCanvasItem
  | LineCanvasItem
  | ArrowCanvasItem
  | ImageCanvasItem
  | SlideCanvasItem
  | WebEmbedCanvasItem

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
  type: TextItemType
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
  typeof value === 'string' &&
  ['text', 'note', 'rect', 'ellipse', 'diamond', 'slide', 'webEmbed', 'path', 'line', 'arrow', 'image'].includes(value)

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

  if (type === 'slide') {
    return {
      color: DEFAULT_SLIDE_FILL,
      stroke: DEFAULT_SLIDE_STROKE,
      strokeWidth: 'medium',
      strokeStyle: 'solid',
      fontFamily: 'sans',
      fontSize: 'md',
      textAlign: 'left',
    }
  }

  if (type === 'webEmbed') {
    return {
      color: '#f7f1e5',
      stroke: '#5b4826',
      strokeWidth: 'thin',
      strokeStyle: 'solid',
      fontFamily: 'sans',
      fontSize: 'md',
      textAlign: 'left',
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
export const isLineItem = (item: CanvasItem): item is LineCanvasItem => item.type === 'line'
export const isArrowItem = (item: CanvasItem): item is ArrowCanvasItem => item.type === 'arrow'
export const isStrokeCanvasItem = (item: CanvasItem): item is StrokeCanvasItem =>
  item.type === 'path' || item.type === 'line' || item.type === 'arrow'
export const isImageItem = (item: CanvasItem): item is ImageCanvasItem => item.type === 'image'
export const isSlideItem = (item: CanvasItem): item is SlideCanvasItem => item.type === 'slide'
export const isWebEmbedItem = (item: CanvasItem): item is WebEmbedCanvasItem => item.type === 'webEmbed'
export const isTextCanvasItem = (item: CanvasItem): item is TextCanvasItem =>
  !isStrokeCanvasItem(item) && item.type !== 'image' && item.type !== 'slide' && item.type !== 'webEmbed'

export const sortCanvasItemsForRender = (items: CanvasItem[]) => {
  const slideItems: CanvasItem[] = []
  const otherItems: CanvasItem[] = []

  items.forEach((item) => {
    if (isSlideItem(item)) slideItems.push(item)
    else otherItems.push(item)
  })

  return [...slideItems, ...otherItems]
}

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

  if (value.type === 'path' || value.type === 'line' || value.type === 'arrow') {
    if (!Array.isArray(value.points) || !value.points.every(isPathPoint)) return null
    if (value.type === 'path' && value.points.length < 1) return null
    if ((value.type === 'line' || value.type === 'arrow') && value.points.length < 2) return null

    return {
      id: value.id,
      type: value.type,
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

  if (value.type === 'slide') {
    return {
      id: value.id,
      type: 'slide',
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
    }
  }

  if (value.type === 'webEmbed') {
    if (typeof value.url !== 'string') return null

    return {
      id: value.id,
      type: 'webEmbed',
      x: value.x,
      y: value.y,
      w: value.w,
      h: value.h,
      url: value.url,
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
