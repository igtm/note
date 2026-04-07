import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import type { JSX } from 'solid-js'
import './App.css'

type ItemType = 'text' | 'note' | 'rect' | 'ellipse' | 'diamond'
type Tool = 'select' | ItemType

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

type Point = {
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
      id: string
      startWorld: Point
      originX: number
      originY: number
    }
  | {
      kind: 'resize'
      pointerId: number
      id: string
      startWorld: Point
      originW: number
      originH: number
    }

const STORAGE_KEY = 'pencil-free-note:v1'

const TOOLS: { id: Tool; label: string; shortcut: string }[] = [
  { id: 'select', label: 'Select', shortcut: 'V' },
  { id: 'text', label: 'Text', shortcut: 'T' },
  { id: 'note', label: 'Note', shortcut: 'N' },
  { id: 'rect', label: 'Rect', shortcut: 'R' },
  { id: 'ellipse', label: 'Circle', shortcut: 'O' },
  { id: 'diamond', label: 'Diamond', shortcut: 'D' },
]

const PALETTE = ['#fff7c7', '#ffd8df', '#d7f2ff', '#d8f5dd', '#eadcff', '#ffe1bd']

const createId = () => `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

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
    text: '## 使い方\n空いている場所をドラッグ: 移動\nCtrl + ホイール: 拡大縮小\n図形ツールを選んでクリック: 追加\nDelete: 選択中を削除',
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

const isTaskLine = (line: string) => /^[-*]\s+\[( |x|X)\]\s+/.test(line)
const isBulletLine = (line: string) => /^[-*]\s+/.test(line) && !isTaskLine(line)
const isOrderedLine = (line: string) => /^\d+[.)]\s+/.test(line)

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

    if (isTaskLine(trimmed)) {
      const tasks: JSX.Element[] = []
      while (index < lines.length && isTaskLine(lines[index].trim())) {
        const match = lines[index].trim().match(/^[-*]\s+\[( |x|X)\]\s+(.*)$/)
        if (match) {
          const done = match[1].toLowerCase() === 'x'
          tasks.push(
            <li class={done ? 'is-done' : ''}>
              <span class={done ? 'task-box is-checked' : 'task-box'} />
              <span>{renderInline(match[2])}</span>
            </li>,
          )
        }
        index += 1
      }
      blocks.push(<ul class="task-list">{tasks}</ul>)
      continue
    }

    if (isBulletLine(trimmed)) {
      const bullets: JSX.Element[] = []
      while (index < lines.length && isBulletLine(lines[index].trim())) {
        bullets.push(<li>{renderInline(lines[index].trim().replace(/^[-*]\s+/, ''))}</li>)
        index += 1
      }
      blocks.push(<ul>{bullets}</ul>)
      continue
    }

    if (isOrderedLine(trimmed)) {
      const ordered: JSX.Element[] = []
      while (index < lines.length && isOrderedLine(lines[index].trim())) {
        ordered.push(<li>{renderInline(lines[index].trim().replace(/^\d+[.)]\s+/, ''))}</li>)
        index += 1
      }
      blocks.push(<ol>{ordered}</ol>)
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

function App() {
  const saved = loadNotebook()
  const [items, setItems] = createSignal<CanvasItem[]>(saved.items)
  const [view, setView] = createSignal<Viewport>(saved.view)
  const [tool, setTool] = createSignal<Tool>('select')
  const [selectedId, setSelectedId] = createSignal<string | null>(items()[0]?.id ?? null)
  const [editingId, setEditingId] = createSignal<string | null>(null)
  const [interaction, setInteraction] = createSignal<Interaction | null>(null)
  const [saveState, setSaveState] = createSignal('autosaved locally')
  let stageRef!: HTMLDivElement

  const selectedItem = createMemo(() => items().find((item) => item.id === selectedId()))
  const zoomLabel = createMemo(() => `${Math.round(view().zoom * 100)}%`)

  createEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: items(), view: view() }))
      setSaveState('autosaved locally')
    } catch {
      setSaveState('storage unavailable')
    }
  })

  const updateItem = (id: string, patch: Partial<CanvasItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)))
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
    setSelectedId(item.id)
    setTool('select')
    if (nextTool === 'text' || nextTool === 'note') setEditingId(item.id)
  }

  const deleteSelected = () => {
    const id = selectedId()
    if (!id) return
    setItems((current) => current.filter((item) => item.id !== id))
    setSelectedId(null)
    setEditingId(null)
  }

  const duplicateSelected = () => {
    const item = selectedItem()
    if (!item) return

    const duplicated = {
      ...item,
      id: createId(),
      x: item.x + 32,
      y: item.y + 32,
    }
    setItems((current) => [...current, duplicated])
    setSelectedId(duplicated.id)
    setEditingId(null)
  }

  const resetView = () => setView(defaultView())

  const clearBoard = () => {
    if (!confirm('キャンバス上のノートをすべて削除しますか？')) return
    setItems([])
    setSelectedId(null)
    setEditingId(null)
  }

  const handleStagePointerDown = (event: PointerEvent & { currentTarget: HTMLDivElement }) => {
    if (event.button !== 0 || isEditableTarget(event.target)) return

    if (tool() !== 'select') {
      placeItem(tool() as ItemType, screenToWorld(event.clientX, event.clientY))
      return
    }

    setSelectedId(null)
    setEditingId(null)
    setInteraction({
      kind: 'pan',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: view().x,
      originY: view().y,
    })
  }

  const handleItemPointerDown = (
    event: PointerEvent & { currentTarget: HTMLDivElement },
    item: CanvasItem,
  ) => {
    if (event.button !== 0 || editingId() === item.id || isEditableTarget(event.target)) return

    event.stopPropagation()
    setSelectedId(item.id)
    setEditingId((current) => (current === item.id ? current : null))
    setInteraction({
      kind: 'drag',
      pointerId: event.pointerId,
      id: item.id,
      startWorld: screenToWorld(event.clientX, event.clientY),
      originX: item.x,
      originY: item.y,
    })
  }

  const handleResizePointerDown = (
    event: PointerEvent & { currentTarget: HTMLButtonElement },
    item: CanvasItem,
  ) => {
    event.stopPropagation()
    setSelectedId(item.id)
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
      updateItem(active.id, {
        x: Math.round(active.originX + world.x - active.startWorld.x),
        y: Math.round(active.originY + world.y - active.startWorld.y),
      })
      return
    }

    updateItem(active.id, {
      w: Math.round(clamp(active.originW + world.x - active.startWorld.x, 120, 760)),
      h: Math.round(clamp(active.originH + world.y - active.startWorld.y, 80, 620)),
    })
  }

  const handlePointerUp = (event: PointerEvent) => {
    const active = interaction()
    if (active?.pointerId === event.pointerId) setInteraction(null)
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
      setTool('select')
      setSelectedId(null)
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
  })

  onCleanup(() => {
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
    window.removeEventListener('keydown', handleKeyDown)
  })

  return (
    <main class="notebook-app">
      <section class="toolbar" aria-label="Canvas tools" onPointerDown={(event) => event.stopPropagation()}>
        <div class="brand-mark">
          <strong>pencil note</strong>
          <span>{saveState()}</span>
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
                <span>{entry.label}</span>
                <small>{entry.shortcut}</small>
              </button>
            )}
          </For>
        </div>

        <div class="toolbar-actions">
          <button type="button" onClick={duplicateSelected} disabled={!selectedId()}>
            Duplicate
          </button>
          <button type="button" onClick={deleteSelected} disabled={!selectedId()}>
            Delete
          </button>
        </div>
      </section>

      <section class="inspector" aria-label="Selected item">
        <Show
          when={selectedItem()}
          fallback={
            <>
              <p class="eyebrow">Format hints</p>
              <h1>Markdown-ish</h1>
              <p class="hint-copy">`- `, `1. `, `# `, `- [ ]`, `**bold**`, `*italic*`, `&gt; quote`</p>
            </>
          }
        >
          {(item) => (
            <>
              <p class="eyebrow">Selected</p>
              <h1>{typeLabel(item().type)}</h1>
              <label class="color-control">
                <span>Color</span>
                <input
                  type="color"
                  value={item().color}
                  onInput={(event) => updateItem(item().id, { color: event.currentTarget.value })}
                />
              </label>
              <p class="hint-copy">Double click to edit text. Drag the corner dot to resize.</p>
            </>
          )}
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
        class={interaction()?.kind === 'pan' ? 'canvas-stage is-panning' : 'canvas-stage'}
        ref={stageRef}
        onPointerDown={handleStagePointerDown}
        onWheel={handleWheel}
      >
        <div
          class="canvas-world"
          style={`transform: translate3d(${view().x}px, ${view().y}px, 0) scale(${view().zoom});`}
        >
          <For each={items()}>
            {(item) => (
              <div
                class={`canvas-item item-${item.type}${selectedId() === item.id ? ' is-selected' : ''}${
                  editingId() === item.id ? ' is-editing' : ''
                }`}
                style={`transform: translate3d(${item.x}px, ${item.y}px, 0); width: ${item.w}px; height: ${item.h}px; --item-color: ${item.color};`}
                onPointerDown={(event) => handleItemPointerDown(event, item)}
                onDblClick={(event) => {
                  event.stopPropagation()
                  setSelectedId(item.id)
                  setEditingId(item.id)
                }}
              >
                <Show when={item.type === 'diamond'}>
                  <div class="diamond-fill" />
                </Show>

                <div class="item-content">
                  <Show
                    when={editingId() === item.id}
                    fallback={<div class="formatted-text">{renderFormattedText(item.text)}</div>}
                  >
                    <textarea
                      ref={(element) => {
                        requestAnimationFrame(() => {
                          element.focus()
                          element.setSelectionRange(element.value.length, element.value.length)
                        })
                      }}
                      class="note-editor"
                      value={item.text}
                      spellcheck={false}
                      onInput={(event) => updateItem(item.id, { text: event.currentTarget.value })}
                      onKeyDown={(event) => handleEditorKeyDown(event, item)}
                      onPointerDown={(event) => event.stopPropagation()}
                      onBlur={() => setEditingId((current) => (current === item.id ? null : current))}
                    />
                  </Show>
                </div>

                <Show when={selectedId() === item.id && editingId() !== item.id}>
                  <button
                    class="resize-handle"
                    type="button"
                    aria-label="Resize item"
                    onPointerDown={(event) => handleResizePointerDown(event, item)}
                  />
                </Show>
              </div>
            )}
          </For>
        </div>
      </div>
    </main>
  )
}

export default App
