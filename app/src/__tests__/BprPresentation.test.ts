import { describe, expect, it, afterEach, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import BprPresentation from '../components/BprPresentation'
import SlideFrame, { slideScale } from '../components/SlideFrame'

const originalScrollTo = Element.prototype.scrollTo
let root: Root | undefined
let host: HTMLDivElement | undefined
afterEach(() => {
  if (root) act(() => root!.unmount())
  host?.remove()
  Element.prototype.scrollTo = originalScrollTo
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
describe('BPR presentation', () => {
  it('remounts each Ryan Finance iframe when shown so its CSS animation can replay', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    Object.defineProperty(Element.prototype, 'scrollTo', { configurable:true, writable:true, value:vi.fn() })
    const contentDocument=Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'contentDocument')!.get!
    vi.spyOn(HTMLIFrameElement.prototype,'contentDocument','get').mockImplementation(function(this:HTMLIFrameElement) {
      const doc=contentDocument.call(this) as Document | null
      if(doc && !doc.fonts) Object.defineProperty(doc,'fonts',{configurable:true,value:{ready:Promise.resolve()}})
      return doc
    })
    const presenters=[{id:'ryan',name:'Ryan',order:0,slides:[
      {id:'custom:ryan-html-deck:0',order:0,html:'<p>First finance slide</p>'},
      {id:'custom:ryan-html-deck:1',order:1,html:'<p>Second finance slide</p>'},
    ]}]
    host=document.createElement('div');document.body.append(host);root=createRoot(host)
    await act(async()=>{root!.render(createElement(BprPresentation,{presenters,onClose:vi.fn()}));await Promise.resolve()})
    const first=document.querySelector<HTMLIFrameElement>('iframe')!
    expect(document.querySelectorAll('iframe')).toHaveLength(1)
    expect(first.srcdoc).toContain('First finance slide')
    expect(first.getAttribute('sandbox')).toBe('allow-same-origin')
    await act(async()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));await Promise.resolve()})
    expect(document.querySelectorAll('iframe')).toHaveLength(1)
    expect(document.querySelector('iframe')?.srcdoc).toContain('Second finance slide')
    await act(async()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));await Promise.resolve()})
    expect(document.querySelector('iframe')?.srcdoc).toContain('First finance slide')
    expect(document.querySelector('iframe')).not.toBe(first)
  })
  it('scales the authored canvas uniformly and uses width for long slides', () => {
    expect(slideScale(1920, 1080, 720)).toBe(1.5)
    expect(slideScale(1920, 1200, 720)).toBe(1.5)
    expect(slideScale(1024, 768, 720)).toBe(.8)
    expect(slideScale(1920, 1080, 1200)).toBe(1.5)
    expect(slideScale(800, 600, 1200)).toBe(.625)
  })
  it('remeasures a sandboxed slide when its native details open', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    Object.defineProperty(Element.prototype, 'scrollTo', { configurable:true, writable:true, value:vi.fn() })
    const observe = vi.fn()
    let changed: MutationCallback | undefined
    vi.stubGlobal('MutationObserver', class {
      constructor(callback:MutationCallback) { changed=callback }
      observe = observe
      disconnect() {}
    })
    vi.stubGlobal('requestAnimationFrame', (callback:FrameRequestCallback) => { callback(0); return 1 })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    host=document.createElement('div');document.body.append(host);root=createRoot(host)
    act(() => root!.render(createElement(SlideFrame,{html:'<details><summary>Evidence</summary>Details</details>',title:'Finance'})))
    const frame=host.querySelector('iframe')!, doc=frame.contentDocument!
    Object.defineProperty(doc,'fonts',{configurable:true,value:{ready:Promise.resolve()}})
    let height=720
    Object.defineProperty(doc.documentElement,'scrollHeight',{configurable:true,get:()=>height})
    await act(async () => { frame.dispatchEvent(new Event('load')); await Promise.resolve() })
    expect(observe).toHaveBeenCalledWith(doc.documentElement,expect.objectContaining({attributes:true,attributeFilter:['open']}))
    height=1100
    act(() => { changed!([],{} as MutationObserver) })
    expect(frame.style.height).toBe('1100px')
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
    const table = document.createElement('div')
    table.setAttribute('data-finance-scroll','')
    Object.defineProperties(table, { scrollWidth:{ value:1000 }, clientWidth:{ value:500 } })
    document.body.append(table)
    const tableKey = new KeyboardEvent('keydown', { key:'ArrowRight', bubbles:true, cancelable:true })
    act(() => { table.dispatchEvent(tableKey) })
    expect(tableKey.defaultPrevented).toBe(false)
    expect(text()).toContain('Mendy · 1 / 2')
    table.remove()
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
