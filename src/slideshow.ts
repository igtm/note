import { type CanvasItem, isSlideItem, type SlideCanvasItem, type Viewport } from './notebook'

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

type SlideRow = {
  top: number
  avgHeight: number
  slides: SlideCanvasItem[]
}

const rowTolerance = (slide: SlideCanvasItem, row?: SlideRow) =>
  Math.max(48, slide.h * 0.35, row ? row.avgHeight * 0.3 : 0)

export const sortSlidesForPresentation = (slides: SlideCanvasItem[]) => {
  const rows: SlideRow[] = []

  ;[...slides]
    .sort((left, right) => left.y - right.y || left.x - right.x)
    .forEach((slide) => {
      const row = rows.find((candidate) => Math.abs(slide.y - candidate.top) <= rowTolerance(slide, candidate))
      if (!row) {
        rows.push({ top: slide.y, avgHeight: slide.h, slides: [slide] })
        return
      }

      row.slides.push(slide)
      row.top = Math.min(row.top, slide.y)
      row.avgHeight = (row.avgHeight * (row.slides.length - 1) + slide.h) / row.slides.length
    })

  return rows
    .sort((left, right) => left.top - right.top)
    .flatMap((row) => row.slides.sort((left, right) => left.x - right.x || left.y - right.y))
}

export const collectPresentationSlides = (items: CanvasItem[]) =>
  sortSlidesForPresentation(items.filter(isSlideItem))

export const fitSlideToViewport = (
  slide: SlideCanvasItem,
  stageWidth: number,
  stageHeight: number,
  padding = 56,
): Viewport => {
  const safeWidth = Math.max(1, stageWidth)
  const safeHeight = Math.max(1, stageHeight)
  const availableWidth = Math.max(1, safeWidth - padding * 2)
  const availableHeight = Math.max(1, safeHeight - padding * 2)
  const zoom = clamp(Math.min(availableWidth / Math.max(1, slide.w), availableHeight / Math.max(1, slide.h)), 0.25, 3)

  return {
    zoom,
    x: safeWidth / 2 - (slide.x + slide.w / 2) * zoom,
    y: safeHeight / 2 - (slide.y + slide.h / 2) * zoom,
  }
}
