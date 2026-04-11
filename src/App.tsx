import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import { Portal } from 'solid-js/web'
import { toBlob } from 'html-to-image'
import './App.css'
import {
  NOTE_CLIPBOARD_FALLBACK_TEXT,
  NOTE_CLIPBOARD_MIME,
  parseCanvasItemsFromClipboardPayload,
  serializeCanvasItemsForClipboard,
} from './clipboard'
import {
  EXPORT_PNG_TEXT_KEY,
  buildExportSvg,
  encodeEmbeddedExportPayload,
  getItemBounds,
  injectPngTextChunk,
} from './exportImage'
import {
  EXPORT_PREVIEW_DEBOUNCE_MS,
  createPreviewRenderFingerprint,
  getRasterRenderSettings,
  type RasterRenderMode,
} from './exportRaster'
import { RichTextItem } from './RichTextItem'
import { WebEmbedContent } from './WebEmbedContent'
import {
  DEFAULT_SLIDE_FILL,
  DEFAULT_SLIDE_STROKE,
  createDefaultItemStyle,
  createEmptyContent,
  isStrokeCanvasItem,
  isImageItem,
  isPathItem,
  isSlideItem,
  isTextCanvasItem,
  isWebEmbedItem,
  normalizeStoredNotebook,
  sortCanvasItemsForRender,
  type ArrowCanvasItem,
  type CanvasItem,
  type FontFamily,
  type FontSize,
  type ItemStyle,
  type ItemType,
  type LineCanvasItem,
  type PathCanvasItem,
  type SavedNotebook,
  type SlideCanvasItem,
  type StrokeCanvasItem,
  type StrokeItemType,
  type StrokeStyle,
  type StrokeWidth,
  type TextAlign,
  type Viewport,
  type WebEmbedCanvasItem,
} from './notebook'
import { resolveWebEmbed } from './webEmbeds'
import {
  THEME_OPTIONS,
  THEME_STORAGE_KEY,
  applyTheme,
  getSystemTheme,
  loadThemeMode,
  resolveTheme,
  type ResolvedTheme,
  type ThemeMode,
} from './theme'
import {
  NOTE_FILE_EXTENSION,
  NOTE_FILE_MIME,
  NOTE_FILE_NAME,
  parseNoteFile,
  readEmbeddedItemsFromFile,
  serializeNoteFile,
} from './noteFile'
import { collectPresentationSlides, fitSlideToViewport } from './slideshow'
import { NOTE_TEMPLATE_SECTIONS, type NotebookTemplate } from './templates'

type ShapeTool = 'rect' | 'ellipse' | 'diamond' | 'slide' | 'webEmbed' | 'line' | 'arrow'
type Tool = 'selection' | 'pan' | 'pencil' | 'eraser' | 'text' | ShapeTool

