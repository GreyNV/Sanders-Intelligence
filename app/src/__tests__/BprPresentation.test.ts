import { describe, expect, it, afterEach, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import BprPresentation from '../components/BprPresentation'
import { slideScale } from '../components/SlideFrame'

const originalScrollTo = Element.prototype.scrollTo
let root: Root | undefined
let host: HTMLDivElement | undefined
afterEach(() => {
  if (root) act(() => root!.unmount())
  host?.remove()
  Element.prototype.scrollTo = originalScrollTo
  vi.unstubAllGlobals()
})
describe('BPR presentation', () => {
  it('scales the authored canvas uniformly and uses width for long slides', () => {
    expect(slideScale(1920, 1080, 720)).toBe(1.5)
    expect(slideScale(1920, 1200, 720)).toBe(1.5)
    expect(slideScale(1024, 768, 720)).toBe(.8)
    expect(slideScale(1920, 1080, 1200)).toBe(1.5)
    expect(slideScale(800, 600, 1200)).toBe(.625)
  })
  it('orders presenters and slides, hands off, walks backward, and ends the meeting', () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, writable: true, value: vi.fn() })
    const close = vi.fn()
    const presenters = [
      { id: 'r', name: 'Ryan', order: 1, slides: [{ id: 'c', order: 0, html: '<p>C</p>' }] },
      { id: 'm', name: 'Mendy', order: 0, slides: [{ id: 'b', order: 1, html: '<p>B</p>' }, { id: 'a', order: 0, html: '<p>A</p>' }] },
    ]
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root!.render(createElement(BprPresentation, { presenters, initialPresenter: 1, onClose: close })))
    const press = (key: string) => act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })) })
    const text = () => document.querySelector('nav')!.textContent
    expect(text()).toContain('Mendy · 1 / 2')
    expect(document.querySelector('iframe')!.srcdoc).toBe('<p>A</p>')
    const preloaded = document.querySelectorAll('iframe')[1]
    press('ArrowRight')
    expect(text()).toContain('Next presenter: Ryan →')
    expect(document.querySelectorAll('iframe')[1]).toBe(preloaded)
    press(' ')
    expect(text()).toContain('Ryan · 1 / 1')
    expect(text()).toContain('End of BPR')
    press('PageUp')
    expect(text()).toContain('Mendy · 2 / 2')
    press('ArrowLeft')
    press('ArrowLeft')
    expect(text()).toContain('Mendy · 1 / 2')
    press('PageDown')
    press('PageDown')
    press('ArrowRight')
    expect(close).toHaveBeenCalledOnce()
    act(() => document.dispatchEvent(new Event('fullscreenchange')))
    expect(close).toHaveBeenCalledTimes(2)
    act(() => root!.unmount())
    root = undefined
    expect(document.body.style.overflow).toBe('')
  })
})
