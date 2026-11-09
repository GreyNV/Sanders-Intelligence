import type { FinanceMilestone } from './financeDeckGenerator'

export interface TimelineLabel {
  milestone: FinanceMilestone
  markerX: number
  labelX: number
  lineY: number
  labelY: number
  left: number
  right: number
  track: number
  lines: string[]
}

/** Keep labels short on the chart; the adjacent details list holds full text. */
function wrapLabel(label: string): string[] {
  const words=label.trim().split(/\s+/), lines:string[]=[]
  let remaining=words.join(' ')
  while (remaining && lines.length<2) {
    if (remaining.length<=17) { lines.push(remaining); remaining=''; break }
    let cut=remaining.lastIndexOf(' ',17)
    if (cut<6) cut=17
    lines.push(remaining.slice(0,cut).trim())
    remaining=remaining.slice(cut).trim()
  }
  if (remaining) lines[lines.length-1]=`${lines[lines.length-1].slice(0,16)}…`
  return lines
}

/** Pack labels into separate tracks, reserving space for date/status and two lines. */
export function layoutFinanceTimeline(milestones: FinanceMilestone[]) {
  const start=Date.UTC(2026,10,1), end=Date.UTC(2027,9,31), left=280, right=1180
  const x=(d:string)=>left+(new Date(`${d}T12:00:00Z`).getTime()-start)/(end-start)*(right-left)
  let laneTop=50
  const labels: TimelineLabel[]=[]
  const lanes=([ 'Execution','Guardrail','Growth lever' ] as const).map(lane=>{
    const lineY=laneTop+24, ends:number[]=[]
    const items=milestones.filter(m=>m.lane===lane).slice().sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))
    // Keep adjacent markers legible even when due dates are only a day apart.
    const markers=items.map(m=>x(m.date))
    for (let i=1;i<markers.length;i++) markers[i]=Math.max(markers[i],markers[i-1]+22)
    for (let i=markers.length-1;i>=0;i--) markers[i]=Math.min(markers[i],right-(markers.length-1-i)*22)
    for (const [index,milestone] of items.entries()) {
      const markerX=markers[index]
      const labelX=Math.max(left+62,Math.min(right-62,markerX))
      const leftEdge=labelX-62, rightEdge=labelX+62
      let track=ends.findIndex(end=>end+8<=leftEdge)
      if (track<0) { track=ends.length; ends.push(rightEdge) } else ends[track]=rightEdge
      labels.push({milestone,markerX,labelX,lineY,labelY:lineY+32+track*52,left:leftEdge,right:rightEdge,track,lines:wrapLabel(milestone.label)})
    }
    laneTop=lineY+32+Math.max(1,ends.length)*52+22
    return { lane,lineY }
  })
  return { x, lanes, labels, guardrailTop:laneTop+8, height:laneTop+185 }
}
