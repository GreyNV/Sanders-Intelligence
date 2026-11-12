import type { ParsedLeadershipTool } from './leadershipToolParser'
import { normalizeFinanceClassName, type FinanceLeadershipDetails } from './financeLeadershipDetails'

/** Parsed Finance data, rather than the workbook binary, is kept between uploads. */
export interface FinanceLeadershipHistory {
  version:1
  filename:string
  uploadedAt:string
  parsed:ParsedLeadershipTool
  details:FinanceLeadershipDetails
}

type Row = {month:string}
function mergeRows<T extends Row>(oldRows:T[],newRows:T[],key:(row:T)=>string):T[] {
  const rows=new Map(oldRows.map(row=>[key(row),{...row}]))
  for(const row of newRows) {
    const id=key(row), previous=rows.get(id)
    if(!previous){rows.set(id,{...row});continue}
    // Empty cells do not overwrite a value previously reported for that month.
    const combined={...previous}
    for(const name of Object.keys(row) as (keyof T)[]) if(row[name]!==null&&row[name]!==undefined) combined[name]=row[name]
    rows.set(id,combined)
  }
  return [...rows.values()].sort((a,b)=>a.month.localeCompare(b.month)||key(a).localeCompare(key(b)))
}
const byMonth=(r:Row)=>r.month
const byName=(name:string,month:string)=>`${normalizeFinanceClassName(name)}|${month}`

export function mergeFinanceLeadershipHistory(previous:FinanceLeadershipHistory|null, incoming:{filename:string;parsed:ParsedLeadershipTool;details:FinanceLeadershipDetails}, uploadedAt:string):FinanceLeadershipHistory {
  if(!previous) return {version:1,filename:incoming.filename,uploadedAt,parsed:incoming.parsed,details:{...incoming.details,payrollDepartments:incoming.details.payrollDepartments??[]}}
  const accounts=new Map(previous.parsed.pnl.accounts.map(row=>[normalizeFinanceClassName(row.account),{...row,periods:[...row.periods]}]))
  for(const account of incoming.parsed.pnl.accounts) {
    const key=normalizeFinanceClassName(account.account), old=accounts.get(key)
    accounts.set(key,{...account,periods:mergeRows(old?.periods??[],account.periods,byMonth)})
  }
  const classBudgets=mergeRows(previous.details.classBudgets,incoming.details.classBudgets,r=>byName(r.channel,r.month))
    .map(row=>({...row,variance:row.budget!==null&&row.actual!==null?row.budget-row.actual:null}))
  return {
    version:1, filename:incoming.filename, uploadedAt,
    parsed:{...incoming.parsed,pnl:{accounts:[...accounts.values()]},budget:{sales:mergeRows(previous.parsed.budget.sales,incoming.parsed.budget.sales,byMonth)}},
    details:{
      channels:mergeRows(previous.details.channels,incoming.details.channels,r=>byName(r.channel,r.month)),
      classBudgets,
      payrollTotals:mergeRows(previous.details.payrollTotals,incoming.details.payrollTotals,byMonth),
      payrollDepartments:mergeRows(previous.details.payrollDepartments??[],incoming.details.payrollDepartments??[],r=>byName(r.department,r.month)),
      // The 13-week forecast is a current snapshot, not monthly actual history.
      cashWeeks:incoming.details.cashWeeks,
    },
  }
}

export function readFinanceLeadershipHistory(json:string):FinanceLeadershipHistory|null {
  try {
    const value=JSON.parse(json) as FinanceLeadershipHistory
    if(value.version!==1||typeof value.filename!=='string'||typeof value.uploadedAt!=='string'||!value.parsed||!value.details||
      !value.parsed.cashflow||!Array.isArray(value.parsed.cashflow.weeks)||!value.parsed.payroll||!Array.isArray(value.parsed.payroll.departments)||!value.parsed.sales_simulation||!value.parsed.source_meta||
      !Array.isArray(value.parsed.pnl?.accounts)||!value.parsed.pnl.accounts.every(a=>typeof a.account==='string'&&Array.isArray(a.periods))||
      !Array.isArray(value.parsed.budget?.sales)||!Array.isArray(value.details.channels)||!Array.isArray(value.details.classBudgets)||
      !Array.isArray(value.details.cashWeeks)||!Array.isArray(value.details.payrollTotals)||!Array.isArray(value.details.payrollDepartments))return null
    return value
  } catch {return null}
}
