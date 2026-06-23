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

export function matchSellerCloudSku(sourceSku: string, inventorySkus: string[]): SkuMatch | null {
  const source = sourceSku.trim()
  if (!source) return null

  const inventory = uniqueNonEmpty(inventorySkus)
  const direct = findUniqueBy(inventory, sku => sku.toLowerCase() === source.toLowerCase())
  if (direct) {
    return match(source, direct, 'direct', 1, { rule: 'case_insensitive_exact' })
  }

  const stripped = stripChannelPrefix(source)
  if (stripped !== source) {
    const channelMatch = findUniqueBy(inventory, sku => sku.toLowerCase() === stripped.toLowerCase())
    if (channelMatch) {
      return match(source, channelMatch, 'channel_prefix_strip', 0.98, { stripped })
    }
  }

  const shadow = stripShadowSuffix(source)
  if (shadow !== source) {
    const shadowMatch = findUniqueBy(inventory, sku => sku.toLowerCase() === shadow.toLowerCase())
    if (shadowMatch) {
      return match(source, shadowMatch, 'seller_cloud_shadow_of_sku', 0.97, { stripped: shadow })
    }
  }

  const box = stripBoxOrItemLabel(source)
  if (box !== source) {
    const boxMatch = findUniqueBy(inventory, sku => sku.toLowerCase() === box.toLowerCase())
    if (boxMatch) {
      return match(source, boxMatch, 'seller_cloud_sku_box_qty_and_item_label', 0.97, { stripped: box })
    }
  }

  const canonical = compactSku(source)
  const canonicalMatch = findUniqueBy(inventory, sku => compactSku(sku) === canonical)
  if (canonicalMatch) {
    return match(source, canonicalMatch, 'compact_canonical', 0.96, { canonical })
  }

  return null
}

export function buildSkuBridgeInsertRows(sourceSkus: string[], inventorySkus: string[]): SkuBridgeInsertRow[] {
  const rows: SkuBridgeInsertRow[] = []
  const seen = new Set<string>()

  for (const sourceSku of uniqueNonEmpty(sourceSkus)) {
    const matchResult = matchSellerCloudSku(sourceSku, inventorySkus)
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

function findUniqueBy(values: string[], predicate: (value: string) => boolean): string | null {
  const matches = values.filter(predicate)
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
