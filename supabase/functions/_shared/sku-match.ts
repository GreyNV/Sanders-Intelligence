export type SkuMatchMethod =
  | 'direct'
  | 'seller_cloud_shadow_of_sku'
  | 'standard_sku'
  | 'seller_cloud_sku_box_qty_and_item_label'
  | 'channel_prefix_strip'
  | 'compact_canonical'

export interface SkuMatch {
  sourceSku: string
  planningSku: string
  matchMethod: SkuMatchMethod
  confidence: number
  evidence: Record<string, unknown>
}

export interface SkuBridgeInsertRow {
  source_system: 'seller_cloud'
  source_sku: string
  planning_sku: string
  match_method: SkuMatchMethod
  confidence: number
  evidence: Record<string, unknown>
  is_active: boolean
}

interface SkuIndexes {
  lower: Map<string, string[]>
  compact: Map<string, string[]>
}

export function matchSellerCloudSku(sourceSku: string, inventorySkus: string[]): SkuMatch | null {
  return matchSellerCloudSkuWithIndexes(sourceSku, buildSkuIndexes(inventorySkus))
}

export function buildSkuBridgeInsertRows(sourceSkus: string[], inventorySkus: string[]): SkuBridgeInsertRow[] {
  const rows: SkuBridgeInsertRow[] = []
  const seen = new Set<string>()
  const indexes = buildSkuIndexes(inventorySkus)

  for (const sourceSku of uniqueNonEmpty(sourceSkus)) {
    const matchResult = matchSellerCloudSkuWithIndexes(sourceSku, indexes)
    if (!matchResult) continue
    const key = `${matchResult.sourceSku.toLowerCase()}|${matchResult.planningSku.toLowerCase()}|${matchResult.matchMethod}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({
      source_system: 'seller_cloud',
      source_sku: matchResult.sourceSku,
      planning_sku: matchResult.planningSku,
      match_method: matchResult.matchMethod,
      confidence: matchResult.confidence,
      evidence: matchResult.evidence,
      is_active: true,
    })
  }

  return rows
}

export function summarizeSkuBackfill({
  beforeUnmatched,
  matchedSourceSkus,
  backfilledItems,
}: {
  beforeUnmatched: number
  matchedSourceSkus: number
  backfilledItems: number
}) {
  const afterUnmatched = Math.max(0, beforeUnmatched - matchedSourceSkus)
  return {
    beforeUnmatched,
    matchedSourceSkus,
    backfilledItems,
    afterUnmatched,
    matchRate: beforeUnmatched > 0 ? matchedSourceSkus / beforeUnmatched : 0,
  }
}

function match(
  sourceSku: string,
  planningSku: string,
  matchMethod: SkuMatchMethod,
  confidence: number,
  evidence: Record<string, unknown>
): SkuMatch {
  return { sourceSku, planningSku, matchMethod, confidence, evidence }
}

function uniqueNonEmpty(values: string[]): string[] {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)))
}

function buildSkuIndexes(inventorySkus: string[]): SkuIndexes {
  const inventory = uniqueNonEmpty(inventorySkus)
  return {
    lower: indexBy(inventory, sku => sku.toLowerCase()),
    compact: indexBy(inventory, compactSku),
  }
}

function matchSellerCloudSkuWithIndexes(sourceSku: string, indexes: SkuIndexes): SkuMatch | null {
  const source = sourceSku.trim()
  if (!source) return null

  const direct = uniqueLookup(indexes.lower, source.toLowerCase())
  if (direct) {
    return match(source, direct, 'direct', 1, { rule: 'case_insensitive_exact' })
  }

  const stripped = stripChannelPrefix(source)
  if (stripped !== source) {
    const channelMatch = uniqueLookup(indexes.lower, stripped.toLowerCase())
    if (channelMatch) {
      return match(source, channelMatch, 'channel_prefix_strip', 0.98, { stripped })
    }
  }

  const shadow = stripShadowSuffix(source)
  if (shadow !== source) {
    const shadowMatch = uniqueLookup(indexes.lower, shadow.toLowerCase())
    if (shadowMatch) {
      return match(source, shadowMatch, 'seller_cloud_shadow_of_sku', 0.97, { stripped: shadow })
    }
  }

  const box = stripBoxOrItemLabel(source)
  if (box !== source) {
    const boxMatch = uniqueLookup(indexes.lower, box.toLowerCase())
    if (boxMatch) {
      return match(source, boxMatch, 'seller_cloud_sku_box_qty_and_item_label', 0.97, { stripped: box })
    }
  }

  const canonical = compactSku(source)
  const canonicalMatch = uniqueLookup(indexes.compact, canonical)
  if (canonicalMatch) {
    return match(source, canonicalMatch, 'compact_canonical', 0.96, { canonical })
  }

  return null
}

function indexBy(values: string[], keyFn: (value: string) => string): Map<string, string[]> {
  const index = new Map<string, string[]>()
  for (const value of values) {
    const key = keyFn(value)
    const rows = index.get(key) ?? []
    rows.push(value)
    index.set(key, rows)
  }
  return index
}

function uniqueLookup(index: Map<string, string[]>, key: string): string | null {
  const matches = index.get(key) ?? []
  return matches.length === 1 ? matches[0] : null
}

function compactSku(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toUpperCase()
}

function stripChannelPrefix(value: string): string {
  return value.replace(/^(?:FBA|WFS|DSC|DS|SC|AMZ|WM|WMT)[-_ ]+/i, '')
}

function stripShadowSuffix(value: string): string {
  return value.replace(/(?:[-_ ]?(?:SHADOW|SH|CHILD|PARENT))$/i, '')
}

function stripBoxOrItemLabel(value: string): string {
  return value
    .replace(/(?:[-_ ]?(?:BOX|CASE|PACK|PK|CTN)[-_ ]?\d+)$/i, '')
    .replace(/(?:[-_ ]?\d+(?:PC|PCS|PK|PACK))$/i, '')
}
