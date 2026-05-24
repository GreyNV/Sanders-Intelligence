import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Inventory Browser SKU cell styling', () => {
  it('does not style non-interactive SKU text as a link', () => {
    const source = readFileSync(
      resolve(__dirname, '../pages/purchasing/InventoryBrowser.tsx'),
      'utf8',
    )

    expect(source).not.toContain('font-mono text-[11px] text-accent whitespace-nowrap')
    expect(source).not.toContain('title="Open in Inventory Browser"')
  })

  it('renders sortable metric headers including COGS percentage', () => {
    const source = readFileSync(
      resolve(__dirname, '../pages/purchasing/InventoryBrowser.tsx'),
      'utf8',
    )

    expect(source).toContain('<SortTh col="sellingPrice"')
    expect(source).toContain('<SortTh col="cogsPct"')
    expect(source).toContain('<SortTh col="profitToday"')
    expect(source).toContain('<SortTh col="profit7d"')
    expect(source).toContain('<SortTh col="profit30d"')
    expect(source).toContain('r.cogsPct')
    expect(source).toContain('N/A')
  })
})
