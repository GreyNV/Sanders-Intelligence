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
