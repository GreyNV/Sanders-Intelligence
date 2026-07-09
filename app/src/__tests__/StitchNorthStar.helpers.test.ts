import { describe, expect, it } from 'vitest'
import { mergeNorthStarRows } from '../pages/csuite/NorthStar.helpers'
import {
  STITCH_ALL_PILLARS_TAB,
  buildOwnerSlideDeck,
  buildStitchPillarTabs,
  filterRowsByPillar,
} from '../pages/csuite/StitchNorthStar.helpers'

describe('Stitch North Star helpers', () => {
  it('builds project tabs from existing pillar names in slot order', () => {
    const rows = mergeNorthStarRows([], '2026-07-01', '2026-07-05')

    expect(buildStitchPillarTabs(rows).slice(0, 4)).toEqual([
      { id: STITCH_ALL_PILLARS_TAB, label: 'All', count: 8 },
      { id: 'finance / cash', label: 'Finance / cash', count: 1 },
      { id: 'amazon retail', label: 'Amazon retail', count: 1 },
      { id: 'wholesale', label: 'Wholesale', count: 1 },
    ])
  })

  it('filters rows by the selected pillar tab without introducing a project field', () => {
    const rows = mergeNorthStarRows([], '2026-07-01', '2026-07-05')

    expect(filterRowsByPillar(rows, STITCH_ALL_PILLARS_TAB)).toHaveLength(rows.length)
    expect(filterRowsByPillar(rows, 'wholesale').map(row => row.pillar)).toEqual(['Wholesale'])
  })

  it('builds editable presentation decks per owner and splits shared owners', () => {
    const rows = mergeNorthStarRows([], '2026-07-01', '2026-07-05')
    const decks = buildOwnerSlideDeck(rows)

    expect(decks.map(deck => deck.owner)).toContain('Mike')
    expect(decks.map(deck => deck.owner)).toContain('Sam')
    expect(decks.find(deck => deck.owner === 'Sam')?.rows.map(row => row.pillar)).toEqual(['Wholesale', 'Cloud9'])
    expect(decks.find(deck => deck.owner === 'Ryan')?.rows.map(row => row.pillar)).toEqual(['Finance / cash', 'Purchasing'])
  })
})
