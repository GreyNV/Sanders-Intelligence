import { useEffect, useRef, useState } from 'react'

export const DESIGN_W = 1280
export const DESIGN_H = 720

export function slideScale(width: number, height: number, contentHeight: number) {
  return contentHeight > DESIGN_H ? width / DESIGN_W : Math.min(width / DESIGN_W, height / DESIGN_H)
}

/** The document always lays out at its authored width, independently of its viewport. */
export default function SlideFrame({ html, title, active = true, onKeyDown, onActivity }: {
  html: string
  title: string
  active?: boolean
  onKeyDown?: (event: KeyboardEvent) => void
  onActivity?: () => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const cleanup = useRef<() => void>(() => {})
  const handlers = useRef({ onKeyDown, onActivity })
  handlers.current = { onKeyDown, onActivity }
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [contentHeight, setContentHeight] = useState(DESIGN_H)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const element = container.current!
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight })
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    window.addEventListener('resize', measure)
    document.addEventListener('fullscreenchange', measure)
    measure()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
      document.removeEventListener('fullscreenchange', measure)
      cleanup.current()
    }
  }, [])

  useEffect(() => { if (active) container.current?.scrollTo(0, 0) }, [active, html])

  function loaded() {
    cleanup.current()
    const iframe = frame.current!
    const doc = iframe.contentDocument
    if (!doc) return
    let disposed = false
    let raf = 0
    const measure = () => {
      // Reset before measuring so a formerly tall document can shrink too.
      iframe.style.height = `${DESIGN_H}px`
      const height = Math.max(DESIGN_H, doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0)
      iframe.style.height = `${height}px`
      setContentHeight(height)
      setReady(true)
    }
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure) }
    const key = (event: KeyboardEvent) => handlers.current.onKeyDown?.(event)
    const activity = () => handlers.current.onActivity?.()
    doc.addEventListener('keydown', key)
    doc.addEventListener('pointermove', activity)
    doc.addEventListener('pointerdown', activity)
    doc.addEventListener('load', schedule, true)
    const observer = new MutationObserver(schedule)
    observer.observe(doc.documentElement, { childList: true, subtree: true, characterData: true })
    void doc.fonts.ready.then(() => { if (!disposed) schedule() })
    measure()
    cleanup.current = () => {
      disposed = true
      cancelAnimationFrame(raf)
      observer.disconnect()
      doc.removeEventListener('keydown', key)
      doc.removeEventListener('pointermove', activity)
      doc.removeEventListener('pointerdown', activity)
      doc.removeEventListener('load', schedule, true)
    }
  }

  const scale = slideScale(size.width, size.height, contentHeight)
  const tall = contentHeight > DESIGN_H
  return (
    <div ref={container} data-slide-viewport style={{ position: 'absolute', inset: 0, overflowX: 'hidden', overflowY: tall ? 'auto' : 'hidden', background: '#080b10', visibility: active ? 'visible' : 'hidden', pointerEvents: active ? 'auto' : 'none' }} aria-hidden={!active}>
      <div style={{ position: 'relative', width: '100%', height: contentHeight * scale, marginTop: tall ? 0 : Math.max(0, (size.height - contentHeight * scale) / 2) }}>
        <iframe ref={frame} title={title} srcDoc={html} sandbox="allow-same-origin" scrolling="no" referrerPolicy="no-referrer" tabIndex={active ? 0 : -1} onLoad={loaded}
          style={{ position: 'absolute', left: '50%', marginLeft: -DESIGN_W / 2, width: DESIGN_W, height: contentHeight, maxWidth: 'none', border: 0, transform: `scale(${scale})`, transformOrigin: 'top center', visibility: ready && active ? 'visible' : 'hidden', background: '#080b10' }} />
      </div>
    </div>
  )
}
