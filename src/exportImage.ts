import type { JSONContent } from '@tiptap/core'
import { getUrlDisplayLabel } from './links'
import {
  isStrokeCanvasItem,
  isImageItem,
  isSlideItem,
  isWebEmbedItem,
  sortCanvasItemsForRender,
  type CanvasItem,
  type FontFamily,
  type FontSize,
  type StrokeCanvasItem,
  type StrokeStyle,
  type StrokeWidth,
} from './notebook'

export const EXPORT_PNG_TEXT_KEY = 'pencil-note'
export const EXPORT_SVG_METADATA_ID = 'pencil-note-data'
export const LIGHT_INK_STROKE = '#1f1f1f'

export type ExportThemeName = 'light' | 'dark'

type ExportTheme = {
  ink: string
  canvasBg: string
  canvasDot: string
  canvasGrid: string
  noteShadow: string
  noteInset: string
  noteRule: string
  noteSheen: string
  taskAccent: string
  textStrike: string
  hand: string
  mono: string
}

export type ExportScene = {
  svg: string
  html: string
  width: number
  height: number
  filenameBase: string
}

type ExportSvgOptions = {
  items: CanvasItem[]
  onlySelected: boolean
  includeBackground: boolean
  darkMode: boolean
  embedPayload?: string | null
}

type Bounds = {
  x: number
  y: number
  w: number
  h: number
}

type EmbeddedExportPayload = {
  version: 1
  items: CanvasItem[]
}

const EXPORT_THEME: Record<ExportThemeName, ExportTheme> = {
  light: {
    ink: '#594734',
    canvasBg: '#f7f0df',
    canvasDot: 'rgba(63, 48, 31, 0.18)',
    canvasGrid: 'rgba(120, 92, 52, 0.08)',
    noteShadow: '0 18px 40px rgba(71, 52, 24, 0.16)',
    noteInset: 'rgba(255, 255, 255, 0.08)',
    noteRule: 'rgba(91, 72, 38, 0.12)',
    noteSheen: 'rgba(255, 255, 255, 0.35)',
    taskAccent: '#8f6b2b',
    textStrike: 'rgba(69, 55, 37, 0.58)',
    hand: "'Klee One', 'Hiragino Maru Gothic ProN', 'Yu Gothic', 'Comic Sans MS', cursive",
    mono: "ui-monospace, 'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
  },
  dark: {
    ink: '#d7c7b5',
    canvasBg: '#19140f',
    canvasDot: 'rgba(240, 223, 198, 0.12)',
    canvasGrid: 'rgba(240, 223, 198, 0.06)',
    noteShadow: '0 18px 40px rgba(0, 0, 0, 0.24)',
    noteInset: 'rgba(255, 255, 255, 0.04)',
    noteRule: 'rgba(176, 138, 83, 0.18)',
    noteSheen: 'rgba(255, 255, 255, 0.08)',
    taskAccent: '#d1a95c',
    textStrike: 'rgba(215, 199, 181, 0.58)',
    hand: "'Klee One', 'Hiragino Maru Gothic ProN', 'Yu Gothic', 'Comic Sans MS', cursive",
    mono: "ui-monospace, 'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
  },
}

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])

const fontSizePx = (value: FontSize) =>
  ({
    sm: 18,
    md: 22,
    lg: 28,
  })[value]

const fontFamilyValue = (value: FontFamily, theme: ExportTheme) =>
  ({
    hand: theme.hand,
    sans: "Inter, 'Helvetica Neue', Arial, sans-serif",
    mono: theme.mono,
  })[value]

const strokeWidthPx = (value: StrokeWidth) =>
  ({
    thin: 1.5,
    medium: 2.75,
    bold: 4.5,
  })[value]

const strokeDasharray = (value: StrokeStyle) =>
  ({
    solid: 'none',
    dashed: '10 8',
    dotted: '2 8',
  })[value]

