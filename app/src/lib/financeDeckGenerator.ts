import type { LeadershipToolSnapshot } from '@/types'
import type { HistoricalStatementMonth, HistoricalChannelStatement } from './financeHistoricalStatements'
import type { FinanceChannelMonth, FinanceClassMappings, FinanceLeadershipDetails } from './financeLeadershipDetails'
import { applyFinanceClassMappings } from './financeLeadershipDetails'
import type { WarehouseVariance } from './financeWarehouseBudget'
import { cashFloorStatus } from './financeWarehouseBudget'
import { buildGrowthScenario } from './financeGrowthScenario'
import { buildPnlForecastPath } from '@/pages/csuite/StitchNorthStar.helpers'
import { layoutFinanceTimeline } from './financeTimelineLayout'

export type MilestoneStatus = 'green' | 'yellow' | 'red' | 'pending'
export type MilestoneCompletion = 'unknown' | 'unfinished' | 'achieved'
export interface FinanceMilestone { id: string; date: string; lane: 'Execution' | 'Guardrail' | 'Growth lever'; label: string }
export type FinanceMilestoneEdits = Record<string, { date: string; label: string }>
export function validFinanceMilestoneDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
export const FINANCE_MILESTONES: FinanceMilestone[] = [
  { id:'close',date:'2026-12-31',lane:'Execution',label:'Finance close workflows mapped' },
  { id:'workflow10',date:'2027-03-31',lane:'Execution',label:'10% of tasks on workflows' },
  { id:'workflow35',date:'2027-06-30',lane:'Execution',label:'35% · workflow library live' },
  { id:'workflow70',date:'2027-08-31',lane:'Execution',label:'70% of tasks on workflows' },
  { id:'workflow100',date:'2027-10-30',lane:'Execution',label:'100% of tasks on workflows' },
  { id:'draftbudget',date:'2027-02-28',lane:'Guardrail',label:'Draft budgets' },
  { id:'finalbudget',date:'2027-04-30',lane:'Guardrail',label:'Budget finalized · cost guardrail live' },
  ...[['may','05','31'],['jun','06','30'],['jul','07','31'],['aug','08','31'],['sep','09','30'],['oct','10','31']].map(([id,month,day]): FinanceMilestone => ({ id:`budget-review-${id}`,date:`2027-${month}-${day}`,lane:'Guardrail',label:'Monthly budget review' })),
  { id:'reviewq1',date:'2027-01-31',lane:'Guardrail',label:'Quarterly expense review · Q1' },
  { id:'reviewq2',date:'2027-04-30',lane:'Guardrail',label:'Quarterly expense review · Q2' },
  { id:'reviewq3',date:'2027-07-31',lane:'Guardrail',label:'Quarterly expense review · Q3' },
  { id:'reviewq4',date:'2027-10-30',lane:'Guardrail',label:'Quarterly expense review · Q4' },
  { id:'margin',date:'2027-02-28',lane:'Growth lever',label:'Margin by channel visible' },
  { id:'warehouse1',date:'2027-01-31',lane:'Growth lever',label:'Research · narrow to three states' },
  { id:'warehouse2',date:'2027-04-30',lane:'Growth lever',label:'Due diligence · site visits' },
  { id:'warehouse3',date:'2027-07-31',lane:'Growth lever',label:'Purchase or lease · financing' },
  { id:'warehouse4',date:'2027-10-30',lane:'Growth lever',label:'Warehouse live' },
]
export interface FinanceDeckInput {
  snapshot: LeadershipToolSnapshot
  details: FinanceLeadershipDetails
  warehouse: WarehouseVariance[]
  history: HistoricalStatementMonth[]
  channelHistory: HistoricalChannelStatement[]
  statuses: Record<string, MilestoneStatus>
  notes: Record<string, string>
  customMilestones?: FinanceMilestone[]
  milestoneEdits?: FinanceMilestoneEdits
  completion?: Record<string, MilestoneCompletion>
  classMappings?: FinanceClassMappings
  channelMappings?: Record<string,string>
  workflowAdoptionPct?: number | null
  workflowAdoptionDate?: string | null
  asOf: string
  currentMonthProjectedSales?: number | null
}
export interface FinanceDeckSavedInputs {
  history: HistoricalStatementMonth[]
  channelHistory: HistoricalChannelStatement[]
  statuses: Record<string, MilestoneStatus>
  notes: Record<string, string>
  customMilestones: FinanceMilestone[]
  milestoneEdits: FinanceMilestoneEdits
  completion: Record<string, MilestoneCompletion>
  classMappings: FinanceClassMappings
  channelMappings: Record<string,string>
  workflowAdoptionPct: number | null
  workflowAdoptionDate: string | null
}

