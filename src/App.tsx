import { For, Index, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import type { JSX } from 'solid-js'
import './App.css'

type ItemType = 'text' | 'note' | 'rect' | 'ellipse' | 'diamond'
type Tool = 'selection' | 'pan' | ItemType

type CanvasItem = {
  id: string
  type: ItemType
  x: number
  y: number
  w: number
  h: number
  text: string
  color: string
}

type Viewport = {
  x: number
  y: number
  zoom: number
}

type SavedNotebook = {
  items: CanvasItem[]
  view: Viewport
}

type WorkspaceMode = 'local' | 'shared'

type SharedStateResponse = {
  ok: boolean
  revision: number
  payload: SavedNotebook | null
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

const STORAGE_KEY = 'pencil-free-note:v1'

const TOOLS: { id: Tool; label: string; shortcut: string }[] = [
  { id: 'selection', label: 'Selection', shortcut: 'V' },
  { id: 'pan', label: 'Pan', shortcut: 'H' },
  { id: 'text', label: 'Text', shortcut: 'T' },
  { id: 'note', label: 'Note', shortcut: 'N' },
  { id: 'rect', label: 'Rect', shortcut: 'R' },
  { id: 'ellipse', label: 'Circle', shortcut: 'O' },
  { id: 'diamond', label: 'Diamond', shortcut: 'D' },
]

const PALETTE = ['#fff7c7', '#ffd8df', '#d7f2ff', '#d8f5dd', '#eadcff', '#ffe1bd']

const createId = () => `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const stableStringify = (notebook: SavedNotebook) => JSON.stringify(notebook)

const isItemTool = (value: Tool): value is ItemType =>
  ['text', 'note', 'rect', 'ellipse', 'diamond'].includes(value)

const unique = (values: string[]) => [...new Set(values)]

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

const defaultView = (): Viewport => ({
  x: typeof window === 'undefined' ? 180 : Math.max(80, window.innerWidth * 0.22),
  y: 120,
  zoom: 1,
})

const defaultItems = (): CanvasItem[] => [
  {
    id: createId(),
    type: 'note',
    x: 0,
    y: 0,
    w: 340,
    h: 260,
    color: '#fff7c7',
    text: '# 今日の自由ノート\n- ハイフン + スペースで箇条書き\n- [ ] チェックボックスも使える\n- **太字** と *斜体* と `code`\n> ダブルクリックで編集',
  },
  {
    id: createId(),
    type: 'text',
    x: 410,
    y: 48,
    w: 320,
    h: 190,
    color: '#ffffff',
    text: '## 使い方\nV: 範囲選択と移動\nH: キャンバス移動\nCtrl + ホイール: 拡大縮小\n図形ツールを選んでクリック: 追加\nDelete: 選択中を削除',
  },
  {
    id: createId(),
    type: 'ellipse',
    x: 180,
    y: 340,
    w: 260,
    h: 150,
    color: '#d7f2ff',
    text: 'ふわっと\nアイデア',
  },
  {
    id: createId(),
    type: 'diamond',
    x: 520,
    y: 330,
    w: 180,
    h: 180,
    color: '#ffd8df',
    text: 'あとで\n考える',
  },
]

const isCanvasItem = (item: unknown): item is CanvasItem => {
  if (!item || typeof item !== 'object') return false
  const value = item as Partial<CanvasItem>
  return (
    typeof value.id === 'string' &&
    ['text', 'note', 'rect', 'ellipse', 'diamond'].includes(value.type ?? '') &&
    typeof value.x === 'number' &&
    typeof value.y === 'number' &&
    typeof value.w === 'number' &&
    typeof value.h === 'number' &&
    typeof value.text === 'string' &&
    typeof value.color === 'string'
  )
}

const loadNotebook = (): SavedNotebook => {
  if (typeof localStorage === 'undefined') return { items: defaultItems(), view: defaultView() }

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { items: defaultItems(), view: defaultView() }

    const parsed = JSON.parse(raw) as Partial<SavedNotebook>
    const view = parsed.view

    if (
      Array.isArray(parsed.items) &&
      parsed.items.every(isCanvasItem) &&
      view &&
      typeof view.x === 'number' &&
      typeof view.y === 'number' &&
      typeof view.zoom === 'number'
    ) {
      return {
        items: parsed.items,
        view: { x: view.x, y: view.y, zoom: clamp(view.zoom, 0.25, 3) },
      }
    }
  } catch {
    return { items: defaultItems(), view: defaultView() }
  }

  return { items: defaultItems(), view: defaultView() }
}

const isEditableTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)

type ListLine = {
  kind: 'task' | 'bullet' | 'ordered'
  indent: number
  marker: string
  text: string
  done?: boolean
}

const indentWidth = (value: string) =>
  [...value].reduce((total, character) => total + (character === '\t' ? 2 : 1), 0)

const parseListLine = (line: string): ListLine | null => {
  const task = line.match(/^(\s*)[-*]\s+\[( |x|X)\]\s+(.*)$/)
  if (task) {
    return {
      kind: 'task',
      indent: Math.floor(indentWidth(task[1]) / 2),
      marker: '',
      text: task[3],
      done: task[2].toLowerCase() === 'x',
    }
  }

  const bullet = line.match(/^(\s*)[-*]\s+(.*)$/)
  if (bullet) {
    return {
      kind: 'bullet',
      indent: Math.floor(indentWidth(bullet[1]) / 2),
      marker: '•',
      text: bullet[2],
    }
  }

  const ordered = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/)
  if (ordered) {
    return {
      kind: 'ordered',
      indent: Math.floor(indentWidth(ordered[1]) / 2),
      marker: `${ordered[2]}.`,
      text: ordered[3],
    }
  }

  return null
}

const renderInline = (value: string): JSX.Element[] => {
  const nodes: JSX.Element[] = []
  const matcher = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = matcher.exec(value))) {
    if (match.index > cursor) nodes.push(value.slice(cursor, match.index))

    const token = match[0]
    if (token.startsWith('**')) {
      nodes.push(<strong>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('*')) {
      nodes.push(<em>{token.slice(1, -1)}</em>)
    } else {
      nodes.push(<code>{token.slice(1, -1)}</code>)
    }

    cursor = match.index + token.length
  }

  if (cursor < value.length) nodes.push(value.slice(cursor))
  return nodes.length ? nodes : ['']
}

const renderFormattedText = (text: string): JSX.Element[] => {
  const source = text.trimEnd()
  if (!source.trim()) return [<p class="empty-copy">Double click to write</p>]

  const blocks: JSX.Element[] = []
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      blocks.push(<div class="soft-break" />)
      index += 1
      continue
    }

    if (/^---+$/.test(trimmed)) {
      blocks.push(<hr />)
      index += 1
      continue
    }

    if (trimmed.startsWith('### ')) {
      blocks.push(<h4>{renderInline(trimmed.slice(4))}</h4>)
      index += 1
      continue
    }

    if (trimmed.startsWith('## ')) {
      blocks.push(<h3>{renderInline(trimmed.slice(3))}</h3>)
      index += 1
      continue
    }

    if (trimmed.startsWith('# ')) {
      blocks.push(<h2>{renderInline(trimmed.slice(2))}</h2>)
      index += 1
      continue
    }

    if (trimmed.startsWith('>')) {
      blocks.push(<blockquote>{renderInline(trimmed.replace(/^>\s?/, ''))}</blockquote>)
      index += 1
      continue
    }

    if (parseListLine(line)) {
      const listRows: ListLine[] = []
      while (index < lines.length) {
        const parsed = parseListLine(lines[index])
        if (!parsed) break
        listRows.push(parsed)
        index += 1
      }

      blocks.push(
        <div class="nested-list">
          {listRows.map((row) => (
            <div
              class={`nested-list-row row-${row.kind}${row.done ? ' is-done' : ''}`}
              style={`--list-indent: ${row.indent};`}
            >
              {row.kind === 'task' ? (
                <span class={row.done ? 'task-box is-checked' : 'task-box'} />
              ) : (
                <span class="list-marker">{row.marker}</span>
              )}
              <span>{renderInline(row.text)}</span>
            </div>
          ))}
        </div>,
      )
      continue
    }

    blocks.push(<p>{renderInline(trimmed)}</p>)
    index += 1
  }

  return blocks
}

const typeLabel = (type: ItemType) =>
  ({
    text: 'Text frame',
    note: 'Sticky note',
    rect: 'Rectangle',
    ellipse: 'Circle',
    diamond: 'Diamond',
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

  if (props.tool === 'rect' || props.tool === 'note') {
    return (
      <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="6" width="14" height="12" rx={props.tool === 'note' ? '3' : '1.5'} />
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

function App() {
  const saved = loadNotebook()
  const [items, setItems] = createSignal<CanvasItem[]>(saved.items)
  const [view, setView] = createSignal<Viewport>(saved.view)
  const [workspaceMode, setWorkspaceMode] = createSignal<WorkspaceMode>('local')
  const [tool, setTool] = createSignal<Tool>('selection')
  const [selectedIds, setSelectedIds] = createSignal<string[]>(items()[0] ? [items()[0].id] : [])
  const [editingId, setEditingId] = createSignal<string | null>(null)
  const [interaction, setInteraction] = createSignal<Interaction | null>(null)
  const [saveState, setSaveState] = createSignal('autosaved locally')
  const [shareState, setShareState] = createSignal('start with pnpm share on your LAN')
  const shareClientId = createId()
  let applyingRemote = false
  let remoteRevision = 0
  let lastSharedSignature = ''
  let pollTimer: number | undefined
  let pushTimer: number | undefined
  let stageRef!: HTMLDivElement

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
  const stageClass = createMemo(() =>
    [
      'canvas-stage',
      tool() === 'pan' ? 'tool-pan' : 'tool-selection',
      interaction()?.kind === 'pan' ? 'is-panning' : '',
      interaction()?.kind === 'selectArea' ? 'is-selecting' : '',
    ]
      .filter(Boolean)
      .join(' '),
  )

  createEffect(() => {
    if (workspaceMode() !== 'local' || applyingRemote) return

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: items(), view: view() }))
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

  const updateItem = (id: string, patch: Partial<CanvasItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  const updateSelectedItems = (patch: Partial<CanvasItem>) => {
    const ids = new Set(selectedIds())
    setItems((current) => current.map((item) => (ids.has(item.id) ? { ...item, ...patch } : item)))
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

      if (result.payload && result.revision > remoteRevision) {
        remoteRevision = result.revision
        lastSharedSignature = stableStringify(result.payload)
        applyRemoteNotebook(result.payload)
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
      const payload = result.payload ?? { items: [], view: defaultView() }

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

  const createItem = (nextTool: ItemType, point: Point): CanvasItem => {
    const index = items().length
    const base = {
      id: createId(),
      type: nextTool,
      x: point.x,
      y: point.y,
      text: '',
      color: PALETTE[index % PALETTE.length],
    }

    if (nextTool === 'text') {
      return { ...base, x: point.x - 20, y: point.y - 20, w: 320, h: 190, color: '#ffffff' }
    }
    if (nextTool === 'note') {
      return { ...base, x: point.x - 140, y: point.y - 95, w: 280, h: 210 }
    }
    if (nextTool === 'rect') {
      return { ...base, x: point.x - 105, y: point.y - 65, w: 210, h: 130, color: '#d8f5dd' }
    }
    if (nextTool === 'ellipse') {
      return { ...base, x: point.x - 110, y: point.y - 75, w: 220, h: 150, color: '#d7f2ff' }
    }
    return { ...base, x: point.x - 90, y: point.y - 90, w: 180, h: 180, color: '#ffd8df' }
  }

  const placeItem = (nextTool: ItemType, point: Point) => {
    const item = createItem(nextTool, point)
    setItems((current) => [...current, item])
    setSelectedIds([item.id])
    setTool('selection')
    if (nextTool === 'text' || nextTool === 'note') setEditingId(item.id)
  }

  const deleteSelected = () => {
    const ids = new Set(selectedIds())
    if (!ids.size) return
    setItems((current) => current.filter((item) => !ids.has(item.id)))
    setSelectedIds([])
    setEditingId(null)
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
  }

  const handleStagePointerDown = (event: PointerEvent & { currentTarget: HTMLDivElement }) => {
    if (event.button !== 0 || isEditableTarget(event.target)) return

    const currentTool = tool()

    if (isItemTool(currentTool)) {
      placeItem(currentTool, screenToWorld(event.clientX, event.clientY))
      return
    }

    if (currentTool === 'pan') {
      startPan(event)
      return
    }

    const additive = event.shiftKey || event.metaKey || event.ctrlKey
    const startWorld = screenToWorld(event.clientX, event.clientY)

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
    const dragSet = new Set(dragIds)

    setSelectedIds(dragIds)
    setEditingId((current) => (current === item.id ? current : null))
    setInteraction({
      kind: 'drag',
      pointerId: event.pointerId,
      ids: dragIds,
      startWorld: screenToWorld(event.clientX, event.clientY),
      origins: items()
        .filter((entry) => dragSet.has(entry.id))
        .map((entry) => ({ id: entry.id, x: entry.x, y: entry.y })),
    })
  }

  const handleResizePointerDown = (
    event: PointerEvent & { currentTarget: HTMLButtonElement },
    item: CanvasItem,
  ) => {
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

    if (active.kind === 'selectArea') {
      const box = normalizeBox(active.startWorld, active.currentWorld)
      if (box.w < 4 && box.h < 4) {
        setSelectedIds(active.additive ? active.previousIds : [])
      }
    }

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

  const handleEditorKeyDown = (
    event: KeyboardEvent & { currentTarget: HTMLTextAreaElement },
    item: CanvasItem,
  ) => {
    if (event.key === 'Tab') {
      event.preventDefault()

      const editor = event.currentTarget
      const value = editor.value
      const selectionStart = editor.selectionStart
      const selectionEnd = editor.selectionEnd
      const blockStart = value.lastIndexOf('\n', selectionStart - 1) + 1
      const nextBreak = value.indexOf('\n', selectionEnd)
      const blockEnd = nextBreak === -1 ? value.length : nextBreak
      const block = value.slice(blockStart, blockEnd)
      const lines = block.split('\n')
      const updatedLines = lines.map((line) => {
        if (!event.shiftKey) return `  ${line}`
        if (line.startsWith('  ')) return line.slice(2)
        if (line.startsWith('\t')) return line.slice(1)
        if (line.startsWith(' ')) return line.slice(1)
        return line
      })
      const updatedBlock = updatedLines.join('\n')
      const nextText = `${value.slice(0, blockStart)}${updatedBlock}${value.slice(blockEnd)}`

      updateItem(item.id, { text: nextText })
      requestAnimationFrame(() => {
        if (selectionStart === selectionEnd) {
          const cursorDelta = updatedLines[0].length - lines[0].length
          const nextCursor = Math.max(blockStart, selectionStart + cursorDelta)
          editor.selectionStart = nextCursor
          editor.selectionEnd = nextCursor
          return
        }

        editor.selectionStart = blockStart
        editor.selectionEnd = blockStart + updatedBlock.length
      })
      return
    }

    if (event.key !== 'Enter' || event.currentTarget.selectionStart !== event.currentTarget.selectionEnd) return

    const editor = event.currentTarget
    const cursor = editor.selectionStart
    const value = editor.value
    const lineStart = value.lastIndexOf('\n', cursor - 1) + 1
    const line = value.slice(lineStart, cursor)
    const emptyListItem = line.match(/^(\s*(?:[-*]|\d+[.)])(?:\s+\[(?: |x|X)\])?\s*)$/)

    if (emptyListItem) {
      event.preventDefault()
      const nextText = `${value.slice(0, lineStart)}${value.slice(cursor)}`
      updateItem(item.id, { text: nextText })
      requestAnimationFrame(() => {
        editor.selectionStart = lineStart
        editor.selectionEnd = lineStart
      })
      return
    }

    const taskPrefix = line.match(/^(\s*[-*]\s+\[(?: |x|X)\]\s+)/)
    const bulletPrefix = line.match(/^(\s*[-*]\s+)/)
    const orderedPrefix = line.match(/^(\s*)(\d+)([.)]\s+)/)
    const nextPrefix = taskPrefix
      ? taskPrefix[1].replace(/\[(?:x|X)\]/, '[ ]')
      : orderedPrefix
        ? `${orderedPrefix[1]}${Number(orderedPrefix[2]) + 1}${orderedPrefix[3]}`
        : bulletPrefix?.[1]

    if (!nextPrefix) return

    event.preventDefault()
    const inserted = `\n${nextPrefix}`
    const nextText = `${value.slice(0, cursor)}${inserted}${value.slice(cursor)}`
    updateItem(item.id, { text: nextText })
    requestAnimationFrame(() => {
      const nextCursor = cursor + inserted.length
      editor.selectionStart = nextCursor
      editor.selectionEnd = nextCursor
    })
  }

  onMount(() => {
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('pagehide', sendShareLeave)
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
            onClick={leaveSharedMode}
          >
            Local notes
          </button>
          <button
            class={workspaceMode() === 'shared' ? 'workspace-tab is-active' : 'workspace-tab'}
            type="button"
            onClick={() => void enterSharedMode()}
          >
            Local net share
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
          <button type="button" onClick={duplicateSelected} disabled={selectedCount() === 0}>
            Duplicate
          </button>
          <button type="button" onClick={deleteSelected} disabled={selectedCount() === 0}>
            Delete
          </button>
        </div>
      </section>

      <section class="inspector" aria-label="Selected item">
        <Show
          when={selectedCount() > 0}
          fallback={
            <>
              <p class="eyebrow">Format hints</p>
              <h1>Markdown-ish</h1>
              <p class="hint-copy">
                V: selection, H: pan. Drag empty space in selection mode to select an area.
              </p>
            </>
          }
        >
          <>
            <p class="eyebrow">Selected</p>
            <h1>{selectedItem() ? typeLabel(selectedItem()!.type) : `${selectedCount()} items`}</h1>
            <label class="color-control">
              <span>Color</span>
              <input
                type="color"
                value={selectedItems()[0]?.color ?? '#fff7c7'}
                onInput={(event) => updateSelectedItems({ color: event.currentTarget.value })}
              />
            </label>
            <p class="hint-copy">Drag selected items to move together. Resize is available for one item.</p>
          </>
        </Show>
      </section>

      <section class="zoom-controls" aria-label="Zoom and view controls" onPointerDown={(event) => event.stopPropagation()}>
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
          <Index each={items()}>
            {(item) => (
              <div
                class={`canvas-item item-${item().type}${
                  selectedIds().includes(item().id) ? ' is-selected' : ''
                }${editingId() === item().id ? ' is-editing' : ''}`}
                style={`transform: translate3d(${item().x}px, ${item().y}px, 0); width: ${item().w}px; height: ${item().h}px; --item-color: ${item().color};`}
                onPointerDown={(event) => handleItemPointerDown(event, item())}
                onDblClick={(event) => {
                  event.stopPropagation()
                  setSelectedIds([item().id])
                  setEditingId(item().id)
                }}
              >
                <Show when={item().type === 'diamond'}>
                  <div class="diamond-fill" />
                </Show>

                <div class={editingId() === item().id ? 'item-content has-live-preview' : 'item-content'}>
                  <Show
                    when={editingId() === item().id}
                    fallback={<div class="formatted-text">{renderFormattedText(item().text)}</div>}
                  >
                    <div class="editor-shell">
                      <label class="editor-pane">
                        <span>Markdown</span>
                        <textarea
                          ref={(element) => {
                            requestAnimationFrame(() => {
                              element.focus()
                              element.setSelectionRange(element.value.length, element.value.length)
                            })
                          }}
                          class="note-editor"
                          value={item().text}
                          spellcheck={false}
                          onInput={(event) => updateItem(item().id, { text: event.currentTarget.value })}
                          onKeyDown={(event) => handleEditorKeyDown(event, item())}
                          onPointerDown={(event) => event.stopPropagation()}
                          onBlur={() => setEditingId((current) => (current === item().id ? null : current))}
                        />
                      </label>
                      <div class="preview-pane" aria-label="Live Markdown preview">
                        <span>Preview</span>
                        <div class="formatted-text">{renderFormattedText(item().text)}</div>
                      </div>
                    </div>
                  </Show>
                </div>

                <Show when={selectedIds().length === 1 && selectedIds()[0] === item().id && editingId() !== item().id}>
                  <button
                    class="resize-handle"
                    type="button"
                    aria-label="Resize item"
                    onPointerDown={(event) => handleResizePointerDown(event, item())}
                  />
                </Show>
              </div>
            )}
          </Index>
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
