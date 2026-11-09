import { describe, expect, it } from 'vitest'
import { FINANCE_MILESTONES } from '@/lib/financeDeckGenerator'
import { layoutFinanceTimeline } from '@/lib/financeTimelineLayout'

function assertNoLabelOverlap(layout: ReturnType<typeof layoutFinanceTimeline>) {
  for (const [index,a] of layout.labels.entries()) {
    for (const b of layout.labels.slice(index+1)) {
      const horizontal=a.left<b.right && b.left<a.right
      const vertical=a.labelY-12<b.labelY+30 && b.labelY-12<a.labelY+30
      expect(horizontal && vertical, `${a.milestone.label} overlaps ${b.milestone.label}`).toBe(false)
    }
  }
  for (const lane of layout.lanes) {
    const marks=layout.labels.filter(label=>label.milestone.lane===lane.lane).map(label=>label.markerX).sort((a,b)=>a-b)
    for (let i=1;i<marks.length;i++) expect(marks[i]-marks[i-1]).toBeGreaterThanOrEqual(21.99)
  }
}

describe('Finance timeline layout', () => {
  it('keeps the approved milestones in distinct label areas', () => {
    const layout=layoutFinanceTimeline(FINANCE_MILESTONES)
    expect(layout.labels).toHaveLength(FINANCE_MILESTONES.length)
    assertNoLabelOverlap(layout)
  })
  it('adds tracks when many edited milestones share a date and preserves full names in the model', () => {
    const crowded=Array.from({length:12},(_,i)=>({id:`test-${i}`,date:'2027-04-30',lane:'Guardrail' as const,label:`Long milestone description ${i} with additional text`}))
    const layout=layoutFinanceTimeline(crowded)
    expect(new Set(layout.labels.map(x=>x.track)).size).toBeGreaterThan(2)
    expect(layout.labels.every(x=>x.lines.length<=2)).toBe(true)
    expect(layout.labels[0].milestone.label).toBe(crowded[0].label)
    assertNoLabelOverlap(layout)
  })
})