const formatNumber = (value: number) => {
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const escapeXml = escapeHtml

const resolveThemeAwareStroke = (stroke: string, themeName: ExportThemeName) =>
  stroke === LIGHT_INK_STROKE ? EXPORT_THEME[themeName].ink : stroke

export const getItemBounds = (items: CanvasItem[]): Bounds => {
  if (!items.length) return { x: 0, y: 0, w: 1, h: 1 }

  const minX = Math.min(...items.map((item) => item.x))
  const minY = Math.min(...items.map((item) => item.y))
  const maxX = Math.max(...items.map((item) => item.x + item.w))
  const maxY = Math.max(...items.map((item) => item.y + item.h))

  return {
    x: minX,
    y: minY,
    w: Math.max(1, maxX - minX),
    h: Math.max(1, maxY - minY),
  }
}

const renderInline = (nodes?: JSONContent[]) =>
  (nodes ?? [])
    .map((node) => {
      if (node.type === 'text' && typeof node.text === 'string') {
        let content = escapeHtml(node.text)
        for (const mark of node.marks ?? []) {
          if (mark.type === 'link' && typeof mark.attrs?.href === 'string') {
            const href = escapeXml(mark.attrs.href)
            content = `<a href="${href}" target="_blank" rel="noopener noreferrer nofollow">${content}</a>`
          }
        }
        return content
      }
      if (node.type === 'hardBreak') return '<br />'
      return renderBlock(node)
    })
    .join('')

const renderBlock = (node: JSONContent): string => {
  switch (node.type) {
    case 'paragraph': {
      const inner = renderInline(node.content)
      return `<p>${inner || '<br />'}</p>`
    }
    case 'bulletList':
      return `<ul>${(node.content ?? []).map(renderBlock).join('')}</ul>`
    case 'orderedList': {
      const start =
        node.attrs && typeof node.attrs.start === 'number' && node.attrs.start > 1 ? ` start="${node.attrs.start}"` : ''
      return `<ol${start}>${(node.content ?? []).map(renderBlock).join('')}</ol>`
    }
    case 'listItem':
      return `<li>${(node.content ?? []).map(renderBlock).join('')}</li>`
    case 'taskList':
      return `<ul class="task-list">${(node.content ?? []).map(renderBlock).join('')}</ul>`
    case 'taskItem': {
      const checked = node.attrs?.checked ? ' is-checked' : ''
      return `<li class="task-item${checked}"><span class="task-box" aria-hidden="true"></span><div class="task-body">${(node.content ?? []).map(renderBlock).join('')}</div></li>`
    }
    case 'text':
      return typeof node.text === 'string' ? escapeHtml(node.text) : ''
    default:
      return (node.content ?? []).map(renderBlock).join('')
  }
}

const renderRichText = (content: JSONContent) => (content.content ?? []).map(renderBlock).join('')

const isDotPath = (item: StrokeCanvasItem) => {
  if (item.type !== 'path') return false
  const first = item.points[0]
  return item.points.every((point) => Math.abs(point.x - first.x) < 0.4 && Math.abs(point.y - first.y) < 0.4)
}

const getArrowHeadPoints = (item: StrokeCanvasItem, size: number) => {
  const tip = item.points[item.points.length - 1]
  const tail = item.points[item.points.length - 2] ?? { x: tip.x - 1, y: tip.y }
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
  return `${formatNumber(left.x)},${formatNumber(left.y)} ${formatNumber(tip.x)},${formatNumber(tip.y)} ${formatNumber(right.x)},${formatNumber(right.y)}`
}

const renderPath = (item: StrokeCanvasItem, themeName: ExportThemeName) => {
  const stroke = resolveThemeAwareStroke(item.stroke, themeName)
  if (isDotPath(item)) {
    const center = item.points[0]
    return `<svg class="path-item" width="${formatNumber(item.w)}" height="${formatNumber(item.h)}" viewBox="0 0 ${formatNumber(item.w)} ${formatNumber(item.h)}" aria-hidden="true"><circle cx="${formatNumber(center.x)}" cy="${formatNumber(center.y)}" r="${formatNumber(Math.max(strokeWidthPx(item.strokeWidth) * 0.75, 1.5))}" fill="${escapeXml(stroke)}" /></svg>`
  }

  const points = item.points.map((point) => `${formatNumber(point.x)},${formatNumber(point.y)}`).join(' ')
  const arrowHead =
    item.type === 'arrow'
      ? `<polygon points="${escapeXml(getArrowHeadPoints(item, Math.max(strokeWidthPx(item.strokeWidth) * 4.2, 12)))}" fill="${escapeXml(stroke)}" stroke="none" />`
      : ''
  return `<svg class="path-item" width="${formatNumber(item.w)}" height="${formatNumber(item.h)}" viewBox="0 0 ${formatNumber(item.w)} ${formatNumber(item.h)}" aria-hidden="true"><polyline points="${escapeXml(points)}" />${arrowHead}</svg>`
}

const renderCanvasItem = (item: CanvasItem, bounds: Bounds, padding: number, themeName: ExportThemeName, theme: ExportTheme) => {
  const resolvedStroke = resolveThemeAwareStroke(item.stroke, themeName)
  const style = [
    `left:${formatNumber(item.x - bounds.x + padding)}px`,
    `top:${formatNumber(item.y - bounds.y + padding)}px`,
    `width:${formatNumber(item.w)}px`,
    `height:${formatNumber(item.h)}px`,
    `--item-fill:${item.color}`,
    `--item-stroke:${resolvedStroke}`,
    `--item-stroke-width:${formatNumber(strokeWidthPx(item.strokeWidth))}px`,
    `--item-stroke-style:${item.strokeStyle}`,
    `--item-stroke-dash:${strokeDasharray(item.strokeStyle)}`,
    `--item-font-size:${formatNumber(fontSizePx(item.fontSize))}px`,
    `--item-font-family:${fontFamilyValue(item.fontFamily, theme)}`,
    `--item-text-align:${item.textAlign}`,
  ].join(';')

  if (isStrokeCanvasItem(item)) {
    return `<div class="canvas-item item-${item.type}" style="${style}">${renderPath(item, themeName)}</div>`
  }

  if (isImageItem(item)) {
    return `<div class="canvas-item item-image" style="${style}"><div class="item-content"><img class="image-item" src="${escapeXml(item.src)}" alt="${escapeXml(item.name ?? 'Exported image')}" /></div></div>`
  }

  if (isSlideItem(item)) {
    return `<div class="canvas-item item-slide" style="${style}"><div class="item-content"><div class="slide-frame-shell"><span class="slide-frame-badge">Slide</span></div></div></div>`
  }

  if (isWebEmbedItem(item)) {
    return `<div class="canvas-item item-webEmbed" style="${style}"><div class="item-content"><div class="web-embed-placeholder"><strong>Web Embed</strong><span>${escapeHtml(getUrlDisplayLabel(item.url) || 'Set a URL in the note editor')}</span></div></div></div>`
  }

  const body = `<div class="item-content"><div class="item-editor"><div class="item-editor-surface">${renderRichText(item.content)}</div></div></div>`
  if (item.type === 'diamond') {
    return `<div class="canvas-item item-diamond" style="${style}"><div class="diamond-fill"></div>${body}</div>`
  }
  return `<div class="canvas-item item-${item.type}" style="${style}">${body}</div>`
}

const exportCss = (theme: ExportTheme, includeBackground: boolean) => `
  .export-root,
  .export-root * { box-sizing: border-box; }
  .export-root {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    color: ${theme.ink};
    background: ${includeBackground ? theme.canvasBg : 'transparent'};
    ${includeBackground ? `background-image:
      radial-gradient(circle, ${theme.canvasDot} 1px, transparent 1px),
      linear-gradient(${theme.canvasGrid} 1px, transparent 1px),
      linear-gradient(90deg, ${theme.canvasGrid} 1px, transparent 1px);
    background-size: 20px 20px, 80px 80px, 80px 80px;` : ''}
    font-family: ${theme.hand};
  }
  .export-root .export-canvas {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .export-root .canvas-item {
    position: absolute;
  }
  .export-root .item-content {
    position: relative;
    z-index: 2;
    display: flex;
    width: 100%;
    height: 100%;
    padding: 22px 24px;
    overflow: visible;
    border: var(--item-stroke-width) var(--item-stroke-style) var(--item-stroke);
    background: var(--item-fill);
    text-align: var(--item-text-align);
  }
  .export-root .item-note .item-content,
  .export-root .item-text .item-content {
    border-radius: 22px 26px 24px 19px;
  }
  .export-root .item-slide .item-content {
    padding: 0;
    overflow: hidden;
    border-radius: 34px;
    box-shadow:
      0 24px 60px rgba(0, 0, 0, 0.18),
      inset 0 0 0 1px rgba(255, 255, 255, 0.45);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.74), rgba(255, 255, 255, 0.06)),
      var(--item-fill);
  }
  .export-root .item-webEmbed .item-content {
    padding: 0;
    overflow: hidden;
    border-radius: 26px;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.56), rgba(255, 255, 255, 0.04)),
      var(--item-fill);
    box-shadow: ${theme.noteShadow};
  }
  .export-root .item-note .item-content {
    box-shadow:
      ${theme.noteShadow},
      inset 0 0 0 999px ${theme.noteInset};
    background-image:
      linear-gradient(${theme.noteRule} 1px, transparent 1px),
      linear-gradient(90deg, ${theme.noteSheen}, rgba(255, 255, 255, 0));
    background-size:
      100% 32px,
      100% 100%;
    background-position:
      0 46px,
      0 0;
  }
  .export-root .item-text .item-content {
    padding: 12px 14px 18px;
    box-shadow: none;
  }
  .export-root .item-image .item-content {
    padding: 0;
    overflow: hidden;
    border-radius: 22px;
    box-shadow: none;
  }
  .export-root .item-rect .item-content,
  .export-root .item-ellipse .item-content,
  .export-root .item-diamond .item-content,
  .export-root .item-rect .item-editor,
  .export-root .item-ellipse .item-editor,
  .export-root .item-diamond .item-editor {
    display: grid;
    place-items: center;
  }
  .export-root .item-rect .item-content {
    border-radius: 22px;
    box-shadow: none;
  }
  .export-root .item-ellipse .item-content {
    border-radius: 999px;
    box-shadow: none;
  }
  .export-root .item-diamond {
    display: grid;
    place-items: center;
  }
  .export-root .item-diamond .item-content {
    border: 0;
    background: transparent;
    box-shadow: none;
  }
  .export-root .diamond-fill {
    position: absolute;
    inset: 16%;
    z-index: 1;
    rotate: 45deg;
    border: var(--item-stroke-width) var(--item-stroke-style) var(--item-stroke);
    border-radius: 22px;
    background: var(--item-fill);
  }
  .export-root .item-editor {
    width: 100%;
    min-height: 100%;
  }
  .export-root .slide-frame-shell {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .export-root .slide-frame-shell::after {
    content: '';
    position: absolute;
    inset: 28px;
    border: 1px dashed rgba(91, 72, 38, 0.22);
    border-radius: 24px;
  }
  .export-root .slide-frame-badge {
    position: absolute;
    top: 18px;
    left: 18px;
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    padding: 0 12px;
    border: 1px solid rgba(91, 72, 38, 0.18);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.72);
    color: rgba(91, 72, 38, 0.76);
    font-family: ${theme.mono};
    font-size: 12px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .export-root .web-embed-placeholder {
    display: grid;
    align-content: start;
    gap: 8px;
    width: 100%;
    height: 100%;
    padding: 18px 20px;
    color: ${theme.ink};
    font-family: ${theme.hand};
  }
  .export-root .web-embed-placeholder strong {
    font-size: 14px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .export-root .web-embed-placeholder span {
    color: ${theme.textStrike};
    font-size: 13px;
    line-height: 1.45;
  }
  .export-root .item-editor-surface {
    width: 100%;
    min-height: 100%;
    color: ${theme.ink};
    background: transparent;
    font-family: var(--item-font-family);
    font-size: var(--item-font-size);
    line-height: 1.5;
    text-align: var(--item-text-align);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .export-root .item-editor-surface a {
    color: inherit;
    text-decoration: underline;
    text-decoration-thickness: 1.5px;
    text-underline-offset: 0.16em;
  }
  .export-root .item-editor-surface p,
  .export-root .item-editor-surface ul,
  .export-root .item-editor-surface ol {
    margin: 0;
  }
  .export-root .item-editor-surface p + p,
  .export-root .item-editor-surface p + ul,
  .export-root .item-editor-surface p + ol,
  .export-root .item-editor-surface ul + p,
  .export-root .item-editor-surface ol + p {
    margin-top: 10px;
  }
  .export-root .item-editor-surface ul,
  .export-root .item-editor-surface ol {
    padding-left: 1.25em;
  }
  .export-root .item-editor-surface li + li {
    margin-top: 4px;
  }
  .export-root .item-editor-surface li p {
    margin: 0;
  }
  .export-root .item-editor-surface .task-list {
    padding-left: 0;
    list-style: none;
  }
  .export-root .item-editor-surface .task-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    list-style: none;
  }
  .export-root .item-editor-surface .task-box {
    flex: 0 0 auto;
    width: 0.86em;
    height: 0.86em;
    margin-top: 0.34em;
    border: 1.5px solid ${theme.taskAccent};
    border-radius: 0.18em;
  }
  .export-root .item-editor-surface .task-item.is-checked .task-box {
    background: ${theme.taskAccent};
    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.88);
  }
  .export-root .item-editor-surface .task-item.is-checked .task-body {
    color: ${theme.textStrike};
    text-decoration: line-through;
  }
  .export-root .image-item {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .export-root .path-item {
    display: block;
    overflow: visible;
    fill: none;
  }
  .export-root .path-item polyline,
  .export-root .path-item path {
    fill: none;
    stroke: var(--item-stroke);
    stroke-width: var(--item-stroke-width);
    stroke-dasharray: var(--item-stroke-dash);
    stroke-linecap: round;
    stroke-linejoin: round;
  }
`

export const buildExportSvg = ({
  items,
  onlySelected,
  includeBackground,
  darkMode,
  embedPayload,
}: ExportSvgOptions): ExportScene | null => {
  if (!items.length) return null

  const themeName: ExportThemeName = darkMode ? 'dark' : 'light'
  const theme = EXPORT_THEME[themeName]
  const bounds = getItemBounds(items)
  const padding = includeBackground ? 36 : 22
  const width = Math.max(1, Math.ceil(bounds.w + padding * 2))
  const height = Math.max(1, Math.ceil(bounds.h + padding * 2))
  const metadata =
    embedPayload && embedPayload.length
      ? `<metadata id="${EXPORT_SVG_METADATA_ID}">${escapeXml(embedPayload)}</metadata>`
      : ''
  const content = sortCanvasItemsForRender(items).map((item) => renderCanvasItem(item, bounds, padding, themeName, theme)).join('')
  const filenameBase = onlySelected ? 'pencil-note-selection' : 'pencil-note-canvas'
  const html = `<style>${exportCss(theme, includeBackground)}</style><div class="export-root"><div class="export-canvas">${content}</div></div>`

  return {
    filenameBase,
    width,
    height,
    html,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">${metadata}<foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">${html}</div></foreignObject></svg>`,
  }
}

export const encodeEmbeddedExportPayload = (items: CanvasItem[]) => {
  const payload: EmbeddedExportPayload = { version: 1, items }
  return stringToBase64(JSON.stringify(payload))
}

export const parseEmbeddedExportPayload = (encoded: string): unknown | null => {
  try {
    return JSON.parse(base64ToString(encoded))
  } catch {
    return null
  }
}

const stringToBase64 = (value: string) => {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

const base64ToString = (value: string) => {
  const binary = atob(value)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

const makeCrcTable = () => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let current = index
    for (let bit = 0; bit < 8; bit += 1) {
      current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1
    }
    table[index] = current >>> 0
  }
  return table
}

const CRC_TABLE = makeCrcTable()

const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff
  bytes.forEach((byte) => {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  })
  return (crc ^ 0xffffffff) >>> 0
}

const readUint32 = (bytes: Uint8Array, offset: number) =>
  ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0

const writeUint32 = (bytes: Uint8Array, offset: number, value: number) => {
  bytes[offset] = (value >>> 24) & 0xff
  bytes[offset + 1] = (value >>> 16) & 0xff
  bytes[offset + 2] = (value >>> 8) & 0xff
  bytes[offset + 3] = value & 0xff
}

const isPng = (bytes: Uint8Array) => PNG_SIGNATURE.every((value, index) => bytes[index] === value)

export const readPngTextChunk = (source: ArrayBuffer, keyword: string) => {
  const bytes = new Uint8Array(source)
  if (bytes.length < PNG_SIGNATURE.length || !isPng(bytes)) return null

  let offset = PNG_SIGNATURE.length
  const decoder = new TextDecoder()

  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset)
    const type = decoder.decode(bytes.slice(offset + 4, offset + 8))
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    if (dataEnd + 4 > bytes.length) return null

    if (type === 'tEXt') {
      const data = bytes.slice(dataStart, dataEnd)
      const separator = data.indexOf(0)
      if (separator > -1) {
        const chunkKeyword = decoder.decode(data.slice(0, separator))
        if (chunkKeyword === keyword) return decoder.decode(data.slice(separator + 1))
      }
    }

    offset = dataEnd + 4
  }

  return null
}

export const injectPngTextChunk = (source: ArrayBuffer, keyword: string, text: string) => {
  const bytes = new Uint8Array(source)
  if (bytes.length < PNG_SIGNATURE.length || !isPng(bytes)) throw new Error('Invalid PNG payload')

  const encoder = new TextEncoder()
  const keywordBytes = encoder.encode(keyword)
  const textBytes = encoder.encode(text)
  const chunkData = new Uint8Array(keywordBytes.length + 1 + textBytes.length)
  chunkData.set(keywordBytes, 0)
  chunkData[keywordBytes.length] = 0
  chunkData.set(textBytes, keywordBytes.length + 1)

  const typeBytes = encoder.encode('tEXt')
  const chunk = new Uint8Array(12 + chunkData.length)
  writeUint32(chunk, 0, chunkData.length)
  chunk.set(typeBytes, 4)
  chunk.set(chunkData, 8)

  const crcInput = new Uint8Array(typeBytes.length + chunkData.length)
  crcInput.set(typeBytes, 0)
  crcInput.set(chunkData, typeBytes.length)
  writeUint32(chunk, chunk.length - 4, crc32(crcInput))

  let insertOffset = PNG_SIGNATURE.length
  const decoder = new TextDecoder()

  while (insertOffset + 12 <= bytes.length) {
    const length = readUint32(bytes, insertOffset)
    const type = decoder.decode(bytes.slice(insertOffset + 4, insertOffset + 8))
    const end = insertOffset + 12 + length
    if (type === 'IEND') break
    insertOffset = end
  }

  const result = new Uint8Array(bytes.length + chunk.length)
  result.set(bytes.slice(0, insertOffset), 0)
  result.set(chunk, insertOffset)
  result.set(bytes.slice(insertOffset), insertOffset + chunk.length)
  return result.buffer
}
