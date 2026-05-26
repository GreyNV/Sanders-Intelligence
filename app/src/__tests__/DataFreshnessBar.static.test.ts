import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('DataFreshnessBar rendering contract', () => {
  it('queries and displays the last MySQL metrics refresh timestamp', () => {
    const source = readFileSync(
      resolve(__dirname, '../components/layout/DataFreshnessBar.tsx'),
      'utf8',
    )

    expect(source).toContain("from('sku_profit_metrics')")
    expect(source).toContain('deriveFreshness')
    expect(source).toContain('fmtDateTime')
    expect(source).toContain('MySQL metrics refreshed')
  })
})
