import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import SlideFrame from './SlideFrame'

export interface PresentationPresenter {
  id: string
  name: string
  order: number
  slides: { id: string; order: number; html: string }[]
}

export default function BprPresentation({ presenters, initialPresenter = 0, initialSlide = 0, onClose }: {
  presenters: PresentationPresenter[]
  initialPresenter?: number
  initialSlide?: number
  onClose: () => void
}) {
  const [slides] = useState(() => [...presenters].sort((a, b) => a.order - b.order).flatMap(presenter =>
    [...presenter.slides].sort((a, b) => a.order - b.order).map((slide, index) => ({ ...slide, presenter, index }))))
  const [position, setPosition] = useState(() => Math.max(0, slides.findIndex(slide => slide.presenter.id === presenters[initialPresenter]?.id && slide.index === initialSlide)))
  const [visible, setVisible] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const overlay = useRef<HTMLDivElement>(null)
  const exitTimer = useRef<ReturnType<typeof setTimeout>>()
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const exit = useCallback(() => {
    closeRef.current()
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
  }, [])
  const activity = useCallback(() => {
    setVisible(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setVisible(false), 3000)
  }, [])
  const next = useCallback(() => {
    activity()
    if (position === slides.length - 1) exit()
    else setPosition(position + 1)
  }, [position, slides.length, exit, activity])
  const previous = useCallback(() => { activity(); setPosition(value => Math.max(0, value - 1)) }, [activity])
  const key = useCallback((event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (['ArrowRight', ' ', 'PageDown', 'ArrowLeft', 'PageUp', 'Escape'].includes(event.key)) {
      event.preventDefault()
      if (event.repeat) return
      if (event.key === 'Escape') exit()
      else if (['ArrowLeft', 'PageUp'].includes(event.key)) previous()
      else next()
    }
  }, [exit, next, previous])

  useEffect(() => {
    clearTimeout(exitTimer.current)
    const focus = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    const siblings = [...document.body.children].filter(element => element !== overlay.current) as HTMLElement[]
    const oldInert = siblings.map(element => element.inert)
    siblings.forEach(element => { element.inert = true })
    document.body.style.overflow = 'hidden'
    overlay.current?.focus()
    const changed = () => { if (!document.fullscreenElement) closeRef.current() }
    document.addEventListener('fullscreenchange', changed)
    activity()
    return () => {
      document.removeEventListener('fullscreenchange', changed)
      clearTimeout(timer.current)
      document.body.style.overflow = overflow
      siblings.forEach((element, index) => { element.inert = oldInert[index] })
      focus?.focus()
      exitTimer.current = setTimeout(() => {
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
      }, 0)
    }
  }, [activity])
  useEffect(() => {
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [key])

  const current = slides[position]
  if (!current) return null
  const upcoming = slides[position + 1]
  const handoff = upcoming && upcoming.presenter.id !== current.presenter.id
  return createPortal(
    <div ref={overlay} role="dialog" aria-modal="true" aria-label="BPR presentation" tabIndex={-1} onPointerMove={activity} onPointerDown={activity}
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: '#080b10', color: 'white', outline: 'none' }}>
      {slides.map((slide, index) => index >= position - 1 && index <= position + 1 && (
        <SlideFrame key={`${slide.presenter.id}:${slide.id}`} html={slide.html} title={`${slide.presenter.name} · ${slide.index + 1}`} active={index === position} onKeyDown={key} onActivity={activity} />
      ))}
      <nav aria-label="Presentation controls" onFocusCapture={activity} style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14, background: 'rgba(15,23,42,.85)', opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none', transition: 'opacity 200ms', whiteSpace: 'nowrap' }}>
        <button type="button" className="btn-secondary" disabled={position === 0} onClick={previous} aria-label="Previous slide">‹</button>
        <span aria-live="polite">{current.presenter.name} · {current.index + 1} / {current.presenter.slides.length}</span>
        <button type="button" className={handoff || !upcoming ? 'btn-primary' : 'btn-secondary'} onClick={next} aria-label={upcoming && !handoff ? 'Next slide' : undefined}>
          {!upcoming ? 'End of BPR' : handoff ? `Next presenter: ${upcoming.presenter.name} →` : '›'}
        </button>
        <button type="button" className="btn-secondary" onClick={exit} aria-label="Exit presentation">✕</button>
      </nav>
    </div>, document.body
  )
}
