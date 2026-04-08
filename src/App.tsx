import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import './App.css'
import { RichTextItem } from './RichTextItem'
import {
  createDefaultItemStyle,
  createEmptyContent,
  isPathItem,
  isTextCanvasItem,
  normalizeStoredNotebook,
  type CanvasItem,
  type FontFamily,
  type FontSize,
  type ItemStyle,
  type ItemType,
  type PathCanvasItem,
  type SavedNotebook,
  type StrokeStyle,
  type StrokeWidth,
  type TextAlign,
  type Viewport,
} from './notebook'
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

type ShapeTool = 'rect' | 'ellipse' | 'diamond'
type Tool = 'selection' | 'pan' | 'pencil' | 'eraser' | 'text' | ShapeTool
type WorkspaceMode = 'local' | 'shared'

type SharedStateResponse = {
  ok: boolean
  revision: number
  payload: unknown | null
  clients: number
  empty: boolean
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
  { id: 'eraser', label: 'Eraser', shortcut: 'E' },
  { id: 'text', label: 'Text', shortcut: 'T' },
  { id: 'rect', label: 'Rect', shortcut: 'R' },
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
const stableStringify = (notebook: SavedNotebook) => JSON.stringify(notebook)
const unique = (values: string[]) => [...new Set(values)]

const isShapeTool = (value: Tool): value is ShapeTool => ['rect', 'ellipse', 'diamond'].includes(value)

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

const createPathItemFromPoints = (id: string, points: Point[], style: ItemStyle): PathCanvasItem => {
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
    type: 'path',
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

const typeLabel = (type: ItemType) =>
  ({
    text: 'Text frame',
    note: 'Sticky note',
    rect: 'Rectangle',
    ellipse: 'Circle',
    diamond: 'Diamond',
    path: 'Stroke',
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

  return (
    <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 18h12" />
      <path d="M9 6h6" />
      <path d="M12 6v12" />
    </svg>
  )
}

const PathStroke = (props: { item: PathCanvasItem }) => {
  const isDot = createMemo(() => {
    const first = props.item.points[0]
    return props.item.points.every((point) => distance(point, first) < 0.4)
  })

  const points = createMemo(() => props.item.points.map((point) => `${point.x},${point.y}`).join(' '))
  const center = createMemo(() => props.item.points[0])

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
            fill={props.item.stroke}
          />
        }
      >
        <polyline points={points()} />
      </Show>
    </svg>
  )
}

function App() {
  const saved = loadNotebook()
  const [items, setItems] = createSignal<CanvasItem[]>(saved.items)
  const [view, setView] = createSignal<Viewport>(saved.view)
  const [workspaceMode, setWorkspaceMode] = createSignal<WorkspaceMode>('local')
  const [themeMode, setThemeMode] = createSignal<ThemeMode>(loadThemeMode())
  const [systemTheme, setSystemTheme] = createSignal<ResolvedTheme>(getSystemTheme())
  const [tool, setTool] = createSignal<Tool>('selection')
  const [selectedIds, setSelectedIds] = createSignal<string[]>([])
  const [editingId, setEditingId] = createSignal<string | null>(null)
  const [interaction, setInteraction] = createSignal<Interaction | null>(null)
  const [erasePreviewIds, setErasePreviewIds] = createSignal<string[]>([])
  const [saveState, setSaveState] = createSignal('autosaved locally')
  const [shareState, setShareState] = createSignal('start with pnpm share on your LAN')
  const shareClientId = createId()
  let applyingRemote = false
  let remoteRevision = 0
  let lastSharedSignature = ''
  let pollTimer: number | undefined
  let pushTimer: number | undefined
  let stageRef!: HTMLDivElement
  const itemContentRefs = new Map<string, HTMLDivElement>()

  const selectedItems = createMemo(() => {
    const ids = new Set(selectedIds())
    return items().filter((item) => ids.has(item.id))
  })
  const selectedItem = createMemo(() => (selectedItems().length === 1 ? selectedItems()[0] : undefined))
  const selectedCount = createMemo(() => selectedItems().length)
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
  const selectedPathItems = createMemo(() => selectedItems().filter(isPathItem))
  const erasePreviewIdSet = createMemo(() => new Set(erasePreviewIds()))
  const resolvedTheme = createMemo<ResolvedTheme>(() => resolveTheme(themeMode(), systemTheme()))
  const draftShape = createMemo(() => {
    const active = interaction()
    if (active?.kind !== 'createShape') return null

    const box = shapeBoxFromDrag(active.type, active.startWorld, active.currentWorld)
    if (!isShapeBoxVisible(box)) return null

    return {
      id: 'shape-draft',
      type: active.type,
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      content: createEmptyContent(),
      ...createDefaultItemStyle(active.type),
    } as CanvasItem
  })
  const canEditText = createMemo(() => selectedTextItems().length === selectedItems().length && selectedItems().length > 0)
  const canChangeFill = createMemo(() => selectedTextItems().length > 0)
  const canResize = createMemo(() => selectedItem() && !isPathItem(selectedItem()!))
  const inspectorStroke = createMemo(() => selectedItems()[0]?.stroke ?? '#1f1f1f')
  const inspectorFill = createMemo(() => selectedTextItems()[0]?.color ?? 'transparent')
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
      interaction()?.kind === 'pan' ? 'is-panning' : '',
      interaction()?.kind === 'selectArea' ? 'is-selecting' : '',
    ]
      .filter(Boolean)
      .join(' '),
  )

  createEffect(() => {
    if (workspaceMode() !== 'local' || applyingRemote) return

    try {
      localStorage.setItem(STORAGE_KEY_V2, JSON.stringify({ items: items(), view: view() }))
      setSaveState('autosaved locally')
    } catch {
      setSaveState('storage unavailable')
    }
  })

  createEffect(() => {
    if (workspaceMode() !== 'shared') return

    const payload = { items: items(), view: view() }
    const signature = stableStringify(payload)
    if (applyingRemote || signature === lastSharedSignature) return

    lastSharedSignature = signature
    window.clearTimeout(pushTimer)
    pushTimer = window.setTimeout(() => {
      void pushSharedState(payload)
    }, 140)
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

  const updateItem = (id: string, patch: Partial<CanvasItem>) => {
    setItems((current) =>
      current.map((item): CanvasItem => (item.id === id ? ({ ...item, ...patch } as CanvasItem) : item)),
    )
  }

  const updateSelectedItemsWhere = (predicate: (item: CanvasItem) => boolean, patch: Partial<CanvasItem>) => {
    const ids = new Set(selectedIds())
    setItems((current) =>
      current.map((item): CanvasItem =>
        ids.has(item.id) && predicate(item) ? ({ ...item, ...patch } as CanvasItem) : item,
      ),
    )
  }

  const updateSelectedItems = (patch: Partial<CanvasItem>) => updateSelectedItemsWhere(() => true, patch)

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
    setItems((current) => current.filter((item) => !eraseSet.has(item.id)))
    setErasePreviewIds([])
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

  const clearShareTimers = () => {
    window.clearInterval(pollTimer)
    window.clearTimeout(pushTimer)
    pollTimer = undefined
    pushTimer = undefined
  }

  const applyRemoteNotebook = (payload: SavedNotebook) => {
    applyingRemote = true
    setItems(payload.items)
    setView(payload.view)
    setSelectedIds([])
    setEditingId(null)
    setErasePreviewIds([])
    setInteraction(null)
    queueMicrotask(() => {
      applyingRemote = false
    })
  }

  const fetchSharedState = async () => {
    const response = await fetch(`/api/localnet/state?client=${encodeURIComponent(shareClientId)}`, {
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`Local net share returned ${response.status}`)
    return (await response.json()) as SharedStateResponse
  }

  const pushSharedState = async (payload: SavedNotebook) => {
    try {
      const response = await fetch('/api/localnet/state', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client: shareClientId, payload }),
      })
      if (!response.ok) throw new Error(`Local net share returned ${response.status}`)

      const result = (await response.json()) as SharedStateResponse
      remoteRevision = result.revision
      setShareState(`${result.clients} peer${result.clients === 1 ? '' : 's'} connected`)
    } catch {
      setShareState('share server disconnected')
    }
  }

  const pollSharedState = async () => {
    try {
      const result = await fetchSharedState()
      setShareState(`${result.clients} peer${result.clients === 1 ? '' : 's'} connected`)

      const payload = result.payload ? normalizeStoredNotebook(result.payload) : null

      if (payload && result.revision > remoteRevision) {
        remoteRevision = result.revision
        lastSharedSignature = stableStringify(payload)
        applyRemoteNotebook(payload)
      }
    } catch {
      setShareState('share server unavailable')
      clearShareTimers()
      applyRemoteNotebook(loadNotebook())
      setWorkspaceMode('local')
    }
  }

  const enterSharedMode = async () => {
    if (workspaceMode() === 'shared') return

    setShareState('connecting to local net share...')
    try {
      const result = await fetchSharedState()
      const payload = result.payload
        ? normalizeStoredNotebook(result.payload) ?? { items: [], view: defaultView() }
        : { items: [], view: defaultView() }

      remoteRevision = result.revision
      lastSharedSignature = stableStringify(payload)
      setWorkspaceMode('shared')
      applyRemoteNotebook(payload)
      setTool('selection')
      setShareState(`${result.clients} peer${result.clients === 1 ? '' : 's'} connected`)
      clearShareTimers()
      pollTimer = window.setInterval(() => {
        void pollSharedState()
      }, 650)
    } catch {
      setWorkspaceMode('local')
      setShareState('run pnpm share, then open the LAN URL')
    }
  }

  const leaveSharedMode = () => {
    if (workspaceMode() === 'local') return

    sendShareLeave()
    clearShareTimers()
    applyRemoteNotebook(loadNotebook())
    setTool('selection')
    setShareState('left local net share')
    setWorkspaceMode('local')
  }

  const sendShareLeave = () => {
    if (workspaceMode() !== 'shared') return
    const body = JSON.stringify({ client: shareClientId })
    navigator.sendBeacon?.('/api/localnet/leave', new Blob([body], { type: 'application/json' }))
  }

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

  const createShapeItem = (type: ShapeTool, startWorld: Point, endWorld: Point): CanvasItem | null => {
    const box = shapeBoxFromDrag(type, startWorld, endWorld)
    if (!isShapeBoxVisible(box)) return null

    return {
      id: createId(),
      type,
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      content: createEmptyContent(),
      ...createDefaultItemStyle(type),
    }
  }

  const placeTextItem = (point: Point) => {
    const item = createTextItem(point)
    setItems((current) => [...current, item])
    setSelectedIds([item.id])
    setTool('selection')
    setEditingId(item.id)
  }

  const startDraw = (event: PointerEvent & { currentTarget: HTMLDivElement }) => {
    const point = screenToWorld(event.clientX, event.clientY)
    const style = createDefaultItemStyle('path')
    const item = createPathItemFromPoints(createId(), [point], style)
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
    setItems((current) => current.filter((item) => !ids.has(item.id)))
    setSelectedIds([])
    setEditingId(null)
    setErasePreviewIds([])
  }

  const duplicateSelected = () => {
    const selection = selectedItems()
    if (!selection.length) return

    const duplicated = selection.map((item) => ({
      ...item,
      id: createId(),
      x: item.x + 32,
      y: item.y + 32,
    }))

    setItems((current) => [...current, ...duplicated])
    setSelectedIds(duplicated.map((item) => item.id))
    setEditingId(null)
  }

  const resetView = () => setView(defaultView())

  const clearBoard = () => {
    if (!confirm('キャンバス上のノートをすべて削除しますか？')) return
    setItems([])
    setSelectedIds([])
    setEditingId(null)
    setErasePreviewIds([])
  }

  const handleStagePointerDown = (event: PointerEvent & { currentTarget: HTMLDivElement }) => {
    if (event.button !== 0 || isEditableTarget(event.target)) return
    setErasePreviewIds([])

    const currentTool = tool()

    if (currentTool === 'pencil') {
      setEditingId(null)
      startDraw(event)
      return
    }

    if (currentTool === 'eraser') {
      setEditingId(null)
      setSelectedIds([])
      startErase(event)
      return
    }

    if (currentTool === 'text') {
      placeTextItem(screenToWorld(event.clientX, event.clientY))
      return
    }

    if (isShapeTool(currentTool)) {
      setEditingId(null)
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
      setEditingId(null)
      startSelectedItemsDrag(event, selectedIds(), startWorld)
      return
    }

    setEditingId(null)
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
    if (event.button !== 0 || editingId() === item.id || isEditableTarget(event.target)) return

    const currentTool = tool()
    if (currentTool === 'pan') {
      event.stopPropagation()
      setEditingId(null)
      startPan(event)
      return
    }

    if (currentTool !== 'selection') return

    event.stopPropagation()
    const additive = event.shiftKey || event.metaKey || event.ctrlKey
    const currentIds = selectedIds()
    const nextIds = currentIds.includes(item.id)
      ? currentIds
      : additive
        ? [...currentIds, item.id]
        : [item.id]
    const dragIds = unique(nextIds)

    setSelectedIds(dragIds)
    setEditingId((current) => (current === item.id ? current : null))
    startSelectedItemsDrag(event, dragIds, screenToWorld(event.clientX, event.clientY))
  }

  const handleResizePointerDown = (
    event: PointerEvent & { currentTarget: HTMLButtonElement },
    item: CanvasItem,
  ) => {
    if (isPathItem(item)) return
    event.stopPropagation()
    setSelectedIds([item.id])
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
        setItems((current) => [...current, item])
        setSelectedIds([item.id])
        setTool('selection')
        setEditingId(null)
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

    setInteraction(null)
  }

  const handleWheel = (event: WheelEvent & { currentTarget: HTMLDivElement }) => {
    event.preventDefault()

    if (event.ctrlKey || event.metaKey) {
      const factor = Math.exp(-event.deltaY * 0.001)
      zoomAt(event.clientX, event.clientY, view().zoom * factor)
      return
    }

    setView((current) => ({
      ...current,
      x: current.x - event.deltaX,
      y: current.y - event.deltaY,
    }))
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (isEditableTarget(event.target)) {
      if (event.key === 'Escape') setEditingId(null)
      return
    }

    if (event.key === 'Escape') {
      setTool('selection')
      setSelectedIds([])
      setEditingId(null)
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
      `--item-fill: ${item.color}`,
      `--item-stroke: ${item.stroke}`,
      `--item-stroke-width: ${strokeWidthPx(item.strokeWidth)}px`,
      `--item-stroke-style: ${item.strokeStyle}`,
      `--item-stroke-dash: ${strokeDasharray(item.strokeStyle)}`,
      `--item-font-size: ${fontSizePx(item.fontSize)}px`,
      `--item-font-family: ${fontFamilyValue(item.fontFamily)}`,
      `--item-text-align: ${item.textAlign}`,
    ].join('; ')

  onMount(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleThemeChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light')
    }

    setSystemTheme(media.matches ? 'dark' : 'light')
    media.addEventListener('change', handleThemeChange)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('pagehide', sendShareLeave)

    onCleanup(() => {
      media.removeEventListener('change', handleThemeChange)
    })
  })

  onCleanup(() => {
    clearShareTimers()
    if (workspaceMode() === 'shared') sendShareLeave()
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
    window.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('pagehide', sendShareLeave)
  })

  return (
    <main class="notebook-app">
      <section class="toolbar" aria-label="Canvas tools" onPointerDown={(event) => event.stopPropagation()}>
        <div class="brand-mark">
          <strong>pencil note</strong>
          <span>{workspaceMode() === 'shared' ? shareState() : saveState()}</span>
        </div>

        <div class="workspace-tabs" aria-label="Notebook workspace">
          <button
            class={workspaceMode() === 'local' ? 'workspace-tab is-active' : 'workspace-tab'}
            type="button"
            title="Local notes"
            aria-label="Local notes"
            onClick={leaveSharedMode}
          >
            L
          </button>
          <button
            class={workspaceMode() === 'shared' ? 'workspace-tab is-active' : 'workspace-tab'}
            type="button"
            title="Local net share"
            aria-label="Local net share"
            onClick={() => void enterSharedMode()}
          >
            N
          </button>
        </div>

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

      <section class={selectedCount() > 0 ? 'inspector' : 'inspector is-empty'} aria-label="Selected item settings">
        <Show
          when={selectedCount() > 0}
          fallback={
            <>
              <p class="eyebrow">Tools</p>
              <h1>Canvas styles</h1>
              <p class="hint-copy">
                R / O / D: drag to create shapes. P: pencil, E: eraser.
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
                        onClick={() => updateSelectedItemsWhere(isTextCanvasItem, { color: option.value })}
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

            <p class="hint-copy">
              {selectedPathItems().length
                ? 'Paths support stroke controls. Text options apply to text and shape items.'
                : 'Double click a text-capable item to edit. Shape defaults are black stroke on transparent fill.'}
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
          <button type="button" onClick={clearBoard}>
            Clear
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

      <div
        class={stageClass()}
        ref={stageRef}
        onPointerDown={handleStagePointerDown}
        onWheel={handleWheel}
      >
        <div
          class="canvas-world"
          style={`transform: translate3d(${view().x}px, ${view().y}px, 0) scale(${view().zoom});`}
        >
          <For each={items()}>
            {(item) => {
              const isSelected = () => selectedIds().includes(item.id)
              const isEditing = () => editingId() === item.id
              const style = () => itemStyle(item)

              return (
                <div
                  class={`canvas-item item-${item.type}${isSelected() ? ' is-selected' : ''}${isEditing() ? ' is-editing' : ''}${erasePreviewIdSet().has(item.id) ? ' is-erase-preview' : ''}`}
                  style={style()}
                  onPointerDown={(event) => handleItemPointerDown(event, item)}
                  onDblClick={(event) => {
                    if (isPathItem(item)) return
                    event.stopPropagation()
                    setSelectedIds([item.id])
                    setEditingId(item.id)
                  }}
                >
                  <Show when={item.type === 'diamond'}>
                    <div class="diamond-fill" />
                  </Show>

                  <Show
                    when={isPathItem(item)}
                    fallback={
                      <div
                        ref={(element) => {
                          itemContentRefs.set(item.id, element)
                          scheduleFitItemHeight(item.id)
                        }}
                        class="item-content"
                      >
                        <RichTextItem
                          content={isTextCanvasItem(item) ? item.content : createEmptyContent()}
                          editable={isEditing()}
                          placeholder="Double click to write"
                          onContentChange={(content) => {
                            if (!isTextCanvasItem(item)) return
                            updateItem(item.id, { content })
                          }}
                          onLayoutChange={() => {
                            scheduleFitItemHeight(item.id)
                          }}
                          onBlur={() => {
                            scheduleFitItemHeight(item.id)
                            setEditingId((current) => (current === item.id ? null : current))
                          }}
                        />
                      </div>
                    }
                  >
                    <PathStroke item={item as PathCanvasItem} />
                  </Show>

                  <Show when={selectedIds().length === 1 && selectedIds()[0] === item.id && !isEditing() && canResize()}>
                    <button
                      class="resize-handle"
                      type="button"
                      aria-label="Resize item"
                      onPointerDown={(event) => handleResizePointerDown(event, item)}
                    />
                  </Show>
                </div>
              )
            }}
          </For>
          <Show when={draftShape()}>
            {(item) => (
              <div class={`canvas-item item-${item().type} is-draft`} style={itemStyle(item())}>
                <Show when={item().type === 'diamond'}>
                  <div class="diamond-fill" />
                </Show>
                <div class="item-content" />
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
      </div>
    </main>
  )
}

export default App
