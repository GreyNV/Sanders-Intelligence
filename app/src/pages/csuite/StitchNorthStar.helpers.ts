import type { NorthStarDisplayRow } from './NorthStar.helpers'

export const STITCH_ALL_PILLARS_TAB = '__all__'
export const STITCH_UNASSIGNED_OWNER = 'Unassigned'

export interface StitchPillarTab {
  id: string
  label: string
  count: number
}

export interface StitchOwnerDeck {
  owner: string
  rows: NorthStarDisplayRow[]
}

export function buildStitchPillarTabs(rows: NorthStarDisplayRow[]): StitchPillarTab[] {
  const tabs = new Map<string, StitchPillarTab>()

  for (const row of rows) {
    const label = row.pillar.trim() || 'Untitled pillar'
    const id = normalizeTabId(label)
    const existing = tabs.get(id)

    if (existing) {
      existing.count += 1
    } else {
      tabs.set(id, { id, label, count: 1 })
    }
  }

  return [{ id: STITCH_ALL_PILLARS_TAB, label: 'All', count: rows.length }, ...tabs.values()]
}

export function filterRowsByPillar(rows: NorthStarDisplayRow[], selectedPillar: string): NorthStarDisplayRow[] {
  if (selectedPillar === STITCH_ALL_PILLARS_TAB) return rows
  return rows.filter(row => normalizeTabId(row.pillar) === selectedPillar)
}

export function buildOwnerSlideDeck(rows: NorthStarDisplayRow[]): StitchOwnerDeck[] {
  const decks = new Map<string, NorthStarDisplayRow[]>()

  for (const row of rows) {
    for (const owner of splitOwners(row.owner)) {
      const ownerRows = decks.get(owner) ?? []
      ownerRows.push(row)
      decks.set(owner, ownerRows)
    }
  }

  return [...decks.entries()]
    .sort(([left], [right]) => {
      if (left === STITCH_UNASSIGNED_OWNER) return 1
      if (right === STITCH_UNASSIGNED_OWNER) return -1
      return left.localeCompare(right, undefined, { sensitivity: 'base' })
    })
    .map(([owner, ownerRows]) => ({
      owner,
      rows: [...ownerRows].sort((a, b) => a.slot_index - b.slot_index),
    }))
}

export function splitOwners(owner: string | null): string[] {
  const owners = (owner ?? '')
    .split(/\s*(?:\/|,|&|\band\b)\s*/i)
    .map(value => value.trim())
    .filter(Boolean)

  return owners.length > 0 ? owners : [STITCH_UNASSIGNED_OWNER]
}

function normalizeTabId(value: string): string {
  return value.trim().toLowerCase() || 'untitled pillar'
}
