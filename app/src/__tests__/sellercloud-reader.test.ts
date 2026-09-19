import { describe,expect,it } from 'vitest'
// @ts-expect-error shared Node module
import { sellerCloudReader } from '../../scripts/lib/sellercloud-reader.mjs'
describe('SellerCloud backfill transport',()=>{
 it('retries a network timeout without losing authentication',async()=>{
  let reads=0
  const transport=async(url:string)=>{
   if(url.endsWith('/api/token'))return new Response(JSON.stringify({access_token:'test'}))
   if(++reads===1)throw new Error('timeout')
   return new Response(JSON.stringify({ok:true}))
  }
  const reader=sellerCloudReader({SELLERCLOUD_DELTA_BASE:'https://example.com',SELLERCLOUD_USERNAME:'test',SELLERCLOUD_PASSWORD:'test'},transport,async()=>{})
  expect(await reader('/api/Orders')).toEqual({ok:true})
  expect(reads).toBe(2)
 })
})

it('coalesces concurrent expired-token refreshes', async () => {
  let tokens = 0
  let release: () => void = () => {}
  const delayed = new Promise<void>(resolve => { release = resolve })
  const transport = async (url: string, options: { headers: Record<string, string> }) => {
    if (url.endsWith('/api/token')) return new Response(JSON.stringify({ access_token: `token-${++tokens}` }))
    if (options.headers.Authorization === 'Bearer token-1') {
      if (url.endsWith('/second')) await delayed
      return new Response('', { status: 401 })
    }
    release()
    return new Response(JSON.stringify({ ok: true }))
  }
  const reader = sellerCloudReader({ SELLERCLOUD_DELTA_BASE: 'https://example.com', SELLERCLOUD_USERNAME: 'test', SELLERCLOUD_PASSWORD: 'test' }, transport, async () => {})
  const results = await Promise.all([reader('/first'), reader('/second')])
  expect(results).toEqual([{ ok: true }, { ok: true }])
  expect(tokens).toBe(2)
})