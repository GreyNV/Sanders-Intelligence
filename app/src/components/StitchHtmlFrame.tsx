import { useEffect, useMemo, useState } from 'react'
import SlideFrame from './SlideFrame'
import { splitFinanceDeckHtml } from '@/lib/financeDeckGenerator'
import { cn } from '@/lib/utils'

/** Generated Finance decks contain multiple slides; iframe scripts are disabled. */
export default function StitchHtmlFrame({ title, html, presentation = false }: {
  title:string
  html:string
  presentation?:boolean
}) {
  const slides=useMemo(()=>splitFinanceDeckHtml(html),[html])
  const [position,setPosition]=useState(0)
  useEffect(()=>setPosition(0),[html])
  const index=Math.min(position,Math.max(0,slides.length-1))
  const displayed=slides[index]??html
  return <div className="space-y-2">
    {slides.length>1 && <div className="flex items-center justify-end gap-2 text-xs text-text2" aria-label="Finance slide controls">
      <button type="button" className="btn-secondary h-8 px-3" disabled={index===0} onClick={()=>setPosition(index-1)} aria-label="Previous Finance slide">Previous</button>
      <span aria-live="polite">{index+1} / {slides.length}</span>
      <button type="button" className="btn-secondary h-8 px-3" disabled={index===slides.length-1} onClick={()=>setPosition(index+1)} aria-label="Next Finance slide">Next</button>
    </div>}
    <div className={cn('relative overflow-hidden rounded-lg border border-border bg-white',presentation?'h-[min(72vh,760px)]':'h-[460px]')}>
      <SlideFrame key={`${index}:${displayed}`} title={title} html={displayed} />
    </div>
  </div>
}