/** Read only the generator's embedded baselines and answers, not executable HTML. */
export function readFinanceDeckSavedInputs(html: string): FinanceDeckSavedInputs | null {
  if (!html.trim()) return null
  try {
    const node = new DOMParser().parseFromString(html, 'text/html').querySelector('script[data-finance-inputs]')
    const data = JSON.parse(node?.textContent ?? '') as Partial<FinanceDeckSavedInputs> & { version?: number }
    if (data.version !== 1 || !Array.isArray(data.history) || !Array.isArray(data.channelHistory)) return null
    const history = data.history.filter(row => typeof row.month === 'string' && (row.income === null || typeof row.income === 'number'))
    const channelHistory = data.channelHistory.filter(row => typeof row.month === 'string' && typeof row.channel === 'string' && (row.income === null || typeof row.income === 'number'))
    const statuses = Object.fromEntries(Object.entries(data.statuses ?? {}).filter(([, value]) => ['green','yellow','red','pending'].includes(value))) as Record<string, MilestoneStatus>
    const notes = Object.fromEntries(Object.entries(data.notes ?? {}).filter(([, value]) => typeof value === 'string')) as Record<string, string>
    const used = new Set(FINANCE_MILESTONES.map(m => m.id))
    const customMilestones = (Array.isArray(data.customMilestones) ? data.customMilestones : []).filter(m => {
      if (!m || typeof m.id !== 'string' || !/^custom-[a-zA-Z0-9-]+$/.test(m.id) || used.has(m.id) || !['Execution','Guardrail','Growth lever'].includes(m.lane) || !validFinanceMilestoneDate(m.date) || typeof m.label !== 'string' || !m.label.trim() || m.label.length > 80) return false
      used.add(m.id); return true
    })
    const ids = used
    const milestoneEdits = Object.fromEntries(Object.entries(data.milestoneEdits ?? {}).filter(([id, value]) => ids.has(id) && value && typeof value.date === 'string' && validFinanceMilestoneDate(value.date) && typeof value.label === 'string' && value.label.trim().length > 0 && value.label.length <= 80)) as FinanceMilestoneEdits
    const completion = Object.fromEntries(Object.entries(data.completion ?? {}).filter(([id, value]) => ids.has(id) && ['unknown','unfinished','achieved'].includes(value))) as Record<string, MilestoneCompletion>
    const classMappings = Object.fromEntries(Object.entries(data.classMappings ?? {}).filter(([source,target]) => typeof source === 'string' && source.length > 0 && source.length <= 200 && typeof target === 'string' && target.trim().length > 0 && target.length <= 200)) as FinanceClassMappings
    const channelMappings = Object.fromEntries(Object.entries(data.channelMappings ?? {}).filter(([source,target]) => typeof source === 'string' && source.length > 0 && source.length <= 200 && typeof target === 'string' && target.trim().length > 0 && target.length <= 200)) as Record<string,string>
    const workflowAdoptionPct = typeof data.workflowAdoptionPct === 'number' && Number.isFinite(data.workflowAdoptionPct) && data.workflowAdoptionPct >= 0 && data.workflowAdoptionPct <= 100 ? data.workflowAdoptionPct : null
    const workflowAdoptionDate = typeof data.workflowAdoptionDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.workflowAdoptionDate) ? data.workflowAdoptionDate : null
    return { history, channelHistory, statuses, notes, customMilestones, milestoneEdits, completion, classMappings, channelMappings, workflowAdoptionPct, workflowAdoptionDate }
  } catch { return null }
}
const esc = (s: unknown) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
const fmtPct = (n: number | null | undefined) => n == null || !Number.isFinite(n) ? 'Pending' : `${(n*100).toFixed(1)}%`
const fmtMoney = (n: number | null | undefined) => n == null || !Number.isFinite(n) ? 'Pending' : `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US',{maximumFractionDigits:0})}`
const short = (s: string) => new Date(`${s.slice(0,7)}-01T12:00:00Z`).toLocaleDateString('en-US',{month:'short',year:'2-digit',timeZone:'UTC'})
const dayLabel = (s: string) => new Date(`${s}T12:00:00Z`).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})
const prevMonth = (s: string) => { const [y,m]=s.slice(0,7).split('-').map(Number); const d=new Date(Date.UTC(y,m-2,1)); return d.toISOString().slice(0,10) }
const statusClass = (pct: number | null) => pct === null ? 'pending' : pct >= .09 ? 'green' : 'yellow'
const channelKey=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()
/** Rank by total income in the four completed months; retain the last month's values separately. */
export function topFinanceChannels(rows: FinanceChannelMonth[], period: string): (FinanceChannelMonth & { fourMonthIncome:number })[] {
  const last=prevMonth(period), start=prevMonth(prevMonth(prevMonth(last)))
  const grouped=new Map<string,{ name:string; income:number; last:FinanceChannelMonth|null }>()
  for(const row of rows) {
    if(row.month<start || row.month>=period || row.income===null || !Number.isFinite(row.income)) continue
    const key=channelKey(row.channel), entry=grouped.get(key)??{name:row.channel,income:0,last:null}
    entry.income+=row.income
    if(row.month===last) entry.last=row
    grouped.set(key,entry)
  }
  return [...grouped.values()].filter(x=>x.income>0).sort((a,b)=>b.income-a.income).slice(0,10).map(x=>({
    ...(x.last??{month:last,channel:x.name,income:null,grossMargin:null,operatingMargin:null}), fourMonthIncome:x.income,
  }))
}
interface LineChartOptions { aria:string; first:string; second:string; reference:number|null; referenceLabel?:string; currency?:boolean; pointColors?:string[]; firstDetails?:string[]; secondDetails?:string[]; hideValues?:boolean; pointStatuses?:string[] }
const lineChart = (a:(number|null)[],b:(number|null)[],labels:string[], options:LineChartOptions={aria:'NOI forecast and 30 percent growth scenario',first:'Current forecast',second:'30% growth goal',reference:.09,referenceLabel:'9% floor'}) => {
  const all=[...a,...b,options.reference].filter((n): n is number => n!==null&&Number.isFinite(n))
  if (!all.length) return '<p class="note">Chart pending: no source values are available.</p>'
  const min=Math.min(0,...all),max=Math.max(options.currency?0:.12,...all),padding=options.currency?(max-min||Math.max(Math.abs(max),1))*.08:.025
  const lo=min-padding,hi=max+padding
  const x=(i:number)=>80+i*1000/Math.max(1,labels.length-1),y=(v:number)=>300-(v-lo)/(hi-lo)*240
  const format=(v:number)=>options.currency?fmtMoney(v):fmtPct(v)
  const axis=(v:number)=>options.currency?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:1}).format(v):fmtPct(v)
  const paths=(values:(number|null)[],color:string,name:string,dashed=false,pointColors?:string[],details?:string[])=>{let seg:string[]=[];const lines:string[]=[],points:string[]=[];const finish=()=>{if(seg.length)lines.push(`<polyline points="${seg.join(' ')}" fill="none" stroke="${color}" stroke-width="4"${dashed?' stroke-dasharray="9 5"':''}/>`);seg=[]};values.forEach((v,i)=>{if(v===null||!Number.isFinite(v)){finish()}else{seg.push(`${x(i)},${y(v)}`);const description=options.hideValues?`${labels[i]} · ${(options.pointStatuses?.[i]??'pending').toUpperCase()}`:`${labels[i]} · ${name}: ${format(v)}${details?.[i]?` · ${details[i]}`:''}`;points.push(`<circle tabindex="0" aria-label="${esc(description)}" cx="${x(i)}" cy="${y(v)}" r="5" fill="${esc(pointColors?.[i]??color)}"><title>${esc(description)}</title></circle>`)}});finish();return {lines:lines.join(''),points:points.join('')}}
  const ticks=Array.from({length:5},(_,i)=>lo+(hi-lo)*i/4)
  const first=paths(a,'#234b38',options.first,false,options.pointColors,options.firstDetails), second=paths(b,'#bf7540',options.second,true,undefined,options.secondDetails)
  return `<svg class="graph" viewBox="0 0 1160 350" role="img" aria-label="${esc(options.aria)}"><defs><clipPath id="plot-reveal"><rect class="plot-reveal" x="0" y="0" width="1160" height="350"/></clipPath></defs>${ticks.map(v=>`<line x1="80" x2="1080" y1="${y(v)}" y2="${y(v)}" stroke="#e2dfd5"/>${options.hideValues?'':`<text x="70" y="${y(v)+4}" text-anchor="end">${esc(axis(v))}</text>`}`).join('')}${options.reference===null?'':`<line x1="80" x2="1080" y1="${y(options.reference)}" y2="${y(options.reference)}" stroke="#8c8e85" stroke-dasharray="3 5"/><text x="1080" y="${y(options.reference)-7}" text-anchor="end">${esc(options.referenceLabel??'Target')}</text>`}<g clip-path="url(#plot-reveal)">${first.lines}${second.lines}${second.points}${first.points}</g>${labels.map((m,i)=>`<text x="${x(i)}" y="330" text-anchor="middle">${esc(m)}</text>`).join('')}</svg>`
}
const table = (heads:string[],rows:string[][], cellClass?: (row:number, col:number)=>string, emptyMessage='Pending source data') => `${heads.length>7?'<p class="table-hint">Scroll horizontally to see all months.</p>':''}<div class="table-wrap" role="region" tabindex="0" aria-label="Scrollable data table" data-finance-scroll><table><thead><tr>${heads.map(v=>`<th>${esc(v)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map((row,ri)=>`<tr>${row.map((v,ci)=>`<td class="${esc(cellClass?.(ri,ci)??'')}">${esc(v)}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${heads.length}">${esc(emptyMessage)}</td></tr>`}</tbody></table></div>`
interface BudgetPeriod { month:string; budget:number|null; actual:number|null; variance:number|null }
/** Show source budgets even when no comparable item qualifies for the top-ten misses. */
const budgetAvailability=(rows:BudgetPeriod[],periods:string[])=>table(['Month','Budget provided','Budget rows'],periods.map(month=>{
  const supplied=rows.filter(row=>row.month===month&&row.budget!==null)
  return [short(month),fmtMoney(supplied.length?supplied.reduce((sum,row)=>sum+row.budget!,0):null),String(supplied.length)]
}))
const varianceTable=(periods:string[],last:string,start:string,rows:{name:string; data:BudgetPeriod[]}[],empty:string)=>{
  const headers=['Class / account','Status',...periods.flatMap((month,i)=>[`${short(month)} budget`,`${short(month)} ${i?'projected':'actual'}`,`${short(month)} variance`,`${short(month)} variance %`])]
  const cells=rows.map(({name,data})=>{
    const recent=data.filter(row=>row.month>=start&&row.month<=last&&row.actual!==null)
    const run=recent.length?recent.reduce((sum,row)=>sum+row.actual!,0)/recent.length:null
    return [name,'Matched',...periods.flatMap((month,i)=>{
      const entry=data.find(row=>row.month===month),budget=entry?.budget??null,actual=i===0?(entry?.actual??null):run
      const variance=budget!==null&&actual!==null?budget-actual:null
      return [fmtMoney(budget),fmtMoney(actual),fmtMoney(variance),fmtPct(variance!==null&&budget!==null&&budget!==0?variance/budget:null)]
    })]
  })
  return table(headers,cells,(ri,ci)=>ci>=2&&(ci-2)%4>=2&&/^[−-]/.test(cells[ri]?.[ci]??'')?'red':ci===1?'green':'',empty)
}
const section = (title:string,kicker:string,body:string) => `<section class="slide" data-finance-slide="${esc(title)}"><div class="inner"><div class="kicker">${esc(kicker)} · FINANCE NORTH STAR <span>RYAN</span></div><h1>${esc(title)}</h1>${body}</div></section>`

export function generateFinanceDeck(input: FinanceDeckInput): string {
  const deckSection=(title:string,kicker:string,body:string) => section(title,kicker,`<div class="source-meta">As of ${esc(input.asOf)} · Leadership Tool: ${esc(input.snapshot.filename)}</div>${body}`)
  const classBudgets=applyFinanceClassMappings(input.details.classBudgets,input.classMappings??{})
  const custom=input.customMilestones??[]
  const seen=new Set(FINANCE_MILESTONES.map(m=>m.id))
  for(const m of custom){
    if(!/^custom-[a-zA-Z0-9-]+$/.test(m.id)||seen.has(m.id)||!['Execution','Guardrail','Growth lever'].includes(m.lane)||!validFinanceMilestoneDate(m.date)||!m.label.trim()||m.label.length>80) throw new Error('Enter a valid unique custom milestone, date and category.')
    seen.add(m.id)
  }
  const milestones=[...FINANCE_MILESTONES,...custom].map(m=>{
    const edit=input.milestoneEdits?.[m.id]
    if (!edit) return m
    if (!validFinanceMilestoneDate(edit.date) || !edit.label.trim() || edit.label.length>80) throw new Error(`Enter a valid date and description for ${m.label}.`)
    return { ...m, date:edit.date, label:edit.label.trim() }
  })
  const timelineMilestones=milestones.filter(m=>m.date>='2026-11-01'&&m.date<='2027-10-31')
  const outsidePlan=milestones.length-timelineMilestones.length
  const workflowAdoptionValue = typeof input.workflowAdoptionPct === 'number' && Number.isFinite(input.workflowAdoptionPct) && input.workflowAdoptionPct >= 0 && input.workflowAdoptionPct <= 100 ? input.workflowAdoptionPct : null
  const workflowAdoptionDate = workflowAdoptionValue !== null && typeof input.workflowAdoptionDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.workflowAdoptionDate) && input.workflowAdoptionDate <= input.asOf ? input.workflowAdoptionDate : null
  const workflowAdoption = workflowAdoptionValue === null ? 'Pending' : `${workflowAdoptionValue}%${workflowAdoptionDate ? ` · ${workflowAdoptionDate}` : ' · date unknown'}`
  const period=`${input.asOf.slice(0,7)}-01`, last=prevMonth(period), fourMonthStart=prevMonth(prevMonth(prevMonth(prevMonth(period))))
  const forecast=buildPnlForecastPath(input.snapshot,.09,period,{expenseAnchorMonth:period,allowBelowFloorForecast:true})
  const growth=buildGrowthScenario(forecast.months.map(m=>m.month),input.history,forecast.variableCostPct,forecast.monthlyExpenseRunRate>0?forecast.monthlyExpenseRunRate:null)
  const missingGoalMonths=growth.filter(m=>m.goalSales===null).map(m=>short(m.month))
  const missingGoalCosts=growth.some(m=>m.goalSales!==null&&m.goalNoi===null)
  const income=input.snapshot.pnl.accounts.find(x=>x.account==='Income')?.periods.find(p=>p.month===last)?.current_year??null
  const noi=input.snapshot.pnl.accounts.find(x=>x.account==='Grand Total'||x.account==='NOI')?.periods.find(p=>p.month===last)?.current_year??null
  const actualNoi=income!==null&&income>0&&noi!==null?noi/income:null
  const forecastBasis: Record<string,string> = { current_projection:'Current-month sales pace', budget:'Current-year budget × fulfillment', prior_year_budget:'Prior-year budget × fulfillment', missing:'Pending' }
  const noiSlide=deckSection('NOI · two paths','Guardrail',`<div class="topline"><div><span>LAST FULL MONTH · ${esc(short(last))}</span><strong class="${statusClass(actualNoi)}">${fmtPct(actualNoi)}</strong></div><p>NOI ${fmtMoney(noi)} · 9% floor. Green meets the floor; yellow is below it.</p></div><div class="legend"><i style="background:#234b38"></i> Current forecast · actual performance and budget fulfillment <i style="background:#bf7540"></i> 30% growth goal scenario (dashed) <i style="background:#8c8e85"></i> 9% floor (dashed)</div>${lineChart(forecast.months.map(m=>m.noiPct),growth.map(m=>m.goalNoiPct),forecast.months.map(m=>short(m.month)),{aria:'NOI forecast and 30 percent growth scenario',first:'Current forecast',second:'30% growth goal',reference:.09,referenceLabel:'9% floor',firstDetails:forecast.months.map(m=>`NOI ${fmtMoney(m.noi)}`),secondDetails:growth.map(m=>`NOI ${fmtMoney(m.goalNoi)}`)})}<p class="note">Current forecast follows the existing North Star method. Budget fulfillment uses all available completed months with matching income and budget. Cost assumptions use up to four completed months (${forecast.expenseBaseMonths.length?forecast.expenseBaseMonths.map(short).join(', '):'none available'}). Budget fulfillment: ${fmtPct(forecast.budgetFulfillmentPct)} · variable costs: ${fmtPct(forecast.variableCostPct)} of income · fixed monthly expense run rate: ${fmtMoney(forecast.monthlyExpenseRunRate>0?forecast.monthlyExpenseRunRate:null)}. The 30% goal applies to each matching prior-year Total Income, assuming returns and other income components grow proportionally; it uses the same variable-cost rate and fixed-cost run rate. Missing inputs remain pending. ${missingGoalMonths.length?`Prior-year Total Income is missing for: ${esc(missingGoalMonths.join(', '))}. `:''}${missingGoalCosts?'Goal NOI is pending because cost assumptions are unavailable. ':''}${esc(forecast.warning??'')}</p>${table(['Month','Forecast income','Forecast basis','Forecast NOI $','Forecast NOI %','Goal income','Goal NOI $','Goal NOI %'],forecast.months.map((m,i)=>[short(m.month),fmtMoney(m.forecastedSales),forecastBasis[m.salesSource]??'Pending',fmtMoney(m.noi),fmtPct(m.noiPct),fmtMoney(growth[i]?.goalSales),fmtMoney(growth[i]?.goalNoi),fmtPct(growth[i]?.goalNoiPct)]))}`)
  const channelRows=topFinanceChannels(input.details.channels,period)
  const historyIndex=new Map<string,HistoricalChannelStatement>(), duplicateHistory=new Set<string>()
  for(const row of input.channelHistory){const key=`${row.month}|${channelKey(row.channel)}`;if(historyIndex.has(key))duplicateHistory.add(key);else historyIndex.set(key,row)}
  const usedHistory=new Map<string,string>()
  for(const channel of channelRows){
    const key=channelKey(channel.channel), historyName=input.channelMappings?.[key]??channel.channel, historyKey=channelKey(historyName)
    if(input.channelHistory.some(row=>channelKey(row.channel)===historyKey)){
      const priorChannel=usedHistory.get(historyKey)
      if(priorChannel && priorChannel!==key) throw new Error(`Historical class ${historyName} is assigned to more than one top channel. Review channel history matches.`)
      usedHistory.set(historyKey,key)
    }
  }
  const channelActuals=input.details.channels.filter(x=>x.month>=fourMonthStart&&x.month<period&&x.income!==null&&x.income>0)
  const prior=(m:string)=>`${Number(m.slice(0,4))-1}${m.slice(4)}`
  const channels=deckSection('NOI by channel','Growth lever',`<p class="lead">Top 10 by revenue over the last four completed months · NOI dollars and percentage.</p>${table(['Channel','4-month revenue','Last month NOI $ / %',...forecast.months.map(m=>short(m.month)+' forecast / goal')],channelRows.map(c=>{
    const recent=channelActuals.filter(x=>channelKey(x.channel)===channelKey(c.channel)&&x.grossMargin!==null&&x.operatingMargin!==null).sort((a,b)=>b.month.localeCompare(a.month)).slice(0,4)
    const total=recent.reduce((s,x)=>s+(x.income??0),0)
    const cogsRate=total?recent.reduce((s,x)=>s+(x.income??0)*(1-(x.grossMargin??0)),0)/total:null
    const fixed=recent.length?recent.reduce((s,x)=>s+(x.income??0)*((x.grossMargin??0)-(x.operatingMargin??0)),0)/recent.length:null
    const result=(sales:number|null)=>sales!==null&&sales>0&&cogsRate!==null&&fixed!==null?sales*(1-cogsRate)-fixed:null
    const formatNoi=(sales:number|null)=>{const amount=result(sales);return amount===null?'Pending':`${fmtMoney(amount)} (${fmtPct(amount/sales!)})`}
    return [c.channel,fmtMoney(c.fourMonthIncome),`${fmtMoney(c.income!==null&&c.operatingMargin!==null?c.income*c.operatingMargin:null)} / ${fmtPct(c.operatingMargin)}`,...forecast.months.map(m=>{
      const historyName=input.channelMappings?.[channelKey(c.channel)]??c.channel, historyKey=`${prior(m.month)}|${channelKey(historyName)}`
      if(duplicateHistory.has(historyKey)) throw new Error(`More than one historical class matches ${historyName} in ${prior(m.month)}. Review the class statements.`)
      const previous=historyIndex.get(historyKey)?.income??null
      const company=input.history.find(x=>x.month===prior(m.month))?.income??null
      const share=previous!==null&&company!==null&&company>0?previous/company:null
      const forecastSales=share!==null&&m.forecastedSales!==null?share*m.forecastedSales:null
      return `${formatNoi(forecastSales)} / ${formatNoi(previous!==null&&previous>0?previous*1.3:null)}`
    })]
  }), (ri,ci)=>ci===2?statusClass(channelRows[ri]?.operatingMargin??null):'')}<p class="note">Forecast / goal: channel sales use the matching prior-year channel share of the company forecast, or prior-year channel income × 1.30 for the goal. COGS rate and fixed operating costs use up to four completed Leadership Tool months. Missing history or costs remain pending.</p>${Object.keys(input.channelMappings??{}).length?`<details class="milestone-details"><summary>Manually confirmed historical channel matches</summary>${table(['Current channel','Historical class'],Object.entries(input.channelMappings??{}))}</details>`:''}`)

  const payrollPeriod=input.details.payrollTotals.find(x=>x.month===last)?.payroll??null
  const payrollRatio=payrollPeriod!==null&&income!==null&&income>0?payrollPeriod/income:null
  const payrollStatus: MilestoneStatus = payrollRatio===null?'pending':payrollRatio<=.08?'green':'yellow'
  const cashForAsOf=input.details.cashWeeks.find(w=>{
    if (!w.date || w.date>input.asOf) return false
    const start=new Date(`${w.date}T00:00:00Z`).getTime(), asOf=new Date(`${input.asOf}T00:00:00Z`).getTime()
    return Number.isFinite(start)&&Number.isFinite(asOf)&&asOf-start<7*86400000
  })
  const cashStatus=cashFloorStatus(cashForAsOf?.endingCash??null,cashForAsOf?.vsFloor??null)
  const payrollHistory=input.details.payrollTotals.filter(p=>p.month>=fourMonthStart&&p.month<period&&p.payroll!==null)
  const projectedPayroll=payrollHistory.length?payrollHistory.reduce((sum,p)=>sum+(p.payroll??0),0)/payrollHistory.length:null
  const payrollMonths=new Set(payrollHistory.map(p=>p.month))
  const departments=[...new Set((input.details.payrollDepartments??[]).map(row=>row.department))]
  const departmentDetails=departments.map(department=>{
    const rows=(input.details.payrollDepartments??[]).filter(row=>row.department===department&&payrollMonths.has(row.month))
    const value=payrollMonths.size&&rows.length===payrollMonths.size&&rows.every(row=>row.payroll!==null)?rows.reduce((sum,row)=>sum+row.payroll!,0)/payrollMonths.size:null
    return `${department}: ${fmtMoney(value)}`
  }).join(' · ')
  const payrollTooltip=`Projected payroll ${fmtMoney(projectedPayroll)} · department monthly averages: ${departmentDetails||'Pending'}`
  const payrollForecast=forecast.months.map(m=>projectedPayroll!==null&&m.forecastedSales?projectedPayroll/m.forecastedSales:null)
  const payrollGoal=growth.map(m=>projectedPayroll!==null&&m.goalSales?projectedPayroll/m.goalSales:null)
  const payroll=deckSection('Payroll · 8% of income','Guardrail',`<div class="topline"><div><span>LAST FULL MONTH · ${esc(short(last))}</span><strong class="${payrollRatio===null?'pending':payrollRatio<=.08?'green':'yellow'}">${fmtPct(payrollRatio)}</strong></div><p>Payroll divided by income · 8% target</p></div><div class="legend"><i style="background:#234b38"></i> Payroll / current forecast <i style="background:#bf7540"></i> Payroll / 30% goal (dashed) <i style="background:#8c8e85"></i> 8% target</div>${lineChart(payrollForecast,payrollGoal,forecast.months.map(m=>short(m.month)),{aria:'Projected payroll as a percentage of income',first:'Payroll / current forecast',second:'Payroll / 30% goal',reference:.08,referenceLabel:'8% target',firstDetails:forecast.months.map(()=>payrollTooltip),secondDetails:forecast.months.map(()=>payrollTooltip)})}${table(['Month','Forecast income','30% goal income','Projected payroll','Forecast / goal payroll %'],forecast.months.map((m,i)=>[short(m.month),fmtMoney(m.forecastedSales),fmtMoney(growth[i]?.goalSales),fmtMoney(projectedPayroll),`${fmtPct(payrollForecast[i])} / ${fmtPct(payrollGoal[i])}`]))}<p class="note">Projected payroll holds the average of ${payrollHistory.length} available month(s) from the last four completed Leadership Tool months constant against forecast and 30% goal income. Missing payroll or sales data remains pending.</p>`)

  const periods=[last,...forecast.months.map(m=>m.month)]
  const classByName=new Map<string,typeof classBudgets>();for(const row of classBudgets){const k=channelKey(row.channel);classByName.set(k,[...(classByName.get(k)??[]),row])}
  const worst=[...classByName.values()].map(rows=>rows.find(r=>r.month===last)).filter((r):r is NonNullable<typeof r>=>Boolean(r&&r.variance!==null&&r.variance<0)).sort((a,b)=>(a.variance??0)-(b.variance??0)).slice(0,10)
  const noClassBudget=[...classByName.values()].map(rows=>rows.find(r=>r.month===last)).filter((r):r is NonNullable<typeof r>=>Boolean(r&&r.actual!==null&&r.budget===null)).sort((a,b)=>(b.actual??0)-(a.actual??0))
  const classCompared=classBudgets.filter(row=>row.month===last&&row.variance!==null).length
  const classBudget=deckSection('Budget by class','Guardrail',`<p class="lead">Ten largest unfavorable expense variances · ${esc(short(last))}.</p>${varianceTable(periods,last,fourMonthStart,worst.map(row=>({name:row.channel,data:classByName.get(channelKey(row.channel))??[]})),classCompared?'No unfavorable variances among matched classes.':'No comparable class budgets and actuals for this month.')}<p class="note">Variance = budget less expenditure; negative is overspent. Future expense is the average of up to four completed months, clearly labeled projected; variance is pending without a budget or expense history. ${classCompared} class(es) have comparable actuals and budgets; ${noClassBudget.length} class(es) with actuals have no matched budget and are excluded from the ranked misses.</p><details open class="milestone-details"><summary>Available monthly class budgets</summary>${budgetAvailability(classBudgets,periods)}</details>${noClassBudget.length?`<h2>Budget missing · ${esc(short(last))}</h2>${table(['Class','Actual expenditure','Budget / variance'],noClassBudget.map(r=>[r.channel,fmtMoney(r.actual),'Pending']))}`:''}${Object.keys(input.classMappings??{}).length?`<details class="milestone-details"><summary>Manually confirmed budget class matches</summary>${table(['Budget class','Actual class'],Object.entries(input.classMappings??{}))}</details>`:''}`)
  const group=new Map<string,WarehouseVariance[]>();for(const row of input.warehouse){const k=`${row.section}|${row.account}`;group.set(k,[...(group.get(k)??[]),row])}
  const whWorst=[...group.values()].map(rows=>rows.find(r=>r.month===last)).filter((r):r is WarehouseVariance=>Boolean(r&&r.variance!==null&&r.variance<0)).sort((a,b)=>(a.variance??0)-(b.variance??0)).slice(0,10)
  const whCompared=input.warehouse.filter(row=>row.month===last&&row.variance!==null).length
  const whNoBudget=input.warehouse.filter(row=>row.month===last&&row.actual!==null&&row.budget===null).sort((a,b)=>(b.actual??0)-(a.actual??0))
  const warehouse=deckSection('Warehouse budget','Guardrail',`<p class="lead">Ten largest unfavorable account variances · ${esc(short(last))}.</p>${varianceTable(periods,last,fourMonthStart,whWorst.map(row=>({name:`${row.section} · ${row.account}`,data:group.get(`${row.section}|${row.account}`)??[]})),whCompared?'No unfavorable variances among matched accounts.':'No comparable warehouse budgets and actuals for this month.')}<p class="note">Variance = budget less actual or projected expenditure; negative is overspent. Future expenditure uses the average of up to four completed months. Missing budgets or expense history remain pending. ${whCompared} account(s) have comparable actuals and budgets; ${whNoBudget.length} account(s) with actuals have no matched budget and are excluded from the ranked misses.</p><details open class="milestone-details"><summary>Available monthly warehouse budgets</summary>${budgetAvailability(input.warehouse,periods)}</details>${whNoBudget.length?`<h2>Budget missing · ${esc(short(last))}</h2>${table(['Account','Actual expenditure','Budget / variance'],whNoBudget.map(r=>[`${r.section} · ${r.account}`,fmtMoney(r.actual),'Pending']))}`:''}`)
  const cashColors={green:'#31804e',yellow:'#c99425',red:'#b64d40',pending:'#9b9c94'}
  const cashStatuses=input.details.cashWeeks.map(w=>cashFloorStatus(w.endingCash,w.vsFloor))
  const cash=deckSection('New product launches · cash','Growth lever',`<p class="lead">Weekly cash status · Leadership Tool 13-week forecast.</p><div class="legend"><i style="background:#31804e"></i> At / above floor <i style="background:#c99425"></i> Below floor <i style="background:#b64d40"></i> Negative cash <i style="background:#9b9c94"></i> Pending</div>${lineChart(input.details.cashWeeks.map(w=>w.endingCash),input.details.cashWeeks.map(w=>w.endingCash!==null&&w.vsFloor!==null?w.endingCash-w.vsFloor:null),input.details.cashWeeks.map(w=>w.date?dayLabel(w.date):`W${w.week}`),{aria:'Projected weekly cash status',first:'Ending cash',second:'Implied floor',reference:null,currency:true,hideValues:true,pointStatuses:cashStatuses,pointColors:cashStatuses.map(status=>cashColors[status])})}${table(['Week','Status'],input.details.cashWeeks.map((w,i)=>[w.date??`Week ${w.week}`,cashStatuses[i].toUpperCase()]),(ri,ci)=>ci===1?cashStatuses[ri]:'')}<p class="note">Status uses ending cash and the supplied column L difference. Green is at or above the floor; yellow is below the floor with nonnegative cash; red is negative cash. This is a company cash forecast, not a product-level launch schedule.</p>`)
  const channelKnown=channelRows.filter(row=>row.operatingMargin!==null)
  const channelBelow=channelKnown.filter(row=>row.operatingMargin!<.09).length
  const channelMissing=channelRows.length-channelKnown.length
  const channelSummary=channelKnown.length ? `${channelBelow}/${channelKnown.length} below 9%${channelMissing?` · ${channelMissing} pending`:''}` : 'Pending'
  const channelSummaryStatus: MilestoneStatus=channelBelow?'yellow':!channelKnown.length||channelMissing?'pending':'green'
  function varianceSummary(rows: { variance:number|null }[]) {
    const known=rows.filter(row=>row.variance!==null), misses=known.filter(row=>row.variance!<0).length, missing=rows.length-known.length
    const label=known.length ? `${misses}/${known.length} overspent${missing?` · ${missing} pending`:''}` : `Pending${missing?` · ${missing} incomplete`:''}`
    const status: MilestoneStatus=misses?'yellow':!known.length||missing?'pending':'green'
    return { label, status }
  }
  const classSummary=varianceSummary(classBudgets.filter(row=>row.month===last))
  const warehouseSummary=varianceSummary(input.warehouse.filter(row=>row.month===last))
  const layout=layoutFinanceTimeline(timelineMilestones)
  const colors:Record<MilestoneStatus,string>={green:'#31804e',yellow:'#c99425',red:'#b64d40',pending:'#9b9c94'}
  const effectiveStatus=(m:FinanceMilestone):MilestoneStatus=>input.completion?.[m.id]==='unfinished'&&m.date<input.asOf?'red':input.statuses[m.id]??'pending'
  const todayX=Math.min(1180,Math.max(280,layout.x(input.asOf))), guard=layout.guardrailTop
  const timeline=`<svg class="waterfall" viewBox="0 0 1280 ${layout.height}" role="img" aria-label="Finance milestone timeline"><line x1="${todayX}" x2="${todayX}" y1="30" y2="${guard+120}" stroke="#bf7540" stroke-width="2" stroke-dasharray="5 5"/><line class="scan" x1="280" x2="280" y1="30" y2="${guard+120}" stroke="#234b38" stroke-width="1.5" stroke-dasharray="4 5"/><text x="${todayX}" y="20" text-anchor="middle">AS OF ${esc(input.asOf)}</text>${layout.lanes.map(({lane,lineY})=>`<text x="8" y="${lineY}" class="lane">${esc(lane.toUpperCase())}</text>${lane==='Execution'?`<text x="8" y="${lineY+20}">Adoption: ${esc(workflowAdoption)}</text>`:''}<line x1="280" x2="1180" y1="${lineY}" y2="${lineY}" stroke="#c9cbc3" stroke-width="3"/>`).join('')}${layout.labels.map(({milestone:m,markerX,labelX,lineY,labelY,lines})=>{const st=effectiveStatus(m),delay=Math.max(0,(layout.x(m.date)-280)/900*5),dateText=`${dayLabel(m.date)} · ${st.toUpperCase()}`;return `<g tabindex="0" aria-label="${esc(m.date)} · ${esc(m.label)} · ${esc(st)}" style="animation-delay:${delay}s"><title>${esc(m.date)} · ${esc(m.label)} · ${esc(st)} · ${esc(input.notes[m.id]??'')}</title><circle cx="${markerX}" cy="${lineY}" r="10" fill="${colors[st]}"/><text x="${labelX}" y="${labelY}" text-anchor="middle" class="date">${esc(dateText)}</text>${lines.map((line,i)=>`<text x="${labelX}" y="${labelY+14+i*13}" text-anchor="middle">${esc(line)}</text>`).join('')}</g>`}).join('')}<line x1="280" x2="1180" y1="${guard}" y2="${guard}" stroke="#d8d7cf"/><text x="8" y="${guard+45}" class="lane">THE GUARDRAIL</text><text x="8" y="${guard+65}">directional shape · not numbers</text><path d="M280 ${guard+125} H410 L430 ${guard+112} H565 L585 ${guard+94} H730 L750 ${guard+80} H900 L920 ${guard+65} H1060 L1080 ${guard+50} H1180" fill="none" stroke="#31804e" stroke-width="3"/><path d="M280 ${guard+42} L1180 ${guard+80}" fill="none" stroke="#bf7540" stroke-width="3"/><path d="M280 ${guard+115} H1180" fill="none" stroke="#85877f" stroke-width="2" stroke-dasharray="6 5"/><text x="1170" y="${guard+43}" text-anchor="end" fill="#31804e">REVENUE</text><text x="1170" y="${guard+73}" text-anchor="end" fill="#bf7540">OVERHEAD % OF REVENUE</text><text x="1170" y="${guard+108}" text-anchor="end">VARIABLE COST PER ORDER</text>${Array.from({length:12},(_,i)=>{const d=new Date(Date.UTC(2026,10+i,1)).toISOString().slice(0,10);return `<text x="${layout.x(d)}" y="${guard+158}">${esc(short(d))}</text>`}).join('')}</svg>`
  const milestoneDetails=`<details class="milestone-details"><summary>View milestone details and evidence</summary><ul>${milestones.map(m=>{const status=effectiveStatus(m),completion=input.completion?.[m.id]??'unknown',note=input.notes[m.id]?.trim();return `<li><span class="${esc(status)}">${esc(status.toUpperCase())}</span> · ${esc(m.date)} · ${esc(m.label)} · ${esc(completion==='unknown'?'completion unconfirmed':completion==='achieved'?'achieved by due date (reported)':'unfinished')}${m.date<'2026-11-01'||m.date>'2027-10-31'?' · outside plan':''}${note?`<div>${esc(note)}</div>`:''}</li>`}).join('')}</ul></details>`
  const waterfall=deckSection('Finance plan · 12 months','Summary',`<div class="planrange">NOV 2026 — OCT 2027</div>${timeline}<div class="legend"><i style="background:#31804e"></i>Green <i style="background:#c99425"></i>Yellow <i style="background:#b64d40"></i>Red <i style="background:#9b9c94"></i>Pending</div><div class="bpr"><b>EVERY WEEK AT THE BPR</b><span class="${statusClass(actualNoi)}">NOI ${fmtPct(actualNoi)} · ${esc(short(last))}</span><span class="${channelSummaryStatus}">Channel NOI · ${esc(channelSummary)}</span><span class="${payrollStatus}">Payroll ${fmtPct(payrollRatio)} · ${esc(short(last))}</span><span class="${classSummary.status}">Class budget · ${esc(classSummary.label)}</span><span class="${warehouseSummary.status}">Warehouse · ${esc(warehouseSummary.label)}</span><span class="${cashStatus}">Cash vs floor · ${esc(cashStatus.toUpperCase())}</span><span>Workflow adoption · ${esc(workflowAdoption)} (manual)</span><span>Next milestone on its date?</span></div><p class="note">Overdue milestones marked unfinished turn red; other colors are Ryan’s answers. Hover over or focus a marker to highlight its label. Full milestone names and evidence are in the details below. The vertical line represents the generation date. NOI, channel, payroll and budget summaries use the last full month. Channel counts cover the top 10 by revenue; budget counts show comparable items and pending inputs. Cash uses the forecast week containing the as-of date.${outsidePlan?` ${outsidePlan} milestone(s) outside the plan appear in the details below.`:''}</p>${milestoneDetails}`)
  const slides=[noiSlide,channels,payroll,classBudget,warehouse,cash,waterfall]
  const style=`*{box-sizing:border-box}body{margin:0;background:#f5f2eb;color:#20241e;font-family:Segoe UI,Arial,sans-serif}.slide{display:none;padding:54px 5vw 70px;min-height:100vh}.slide.active{display:block}.inner{max-width:1480px;margin:auto}.kicker{color:#bf7540;letter-spacing:.22em;font-size:12px;font-weight:700}.kicker span{float:right;color:#777}h1{font:700 clamp(38px,5vw,72px)/.98 Impact,'Arial Narrow',sans-serif;text-transform:uppercase;margin:20px 0;color:#234b38}.source-meta{color:#777;font-size:11px;margin:-8px 0 14px}.lead,.note{color:#676a61;font-size:14px;line-height:1.5}.note{font-size:12px}.topline{display:flex;align-items:center;gap:36px;border-block:1px solid #dcd9cf;padding:14px 0}.topline span{display:block;color:#777;font-size:11px;letter-spacing:.1em}.topline strong{display:block;font:40px Impact,sans-serif}.green{color:#31804e;font-weight:700}.yellow{color:#ae7820;font-weight:700}.red{color:#b64d40;font-weight:700}.pending{color:#85877f}.legend{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:12px;color:#555;margin:15px 0}.legend i{width:12px;height:12px;border-radius:50%;margin-left:12px}.graph,.waterfall{width:100%;overflow:visible}.graph{max-height:48vh}.plot-reveal{transform-box:fill-box;transform-origin:left;animation:reveal-plot 1.6s ease-out both}.graph circle:focus{outline:none;stroke:#20241e;stroke-width:3}.waterfall{height:auto;max-height:none}.graph text,.waterfall text{font:12px Segoe UI,Arial;fill:#555}.waterfall .lane{font-weight:bold;font-size:16px;fill:#234b38}.waterfall .date{font-size:11px;font-weight:bold}.planrange{text-align:right;font:700 20px Impact,sans-serif;color:#234b38;letter-spacing:.12em}.bpr{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:11px}.bpr b{color:#bf7540;letter-spacing:.13em}.bpr span{border:1px solid #dad7cd;background:#fffdf8;border-radius:99px;padding:6px 10px}.milestone-details{font-size:12px;border-block:1px solid #dcd9cf;margin-top:10px;padding:10px 0}.milestone-details summary{cursor:pointer;color:#234b38;font-weight:700}.milestone-details ul{padding-left:20px;line-height:1.6}.milestone-details li{margin:8px 0}.milestone-details li div{color:#676a61;white-space:pre-wrap}.table-hint{font-size:11px;color:#676a61;margin:8px 0}.table-wrap{overflow:auto;max-height:40vh;border-block:1px solid #dedbd2}table{border-collapse:collapse;width:100%;font-size:12px;white-space:nowrap}td,th{padding:8px 10px;border-bottom:1px solid #e2dfd5;text-align:right}td:first-child,th:first-child{text-align:left;position:sticky;left:0;background:#f5f2eb}th{color:#676a61}.deck-nav{position:fixed;bottom:0;left:0;right:0;display:flex;justify-content:center;gap:12px;padding:12px;background:#f5f2eb;border-top:1px solid #ddd}.deck-nav button{padding:8px 14px;cursor:pointer}.waterfall g{animation:pop .7s both;cursor:pointer;outline:none}.waterfall g:hover circle,.waterfall g:focus circle{stroke:#20241e;stroke-width:4}.waterfall g:hover text,.waterfall g:focus text{fill:#234b38;font-weight:700;paint-order:stroke;stroke:#fffdf8;stroke-width:4;stroke-linejoin:round}.waterfall .scan{opacity:0;animation:sweep 5.7s linear both}.paused .graph polyline,.paused .graph circle{animation:none!important;opacity:1}.paused .plot-reveal{animation:none!important}.paused .waterfall g{animation:none!important;opacity:1;transform:none}.paused .waterfall .scan{animation:none!important;opacity:0}@keyframes sweep{0%{transform:translateX(0);opacity:.7}90%{opacity:.7}100%{transform:translateX(900px);opacity:0}}@keyframes chart-appear{from{opacity:.65}to{opacity:1}}@keyframes reveal-plot{from{transform:scaleX(0)}to{transform:scaleX(1)}}@keyframes pop{from{opacity:.65;transform:translateY(4px)}to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){*{animation:none!important}}`
  const savedInputs = JSON.stringify({ version:1, history:input.history.map(row=>({month:row.month,income:row.income,cogs:null,expenses:null,ordinaryIncome:null,netIncome:null})), channelHistory:input.channelHistory.map(row=>({month:row.month,channel:row.channel,income:row.income,cogs:null,expenses:null,ordinaryIncome:null,netIncome:null})), statuses:input.statuses, notes:input.notes, customMilestones:custom, milestoneEdits:input.milestoneEdits??{}, completion:input.completion??{}, classMappings:input.classMappings??{}, channelMappings:input.channelMappings??{}, workflowAdoptionPct:workflowAdoptionValue, workflowAdoptionDate }).replace(/</g, '\\u003c')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ryan · Finance North Star</title><style>${style}</style></head><body>${slides.join('')}<nav class="deck-nav" aria-label="Presentation controls"><button id="p">Previous</button><span id="counter" aria-live="polite"></span><button id="n">Next</button><button id="motion" aria-pressed="false">Pause animation</button><button id="fs">Fullscreen</button><span id="deck-message" aria-live="polite"></span></nav><script type="application/json" data-finance-inputs>${savedInputs}</script><script>(()=>{const s=[...document.querySelectorAll('[data-finance-slide]')];let i=0;function show(n){i=Math.max(0,Math.min(s.length-1,n));s.forEach((e,k)=>e.classList.toggle('active',k===i));document.getElementById('counter').textContent=(i+1)+' / '+s.length;document.getElementById('p').disabled=i===0;document.getElementById('n').disabled=i===s.length-1}document.getElementById('p').onclick=()=>show(i-1);document.getElementById('n').onclick=()=>show(i+1);document.addEventListener('keydown',e=>{const table=e.target?.closest?.('[data-finance-scroll]');if(table&&['ArrowLeft','ArrowRight'].includes(e.key)&&table.scrollWidth>table.clientWidth)return;if(['ArrowRight','PageDown',' '].includes(e.key)){e.preventDefault();show(i+1)}else if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();show(i-1)}else if(e.key==='Home')show(0);else if(e.key==='End')show(s.length-1)});const motion=document.getElementById('motion');motion.onclick=()=>{const paused=document.body.classList.toggle('paused');motion.textContent=paused?'Resume animation':'Pause animation';motion.setAttribute('aria-pressed',String(paused))};document.getElementById('fs').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else document.getElementById('deck-message').textContent='Fullscreen is unavailable in this browser.'}catch{document.getElementById('deck-message').textContent='Fullscreen could not be opened.'}};show(0)})();</script></body></html>`
}

/** Split our generated document into script-free slides for Stitch's sandboxed frames. */
export function splitFinanceDeckHtml(html: string): string[] {
  if (!html.includes('data-finance-slide')) return []
  const doc=new DOMParser().parseFromString(html,'text/html')
  const slides=[...doc.querySelectorAll('section[data-finance-slide]')]
  if (!slides.length) return []
  const styles=[...doc.querySelectorAll('style')].map(s=>s.textContent??'').join('\n')
  return slides.map(slide=>`<!doctype html><html><head><meta charset="utf-8"><style>${styles}\n.slide{display:block!important;min-height:720px;padding-bottom:20px}.table-wrap{max-height:none}.deck-nav{display:none}</style></head><body>${slide.outerHTML}</body></html>`)
}

/** Use one Ryan deck, including a generated document pasted into his HTML row. */
export function selectRyanFinanceDeckHtml(dedicated:string|undefined, candidates:{view_mode:string;html_code:string}[]):string {
  if(dedicated?.trim()) return dedicated
  return candidates.find(block=>block.view_mode==='html'&&splitFinanceDeckHtml(block.html_code).length>0)?.html_code??''
}

/** Expand a Finance document pasted in any owner row into individual presentation slides. */
export function expandFinancePresentationRows(rows:{id:string;html:string}[]):{id:string;html:string;order:number}[] {
  return rows.flatMap(row=>{
    const slides=splitFinanceDeckHtml(row.html)
    return slides.length?slides.map((html,index)=>({id:`custom:finance-split:${row.id}:${index}`,html})):[row]
  }).map((row,order)=>({...row,order}))
}

export function financePresentationRowOffset(rows:{html:string}[],rowIndex:number):number {
  return rows.slice(0,rowIndex).reduce((count,row)=>count+Math.max(1,splitFinanceDeckHtml(row.html).length),0)
}