type NoteFileHandle = {
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<{
    write(data: Blob | BufferSource | string): Promise<void>
    close(): Promise<void>
  }>
  queryPermission?(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission?(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
}

type OpenFilePickerWindow = Window & {
  showOpenFilePicker?: (options?: {
    multiple?: boolean
    excludeAcceptAllOption?: boolean
    types?: Array<{
      description?: string
      accept: Record<string, string[]>
    }>
  }) => Promise<NoteFileHandle[]>
}

type Point = {
  x: number
  y: number
}

type SelectionBox = Point & {
  w: number
  h: number
}

type ItemOrigin = {
  id: string
  x: number
  y: number
}

type HistorySnapshot = {
  items: CanvasItem[]
  selectedIds: string[]
}

type DrawInteraction = {
  kind: 'draw'
  pointerId: number
  id: string
  points: Point[]
  style: ItemStyle
}

type CreateShapeInteraction = {
  kind: 'createShape'
  pointerId: number
  type: ShapeTool
  startWorld: Point
  currentWorld: Point
}

type Interaction =
  | {
      kind: 'pan'
      pointerId: number
      startX: number
      startY: number
      originX: number
      originY: number
    }
  | {
      kind: 'drag'
      pointerId: number
      ids: string[]
      startWorld: Point
      origins: ItemOrigin[]
    }
  | {
      kind: 'resize'
      pointerId: number
      id: string
      startWorld: Point
      originW: number
      originH: number
    }
  | {
      kind: 'selectArea'
      pointerId: number
      startWorld: Point
      currentWorld: Point
      additive: boolean
      previousIds: string[]
    }
  | DrawInteraction
  | CreateShapeInteraction
  | {
      kind: 'erase'
      pointerId: number
      lastWorld: Point
    }

const STORAGE_KEY_V1 = 'pencil-free-note:v1'
const STORAGE_KEY_V2 = 'pencil-free-note:v2'

const TOOLS: { id: Tool; label: string; shortcut: string }[] = [
  { id: 'selection', label: 'Selection', shortcut: 'V' },
  { id: 'pan', label: 'Pan', shortcut: 'H' },
  { id: 'pencil', label: 'Pencil', shortcut: 'P' },
  { id: 'line', label: 'Line', shortcut: 'I' },
  { id: 'arrow', label: 'Arrow', shortcut: 'A' },
  { id: 'eraser', label: 'Eraser', shortcut: 'E' },
  { id: 'text', label: 'Text', shortcut: 'T' },
  { id: 'webEmbed', label: 'Web', shortcut: 'W' },
  { id: 'rect', label: 'Rect', shortcut: 'R' },
  { id: 'slide', label: 'Slide', shortcut: 'L' },
  { id: 'ellipse', label: 'Circle', shortcut: 'O' },
  { id: 'diamond', label: 'Diamond', shortcut: 'D' },
]

const STROKE_OPTIONS = [
  { value: '#1f1f1f', label: 'Ink' },
  { value: '#594734', label: 'Sepia' },
  { value: '#4e6c88', label: 'Blue' },
] as const

const FILL_OPTIONS = [
  { value: 'transparent', label: 'Clear' },
  { value: '#fff8e8', label: 'Paper' },
  { value: '#ffe3df', label: 'Blush' },
] as const

const STROKE_WIDTH_OPTIONS: { value: StrokeWidth; label: string }[] = [
  { value: 'thin', label: 'Thin' },
  { value: 'medium', label: 'Med' },
  { value: 'bold', label: 'Bold' },
]

const STROKE_STYLE_OPTIONS: { value: StrokeStyle; label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dash' },
  { value: 'dotted', label: 'Dot' },
]

const FONT_FAMILY_OPTIONS: { value: FontFamily; label: string }[] = [
  { value: 'hand', label: 'Hand' },
  { value: 'sans', label: 'Sans' },
  { value: 'mono', label: 'Mono' },
]

const FONT_SIZE_OPTIONS: { value: FontSize; label: string }[] = [
  { value: 'sm', label: 'S' },
  { value: 'md', label: 'M' },
  { value: 'lg', label: 'L' },
]

const TEXT_ALIGN_OPTIONS: { value: TextAlign; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
]

const createId = () => `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
const unique = (values: string[]) => [...new Set(values)]
const HISTORY_LIMIT = 100

const isShapeTool = (value: Tool): value is ShapeTool =>
  ['rect', 'ellipse', 'diamond', 'slide', 'webEmbed', 'line', 'arrow'].includes(value)

const strokeWidthPx = (value: StrokeWidth) =>
  ({
    thin: 1.5,
    medium: 2.75,
    bold: 4.5,
  })[value]

const fontSizePx = (value: FontSize) =>
  ({
    sm: 18,
    md: 22,
    lg: 28,
  })[value]

const fontFamilyValue = (value: FontFamily) =>
  ({
    hand: 'var(--hand)',
    sans: "Inter, 'Helvetica Neue', Arial, sans-serif",
    mono: 'var(--mono)',
  })[value]

const strokeDasharray = (value: StrokeStyle) =>
  ({
    solid: 'none',
    dashed: '10 8',
    dotted: '2 8',
  })[value]

const LIGHT_INK_STROKE = '#1f1f1f'
const THEME_INK_STROKE = 'var(--ink-stroke)'
const THEME_SLIDE_FILL = 'var(--slide-fill)'
const THEME_SLIDE_STROKE = 'var(--slide-stroke)'

const resolveThemeAwareStroke = (stroke: string) => (stroke === LIGHT_INK_STROKE ? THEME_INK_STROKE : stroke)
const resolveItemFill = (item: CanvasItem) => (item.type === 'slide' && item.color === DEFAULT_SLIDE_FILL ? THEME_SLIDE_FILL : item.color)
const resolveItemStroke = (item: CanvasItem) =>
  item.type === 'slide' && item.stroke === DEFAULT_SLIDE_STROKE ? THEME_SLIDE_STROKE : resolveThemeAwareStroke(item.stroke)
const isLinearTool = (value: ShapeTool): value is LineCanvasItem['type'] | ArrowCanvasItem['type'] =>
  value === 'line' || value === 'arrow'
const MIN_LINEAR_PREVIEW_LENGTH = 1
const MIN_LINEAR_ITEM_LENGTH = 4

const verticalPadding = (element: HTMLElement) => {
  const style = getComputedStyle(element)
  return Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)
}

const isAutoHeightItem = (item: CanvasItem) => item.type === 'text' || item.type === 'note'

const renderedEditorHeight = (container: HTMLDivElement) => {
  const surface = container.querySelector<HTMLElement>('.item-editor-surface')
  if (!surface) return container.scrollHeight

  const children = [...surface.children].filter((child): child is HTMLElement => child instanceof HTMLElement)
  if (!children.length) return surface.scrollHeight

  return Math.max(...children.map((child) => child.offsetTop + child.offsetHeight))
}

const normalizeBox = (start: Point, end: Point): SelectionBox => ({
  x: Math.min(start.x, end.x),
  y: Math.min(start.y, end.y),
  w: Math.abs(start.x - end.x),
  h: Math.abs(start.y - end.y),
})

const itemBox = (item: CanvasItem): SelectionBox => ({
  x: item.x,
  y: item.y,
  w: item.w,
  h: item.h,
})

const boxesIntersect = (a: SelectionBox, b: SelectionBox) =>
  a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y

const boxContainsPoint = (box: SelectionBox, point: Point) =>
  point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

const orientation = (a: Point, b: Point, c: Point) => (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y)

const onSegment = (a: Point, b: Point, c: Point) =>
  Math.min(a.x, c.x) <= b.x &&
  b.x <= Math.max(a.x, c.x) &&
  Math.min(a.y, c.y) <= b.y &&
  b.y <= Math.max(a.y, c.y)

const segmentsIntersect = (a1: Point, a2: Point, b1: Point, b2: Point) => {
  const o1 = orientation(a1, a2, b1)
  const o2 = orientation(a1, a2, b2)
  const o3 = orientation(b1, b2, a1)
  const o4 = orientation(b1, b2, a2)

  if (o1 === 0 && onSegment(a1, b1, a2)) return true
  if (o2 === 0 && onSegment(a1, b2, a2)) return true
  if (o3 === 0 && onSegment(b1, a1, b2)) return true
  if (o4 === 0 && onSegment(b1, a2, b2)) return true

  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0)
}

const segmentHitsBox = (start: Point, end: Point, box: SelectionBox, padding: number) => {
  const expanded = {
    x: box.x - padding,
    y: box.y - padding,
    w: box.w + padding * 2,
    h: box.h + padding * 2,
  }

  if (boxContainsPoint(expanded, start) || boxContainsPoint(expanded, end)) return true

  const topLeft = { x: expanded.x, y: expanded.y }
  const topRight = { x: expanded.x + expanded.w, y: expanded.y }
  const bottomLeft = { x: expanded.x, y: expanded.y + expanded.h }
  const bottomRight = { x: expanded.x + expanded.w, y: expanded.y + expanded.h }

  return (
    segmentsIntersect(start, end, topLeft, topRight) ||
    segmentsIntersect(start, end, topRight, bottomRight) ||
    segmentsIntersect(start, end, bottomRight, bottomLeft) ||
    segmentsIntersect(start, end, bottomLeft, topLeft)
  )
}

const createStrokeItemFromPoints = (
  id: string,
  type: StrokeItemType,
  points: Point[],
  style: ItemStyle,
): StrokeCanvasItem => {
  const safePoints = points.length ? points : [{ x: 0, y: 0 }]
  const minX = Math.min(...safePoints.map((point) => point.x))
  const minY = Math.min(...safePoints.map((point) => point.y))
  const maxX = Math.max(...safePoints.map((point) => point.x))
  const maxY = Math.max(...safePoints.map((point) => point.y))
  const padding = strokeWidthPx(style.strokeWidth) * 1.5 + 6
  const width = Math.max(maxX - minX + padding * 2, padding * 2 + 1)
  const height = Math.max(maxY - minY + padding * 2, padding * 2 + 1)

  return {
    id,
    type,
    x: minX - padding,
    y: minY - padding,
    w: width,
    h: height,
    points: safePoints.map((point) => ({
      x: point.x - (minX - padding),
      y: point.y - (minY - padding),
    })),
    ...style,
  }
}

const createPathItemFromPoints = (id: string, points: Point[], style: ItemStyle): PathCanvasItem =>
  createStrokeItemFromPoints(id, 'path', points, style) as PathCanvasItem

const createLinearItemFromEndpoints = (
  id: string,
  type: LineCanvasItem['type'] | ArrowCanvasItem['type'],
  start: Point,
  end: Point,
  style: ItemStyle,
): StrokeCanvasItem => createStrokeItemFromPoints(id, type, [start, end], style)

const shapeBoxFromDrag = (type: ShapeTool, start: Point, end: Point): SelectionBox => {
  if (type !== 'ellipse') return normalizeBox(start, end)

  const dx = end.x - start.x
  const dy = end.y - start.y
  const size = Math.max(Math.abs(dx), Math.abs(dy))

  return {
    x: dx >= 0 ? start.x : start.x - size,
    y: dy >= 0 ? start.y : start.y - size,
    w: size,
    h: size,
  }
}

const isShapeBoxVisible = (box: SelectionBox) => box.w >= 12 && box.h >= 12

const defaultView = (): Viewport => ({
  x: typeof window === 'undefined' ? 180 : Math.max(80, window.innerWidth * 0.22),
  y: 120,
  zoom: 1,
})

const defaultItems = (): CanvasItem[] => []

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Image paste returned an unreadable payload'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read pasted image'))
    reader.readAsDataURL(file)
  })

const measureImage = (src: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height })
    image.onerror = () => reject(new Error('Failed to decode pasted image'))
    image.src = src
  })

const fitImageWithinFrame = (width: number, height: number) => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { w: 320, h: 240 }
  }

  const scale = Math.min(1, 560 / width, 420 / height)
  return {
    w: Math.max(80, Math.round(width * scale)),
    h: Math.max(80, Math.round(height * scale)),
  }
}

const loadNotebook = (): SavedNotebook => {
  if (typeof localStorage === 'undefined') return { items: defaultItems(), view: defaultView() }

  try {
    const raw = localStorage.getItem(STORAGE_KEY_V2) ?? localStorage.getItem(STORAGE_KEY_V1)
    if (!raw) return { items: defaultItems(), view: defaultView() }

    const parsed = normalizeStoredNotebook(JSON.parse(raw))
    if (parsed) return parsed
  } catch {
    return { items: defaultItems(), view: defaultView() }
  }

  return { items: defaultItems(), view: defaultView() }
}

const isEditableTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.tagName === 'INPUT' || target.isContentEditable)

const isFillableItem = (item: CanvasItem) =>
  !isStrokeCanvasItem(item) && !isImageItem(item) && !isWebEmbedItem(item)

const typeLabel = (type: ItemType) =>
  ({
    text: 'Text frame',
    note: 'Sticky note',
    rect: 'Rectangle',
    ellipse: 'Circle',
    diamond: 'Diamond',
    slide: 'Slide frame',
    webEmbed: 'Web embed',
    line: 'Line',
    arrow: 'Arrow',
    path: 'Stroke',
    image: 'Image',
  })[type]

const ToolIcon = (props: { tool: Tool }) => {
  if (props.tool === 'selection') {
    return (
      <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 3.5 18.5 12l-6.2 1.1 3.1 6.4-3.1 1.5-3-6.3-4.3 4.6Z" />
      </svg>
    )
  }

  if (props.tool === 'pan') {
    return (
      <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8.2 11.4V5.8a1.4 1.4 0 0 1 2.8 0v5.1" />
        <path d="M11 10.8V4.6a1.4 1.4 0 0 1 2.8 0v6" />
        <path d="M13.8 10.7V6.2a1.4 1.4 0 0 1 2.8 0v5.3" />
        <path d="M16.6 11.6V8.9a1.4 1.4 0 0 1 2.8 0v5.3c0 4-2.4 6.5-6.5 6.5h-1.3c-2.2 0-3.6-.8-5-2.5l-2.4-2.9a1.5 1.5 0 0 1 2.2-2l1.8 1.8" />
      </svg>
    )
  }

  if (props.tool === 'pencil') {
    return (
      <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m5 19 1.2-4.6L15 5.6l3.4 3.4-8.9 8.8Z" />
        <path d="m13.8 6.8 3.4 3.4" />
      </svg>
    )
  }

  if (props.tool === 'line') {
    return (
      <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 18 19 6" />
      </svg>
    )
  }

  if (props.tool === 'arrow') {
    return (
      <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 18 19 6" />
        <path d="m13.8 6 5.2 0v5.2" />
      </svg>
    )
  }

  if (props.tool === 'eraser') {
    return (
      <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m7.4 14.7 6.8-6.8a2.4 2.4 0 0 1 3.4 0l1.5 1.5a2.4 2.4 0 0 1 0 3.4l-4.2 4.2H9.7a3 3 0 0 1-2.3-.9 1.7 1.7 0 0 1 0-1.4Z" />
        <path d="M4 18h15" />
      </svg>
    )
  }

  if (props.tool === 'ellipse') {
    return (
      <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true">
        <ellipse cx="12" cy="12" rx="7.5" ry="5.8" />
      </svg>
    )
  }

  if (props.tool === 'diamond') {
    return (
      <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 4.2 7.8 7.8-7.8 7.8L4.2 12Z" />
      </svg>
    )
  }

  if (props.tool === 'rect') {
    return (
      <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="6" width="14" height="12" rx="1.5" />
      </svg>
    )
  }

  if (props.tool === 'slide') {
    return (
      <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="5" width="16" height="11" rx="1.8" />
        <path d="M9 19h6" />
        <path d="M12 16v3" />
      </svg>
    )
  }

  if (props.tool === 'webEmbed') {
    return (
      <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="5" width="16" height="12" rx="2" />
        <path d="M8.2 11.1h.01" />
        <path d="M11.9 11.1h3.9" />
        <path d="M8 19h8" />
      </svg>
    )
  }

  return (
    <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 18h12" />
      <path d="M9 6h6" />
      <path d="M12 6v12" />
    </svg>
  )
}

const arrowHeadPoints = (points: Point[], size: number) => {
  const tip = points[points.length - 1]
  const tail = points[points.length - 2] ?? { x: tip.x - 1, y: tip.y }
  const dx = tip.x - tail.x
  const dy = tip.y - tail.y
  const length = Math.max(Math.hypot(dx, dy), 0.001)
  const unit = { x: dx / length, y: dy / length }
  const normal = { x: -unit.y, y: unit.x }
  const base = {
    x: tip.x - unit.x * size,
    y: tip.y - unit.y * size,
  }
  const spread = size * 0.56
  const left = {
    x: base.x + normal.x * spread,
    y: base.y + normal.y * spread,
  }
  const right = {
    x: base.x - normal.x * spread,
    y: base.y - normal.y * spread,
  }
  return `${left.x},${left.y} ${tip.x},${tip.y} ${right.x},${right.y}`
}

const StrokeItem = (props: { item: StrokeCanvasItem }) => {
  const isDot = createMemo(() => {
    if (props.item.type !== 'path') return false
    const first = props.item.points[0]
    return props.item.points.every((point) => distance(point, first) < 0.4)
  })

  const points = createMemo(() => props.item.points.map((point) => `${point.x},${point.y}`).join(' '))
  const center = createMemo(() => props.item.points[0])
  const stroke = createMemo(() => resolveThemeAwareStroke(props.item.stroke))
  const arrowHead = createMemo(() =>
    props.item.type === 'arrow' ? arrowHeadPoints(props.item.points, Math.max(strokeWidthPx(props.item.strokeWidth) * 4.2, 12)) : '',
  )

  return (
    <svg
      class="path-item"
      width={props.item.w}
      height={props.item.h}
      viewBox={`0 0 ${props.item.w} ${props.item.h}`}
      aria-hidden="true"
    >
      <Show
        when={!isDot()}
        fallback={
          <circle
            cx={center().x}
            cy={center().y}
            r={Math.max(strokeWidthPx(props.item.strokeWidth) * 0.75, 1.5)}
            fill={stroke()}
          />
        }
      >
        <polyline points={points()} />
        <Show when={props.item.type === 'arrow'}>
          <polygon points={arrowHead()} fill={stroke()} stroke="none" />
        </Show>
      </Show>
    </svg>
  )
}

function App() {
  const saved = loadNotebook()
  const [items, setItems] = createSignal<CanvasItem[]>(saved.items)
  const [view, setView] = createSignal<Viewport>(saved.view)
  const [themeMode, setThemeMode] = createSignal<ThemeMode>(loadThemeMode())
  const [systemTheme, setSystemTheme] = createSignal<ResolvedTheme>(getSystemTheme())
  const [tool, setTool] = createSignal<Tool>('selection')
  const [selectedIds, setSelectedIds] = createSignal<string[]>([])
  const [editingId, setEditingId] = createSignal<string | null>(null)
  const [interaction, setInteraction] = createSignal<Interaction | null>(null)
  const [erasePreviewIds, setErasePreviewIds] = createSignal<string[]>([])
  const [saveState, setSaveState] = createSignal('autosaved locally')
  const [appMenuOpen, setAppMenuOpen] = createSignal(false)
  const [templateModalOpen, setTemplateModalOpen] = createSignal(false)
  const [exportModalOpen, setExportModalOpen] = createSignal(false)
  const [slideshowIndex, setSlideshowIndex] = createSignal<number | null>(null)
  const [slideshowRestoreView, setSlideshowRestoreView] = createSignal<Viewport | null>(null)
  const [laserPointerEnabled, setLaserPointerEnabled] = createSignal(false)
  const [laserPointer, setLaserPointer] = createSignal<{ x: number; y: number } | null>(null)
  const [exportOnlySelected, setExportOnlySelected] = createSignal(false)
  const [exportIncludeBackground, setExportIncludeBackground] = createSignal(true)
  const [exportDarkMode, setExportDarkMode] = createSignal(false)
  const [exportEmbedData, setExportEmbedData] = createSignal(false)
  const [exportBusy, setExportBusy] = createSignal<'png' | 'svg' | 'clipboard' | null>(null)
  const [exportError, setExportError] = createSignal<string | null>(null)
  const [exportPreviewUrl, setExportPreviewUrl] = createSignal<string | null>(null)
  const [exportPreviewPending, setExportPreviewPending] = createSignal(false)
  const [currentNoteFileHandle, setCurrentNoteFileHandle] = createSignal<NoteFileHandle | null>(null)
  const [currentNoteFileName, setCurrentNoteFileName] = createSignal<string | null>(null)
  const [undoStack, setUndoStack] = createSignal<HistorySnapshot[]>([])
  const [redoStack, setRedoStack] = createSignal<HistorySnapshot[]>([])
  let appMenuRef!: HTMLDivElement
  let stageRef!: HTMLDivElement
  let imagePickerRef!: HTMLInputElement
  let notePickerRef!: HTMLInputElement
  let exportPreviewObjectUrl: string | undefined
  let exportPreviewFingerprint: string | undefined
  let exportPreviewRequestId = 0
  let exportPreviewTimer: number | undefined
  let exportRenderCaptureRef: HTMLDivElement | undefined
  let exportRenderSurfaceRef: HTMLDivElement | undefined
  let exportRenderSurfaceHtml = ''
  let exportRenderSurfaceWidth = 0
  let exportRenderSurfaceHeight = 0
  let exportRenderQueue = Promise.resolve()
  let documentFontsReadyPromise: Promise<void> | null = null
  let inMemoryClipboard: CanvasItem[] | null = null
  let clipboardPasteCount = 0
  let pendingHistorySnapshot: HistorySnapshot | null = null
  const itemContentRefs = new Map<string, HTMLDivElement>()

  const queueExportRender = async <T,>(job: () => Promise<T>) => {
    const previous = exportRenderQueue
    let release: (() => void) | undefined
    exportRenderQueue = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      return await job()
    } finally {
      release?.()
    }
  }

  const ensureExportRenderSurface = () => {
    if (exportRenderCaptureRef && exportRenderSurfaceRef && exportRenderCaptureRef.isConnected) {
      return exportRenderSurfaceRef
    }

    const captureRoot = document.createElement('div')
    captureRoot.className = 'export-render-capture'
    captureRoot.setAttribute('aria-hidden', 'true')

    const surface = document.createElement('div')
    surface.className = 'export-render-surface'
    captureRoot.append(surface)
    document.body.append(captureRoot)

    exportRenderCaptureRef = captureRoot
    exportRenderSurfaceRef = surface
    exportRenderSurfaceHtml = ''
    exportRenderSurfaceWidth = 0
    exportRenderSurfaceHeight = 0

    return surface
  }

  const updateExportRenderSurface = (scene: NonNullable<ReturnType<typeof buildSceneForExport>>) => {
    const surface = ensureExportRenderSurface()

    if (exportRenderSurfaceWidth !== scene.width) {
      surface.style.width = `${scene.width}px`
      exportRenderSurfaceWidth = scene.width
    }
    if (exportRenderSurfaceHeight !== scene.height) {
      surface.style.height = `${scene.height}px`
      exportRenderSurfaceHeight = scene.height
    }
    if (exportRenderSurfaceHtml !== scene.html) {
      surface.innerHTML = scene.html
      exportRenderSurfaceHtml = scene.html
    }

    return surface
  }

  const waitForExportRenderImages = async (surface: HTMLDivElement) => {
    const images = [...surface.querySelectorAll('img')]
    await Promise.all(
      images.map(async (image) => {
        if (typeof image.decode === 'function') {
          try {
            await image.decode()
            return
          } catch {
            // Fall back to load/error events when decode is unavailable for the current image state.
          }
        }
        if (image.complete) return

        await new Promise<void>((resolve) => {
          const finish = () => resolve()
          image.addEventListener('load', finish, { once: true })
          image.addEventListener('error', finish, { once: true })
        })
      }),
    )
  }

  const waitForExportRenderSurface = async (surface: HTMLDivElement) => {
    await Promise.resolve()
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    if ('fonts' in document) {
      documentFontsReadyPromise ??= document.fonts.ready.then(() => undefined, () => undefined)
      await documentFontsReadyPromise
    }
    await waitForExportRenderImages(surface)
  }

  const viewportCenterWorld = (): Point => ({
    x: (stageRef.clientWidth / 2 - view().x) / view().zoom,
    y: (stageRef.clientHeight / 2 - view().y) / view().zoom,
  })

  const selectedItems = createMemo(() => {
    const ids = new Set(selectedIds())
    return items().filter((item) => ids.has(item.id))
  })
  const itemLookup = createMemo(() => new Map(items().map((item) => [item.id, item] as const)))
  const renderedItems = createMemo(() => sortCanvasItemsForRender(items()))
  const itemIds = createMemo(() => renderedItems().map((item) => item.id))
  const presentationSlides = createMemo(() => collectPresentationSlides(items()))
  const presentationSlideIndexLookup = createMemo(
    () => new Map(presentationSlides().map((item, index) => [item.id, index] as const)),
  )
  const slideOrderLookup = createMemo(() => new Map(presentationSlides().map((item, index) => [item.id, index + 1] as const)))
  const slideshowActive = createMemo(() => slideshowIndex() !== null && presentationSlides().length > 0)
  const currentSlide = createMemo<SlideCanvasItem | null>(() => {
    const index = slideshowIndex()
    const slides = presentationSlides()
    if (index === null || !slides.length) return null
    return slides[Math.min(Math.max(index, 0), slides.length - 1)] ?? null
  })
  const slideshowVisibleIds = createMemo(() => {
    const slide = currentSlide()
    if (!slideshowActive() || !slide) return null
    const slideBounds = itemBox(slide)
    return new Set(
      items()
        .filter((item) => item.id === slide.id || (!isSlideItem(item) && boxesIntersect(itemBox(item), slideBounds)))
        .map((item) => item.id),
    )
  })
  const slideshowFocusRect = createMemo(() => {
    const slide = currentSlide()
    if (!slideshowActive() || !slide) return null
    const current = view()
    return {
      x: slide.x * current.zoom + current.x,
      y: slide.y * current.zoom + current.y,
      w: slide.w * current.zoom,
      h: slide.h * current.zoom,
    }
  })
  const selectedItem = createMemo(() => (selectedItems().length === 1 ? selectedItems()[0] : undefined))
  const selectedCount = createMemo(() => selectedItems().length)
  const selectedFillItems = createMemo(() => selectedItems().filter(isFillableItem))
  const selectedWebEmbedItem = createMemo<WebEmbedCanvasItem | null>(() => {
    const current = selectedItem()
    return current && isWebEmbedItem(current) ? current : null
  })
  const zoomLabel = createMemo(() => `${Math.round(view().zoom * 100)}%`)
  const marquee = createMemo(() => {
    const active = interaction()
    return active?.kind === 'selectArea' ? normalizeBox(active.startWorld, active.currentWorld) : null
  })
  const selectedBounds = createMemo(() => {
    const selection = selectedItems()
    if (selection.length < 2) return null

    const minX = Math.min(...selection.map((item) => item.x))
    const minY = Math.min(...selection.map((item) => item.y))
    const maxX = Math.max(...selection.map((item) => item.x + item.w))
    const maxY = Math.max(...selection.map((item) => item.y + item.h))

    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
  })
  const selectedTextItems = createMemo(() => selectedItems().filter(isTextCanvasItem))
  const selectedStrokeItems = createMemo(() => selectedItems().filter(isStrokeCanvasItem))
  const erasePreviewIdSet = createMemo(() => new Set(erasePreviewIds()))
  const resolvedTheme = createMemo<ResolvedTheme>(() => resolveTheme(themeMode(), systemTheme()))
  const canSaveToCurrentFile = createMemo(() => currentNoteFileHandle() !== null)
  const canExportSelection = createMemo(() => selectedCount() > 0)
  const canStartSlideshow = createMemo(() => presentationSlides().length > 0)
  const canUndo = createMemo(() => undoStack().length > 0)
  const canRedo = createMemo(() => redoStack().length > 0)
  const exportTargetItems = createMemo(() =>
    exportOnlySelected() && canExportSelection() ? selectedItems() : items(),
  )
  const exportScene = createMemo(() =>
    exportModalOpen()
      ? buildExportSvg({
          items: exportTargetItems(),
          onlySelected: exportOnlySelected() && canExportSelection(),
          includeBackground: exportIncludeBackground(),
          darkMode: exportDarkMode(),
        })
      : null,
  )
  const draftShape = createMemo(() => {
    const active = interaction()
    if (active?.kind !== 'createShape') return null
    return createDraftShapeItem(active.type, active.startWorld, active.currentWorld)
  })
  const canEditText = createMemo(() => selectedTextItems().length === selectedItems().length && selectedItems().length > 0)
  const canChangeFill = createMemo(() => selectedFillItems().length > 0)
  const canResize = createMemo(() => selectedItem() && !isStrokeCanvasItem(selectedItem()!))
  const inspectorStroke = createMemo(() => selectedItems()[0]?.stroke ?? '#1f1f1f')
  const inspectorFill = createMemo(() => selectedFillItems()[0]?.color ?? 'transparent')
  const inspectorStrokeWidth = createMemo<StrokeWidth>(() => selectedItems()[0]?.strokeWidth ?? 'medium')
  const inspectorStrokeStyle = createMemo<StrokeStyle>(() => selectedItems()[0]?.strokeStyle ?? 'solid')
  const inspectorFontFamily = createMemo<FontFamily>(() => selectedTextItems()[0]?.fontFamily ?? 'hand')
  const inspectorFontSize = createMemo<FontSize>(() => selectedTextItems()[0]?.fontSize ?? 'md')
  const inspectorTextAlign = createMemo<TextAlign>(() => selectedTextItems()[0]?.textAlign ?? 'left')
  const stageClass = createMemo(() =>
    [
      'canvas-stage',
      `tool-${tool()}`,
      tool() === 'pan' ? 'tool-pan' : '',
      tool() === 'pencil' ? 'tool-pencil' : '',
      tool() === 'eraser' ? 'tool-eraser' : '',
      slideshowActive() ? 'is-slideshow' : '',
      laserPointerEnabled() ? 'laser-enabled' : '',
      interaction()?.kind === 'pan' ? 'is-panning' : '',
      interaction()?.kind === 'selectArea' ? 'is-selecting' : '',
    ]
      .filter(Boolean)
      .join(' '),
  )

  createEffect(() => {
    if (!persistLocalSnapshot()) return
    setSaveState('autosaved locally')
  })

  createEffect(() => {
    const ids = new Set(items().map((item) => item.id))
    const filteredIds = selectedIds().filter((id) => ids.has(id))
    if (filteredIds.length !== selectedIds().length) setSelectedIds(filteredIds)
  })

  createEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, themeMode())
    } catch {
      // Ignore theme persistence failures and continue with in-memory state.
    }
  })

  createEffect(() => {
    applyTheme(themeMode(), systemTheme())
  })

  createEffect(() => {
    if (tool() !== 'eraser') setErasePreviewIds([])
  })

  createEffect(() => {
    const requestId = ++exportPreviewRequestId

    if (!exportModalOpen()) {
      setExportPreviewPending(false)
      setExportPreviewUrl(null)
      return
    }

    const scene = exportScene()
    if (!scene) {
      setExportPreviewPending(false)
      setExportPreviewUrl(null)
      return
    }

    const fingerprint = createPreviewRenderFingerprint(scene)
    if (exportPreviewFingerprint === fingerprint && exportPreviewObjectUrl) {
      setExportPreviewPending(false)
      setExportPreviewUrl(exportPreviewObjectUrl)
      return
    }

    setExportPreviewPending(true)
    const timer = window.setTimeout(() => {
      exportPreviewTimer = undefined
      void renderSceneToPngBlob(scene, null, 'preview')
        .then((blob) => {
          if (requestId !== exportPreviewRequestId || !exportModalOpen()) return
          const url = URL.createObjectURL(blob)
          if (exportPreviewObjectUrl) URL.revokeObjectURL(exportPreviewObjectUrl)
          exportPreviewObjectUrl = url
          exportPreviewFingerprint = fingerprint
          setExportPreviewUrl(url)
        })
        .catch((error) => {
          if (requestId !== exportPreviewRequestId) return
          console.error(error)
          setExportPreviewUrl(null)
        })
        .finally(() => {
          if (requestId !== exportPreviewRequestId) return
          setExportPreviewPending(false)
        })
    }, EXPORT_PREVIEW_DEBOUNCE_MS)
    exportPreviewTimer = timer

    onCleanup(() => {
      window.clearTimeout(timer)
      if (exportPreviewTimer === timer) exportPreviewTimer = undefined
    })
  })

  createEffect(() => {
    if (canExportSelection()) return
    if (exportOnlySelected()) setExportOnlySelected(false)
  })

  createEffect(() => {
    const slides = presentationSlides()
    const index = slideshowIndex()
    if (index === null) return
    if (!slides.length) {
      stopSlideshow()
      return
    }

    const clampedIndex = Math.min(Math.max(index, 0), slides.length - 1)
    if (clampedIndex !== index) {
      setSlideshowIndex(clampedIndex)
      return
    }

    syncSlideshowView(slides[clampedIndex] ?? null)
  })

  createEffect(() => {
    if (slideshowActive()) return
    if (laserPointer()) setLaserPointer(null)
    if (laserPointerEnabled()) setLaserPointerEnabled(false)
  })

  const cloneCanvasItem = (item: CanvasItem): CanvasItem => JSON.parse(JSON.stringify(item)) as CanvasItem
  const cloneCanvasItems = (sourceItems: CanvasItem[]) => sourceItems.map(cloneCanvasItem)
  const historyItemsSignature = (sourceItems: CanvasItem[]) => JSON.stringify(sourceItems)
  const takeHistorySnapshot = (): HistorySnapshot => ({
    items: cloneCanvasItems(items()),
    selectedIds: [...selectedIds()],
  })

  const pushUndoSnapshot = (snapshot: HistorySnapshot) => {
    setUndoStack((current) => [...current.slice(Math.max(0, current.length - HISTORY_LIMIT + 1)), snapshot])
    setRedoStack([])
  }

  const beginHistoryAction = () => {
    pendingHistorySnapshot ??= takeHistorySnapshot()
  }

  const commitHistoryAction = () => {
    const snapshot = pendingHistorySnapshot
    pendingHistorySnapshot = null
    if (!snapshot || historyItemsSignature(snapshot.items) === historyItemsSignature(items())) return
    pushUndoSnapshot(snapshot)
  }

  const applyHistoryMutation = (mutation: () => void) => {
    const ownsHistoryAction = pendingHistorySnapshot === null
    if (ownsHistoryAction) beginHistoryAction()
    mutation()
    if (ownsHistoryAction) commitHistoryAction()
  }

  const clearHistory = () => {
    pendingHistorySnapshot = null
    setUndoStack([])
    setRedoStack([])
  }

  const restoreHistorySnapshot = (snapshot: HistorySnapshot) => {
    const nextItems = cloneCanvasItems(snapshot.items)
    const itemIds = new Set(nextItems.map((item) => item.id))
    setItems(nextItems)
    setSelectedIds(snapshot.selectedIds.filter((id) => itemIds.has(id)))
    setEditingId(null)
    setInteraction(null)
    setErasePreviewIds([])
  }

  const undoHistory = () => {
    if (editingId()) setEditingId(null)
    if (pendingHistorySnapshot) commitHistoryAction()

    const past = undoStack()
    const target = past[past.length - 1]
    if (!target) return

    setUndoStack(past.slice(0, -1))
    setRedoStack((current) => [...current, takeHistorySnapshot()])
    restoreHistorySnapshot(target)
  }

  const redoHistory = () => {
    if (editingId()) setEditingId(null)
    if (pendingHistorySnapshot) commitHistoryAction()

    const future = redoStack()
    const target = future[future.length - 1]
    if (!target) return

    setRedoStack(future.slice(0, -1))
    setUndoStack((current) => [...current.slice(Math.max(0, current.length - HISTORY_LIMIT + 1)), takeHistorySnapshot()])
    restoreHistorySnapshot(target)
  }

  const startTextEdit = (id: string) => {
    if (editingId() === id) return
    if (editingId()) commitHistoryAction()
    beginHistoryAction()
    setEditingId(id)
  }

  const finishTextEdit = () => {
    const hadEditing = editingId() !== null
    setEditingId(null)
    if (hadEditing) commitHistoryAction()
  }

  const updateItem = (id: string, patch: Partial<CanvasItem>) => {
    setItems((current) =>
      current.map((item): CanvasItem => (item.id === id ? ({ ...item, ...patch } as CanvasItem) : item)),
    )
  }

  const updateSelectedItemsWhere = (predicate: (item: CanvasItem) => boolean, patch: Partial<CanvasItem>) => {
    const ids = new Set(selectedIds())
    applyHistoryMutation(() =>
      setItems((current) =>
        current.map((item): CanvasItem =>
          ids.has(item.id) && predicate(item) ? ({ ...item, ...patch } as CanvasItem) : item,
        ),
      ),
    )
  }

  const updateSelectedItems = (patch: Partial<CanvasItem>) => updateSelectedItemsWhere(() => true, patch)

  const placeImportedItems = (sourceItems: CanvasItem[], index: number) => {
    const center = viewportCenterWorld()
    const bounds = getItemBounds(sourceItems)
    const offsetX = center.x - (bounds.x + bounds.w / 2) + index * 24
    const offsetY = center.y - (bounds.y + bounds.h / 2) + index * 24

    return sourceItems.map((item) => {
      const cloned = cloneCanvasItem(item)
      cloned.id = createId()
      cloned.x = Math.round((cloned.x + offsetX) * 1000) / 1000
      cloned.y = Math.round((cloned.y + offsetY) * 1000) / 1000
      return cloned
    })
  }

  const duplicateClipboardItems = (sourceItems: CanvasItem[], offset: number) =>
    sourceItems.map((item) => {
      const cloned = cloneCanvasItem(item)
      cloned.id = createId()
      cloned.x = Math.round((cloned.x + offset) * 1000) / 1000
      cloned.y = Math.round((cloned.y + offset) * 1000) / 1000
      return cloned
    })

  const growItemHeight = (id: string, height: number) => {
    setItems((current) =>
      current.map((item): CanvasItem => {
        if (item.id !== id || isPathItem(item) || !isAutoHeightItem(item) || height <= item.h + 2) return item
        return { ...item, h: Math.ceil(height) }
      }),
    )
  }

  const fitItemHeight = (id: string) => {
    const item = items().find((entry) => entry.id === id)
    if (!item || isPathItem(item) || !isAutoHeightItem(item)) return

    const content = itemContentRefs.get(id)
    if (content) growItemHeight(id, renderedEditorHeight(content) + verticalPadding(content) + 8)
  }

  const scheduleFitItemHeight = (id: string) => {
    requestAnimationFrame(() => fitItemHeight(id))
  }

  const collectEraseHits = (from: Point, to: Point) => {
    const radius = 14 / view().zoom

    return items()
      .filter((item) => segmentHitsBox(from, to, itemBox(item), radius))
      .map((item) => item.id)
  }

  const commitErasePreview = () => {
    const ids = erasePreviewIds()
    if (!ids.length) return

    const eraseSet = new Set(ids)
    applyHistoryMutation(() => {
      setItems((current) => current.filter((item) => !eraseSet.has(item.id)))
      setErasePreviewIds([])
      setSelectedIds((current) => current.filter((id) => !eraseSet.has(id)))
    })
  }

  const selectItemsInBox = (box: SelectionBox, previousIds: string[]) => {
    const hitIds = items()
      .filter((item) => boxesIntersect(box, itemBox(item)))
      .map((item) => item.id)

    setSelectedIds(unique([...previousIds, ...hitIds]))
  }

  const startPan = (event: PointerEvent) => {
    setInteraction({
      kind: 'pan',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: view().x,
      originY: view().y,
    })
  }

  const startSelectedItemsDrag = (event: PointerEvent, ids: string[], startWorld: Point) => {
    const dragIds = unique(ids)
    const dragSet = new Set(dragIds)

    beginHistoryAction()
    setInteraction({
      kind: 'drag',
      pointerId: event.pointerId,
      ids: dragIds,
      startWorld,
      origins: items()
        .filter((entry) => dragSet.has(entry.id))
        .map((entry) => ({ id: entry.id, x: entry.x, y: entry.y })),
    })
  }

  const persistLocalSnapshot = () => {
    if (typeof localStorage === 'undefined') return false

    try {
      localStorage.setItem(STORAGE_KEY_V2, JSON.stringify({ items: items(), view: view() }))
      return true
    } catch {
      setSaveState('storage unavailable')
      return false
    }
  }

  const createImageItemFromFile = async (file: File, index: number): Promise<CanvasItem> => {
    const center = viewportCenterWorld()
    const src = await readFileAsDataUrl(file)
    const imageSize = await measureImage(src).catch(() => ({ width: 320, height: 240 }))
    const size = fitImageWithinFrame(imageSize.width, imageSize.height)

    return {
      id: createId(),
      type: 'image',
      x: Math.round(center.x - size.w / 2 + index * 24),
      y: Math.round(center.y - size.h / 2 + index * 24),
      w: size.w,
      h: size.h,
      src,
      mimeType: file.type || undefined,
      name: file.name || undefined,
      ...createDefaultItemStyle('image'),
    } as CanvasItem
  }

  const updateWebEmbedUrl = (id: string, nextUrl: string) => {
    updateItem(id, { url: nextUrl } as Partial<CanvasItem>)
  }

  const openWebEmbedUrl = (url: string) => {
    const spec = resolveWebEmbed(url)
    if (!spec) return
    window.open(spec.openUrl, '_blank', 'noopener,noreferrer')
  }

  const webEmbedSpec = (url: string) => resolveWebEmbed(url)

  const createExportPayload = () => {
    const exportItems = exportTargetItems()
    return exportEmbedData() && exportItems.length ? encodeEmbeddedExportPayload(exportItems) : null
  }

  const buildSceneForExport = (embedPayload?: string | null) =>
    buildExportSvg({
      items: exportTargetItems(),
      onlySelected: exportOnlySelected() && canExportSelection(),
      includeBackground: exportIncludeBackground(),
      darkMode: exportDarkMode(),
      embedPayload,
    })

  const downloadBlob = (filename: string, blob: Blob) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const currentNotebook = (): SavedNotebook => ({ items: items(), view: view() })

  const applyLoadedNotebook = (payload: SavedNotebook, handle: NoteFileHandle | null, name: string | null) => {
    clearHistory()
    setSlideshowIndex(null)
    setSlideshowRestoreView(null)
    setItems(payload.items)
    setView(payload.view)
    setSelectedIds([])
    setEditingId(null)
    setErasePreviewIds([])
    setInteraction(null)
    setTool('selection')
    setCurrentNoteFileHandle(handle)
    setCurrentNoteFileName(name)
  }

  const openNoteFromText = (source: string, handle: NoteFileHandle | null, name: string | null) => {
    const parsed = parseNoteFile(source)
    if (!parsed) {
      alert('この .note ファイルは読み込めませんでした。')
      return false
    }

    closeExportModal()
    setAppMenuOpen(false)
    applyLoadedNotebook(parsed, handle, name)
    setSaveState(`opened ${name ?? 'note file'}`)
    return true
  }

  const openNotebookFromFile = async (file: File, handle: NoteFileHandle | null) => {
    const lowerName = file.name.toLowerCase()
    if (lowerName.endsWith(NOTE_FILE_EXTENSION)) {
      return openNoteFromText(await file.text(), handle, file.name)
    }

    const embeddedItems = await readEmbeddedItemsFromFile(file)
    if (!embeddedItems) {
      const isImageFile = file.type.startsWith('image/') || lowerName.endsWith('.png') || lowerName.endsWith('.svg')
      alert(isImageFile ? 'この画像には埋め込みノートデータがありません。' : 'このファイルは読み込めませんでした。')
      return false
    }

    closeExportModal()
    setAppMenuOpen(false)
    applyLoadedNotebook({ items: embeddedItems, view: defaultView() }, handle, file.name)
    setSaveState(`opened ${file.name}`)
    return true
  }

  const openNotePicker = async () => {
    setAppMenuOpen(false)
    const pickerWindow = window as OpenFilePickerWindow
    if (typeof pickerWindow.showOpenFilePicker !== 'function') {
      notePickerRef?.click()
      return
    }

    try {
      const [handle] = await pickerWindow.showOpenFilePicker({
        multiple: false,
        excludeAcceptAllOption: true,
        types: [
          {
            description: 'Pencil note or embedded export',
            accept: {
              [NOTE_FILE_MIME]: [NOTE_FILE_EXTENSION],
              'image/png': ['.png'],
              'image/svg+xml': ['.svg'],
            },
          },
        ],
      })
      if (!handle) return

      const file = await handle.getFile()
      await openNotebookFromFile(file, handle)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      alert('このファイルは読み込めませんでした。')
    }
  }

  const saveToCurrentFile = async () => {
    const handle = currentNoteFileHandle()
    if (!handle) return

    setAppMenuOpen(false)

    try {
      let permission = await handle.queryPermission?.({ mode: 'readwrite' })
      if (permission !== 'granted') {
        permission = await handle.requestPermission?.({ mode: 'readwrite' })
      }
      if (permission !== 'granted') {
        alert('現在のファイルへ保存する権限がありません。')
        return
      }

      const lowerName = (currentNoteFileName() ?? handle.name).toLowerCase()
      const writable = await handle.createWritable()
      if (lowerName.endsWith('.png') || lowerName.endsWith('.svg')) {
        const exportItems = items()
        const payload = exportItems.length ? encodeEmbeddedExportPayload(exportItems) : null
        const scene = buildExportSvg({
          items: exportItems,
          onlySelected: false,
          includeBackground: true,
          darkMode: resolvedTheme() === 'dark',
          embedPayload: lowerName.endsWith('.svg') ? payload : null,
        })
        if (!scene || !payload) {
          alert('保存する内容がありません。')
          await writable.close()
          return
        }

        if (lowerName.endsWith('.png')) {
          await writable.write(await renderSceneToPngBlob(scene, payload))
        } else {
          await writable.write(new Blob([scene.svg], { type: 'image/svg+xml;charset=utf-8' }))
        }
      } else {
        await writable.write(serializeNoteFile(currentNotebook()))
      }
      await writable.close()
      setSaveState(`saved ${currentNoteFileName() ?? handle.name}`)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      alert('現在のファイルへ保存できませんでした。')
    }
  }

  const renderSceneToPngBlob = async (
    scene: NonNullable<ReturnType<typeof buildSceneForExport>>,
    payload?: string | null,
    mode: RasterRenderMode = 'export',
  ) =>
    queueExportRender(async () => {
      const surface = updateExportRenderSurface(scene)
      await waitForExportRenderSurface(surface)

      const settings = getRasterRenderSettings(scene, mode, window.devicePixelRatio || 1)
      const blob = await toBlob(surface, {
        width: settings.width,
        height: settings.height,
        canvasWidth: settings.canvasWidth,
        canvasHeight: settings.canvasHeight,
        pixelRatio: settings.pixelRatio,
        cacheBust: settings.cacheBust,
        preferredFontFormat: 'woff2',
      })
      if (!blob) throw new Error('Failed to encode PNG export')
      if (!payload) return blob

      const arrayBuffer = await blob.arrayBuffer()
      const embedded = injectPngTextChunk(arrayBuffer, EXPORT_PNG_TEXT_KEY, payload)
      return new Blob([embedded], { type: 'image/png' })
    })

  const runExportAction = async (
    kind: 'png' | 'svg' | 'clipboard',
    action: (scene: NonNullable<ReturnType<typeof buildSceneForExport>>, payload: string | null) => Promise<void>,
  ) => {
    const payload = createExportPayload()
    const scene = buildSceneForExport(kind === 'svg' ? payload : null)
    if (!scene) return

    setExportError(null)
    setExportBusy(kind)
    try {
      await action(scene, payload)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Export failed')
    } finally {
      setExportBusy(null)
    }
  }

  const exportAsSvg = () =>
    runExportAction('svg', async (scene) => {
      downloadBlob(`${scene.filenameBase}.svg`, new Blob([scene.svg], { type: 'image/svg+xml;charset=utf-8' }))
    })

  const exportAsPng = () =>
    runExportAction('png', async (scene, payload) => {
      const blob = await renderSceneToPngBlob(scene, payload)
      downloadBlob(`${scene.filenameBase}.png`, blob)
    })

  const copyExportToClipboard = () =>
    runExportAction('clipboard', async (scene, payload) => {
      if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
        throw new Error('Clipboard image export is not available in this browser')
      }
      const blob = await renderSceneToPngBlob(scene, payload)
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    })

  const screenToWorld = (clientX: number, clientY: number): Point => {
    const rect = stageRef.getBoundingClientRect()
    const current = view()
    return {
      x: (clientX - rect.left - current.x) / current.zoom,
      y: (clientY - rect.top - current.y) / current.zoom,
    }
  }

  const zoomAt = (clientX: number, clientY: number, nextZoom: number) => {
    const rect = stageRef.getBoundingClientRect()
    const targetZoom = clamp(nextZoom, 0.25, 3)

    setView((current) => {
      const screenX = clientX - rect.left
      const screenY = clientY - rect.top
      const worldX = (screenX - current.x) / current.zoom
      const worldY = (screenY - current.y) / current.zoom

      return {
        zoom: targetZoom,
        x: screenX - worldX * targetZoom,
        y: screenY - worldY * targetZoom,
      }
    })
  }

  const zoomFromCenter = (factor: number) => {
    const rect = stageRef.getBoundingClientRect()
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, view().zoom * factor)
  }

  const createTextItem = (point: Point): CanvasItem => ({
    id: createId(),
    type: 'text',
    x: point.x - 20,
    y: point.y - 20,
    w: 320,
    h: 120,
    content: createEmptyContent(),
    ...createDefaultItemStyle('text'),
  })

  const createDraftShapeItem = (type: ShapeTool, startWorld: Point, endWorld: Point): CanvasItem | null => {
    if (isLinearTool(type)) {
      if (distance(startWorld, endWorld) < MIN_LINEAR_PREVIEW_LENGTH) return null
      return createLinearItemFromEndpoints('shape-draft', type, startWorld, endWorld, createDefaultItemStyle(type))
    }

    const box = shapeBoxFromDrag(type, startWorld, endWorld)
    if (!isShapeBoxVisible(box)) return null

    const item = {
      id: 'shape-draft',
      type,
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      ...createDefaultItemStyle(type),
    } as CanvasItem

    if (type === 'slide') return item
    if (type === 'webEmbed') return { ...item, url: '' } as CanvasItem

    return {
      ...item,
      content: createEmptyContent(),
    } as CanvasItem
  }

  const createShapeItem = (type: ShapeTool, startWorld: Point, endWorld: Point): CanvasItem | null => {
    if (isLinearTool(type)) {
      if (distance(startWorld, endWorld) < MIN_LINEAR_ITEM_LENGTH) return null
      return createLinearItemFromEndpoints(createId(), type, startWorld, endWorld, createDefaultItemStyle(type))
    }

    const box = shapeBoxFromDrag(type, startWorld, endWorld)
    if (!isShapeBoxVisible(box)) return null

    const item = {
      id: createId(),
      type,
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      ...createDefaultItemStyle(type),
    } as CanvasItem

    if (type === 'slide') return item
    if (type === 'webEmbed') return { ...item, url: '' } as CanvasItem

    return {
      ...item,
      content: createEmptyContent(),
    } as CanvasItem
  }

  const placeTextItem = (point: Point) => {
    const item = createTextItem(point)
    applyHistoryMutation(() => {
      setItems((current) => [...current, item])
      setSelectedIds([item.id])
      setTool('selection')
    })
    startTextEdit(item.id)
  }

  const pasteImageFiles = async (files: File[]) => {
    if (!files.length) return

    const nextItems: CanvasItem[] = []
    for (const [index, file] of files.entries()) {
      const restoredItems = await readEmbeddedItemsFromFile(file)
      if (restoredItems?.length) {
        nextItems.push(...placeImportedItems(restoredItems, index))
        continue
      }
      nextItems.push(await createImageItemFromFile(file, index))
    }

    applyHistoryMutation(() => {
      setItems((current) => [...current, ...nextItems])
      setSelectedIds(nextItems.map((item) => item.id))
      setEditingId(null)
      setTool('selection')
    })
  }

  const copySelectedItems = (clipboardData?: DataTransfer | null) => {
    const selection = selectedItems().map(cloneCanvasItem)
    if (!selection.length) return false

    inMemoryClipboard = selection
    clipboardPasteCount = 0

    if (clipboardData) {
      const payload = serializeCanvasItemsForClipboard(selection)
      clipboardData.setData(NOTE_CLIPBOARD_MIME, payload)
      clipboardData.setData('text/plain', NOTE_CLIPBOARD_FALLBACK_TEXT)
    }

    return true
  }

  const pasteClipboardItems = (sourceItems: CanvasItem[]) => {
    if (!sourceItems.length) return false

    clipboardPasteCount += 1
    const offset = 24 * clipboardPasteCount
    const nextItems = duplicateClipboardItems(sourceItems, offset)
    applyHistoryMutation(() => {
      setItems((current) => [...current, ...nextItems])
      setSelectedIds(nextItems.map((item) => item.id))
      setEditingId(null)
      setTool('selection')
    })
    return true
  }

  const openImagePicker = () => {
    imagePickerRef?.click()
  }

  const saveNoteToFile = () => {
    setAppMenuOpen(false)
    const source = serializeNoteFile(currentNotebook())
    downloadBlob(NOTE_FILE_NAME, new Blob([source], { type: NOTE_FILE_MIME }))
    setSaveState('saved to .note file')
  }

  const openExportModal = () => {
    setAppMenuOpen(false)
    setExportOnlySelected(canExportSelection())
    setExportIncludeBackground(true)
    setExportDarkMode(resolvedTheme() === 'dark')
    setExportEmbedData(false)
    setExportBusy(null)
    setExportError(null)
    setExportModalOpen(true)
  }

  const openTemplateModal = () => {
    setAppMenuOpen(false)
    setTemplateModalOpen(true)
  }

  const closeTemplateModal = () => {
    setTemplateModalOpen(false)
  }

  const applyTemplate = (template: NotebookTemplate) => {
    if (items().length > 0 && !confirm(`Replace the current note with the "${template.name}" template?`)) return

    closeTemplateModal()
    applyLoadedNotebook({ items: template.buildItems(), view: defaultView() }, null, null)
    setSaveState(`template ${template.name.toLowerCase()}`)
  }

  const syncSlideshowView = (slide: SlideCanvasItem | null) => {
    if (!slide || !stageRef) return
    const rect = stageRef.getBoundingClientRect()
    setView(fitSlideToViewport(slide, rect.width || window.innerWidth, rect.height || window.innerHeight))
  }

  const goToSlideshowIndex = (nextIndex: number) => {
    const slides = presentationSlides()
    if (!slides.length) return
    const clampedIndex = Math.min(Math.max(nextIndex, 0), slides.length - 1)
    setSlideshowIndex(clampedIndex)
    requestAnimationFrame(() => syncSlideshowView(slides[clampedIndex] ?? null))
  }

  const stopSlideshow = () => {
    if (slideshowIndex() === null) return

    const restore = slideshowRestoreView()
    setSlideshowIndex(null)
    setSlideshowRestoreView(null)
    setLaserPointerEnabled(false)
    setLaserPointer(null)
    if (restore) setView(restore)
  }

  const startSlideshow = (requestedIndex?: number) => {
    const slides = presentationSlides()
    if (!slides.length) return

    const selectedSlideId = selectedItems().find(isSlideItem)?.id
    const selectedIndex = selectedSlideId ? presentationSlideIndexLookup().get(selectedSlideId) : undefined
    const nextIndex = Math.min(
      Math.max(requestedIndex ?? selectedIndex ?? 0, 0),
      slides.length - 1,
    )

    if (slideshowIndex() === null) setSlideshowRestoreView({ ...view() })
    closeTemplateModal()
    closeExportModal()
    setAppMenuOpen(false)
    finishTextEdit()
    setInteraction(null)
    setErasePreviewIds([])
    setSelectedIds([])
    setLaserPointer(null)
    setTool('selection')
    goToSlideshowIndex(nextIndex)
  }

  const stepSlideshow = (direction: -1 | 1) => {
    const currentIndex = slideshowIndex()
    if (currentIndex === null) return
    goToSlideshowIndex(currentIndex + direction)
  }

  const updateLaserPointerPosition = (clientX: number, clientY: number) => {
    if (!slideshowActive() || !laserPointerEnabled() || !stageRef) return
    const rect = stageRef.getBoundingClientRect()
    setLaserPointer({
      x: clientX - rect.left,
      y: clientY - rect.top,
    })
  }

  const hideLaserPointer = () => setLaserPointer(null)

  const closeExportModal = () => {
    setExportBusy(null)
    setExportModalOpen(false)
    setExportError(null)
  }

  const handleNotePickerChange = async (event: Event & { currentTarget: HTMLInputElement }) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return

    try {
      await openNotebookFromFile(file, null)
    } catch {
      alert('このファイルは読み込めませんでした。')
    }
  }

  const handleImagePickerChange = (event: Event & { currentTarget: HTMLInputElement }) => {
    const files = [...(event.currentTarget.files ?? [])].filter((file) => file.type.startsWith('image/'))
    event.currentTarget.value = ''
    void pasteImageFiles(files)
  }

  const startDraw = (event: PointerEvent & { currentTarget: HTMLDivElement }) => {
    const point = screenToWorld(event.clientX, event.clientY)
    const style = createDefaultItemStyle('path')
    const item = createPathItemFromPoints(createId(), [point], style)
    beginHistoryAction()
    setItems((current) => [...current, item])
    setSelectedIds([item.id])
    setInteraction({
      kind: 'draw',
      pointerId: event.pointerId,
      id: item.id,
      points: [point],
      style,
    })
  }

  const startShapeCreation = (event: PointerEvent & { currentTarget: HTMLDivElement }, type: ShapeTool) => {
    const point = screenToWorld(event.clientX, event.clientY)
    setSelectedIds([])
    setInteraction({
      kind: 'createShape',
      pointerId: event.pointerId,
      type,
      startWorld: point,
      currentWorld: point,
    })
  }

  const startErase = (event: PointerEvent & { currentTarget: HTMLDivElement }) => {
    const point = screenToWorld(event.clientX, event.clientY)
    setErasePreviewIds(collectEraseHits(point, point))
    setInteraction({
      kind: 'erase',
      pointerId: event.pointerId,
      lastWorld: point,
    })
  }

  const deleteSelected = () => {
    const ids = new Set(selectedIds())
    if (!ids.size) return
    applyHistoryMutation(() => {
      setItems((current) => current.filter((item) => !ids.has(item.id)))
      setSelectedIds([])
      setEditingId(null)
      setErasePreviewIds([])
    })
  }

  const duplicateSelected = () => {
    const selection = selectedItems()
    if (!selection.length) return

    const duplicated = selection.map((item) => {
      const cloned = cloneCanvasItem(item)
      cloned.id = createId()
      cloned.x += 32
      cloned.y += 32
      return cloned
    })

    applyHistoryMutation(() => {
      setItems((current) => [...current, ...duplicated])
      setSelectedIds(duplicated.map((item) => item.id))
      setEditingId(null)
    })
  }

  const resetView = () => setView(defaultView())

  const clearBoard = () => {
    setAppMenuOpen(false)
    if (!confirm('このノートを初期状態に戻しますか？')) return
    applyHistoryMutation(() => {
      setItems([])
      setView(defaultView())
      setSelectedIds([])
      setEditingId(null)
      setErasePreviewIds([])
      setInteraction(null)
      setTool('selection')
    })
  }

  const handleStagePointerDown = (event: PointerEvent & { currentTarget: HTMLDivElement }) => {
    if (slideshowActive()) return
    if (event.button !== 0 || isEditableTarget(event.target)) return
    setErasePreviewIds([])
    finishTextEdit()

    const currentTool = tool()

    if (currentTool === 'pencil') {
      startDraw(event)
      return
    }

    if (currentTool === 'eraser') {
      setSelectedIds([])
      startErase(event)
      return
    }

    if (currentTool === 'text') {
      placeTextItem(screenToWorld(event.clientX, event.clientY))
      return
    }

    if (isShapeTool(currentTool)) {
      startShapeCreation(event, currentTool)
      return
    }

    if (currentTool === 'pan') {
      startPan(event)
      return
    }

    const additive = event.shiftKey || event.metaKey || event.ctrlKey
    const startWorld = screenToWorld(event.clientX, event.clientY)
    const bounds = selectedBounds()

    if (!additive && bounds && boxContainsPoint(bounds, startWorld)) {
      startSelectedItemsDrag(event, selectedIds(), startWorld)
      return
    }

    if (!additive) setSelectedIds([])
    setInteraction({
      kind: 'selectArea',
      pointerId: event.pointerId,
      startWorld,
      currentWorld: startWorld,
      additive,
      previousIds: additive ? selectedIds() : [],
    })
  }

  const handleItemPointerDown = (
    event: PointerEvent & { currentTarget: HTMLDivElement },
    item: CanvasItem,
  ) => {
    if (slideshowActive()) return
    if (event.button !== 0 || editingId() === item.id || isEditableTarget(event.target)) return

    const currentTool = tool()
    if (currentTool === 'pan') {
      event.stopPropagation()
      finishTextEdit()
      startPan(event)
      return
    }

    if (currentTool !== 'selection') return

    event.stopPropagation()
    finishTextEdit()
    const additive = event.shiftKey || event.metaKey || event.ctrlKey
    const currentIds = selectedIds()
    const nextIds = currentIds.includes(item.id)
      ? currentIds
      : additive
        ? [...currentIds, item.id]
        : [item.id]
    const dragIds = unique(nextIds)

    setSelectedIds(dragIds)
    startSelectedItemsDrag(event, dragIds, screenToWorld(event.clientX, event.clientY))
  }

  const handleResizePointerDown = (
    event: PointerEvent & { currentTarget: HTMLButtonElement },
    item: CanvasItem,
  ) => {
    if (slideshowActive()) return
    if (isStrokeCanvasItem(item)) return
    event.stopPropagation()
    setSelectedIds([item.id])
    beginHistoryAction()
    setInteraction({
      kind: 'resize',
      pointerId: event.pointerId,
      id: item.id,
      startWorld: screenToWorld(event.clientX, event.clientY),
      originW: item.w,
      originH: item.h,
    })
  }

  const handlePointerMove = (event: PointerEvent) => {
    const active = interaction()
    if (!active || active.pointerId !== event.pointerId) return

    if (active.kind === 'pan') {
      setView((current) => ({
        ...current,
        x: active.originX + event.clientX - active.startX,
        y: active.originY + event.clientY - active.startY,
      }))
      return
    }

    const world = screenToWorld(event.clientX, event.clientY)

    if (active.kind === 'draw') {
      const lastPoint = active.points[active.points.length - 1]
      if (distance(lastPoint, world) < 3 / view().zoom) return

      const nextPoints = [...active.points, world]
      updateItem(active.id, createPathItemFromPoints(active.id, nextPoints, active.style))
      setInteraction({ ...active, points: nextPoints })
      return
    }

    if (active.kind === 'createShape') {
      setInteraction({ ...active, currentWorld: world })
      return
    }

    if (active.kind === 'erase') {
      const hitIds = collectEraseHits(active.lastWorld, world)
      setErasePreviewIds((current) => unique([...current, ...hitIds]))
      setInteraction({ ...active, lastWorld: world })
      return
    }

    if (active.kind === 'drag') {
      const originMap = new Map(active.origins.map((origin) => [origin.id, origin]))
      setItems((current) =>
        current.map((item) => {
          const origin = originMap.get(item.id)
          if (!origin) return item

          return {
            ...item,
            x: Math.round(origin.x + world.x - active.startWorld.x),
            y: Math.round(origin.y + world.y - active.startWorld.y),
          }
        }),
      )
      return
    }

    if (active.kind === 'selectArea') {
      const currentWorld = screenToWorld(event.clientX, event.clientY)
      const nextInteraction = { ...active, currentWorld }
      setInteraction(nextInteraction)
      selectItemsInBox(normalizeBox(active.startWorld, currentWorld), active.additive ? active.previousIds : [])
      return
    }

    updateItem(active.id, {
      w: Math.round(clamp(active.originW + world.x - active.startWorld.x, 120, 760)),
      h: Math.round(clamp(active.originH + world.y - active.startWorld.y, 80, 620)),
    })
  }

  const handlePointerUp = (event: PointerEvent) => {
    const active = interaction()
    if (active?.pointerId !== event.pointerId) return

    if (active.kind === 'createShape') {
      const item = createShapeItem(active.type, active.startWorld, active.currentWorld)
      if (item) {
        applyHistoryMutation(() => {
          setItems((current) => [...current, item])
          setSelectedIds([item.id])
          setTool('selection')
          setEditingId(null)
        })
      }
      setInteraction(null)
      return
    }

    if (active.kind === 'selectArea') {
      const box = normalizeBox(active.startWorld, active.currentWorld)
      if (box.w < 4 && box.h < 4) {
        setSelectedIds(active.additive ? active.previousIds : [])
      }
    }

    if (active.kind === 'erase') commitErasePreview()
    if (active.kind === 'draw' || active.kind === 'drag' || active.kind === 'resize') commitHistoryAction()

    setInteraction(null)
  }

  const handleWheel = (event: WheelEvent & { currentTarget: HTMLDivElement }) => {
    if (slideshowActive()) {
      event.preventDefault()
      return
    }
    event.preventDefault()

    if (event.ctrlKey || event.metaKey) {
      const factor = Math.exp(-event.deltaY * 0.001)
      zoomAt(event.clientX, event.clientY, view().zoom * factor)
      return
    }

    if (event.shiftKey) {
      const horizontalDelta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      setView((current) => ({
        ...current,
        x: current.x - horizontalDelta,
      }))
      return
    }

    setView((current) => ({
      ...current,
      x: current.x - event.deltaX,
      y: current.y - event.deltaY,
    }))
  }

  const handlePaste = (event: ClipboardEvent) => {
    if (isEditableTarget(event.target) || templateModalOpen() || exportModalOpen() || slideshowActive()) return

    const clipboardPayload = event.clipboardData?.getData(NOTE_CLIPBOARD_MIME)
    const clipboardMarker = event.clipboardData?.getData('text/plain')
    const clipboardItems =
      (clipboardPayload ? parseCanvasItemsFromClipboardPayload(clipboardPayload) : null) ??
      (clipboardMarker === NOTE_CLIPBOARD_FALLBACK_TEXT ? inMemoryClipboard : null) ??
      (!event.clipboardData || event.clipboardData.types.length === 0 ? inMemoryClipboard : null)

    if (clipboardItems?.length) {
      event.preventDefault()
      pasteClipboardItems(clipboardItems)
      return
    }

    const files =
      event.clipboardData?.items
        ? [...event.clipboardData.items]
            .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
            .map((item) => item.getAsFile())
            .filter((file): file is File => file !== null)
        : []

    if (!files.length) return

    event.preventDefault()
    void pasteImageFiles(files)
  }

  const handleCopy = (event: ClipboardEvent) => {
    if (isEditableTarget(event.target) || templateModalOpen() || exportModalOpen() || slideshowActive()) return
    if (!copySelectedItems(event.clipboardData)) return
    event.preventDefault()
  }

  const handleCut = (event: ClipboardEvent) => {
    if (isEditableTarget(event.target) || templateModalOpen() || exportModalOpen() || slideshowActive()) return
    if (!copySelectedItems(event.clipboardData)) return
    event.preventDefault()
    deleteSelected()
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (slideshowActive()) {
      if (event.key === 'Escape') {
        event.preventDefault()
        stopSlideshow()
        return
      }

      if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'PageDown') {
        event.preventDefault()
        stepSlideshow(1)
        return
      }

      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'PageUp') {
        event.preventDefault()
        stepSlideshow(-1)
        return
      }

      if (event.key === 'Home') {
        event.preventDefault()
        goToSlideshowIndex(0)
        return
      }

      if (event.key === 'End') {
        event.preventDefault()
        goToSlideshowIndex(presentationSlides().length - 1)
        return
      }

      if (event.key.toLowerCase() === 'l') {
        event.preventDefault()
        setLaserPointerEnabled((current) => {
          const next = !current
          if (!next) setLaserPointer(null)
          return next
        })
        return
      }

      return
    }

    if (templateModalOpen()) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeTemplateModal()
      }
      return
    }

    if (exportModalOpen()) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeExportModal()
      }
      return
    }

    if (appMenuOpen()) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setAppMenuOpen(false)
      }
      return
    }

    if (isEditableTarget(event.target)) {
      if (event.key === 'Escape') {
        event.preventDefault()
        finishTextEdit()
      }
      return
    }

    if ((event.metaKey || event.ctrlKey) && !event.altKey) {
      const key = event.key.toLowerCase()

      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redoHistory()
        else undoHistory()
        return
      }

      if (key === 'y') {
        event.preventDefault()
        redoHistory()
        return
      }

      if (key === 'o') {
        event.preventDefault()
        void openNotePicker()
        return
      }

      if (key === 's') {
        event.preventDefault()
        if (canSaveToCurrentFile()) {
          void saveToCurrentFile()
        } else {
          saveNoteToFile()
        }
        return
      }

      if (key === 'a') {
        event.preventDefault()
        setSelectedIds(items().map((item) => item.id))
        finishTextEdit()
        setTool('selection')
        return
      }
    }

    if (event.key === 'Escape') {
      setTool('selection')
      setSelectedIds([])
      finishTextEdit()
      setErasePreviewIds([])
      setInteraction(null)
      return
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      deleteSelected()
      return
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
      event.preventDefault()
      duplicateSelected()
      return
    }

    if (event.key === '+' || event.key === '=') {
      zoomFromCenter(1.12)
      return
    }

    if (event.key === '-') {
      zoomFromCenter(0.88)
      return
    }

    if (event.key === '0') {
      resetView()
      return
    }

    const nextTool = TOOLS.find((entry) => entry.shortcut.toLowerCase() === event.key.toLowerCase())
    if (nextTool) setTool(nextTool.id)
  }

  const itemStyle = (item: CanvasItem) =>
    [
      `transform: translate3d(${item.x}px, ${item.y}px, 0)`,
      `width: ${item.w}px`,
      `min-height: ${item.h}px`,
      `height: ${item.h}px`,
      `--item-fill: ${resolveItemFill(item)}`,
      `--item-stroke: ${resolveItemStroke(item)}`,
      `--item-stroke-width: ${strokeWidthPx(item.strokeWidth)}px`,
      `--item-stroke-style: ${item.strokeStyle}`,
      `--item-stroke-dash: ${strokeDasharray(item.strokeStyle)}`,
      `--item-font-size: ${fontSizePx(item.fontSize)}px`,
      `--item-font-family: ${fontFamilyValue(item.fontFamily)}`,
      `--item-text-align: ${item.textAlign}`,
    ].join('; ')

  onMount(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleWindowPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!appMenuOpen() || !(target instanceof Node)) return
      if (appMenuRef?.contains(target)) return
      setAppMenuOpen(false)
    }
    const handleWindowResize = () => {
      if (!slideshowActive()) return
      syncSlideshowView(currentSlide())
    }
    const handleThemeChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light')
    }

    setSystemTheme(media.matches ? 'dark' : 'light')
    media.addEventListener('change', handleThemeChange)
    window.addEventListener('pointerdown', handleWindowPointerDown)
    window.addEventListener('resize', handleWindowResize)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('copy', handleCopy)
    window.addEventListener('cut', handleCut)
    window.addEventListener('paste', handlePaste)
    window.addEventListener('beforeunload', persistLocalSnapshot)
    window.addEventListener('pagehide', persistLocalSnapshot)

    onCleanup(() => {
      media.removeEventListener('change', handleThemeChange)
      window.removeEventListener('pointerdown', handleWindowPointerDown)
      window.removeEventListener('resize', handleWindowResize)
    })
  })

  onCleanup(() => {
    if (exportPreviewTimer) window.clearTimeout(exportPreviewTimer)
    if (exportPreviewObjectUrl) URL.revokeObjectURL(exportPreviewObjectUrl)
    exportRenderCaptureRef?.remove()
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
    window.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('copy', handleCopy)
    window.removeEventListener('cut', handleCut)
    window.removeEventListener('paste', handlePaste)
    window.removeEventListener('beforeunload', persistLocalSnapshot)
    window.removeEventListener('pagehide', persistLocalSnapshot)
  })

  return (
    <main class="notebook-app">
      <Show when={!slideshowActive()}>
        <section class="toolbar" aria-label="Canvas tools" onPointerDown={(event) => event.stopPropagation()}>
          <div class="tool-strip">
            <For each={TOOLS}>
              {(entry) => (
                <button
                  class={tool() === entry.id ? 'tool-button is-active' : 'tool-button'}
                  type="button"
                  title={`${entry.label} (${entry.shortcut})`}
                  onClick={() => setTool(entry.id)}
                >
                  <ToolIcon tool={entry.id} />
                  <span>{entry.label}</span>
                  <small>{entry.shortcut}</small>
                </button>
              )}
            </For>
          </div>

          <div class="toolbar-actions">
            <button
              class="action-button"
              type="button"
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
              onClick={undoHistory}
              disabled={!canUndo()}
            >
              <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 7 5 11l4 4" />
                <path d="M5 11h8.5a5 5 0 0 1 0 10H11" />
              </svg>
            </button>
            <button
              class="action-button"
              type="button"
              title="Redo (Ctrl+Shift+Z / Ctrl+Y)"
              aria-label="Redo"
              onClick={redoHistory}
              disabled={!canRedo()}
            >
              <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m15 7 4 4-4 4" />
                <path d="M19 11h-8.5a5 5 0 0 0 0 10H13" />
              </svg>
            </button>
            <button
              class="action-button"
              type="button"
              title="Insert image"
              aria-label="Insert image"
              onClick={openImagePicker}
            >
              <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="4" y="5" width="16" height="14" rx="2" />
                <circle cx="9" cy="10" r="1.6" />
                <path d="m7 17 4.1-4.1a1.4 1.4 0 0 1 2 0L17 17" />
                <path d="m13.5 17 1.8-1.8a1.4 1.4 0 0 1 2 0L19 17" />
              </svg>
            </button>
            <button
              class="action-button"
              type="button"
              title="Duplicate"
              aria-label="Duplicate selected"
              onClick={duplicateSelected}
              disabled={selectedCount() === 0}
            >
              <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="8" y="8" width="10" height="10" rx="2" />
                <path d="M6 14H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
            <button
              class="action-button"
              type="button"
              title="Delete"
              aria-label="Delete selected"
              onClick={deleteSelected}
              disabled={selectedCount() === 0}
            >
              <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 7h14" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
                <path d="M8 7l1-3h6l1 3" />
                <path d="M7 7l1 13h8l1-13" />
              </svg>
            </button>
          </div>
        </section>

        <div class="app-menu" ref={appMenuRef} onPointerDown={(event) => event.stopPropagation()}>
          <button
            class={appMenuOpen() ? 'app-menu-button is-active' : 'app-menu-button'}
            type="button"
            title={saveState()}
            aria-label="Notebook menu"
            aria-haspopup="menu"
            aria-expanded={appMenuOpen()}
            onClick={() => setAppMenuOpen((current) => !current)}
          >
            <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 7h14" />
              <path d="M5 12h14" />
              <path d="M5 17h14" />
            </svg>
          </button>

          <Show when={appMenuOpen()}>
            <div class="app-menu-panel" role="menu" aria-label="Notebook actions">
              <button class="app-menu-item" type="button" role="menuitem" onClick={() => void openNotePicker()}>
                <span class="app-menu-item-text">Open</span>
                <span class="app-menu-item-shortcut">Ctrl+O</span>
              </button>
              <button class="app-menu-item" type="button" role="menuitem" onClick={openTemplateModal}>
                <span class="app-menu-item-text">Templateから作成</span>
              </button>
              <Show when={canSaveToCurrentFile()}>
                <button class="app-menu-item" type="button" role="menuitem" onClick={() => void saveToCurrentFile()}>
                  <span class="app-menu-item-text">Save to current file</span>
                  <span class="app-menu-item-shortcut">Ctrl+S</span>
                </button>
              </Show>
              <button class="app-menu-item" type="button" role="menuitem" onClick={saveNoteToFile}>
                <span class="app-menu-item-text">Save to...</span>
              </button>
              <button
                class="app-menu-item"
                type="button"
                role="menuitem"
                onClick={() => startSlideshow()}
                disabled={!canStartSlideshow()}
              >
                <span class="app-menu-item-text">Start slideshow</span>
              </button>
              <button
                class="app-menu-item"
                type="button"
                role="menuitem"
                onClick={openExportModal}
                disabled={items().length === 0}
              >
                <span class="app-menu-item-text">Export Image</span>
              </button>
              <button class="app-menu-item is-danger" type="button" role="menuitem" onClick={clearBoard}>
                <span class="app-menu-item-text">Reset note</span>
              </button>
            </div>
          </Show>
        </div>
      </Show>

      <input
        ref={notePickerRef}
        class="file-picker-input"
        type="file"
        accept=".note,.png,.svg,image/png,image/svg+xml"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleNotePickerChange}
      />

      <input
        ref={imagePickerRef}
        class="file-picker-input"
        type="file"
        accept="image/*"
        multiple
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleImagePickerChange}
      />

      <Show when={templateModalOpen()}>
        <div class="template-modal-backdrop" onPointerDown={closeTemplateModal}>
          <section
            class="template-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="template-modal-title"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div class="template-modal-header">
              <div>
                <p class="eyebrow">Template library</p>
                <h2 id="template-modal-title">Create from template</h2>
                <p class="template-modal-copy">
                  Start with a structured board for meetings, design reviews, incident follow-up, or teaching.
                </p>
              </div>
              <button class="export-close-button" type="button" aria-label="Close template modal" onClick={closeTemplateModal}>
                <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m6 6 12 12" />
                  <path d="m18 6-12 12" />
                </svg>
              </button>
            </div>

            <div class="template-modal-body">
              <For each={NOTE_TEMPLATE_SECTIONS}>
                {(section) => (
                  <section class="template-section" aria-labelledby={`template-section-${section.id}`}>
                    <div class="template-section-header">
                      <div>
                        <p class="eyebrow">{section.label}</p>
                        <h3 id={`template-section-${section.id}`}>{section.templates.length} ready-to-use layouts</h3>
                      </div>
                    </div>

                    <div class="template-card-grid">
                      <For each={section.templates}>
                        {(template) => (
                          <article class={`template-card template-card-${section.id}`}>
                            <div class="template-card-head">
                              <span class="template-card-badge">{section.label}</span>
                              <h4>{template.name}</h4>
                            </div>
                            <p class="template-card-description">{template.description}</p>
                            <div class="template-card-highlights">
                              <For each={template.highlights}>
                                {(highlight) => <p>{highlight}</p>}
                              </For>
                            </div>
                            <button class="template-use-button" type="button" onClick={() => applyTemplate(template)}>
                              Use template
                            </button>
                          </article>
                        )}
                      </For>
                    </div>
                  </section>
                )}
              </For>
            </div>
          </section>
        </div>
      </Show>

      <Show when={exportModalOpen()}>
        <div class="export-modal-backdrop" onPointerDown={closeExportModal}>
          <section
            class="export-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-modal-title"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div class="export-preview-panel">
              <div class="export-preview-header">
                <div>
                  <p class="eyebrow">Export</p>
                  <h2 id="export-modal-title">Image export</h2>
                </div>
                <button class="export-close-button" type="button" aria-label="Close export modal" onClick={closeExportModal}>
                  <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m6 6 12 12" />
                    <path d="m18 6-12 12" />
                  </svg>
                </button>
              </div>

              <div class="export-preview-stage">
                <Show
                  when={exportPreviewUrl()}
                  fallback={
                    <div class="export-preview-empty">
                      {exportPreviewPending() ? 'Rendering preview…' : 'Nothing to export yet.'}
                    </div>
                  }
                >
                  {(previewUrl) => <img class="export-preview-image" src={previewUrl()} alt="Export preview" />}
                </Show>
              </div>

              <div class="export-preview-meta">
                <span>{exportOnlySelected() && canExportSelection() ? 'Selection' : 'Canvas'}</span>
                <span>{exportScene() ? `${exportScene()!.width} × ${exportScene()!.height}` : 'No content'}</span>
              </div>
            </div>

            <div class="export-controls-panel">
              <label class={canExportSelection() ? 'export-toggle-row' : 'export-toggle-row is-disabled'}>
                <div class="export-toggle-copy">
                  <strong>Only Selected</strong>
                  <span>Current selection only. Enabled only when something is selected.</span>
                </div>
                <span class="export-toggle">
                  <input
                    type="checkbox"
                    checked={exportOnlySelected()}
                    disabled={!canExportSelection()}
                    onInput={(event) => setExportOnlySelected(event.currentTarget.checked)}
                  />
                  <span class="export-toggle-track" />
                </span>
              </label>

              <label class="export-toggle-row">
                <div class="export-toggle-copy">
                  <strong>Background</strong>
                  <span>Include the canvas paper and grid. Turn off for transparent output.</span>
                </div>
                <span class="export-toggle">
                  <input
                    type="checkbox"
                    checked={exportIncludeBackground()}
                    onInput={(event) => setExportIncludeBackground(event.currentTarget.checked)}
                  />
                  <span class="export-toggle-track" />
                </span>
              </label>

              <label class="export-toggle-row">
                <div class="export-toggle-copy">
                  <strong>Dark mode</strong>
                  <span>Render the export with the dark palette without changing the live canvas.</span>
                </div>
                <span class="export-toggle">
                  <input
                    type="checkbox"
                    checked={exportDarkMode()}
                    onInput={(event) => setExportDarkMode(event.currentTarget.checked)}
                  />
                  <span class="export-toggle-track" />
                </span>
              </label>

              <label class="export-toggle-row">
                <div class="export-toggle-copy">
                  <strong>Embed Data</strong>
                  <span>Store restorable note data inside the file. File size gets larger.</span>
                </div>
                <span class="export-toggle">
                  <input
                    type="checkbox"
                    checked={exportEmbedData()}
                    onInput={(event) => setExportEmbedData(event.currentTarget.checked)}
                  />
                  <span class="export-toggle-track" />
                </span>
              </label>

              <Show when={exportError()}>
                {(message) => <p class="export-error">{message()}</p>}
              </Show>

              <div class="export-action-row">
                <button
                  class="export-action-button"
                  type="button"
                  disabled={!exportScene() || exportBusy() !== null}
                  onClick={() => void exportAsPng()}
                >
                  PNG
                </button>
                <button
                  class="export-action-button"
                  type="button"
                  disabled={!exportScene() || exportBusy() !== null}
                  onClick={() => void exportAsSvg()}
                >
                  SVG
                </button>
                <button
                  class="export-action-button is-wide"
                  type="button"
                  disabled={!exportScene() || exportBusy() !== null}
                  onClick={() => void copyExportToClipboard()}
                >
                  Copy to clipboard
                </button>
              </div>
            </div>
          </section>

        </div>
      </Show>

      <Show when={!slideshowActive()}>
        <section class={selectedCount() > 0 ? 'inspector' : 'inspector is-empty'} aria-label="Selected item settings">
          <Show
            when={selectedCount() > 0}
            fallback={
              <>
                <p class="eyebrow">Tools</p>
                <h1>Canvas styles</h1>
                <p class="hint-copy">
                  I: line, A: arrow, R / O / D / L: drag to create shapes and slides. P: pencil, E: eraser.
                </p>
              </>
            }
          >
            <>
              <p class="eyebrow">Selected</p>
              <h1>{selectedItem() ? typeLabel(selectedItem()!.type) : `${selectedCount()} items`}</h1>

            <div class="style-card">
              <div class="style-card-header">
                <strong>Stroke</strong>
              </div>
              <div class="style-swatch-row">
                <For each={STROKE_OPTIONS}>
                  {(option) => (
                    <button
                      type="button"
                      class={inspectorStroke() === option.value ? 'style-swatch is-active' : 'style-swatch'}
                      title={option.label}
                      onClick={() => updateSelectedItems({ stroke: option.value })}
                    >
                      <span style={`background:${option.value};`} />
                    </button>
                  )}
                </For>
              </div>
              <div class="style-chip-row">
                <For each={STROKE_WIDTH_OPTIONS}>
                  {(option) => (
                    <button
                      type="button"
                      class={inspectorStrokeWidth() === option.value ? 'style-chip is-active' : 'style-chip'}
                      onClick={() => updateSelectedItems({ strokeWidth: option.value })}
                    >
                      {option.label}
                    </button>
                  )}
                </For>
              </div>
              <div class="style-chip-row">
                <For each={STROKE_STYLE_OPTIONS}>
                  {(option) => (
                    <button
                      type="button"
                      class={inspectorStrokeStyle() === option.value ? 'style-chip is-active' : 'style-chip'}
                      onClick={() => updateSelectedItems({ strokeStyle: option.value })}
                    >
                      {option.label}
                    </button>
                  )}
                </For>
              </div>
            </div>

            <Show when={canChangeFill()}>
              <div class="style-card">
                <div class="style-card-header">
                  <strong>Background</strong>
                </div>
                <div class="style-swatch-row">
                  <For each={FILL_OPTIONS}>
                    {(option) => (
                      <button
                        type="button"
                        class={inspectorFill() === option.value ? 'style-swatch is-active' : 'style-swatch'}
                        title={option.label}
                        onClick={() => updateSelectedItemsWhere(isFillableItem, { color: option.value })}
                      >
                        <span
                          class={option.value === 'transparent' ? 'swatch-clear' : ''}
                          style={option.value === 'transparent' ? undefined : `background:${option.value};`}
                        />
                      </button>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            <Show when={canEditText()}>
              <div class="style-card">
                <div class="style-card-header">
                  <strong>Text</strong>
                </div>
                <div class="style-chip-row">
                  <For each={FONT_FAMILY_OPTIONS}>
                    {(option) => (
                      <button
                        type="button"
                        class={inspectorFontFamily() === option.value ? 'style-chip is-active' : 'style-chip'}
                        onClick={() => updateSelectedItemsWhere(isTextCanvasItem, { fontFamily: option.value })}
                      >
                        {option.label}
                      </button>
                    )}
                  </For>
                </div>
                <div class="style-chip-row">
                  <For each={FONT_SIZE_OPTIONS}>
                    {(option) => (
                      <button
                        type="button"
                        class={inspectorFontSize() === option.value ? 'style-chip is-active' : 'style-chip'}
                        onClick={() => updateSelectedItemsWhere(isTextCanvasItem, { fontSize: option.value })}
                      >
                        {option.label}
                      </button>
                    )}
                  </For>
                </div>
                <div class="style-chip-row">
                  <For each={TEXT_ALIGN_OPTIONS}>
                    {(option) => (
                      <button
                        type="button"
                        class={inspectorTextAlign() === option.value ? 'style-chip is-active' : 'style-chip'}
                        onClick={() => updateSelectedItemsWhere(isTextCanvasItem, { textAlign: option.value })}
                      >
                        {option.label}
                      </button>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            <Show when={selectedWebEmbedItem()}>
              {(item) => (
                <div class="style-card">
                  <div class="style-card-header">
                    <strong>Embed URL</strong>
                  </div>
                  <label class="style-field">
                    <span class="style-field-label">Website</span>
                    <input
                      class="style-input"
                      type="url"
                      value={item().url}
                      placeholder="https://example.com"
                      onInput={(event) => updateWebEmbedUrl(item().id, event.currentTarget.value)}
                    />
                  </label>
                  <div class="style-inline-actions">
                    <button
                      type="button"
                      class="style-chip"
                      disabled={!webEmbedSpec(item().url)}
                      onClick={() => openWebEmbedUrl(item().url)}
                    >
                      Open site
                    </button>
                  </div>
                  <p class="hint-copy">
                    Many sites block iframes. If that happens, the frame still keeps the URL and can be opened directly.
                  </p>
                </div>
              )}
            </Show>

              <p class="hint-copy">
                {selectedStrokeItems().length
                  ? 'Lines, arrows, and strokes support stroke controls. Text options apply to text and shape items.'
                  : 'Double click a text-capable item to edit. Slide frames stay as page boundaries.'}
              </p>
            </>
          </Show>
        </section>

        <section class="zoom-controls" aria-label="Zoom and view controls" onPointerDown={(event) => event.stopPropagation()}>
          <div class="zoom-row">
            <button type="button" onClick={() => zoomFromCenter(0.88)} aria-label="Zoom out">
              -
            </button>
            <span>{zoomLabel()}</span>
            <button type="button" onClick={() => zoomFromCenter(1.12)} aria-label="Zoom in">
              +
            </button>
            <button type="button" onClick={resetView}>
              Reset view
            </button>
          </div>
          <div class="theme-row" aria-label="Theme controls">
            <span class="theme-label">Theme</span>
            <For each={THEME_OPTIONS}>
              {(option) => (
                <button
                  type="button"
                  class={themeMode() === option.value ? 'theme-button is-active' : 'theme-button'}
                  title={
                    option.value === 'system' ? `System (${resolvedTheme()})` : option.label
                  }
                  onClick={() => setThemeMode(option.value)}
                >
                  {option.label}
                </button>
              )}
            </For>
          </div>
        </section>
      </Show>

      <Show when={slideshowActive()}>
        <div class="slideshow-hud" onPointerDown={(event) => event.stopPropagation()}>
          <div class="slideshow-chip">
            <strong>Slideshow</strong>
            <span>
              {slideshowIndex() !== null ? slideshowIndex()! + 1 : 0} / {presentationSlides().length}
            </span>
          </div>
          <div class="slideshow-chip">
            <span>← → move</span>
            <span>L laser</span>
            <span>Esc exit</span>
          </div>
          <div class="slideshow-actions">
            <button type="button" onClick={() => stepSlideshow(-1)} disabled={slideshowIndex() === 0}>
              Previous
            </button>
            <button
              type="button"
              onClick={() => stepSlideshow(1)}
              disabled={slideshowIndex() === null || slideshowIndex() === presentationSlides().length - 1}
            >
              Next
            </button>
            <button
              type="button"
              class={laserPointerEnabled() ? 'is-active' : undefined}
              onClick={() => {
                setLaserPointerEnabled((current) => {
                  const next = !current
                  if (!next) setLaserPointer(null)
                  return next
                })
              }}
            >
              Laser
            </button>
            <button type="button" onClick={stopSlideshow}>
              Exit
            </button>
          </div>
        </div>
      </Show>

      <div
        class={stageClass()}
        ref={stageRef}
        onPointerDown={handleStagePointerDown}
        onPointerMove={(event) => updateLaserPointerPosition(event.clientX, event.clientY)}
        onPointerLeave={hideLaserPointer}
        onWheel={handleWheel}
      >
        <div
          class="canvas-world"
          style={`transform: translate3d(${view().x}px, ${view().y}px, 0) scale(${view().zoom});`}
        >
          <For each={itemIds()}>
            {(itemId) => {
              const item = () => itemLookup().get(itemId)!
              const imageItem = () => {
                const current = item()
                return isImageItem(current) ? current : null
              }
              const webEmbedItem = () => {
                const current = item()
                return isWebEmbedItem(current) ? current : null
              }
              const slideItem = () => {
                const current = item()
                return isSlideItem(current) ? current : null
              }
              const strokeItem = () => {
                const current = item()
                return isStrokeCanvasItem(current) ? current : null
              }
              const textItem = () => {
                const current = item()
                return isTextCanvasItem(current) ? current : null
              }
              const isSelected = () => selectedIds().includes(itemId)
              const isEditing = () => editingId() === itemId
              const style = () => itemStyle(item())
              const isVisibleInSlideshow = () => !slideshowActive() || slideshowVisibleIds()?.has(itemId)

              return (
                <div
                  class={`canvas-item item-${item().type}${isSelected() ? ' is-selected' : ''}${isEditing() ? ' is-editing' : ''}${erasePreviewIdSet().has(itemId) ? ' is-erase-preview' : ''}${isVisibleInSlideshow() ? '' : ' is-slideshow-hidden'}`}
                  style={style()}
                  onPointerDown={(event) => handleItemPointerDown(event, item())}
                  onDblClick={(event) => {
                    if (isStrokeCanvasItem(item()) || isImageItem(item()) || isSlideItem(item()) || isWebEmbedItem(item())) return
                    event.stopPropagation()
                    setSelectedIds([itemId])
                    startTextEdit(itemId)
                  }}
                >
                  <Show when={item().type === 'diamond'}>
                    <div class="diamond-fill" />
                  </Show>

                  <Show
                    when={strokeItem()}
                    fallback={
                      <Show
                        when={imageItem()}
                        fallback={
                          <Show
                            when={webEmbedItem()}
                            fallback={
                              <Show
                                when={slideItem()}
                                fallback={
                                  <div
                                    ref={(element) => {
                                      itemContentRefs.set(itemId, element)
                                      scheduleFitItemHeight(itemId)
                                    }}
                                    class="item-content"
                                  >
                                    <RichTextItem
                                      content={textItem()?.content ?? createEmptyContent()}
                                      editable={isEditing()}
                                      placeholder="Double click to write"
                                      onContentChange={(content) => {
                                        if (!textItem()) return
                                        updateItem(itemId, { content })
                                      }}
                                      onLayoutChange={() => {
                                        scheduleFitItemHeight(itemId)
                                      }}
                                      onBlur={() => {
                                        scheduleFitItemHeight(itemId)
                                        if (editingId() === itemId) finishTextEdit()
                                      }}
                                    />
                                  </div>
                                }
                              >
                                {(slideItem) => (
                                  <div class="item-content">
                                    <div class="slide-frame-shell" aria-hidden="true">
                                      <span class="slide-frame-badge">Slide {slideOrderLookup().get(slideItem().id) ?? '?'}</span>
                                    </div>
                                  </div>
                                )}
                              </Show>
                            }
                          >
                            {(webEmbedItem) => {
                              const spec = () => webEmbedSpec(webEmbedItem().url)
                              return (
                                <div class="item-content">
                                  <div class="web-embed-shell">
                                    <div class="web-embed-toolbar">
                                      <Show
                                        when={isSelected()}
                                        fallback={
                                          <span class="web-embed-label">
                                            {spec() ? spec()!.providerLabel : 'Web embed'}
                                          </span>
                                        }
                                      >
                                        <input
                                          class="web-embed-url-input"
                                          type="url"
                                          value={webEmbedItem().url}
                                          placeholder="Paste a URL…"
                                          onPointerDown={(event) => event.stopPropagation()}
                                          onClick={(event) => event.stopPropagation()}
                                          onFocus={beginHistoryAction}
                                          onBlur={commitHistoryAction}
                                          onInput={(event) => updateWebEmbedUrl(webEmbedItem().id, event.currentTarget.value)}
                                        />
                                      </Show>
                                      <button
                                        class="web-embed-open-button"
                                        type="button"
                                        disabled={!spec()}
                                        onPointerDown={(event) => event.stopPropagation()}
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          if (!spec()) return
                                          openWebEmbedUrl(webEmbedItem().url)
                                        }}
                                      >
                                        Open
                                      </button>
                                    </div>
                                    <Show
                                      when={spec()}
                                      fallback={
                                        <div class="web-embed-placeholder">
                                          <strong>Paste a URL</strong>
                                          <span>
                                            {isSelected()
                                              ? 'Paste a website or supported social URL into the field above to turn this frame into a live embed.'
                                              : 'Select this frame to paste a website URL.'}
                                          </span>
                                        </div>
                                      }
                                    >
                                      {(spec) => (
                                        <WebEmbedContent
                                          spec={spec()}
                                          darkMode={resolvedTheme() === 'dark'}
                                        />
                                      )}
                                    </Show>
                                  </div>
                                </div>
                              )
                            }}
                          </Show>
                        }
                      >
                        {(imageItem) => (
                          <div class="item-content">
                            <img
                              class="image-item"
                              src={imageItem().src}
                              alt={imageItem().name ?? 'Pasted image'}
                              draggable={false}
                            />
                          </div>
                        )}
                      </Show>
                    }
                      >
                    {(strokeItem) => <StrokeItem item={strokeItem()} />}
                  </Show>

                  <Show
                    when={
                      !slideshowActive() && selectedIds().length === 1 && selectedIds()[0] === itemId && !isEditing() && canResize()
                    }
                  >
                    <button
                      class="resize-handle"
                      type="button"
                      aria-label="Resize item"
                      onPointerDown={(event) => handleResizePointerDown(event, item())}
                    />
                  </Show>
                </div>
              )
            }}
          </For>
          <Show when={draftShape()} keyed>
            {(draft) => (
              <div class={`canvas-item item-${draft.type} is-draft`} style={itemStyle(draft)}>
                <Show when={draft.type === 'diamond'}>
                  <div class="diamond-fill" />
                </Show>
                {isStrokeCanvasItem(draft) ? <StrokeItem item={draft} /> : <div class="item-content" />}
              </div>
            )}
          </Show>
          <Show when={selectedBounds()}>
            {(box) => (
              <div
                class="multi-selection-bounds"
                style={`transform: translate3d(${box().x}px, ${box().y}px, 0); width: ${box().w}px; height: ${box().h}px;`}
              />
            )}
          </Show>
          <Show when={marquee()}>
            {(box) => (
              <div
                class="area-selection"
                style={`transform: translate3d(${box().x}px, ${box().y}px, 0); width: ${box().w}px; height: ${box().h}px;`}
              />
            )}
          </Show>
        </div>

        <Show when={slideshowFocusRect()}>
          {(rect) => (
            <div
              class="slideshow-focus-frame"
              style={`transform: translate3d(${rect().x}px, ${rect().y}px, 0); width: ${rect().w}px; height: ${rect().h}px;`}
            />
          )}
        </Show>

      </div>

      <Portal>
        <Show when={slideshowActive() && laserPointerEnabled() && laserPointer()}>
          {(point) => (
            <div
              class="laser-pointer"
              style={`transform: translate3d(${point().x}px, ${point().y}px, 0);`}
            />
          )}
        </Show>
      </Portal>
    </main>
  )
}

export default App
