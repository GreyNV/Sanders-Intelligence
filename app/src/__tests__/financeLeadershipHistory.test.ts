import { describe, expect, it } from 'vitest'
import { mergeFinanceLeadershipHistory, readFinanceLeadershipHistory } from '@/lib/financeLeadershipHistory'
import type { ParsedLeadershipTool } from '@/lib/leadershipToolParser'
import type { FinanceLeadershipDetails } from '@/lib/financeLeadershipDetails'

const parsed=(rows:{month:string;current_year:number}[]):ParsedLeadershipTool=>({
  cashflow:{current_cash_balance:null,minimum_cash_floor:null,weeks:[]},payroll:{departments:[]},
  pnl:{accounts:[{account:'Income',periods:rows.map(row=>({...row,last_year:0,difference_pct:null}))}]},
  budget:{sales:rows.map(row=>({month:row.month,budgeted_sales:row.current_year}))},
  sales_simulation:{noi_benchmark_pct:.09,latest_income:0,latest_noi:0,latest_noi_pct:null,sales_needed_for_benchmark:null},source_meta:{},
})
const details=(month:string,income:number|null,payroll:number|null):FinanceLeadershipDetails=>({
  channels:[{month,channel:'Shop',income,grossMargin:.4,operatingMargin:.1}],
  classBudgets:[{month,channel:'Shop',budget:100,actual:120,variance:-20}],
  payrollTotals:[{month,payroll}],payrollDepartments:[{month,department:'Finance',payroll}],cashWeeks:[],
})

describe('Finance Leadership history',()=>{
  it('retains months that fall off, replaces updated values, preserves blanks, and recalculates variances',()=>{
    const july='2026-07-01', august='2026-08-01', september='2026-09-01'
    const initial=mergeFinanceLeadershipHistory(null,{filename:'old.xlsm',parsed:parsed([{month:july,current_year:100},{month:august,current_year:200}]),details:details(august,200,80)},'2026-09-01T00:00:00Z')
    const updatedDetails=details(august,250,null)
    updatedDetails.classBudgets=[{month:august,channel:'SHOP',budget:null,actual:130,variance:null},...details(september,300,90).classBudgets]
    updatedDetails.channels.push(...details(september,300,90).channels)
    updatedDetails.payrollTotals.push(...details(september,300,90).payrollTotals)
    updatedDetails.payrollDepartments!.push(...details(september,300,90).payrollDepartments!)
    const updated=mergeFinanceLeadershipHistory(initial,{filename:'new.xlsm',parsed:parsed([{month:august,current_year:250},{month:september,current_year:300}]),details:updatedDetails},'2026-10-01T00:00:00Z')
    expect(updated.filename).toBe('new.xlsm')
    expect(updated.parsed.pnl.accounts[0].periods.map(p=>[p.month,p.current_year])).toEqual([[july,100],[august,250],[september,300]])
    expect(updated.details.channels.find(r=>r.month===august)?.income).toBe(250)
    expect(updated.details.payrollTotals.find(r=>r.month===august)?.payroll).toBe(80)
    expect(updated.details.payrollDepartments?.find(r=>r.month===august)?.payroll).toBe(80)
    expect(updated.details.classBudgets.find(r=>r.month===august)).toMatchObject({budget:100,actual:130,variance:-30})
    const corrected=mergeFinanceLeadershipHistory(updated,{filename:'corrected.xlsm',parsed:parsed([{month:august,current_year:0}]),details:details(august,0,0)},'2026-10-02T00:00:00Z')
    expect(corrected.parsed.pnl.accounts[0].periods.find(row=>row.month===august)?.current_year).toBe(0)
    expect(corrected.details.payrollTotals.find(row=>row.month===august)?.payroll).toBe(0)
    expect(readFinanceLeadershipHistory(JSON.stringify(updated))).toEqual(updated)
    expect(readFinanceLeadershipHistory('{"version":1}')).toBeNull()
  })
})
