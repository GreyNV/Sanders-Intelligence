import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const source = readFileSync('../supabase/functions/sync-sales/index.ts', 'utf8').replace(/^import .*$/m, '')
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
const api = new Function('Deno', `${js}; return { orderCogsTotal, profitAndLossFields, requireAdminOrService };`)({ serve() {}, env: { get: () => 'actual-service-secret' } })
describe('sales sync inventory cost and authorization', () => {
  it('uses goods cost even when total expenses are larger or unavailable', () => {
    expect(api.orderCogsTotal({ ItemCostUsd: '3.06', OrderCostUsd: '11.97' })).toMatchObject({ amount: 3.06, applyCurrencyRate: false })
    expect(api.orderCogsTotal({ ItemCostUsd: '7.82', OrderCostUsd: 'N/A' }).amount).toBe(7.82)
    expect(api.orderCogsTotal({ OrderCostUsd: '11.97' })).toBeNull()
    expect(api.orderCogsTotal({ ItemCostUsd: 0 }).amount).toBe(0)
    expect(api.orderCogsTotal({ ItemCostUsd: -3 }).amount).toBe(-3)
    expect(api.profitAndLossFields({ ItemCostUsd: 4, ItemCost: 5 })).toMatchObject({ ItemCostUsd: 4, ItemCost: 5 })
  })
  it('rejects a forged service-role claim and accepts only the configured service secret', async () => {
    const forged = `e30.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.fake`
    const client = { auth: { getUser: async () => ({ data: { user: null }, error: new Error('invalid') }) } }
    await expect(api.requireAdminOrService(new Request('https://example.com', { headers: { Authorization: `Bearer ${forged}` } }), client)).rejects.toThrow('Invalid bearer token')
    await expect(api.requireAdminOrService(new Request('https://example.com', { headers: { Authorization: 'Bearer actual-service-secret' } }), client)).resolves.toBeUndefined()
  })
})