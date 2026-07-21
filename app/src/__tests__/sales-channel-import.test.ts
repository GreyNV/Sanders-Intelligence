import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(process.cwd(), '..')
const scriptPath = resolve(process.cwd(), 'scripts/import-sales-channel-mappings.mjs')
const scriptUrl = pathToFileURL(scriptPath).href
const defaultSeedPath = resolve(repoRoot, 'supabase/seed-data/sales-channel-mappings/Mappingd.xlsx')

function runImporterExpression(expression: string) {
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { buildMappingRows, normalizeSalesChannelValue } from ${JSON.stringify(scriptUrl)};
    const result = ${expression};
    console.log(JSON.stringify(result));
  `], { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  return JSON.parse(output)
}

describe('sales channel mapping import helpers', () => {
  it('normalizes flexible source and QB mapping headers into upsert rows', () => {
    const rows = runImporterExpression(`buildMappingRows(${JSON.stringify([
      {
        Company: ' Amazon US ',
        Channel: ' FBA  Marketplace ',
        'COGS Class': 'Amazon FBA',
        Notes: 'primary marketplace',
      },
      {
        Company: 'Amazon US',
        Channel: 'FBA Marketplace',
        'COGS Class': 'Amazon FBA',
      },
    ])}, 'channel-map.xlsx')`)

    expect(rows).toEqual([
      expect.objectContaining({
        sellercloud_company: 'Amazon US',
        sellercloud_channel: 'FBA Marketplace',
        normalized_company: 'amazon us',
        normalized_channel: 'fba marketplace',
        qb_channel: 'Amazon FBA',
        is_active: true,
        source_file: 'channel-map.xlsx',
        notes: 'primary marketplace',
      }),
    ])
  })

  it('fails fast when one source combination maps to conflicting QB channels', () => {
    expect(() => runImporterExpression(`buildMappingRows(${JSON.stringify([
      { Company: 'Wholesale', Channel: 'Phone', 'QuickBooks Channel': 'Wholesale' },
      { Company: 'Wholesale', Channel: 'Phone', 'QuickBooks Channel': 'Retail' },
    ])}, 'channel-map.xlsx')`)).toThrow(/conflicting QB channels/i)
  })

  it('uses the same whitespace-insensitive normalization contract as the mapping table', () => {
    expect(runImporterExpression("normalizeSalesChannelValue(' Amazon   EU\\tDirect ')")).toBe('amazon eu direct')
  })

  it('keeps the provided mapping workbook at the default seed path and can dry-run it', () => {
    expect(existsSync(defaultSeedPath)).toBe(true)

    const output = execFileSync(process.execPath, [
      scriptPath,
    ], { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

    expect(output).toContain('Prepared 82 sales channel mappings')
    expect(output).toContain('Dry run only')
    expect(output).toContain('"qb_channel": "Amazon CA"')
  })

  it('keeps the CLI import behind an explicit apply flag', () => {
    const script = readFileSync(scriptPath, 'utf8')

    expect(script).toContain('DEFAULT_MAPPING_FILE')
    expect(script).toContain('args.apply')
    expect(script).toContain('Dry run')
    expect(script).toContain("onConflict: 'normalized_company,normalized_channel'")
  })
})
