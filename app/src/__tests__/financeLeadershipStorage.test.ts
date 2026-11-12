import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSaveRyanFinanceLeadership } from '@/hooks/useStitchSlideHtmlBlocks'
import { mergeFinanceLeadershipHistory, readFinanceLeadershipHistory } from '@/lib/financeLeadershipHistory'
import type { ParsedLeadershipTool } from '@/lib/leadershipToolParser'
import type { FinanceLeadershipDetails } from '@/lib/financeLeadershipDetails'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const db=vi.hoisted(()=>({record:null as {html_code:string;updated_at:string}|null,concurrent:null as {html_code:string;updated_at:string}|null,fail:false}))
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({profile:{id:'admin',role:'admin',is_active:true}})}))
vi.mock('@/lib/supabase',()=>({supabase:{from:()=>({
  select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:db.record,error:null})})})}),
  insert:(payload:{html_code:string;updated_at:string})=>({select:()=>({maybeSingle:async()=>{
    if(db.fail)return {data:null,error:{message:'save failed'}}
    if(db.record)return {data:null,error:{code:'23505'}}
    db.record={html_code:payload.html_code,updated_at:payload.updated_at};return {data:{id:'one'},error:null}
  }})}),
  update:(payload:{html_code:string;updated_at:string})=>{
    let expected='';let count=0
    const builder={eq:(_name:string,value:string)=>{if(++count===3)expected=value;return builder},select:()=>({maybeSingle:async()=>{
      if(db.fail)return {data:null,error:{message:'save failed'}}
      if(db.concurrent){db.record=db.concurrent;db.concurrent=null;return {data:null,error:null}}
      if(db.record?.updated_at!==expected)return {data:null,error:null}
      db.record={html_code:payload.html_code,updated_at:payload.updated_at};return {data:{id:'one'},error:null}
    }})}
    return builder
  },
})}}))

const parsed=(month:string,value:number):ParsedLeadershipTool=>({cashflow:{current_cash_balance:null,minimum_cash_floor:null,weeks:[]},payroll:{departments:[]},pnl:{accounts:[{account:'Income',periods:[{month,current_year:value,last_year:0,difference_pct:null}]}]},budget:{sales:[]},sales_simulation:{noi_benchmark_pct:.09,latest_income:0,latest_noi:0,latest_noi_pct:null,sales_needed_for_benchmark:null},source_meta:{}})
const details:FinanceLeadershipDetails={channels:[],classBudgets:[],cashWeeks:[],payrollTotals:[],payrollDepartments:[]}

describe('saving Finance Leadership history',()=>{
  beforeEach(()=>{db.record=null;db.concurrent=null;db.fail=false})
  it('retries against the newest history if another upload saves concurrently',async()=>{
    const first=mergeFinanceLeadershipHistory(null,{filename:'a',parsed:parsed('2026-07-01',1),details},'2026-08-01T00:00:00.000Z')
    const concurrent=mergeFinanceLeadershipHistory(first,{filename:'b',parsed:parsed('2026-08-01',2),details},'2026-09-01T00:00:00.000Z')
    db.record={html_code:JSON.stringify(first),updated_at:first.uploadedAt}
    db.concurrent={html_code:JSON.stringify(concurrent),updated_at:concurrent.uploadedAt}
    const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})
    let save:ReturnType<typeof useSaveRyanFinanceLeadership>['mutateAsync']
    function Test(){save=useSaveRyanFinanceLeadership().mutateAsync;return null}
    const container=document.createElement('div');document.body.append(container);const root=createRoot(container)
    await act(async()=>root.render(createElement(QueryClientProvider,{client},createElement(Test))))
    await act(async()=>{await save!({filename:'c',parsed:parsed('2026-09-01',3),details})})
    const result=readFinanceLeadershipHistory(db.record!.html_code)!
    expect(result.parsed.pnl.accounts[0].periods.map(row=>row.month)).toEqual(['2026-07-01','2026-08-01','2026-09-01'])
    expect(client.getQueryData(['stitch_slide_html_blocks','ryan-finance-leadership'])).toEqual(result)
    db.fail=true
    await act(async()=>{await expect(save!({filename:'d',parsed:parsed('2026-10-01',4),details})).rejects.toMatchObject({message:'save failed'})})
    expect(readFinanceLeadershipHistory(db.record!.html_code)?.filename).toBe('c')
    await act(async()=>root.unmount());container.remove();client.clear()
  })
})
