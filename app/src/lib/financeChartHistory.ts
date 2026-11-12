/** Values saved with a Finance deck. Percentages are fractions, not whole percentages. */
export interface FinanceChartMonth {
  month:string
  forecastIncome:number|null
  forecastNoi:number|null
  forecastNoiPct:number|null
  goalIncome:number|null
  goalNoi:number|null
  goalNoiPct:number|null
  projectedPayroll:number|null
  forecastPayrollPct:number|null
  goalPayrollPct:number|null
  actualIncome:number|null
  actualNoi:number|null
  actualNoiPct:number|null
  actualPayroll:number|null
  actualPayrollPct:number|null
  payrollDetails:string|null
}
const fields: (keyof Omit<FinanceChartMonth,'month'|'payrollDetails'>)[] = ['forecastIncome','forecastNoi','forecastNoiPct','goalIncome','goalNoi','goalNoiPct','projectedPayroll','forecastPayrollPct','goalPayrollPct','actualIncome','actualNoi','actualNoiPct','actualPayroll','actualPayrollPct']
export function readFinanceChartMonths(value:unknown):FinanceChartMonth[] {
  if(!Array.isArray(value))return []
  const seen=new Set<string>()
  return value.flatMap(raw=>{
    if(!raw||typeof raw!=='object'||typeof raw.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(raw.month)||seen.has(raw.month))return []
    if(fields.some(field=>raw[field]!==null && !(typeof raw[field]==='number'&&Number.isFinite(raw[field]))))return []
    if(raw.payrollDetails!==null && (typeof raw.payrollDetails!=='string'||raw.payrollDetails.length>4000))return []
    seen.add(raw.month)
    return [raw as FinanceChartMonth]
  }).sort((a,b)=>a.month.localeCompare(b.month))
}
const parseValue=(value:string|null,percent=false):number|null=>{
  const text=(value??'').trim().replace(/−/g,'-').replace(/[$,%\s]/g,'')
  if(!text||text==='Pending')return null
  const result=Number(text)
  return Number.isFinite(result)?result/(percent?100:1):null
}
const parseMonth=(value:string|null):string|null=>{
  const match=/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{2})$/.exec((value??'').trim())
  if(!match)return null
  return `20${match[2]}-${String(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(match[1])+1).padStart(2,'0')}-01`
}

/** Recover rounded forecasts from decks saved before chart history was embedded. */
export function readLegacyFinanceChartMonths(document:Document):FinanceChartMonth[] {
  const rows=new Map<string,FinanceChartMonth>()
  const tableRows=(title:string)=>document.querySelectorAll(`[data-finance-slide="${title}"] table tbody tr`)
  for(const tr of tableRows('NOI · two paths')) {
    const c=[...tr.querySelectorAll('td')].map(td=>td.textContent), month=parseMonth(c[0])
    if(!month||c.length<8)continue
    rows.set(month,{month,forecastIncome:parseValue(c[1]),forecastNoi:parseValue(c[3]),forecastNoiPct:parseValue(c[4],true),goalIncome:parseValue(c[5]),goalNoi:parseValue(c[6]),goalNoiPct:parseValue(c[7],true),projectedPayroll:null,forecastPayrollPct:null,goalPayrollPct:null,actualIncome:null,actualNoi:null,actualNoiPct:null,actualPayroll:null,actualPayrollPct:null,payrollDetails:null})
  }
  for(const tr of tableRows('Payroll · 8% of income')) {
    const c=[...tr.querySelectorAll('td')].map(td=>td.textContent), month=parseMonth(c[0])
    const row=month?rows.get(month):undefined
    if(!row||c.length<5)continue
    const [forecast,goal]=(c[4]??'').split('/')
    row.projectedPayroll=parseValue(c[3]);row.forecastPayrollPct=parseValue(forecast,true);row.goalPayrollPct=parseValue(goal,true)
  }
  return [...rows.values()].sort((a,b)=>a.month.localeCompare(b.month))
}
