import { describe, expect, it } from 'vitest'
import { collectPresentationSlides, fitSlideToViewport, sortSlidesForPresentation } from './slideshow'
import { type SlideCanvasItem } from './notebook'

const createSlide = (id: string, x: number, y: number, w = 640, h = 360): SlideCanvasItem => ({
  id,
  type: 'slide',
  x,
  y,
  w,
  h,
  color: '#fffdf8',
  stroke: '#5b4826',
  strokeWidth: 'medium',
  strokeStyle: 'solid',
  fontFamily: 'sans',
  fontSize: 'md',
  textAlign: 'left',
})

describe('slideshow', () => {
  it('sorts slides from top-left to bottom-right with row grouping', () => {
    const slides = [
      createSlide('slide-4', 140, 760),
      createSlide('slide-2', 860, 118),
      createSlide('slide-3', 120, 412),
      createSlide('slide-1', 120, 96),
    ]

    expect(sortSlidesForPresentation(slides).map((slide) => slide.id)).toEqual([
      'slide-1',
      'slide-2',
      'slide-3',
      'slide-4',
    ])
  })

  it('collects only slide frame items from the canvas', () => {
    expect(
      collectPresentationSlides([
        createSlide('slide-1', 0, 0),
        {
          id: 'text-1',
          type: 'text',
          x: 20,
          y: 20,
          w: 240,
          h: 80,
          color: 'transparent',
          stroke: 'transparent',
          strokeWidth: 'thin',
          strokeStyle: 'solid',
          fontFamily: 'hand',
          fontSize: 'md',
          textAlign: 'left',
          content: { type: 'doc', content: [{ type: 'paragraph' }] },
        },
      ]).map((slide) => slide.id),
    ).toEqual(['slide-1'])
  })

  it('fits a slide into the viewport with padding', () => {
    const slide = createSlide('slide-1', 120, 200, 800, 450)
    const view = fitSlideToViewport(slide, 1440, 900)

    expect(view.zoom).toBeCloseTo(1.66, 2)
    expect(view.x).toBeCloseTo(-143.2, 1)
    expect(view.y).toBeCloseTo(-255.5, 1)
  })
})
