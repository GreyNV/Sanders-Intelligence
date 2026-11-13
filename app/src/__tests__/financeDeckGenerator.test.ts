import { describe, expect, it, vi } from 'vitest'
import { bottomFinanceChannels, expandFinancePresentationRows, financePresentationRowOffset, generateFinanceDeck, readFinanceDeckSavedInputs, readFinanceMilestoneInputs, selectRyanFinanceDeckHtml, splitFinanceDeckHtml, topFinanceChannels, type FinanceDeckInput } from '@/lib/financeDeckGenerator'
import type { LeadershipToolSnapshot } from '@/types'
import { buildPnlForecastPath } from '@/pages/csuite/StitchNorthStar.helpers'

describe('Finance deck generation', () => {
  it('restores separately saved manual milestones without executing embedded content', () => {
    const input={version:1,customMilestones:[{id:'custom-abc',date:'2027-02-01',lane:'Execution',label:'Close review'}],milestoneEdits:{},statuses:{'custom-abc':'yellow'},completion:{'custom-abc':'unfinished'},notes:{'custom-abc':'</script><script>unsafe()</script>'}}
    expect(readFinanceMilestoneInputs(JSON.stringify(input))).toMatchObject({customMilestones:input.customMilestones,statuses:input.statuses,notes:input.notes})
    expect(readFinanceMilestoneInputs('invalid')).toBeNull()
  })
  it('uses pasted Finance HTML as Ryan’s deck and prioritizes a dedicated saved deck', () => {
    const finance='<style>.slide{display:none}</style><section data-finance-slide="NOI">NOI</section><section data-finance-slide="Payroll">Payroll</section><script>untrusted()</script>'
    const candidates=[{view_mode:'html',html_code:'<p>old slide</p>'},{view_mode:'html',html_code:finance}]
    expect(selectRyanFinanceDeckHtml('',candidates)).toBe(finance)
    expect(splitFinanceDeckHtml(selectRyanFinanceDeckHtml('',candidates))).toHaveLength(2)
    expect(selectRyanFinanceDeckHtml('<p>saved deck</p>',candidates)).toBe('<p>saved deck</p>')
    expect(selectRyanFinanceDeckHtml('',[{view_mode:'fields',html_code:finance}])).toBe('')
    const rows=[{id:'before',html:'<p>Before</p>'},{id:'pasted',html:finance},{id:'after',html:'<p>After</p>'}]
    const expanded=expandFinancePresentationRows(rows)
    expect(expanded.map(row=>row.id)).toEqual(['before','custom:finance-split:pasted:0','custom:finance-split:pasted:1','after'])
    expect(expanded[1].html).not.toContain('<script')
    expect(financePresentationRowOffset(rows,2)).toBe(3)
  })
  it('ranks channels by four completed months, retaining a missing last month as pending', () => {
    const row=(month:string,channel:string,income:number)=>({month,channel,income,grossMargin:.5,operatingMargin:.1})
    const channels=topFinanceChannels([row('2026-07-01','A',1000),row('2026-10-01','B',800),row('2026-11-01','B',5000),row('2026-10-01','No Income Account',9000)],'2026-11-01')
    expect(channels.map(c=>c.channel)).toEqual(['A','B'])
    expect(channels[0]).toMatchObject({fourMonthIncome:1000,income:null,operatingMargin:null})
    expect(channels[1]).toMatchObject({fourMonthIncome:800,income:800})
  })
  it('ranks the lowest known NOI margins only for channels with sales in the last completed month', () => {
    const rows=[
      {month:'2026-10-01',channel:'Weak',income:10,grossMargin:.3,operatingMargin:-.2},
      {month:'2026-10-01',channel:'No Income Account',income:10,grossMargin:.3,operatingMargin:-9},
      {month:'2026-10-01',channel:'Good',income:100,grossMargin:.4,operatingMargin:.1},
      {month:'2026-10-01',channel:'No sales',income:0,grossMargin:.3,operatingMargin:-.9},
      {month:'2026-10-01',channel:'Unknown',income:10,grossMargin:.3,operatingMargin:null},
      {month:'2026-09-01',channel:'Old only',income:100,grossMargin:.3,operatingMargin:-.8},
    ]
    expect(bottomFinanceChannels(rows,'2026-11-01').map(row=>row.channel)).toEqual(['Weak','Good'])
  })
  it('uses four earlier closed months for delayed channels, rolling forward and excluding the open month', () => {
    const rows=['Kohl’s','TikTok','Target','Other'].flatMap(channel=>[
      {month:'2026-06-01',channel,income:50,grossMargin:.5,operatingMargin:.05},
      {month:'2026-07-01',channel,income:100,grossMargin:.5,operatingMargin:.1},
      {month:'2026-08-01',channel,income:200,grossMargin:.5,operatingMargin:.2},
      {month:'2026-09-01',channel,income:300,grossMargin:.5,operatingMargin:.3},
      {month:'2026-10-01',channel,income:9000,grossMargin:.01,operatingMargin:-.9},
    ])
    const november=topFinanceChannels(rows,'2026-11-01')
    for(const channel of ['Kohl’s','TikTok','Target']) expect(november.find(row=>row.channel===channel)).toMatchObject({month:'2026-09-01',fourMonthIncome:650,income:300,operatingMargin:.3})
    expect(november.find(row=>row.channel==='Other')).toMatchObject({month:'2026-10-01',fourMonthIncome:9600,operatingMargin:-.9})
    expect(bottomFinanceChannels(rows,'2026-11-01')[0].channel).toBe('Other')
    expect(topFinanceChannels(rows,'2026-12-01').find(row=>row.channel==='Target')).toMatchObject({month:'2026-10-01',fourMonthIncome:9600,operatingMargin:-.9})
    const missing=topFinanceChannels(rows.filter(row=>row.channel!=='Target'||row.month!=='2026-09-01'),'2026-11-01').find(row=>row.channel==='Target')
    expect(missing).toMatchObject({month:'2026-09-01',income:null,operatingMargin:null,fourMonthIncome:350})
  })
  it('generates distinct forecast and 30% goal lines and seven sandbox-ready slides', () => {
    const closed=['2026-07-01','2026-08-01','2026-09-01','2026-10-01']
    const future=Array.from({length:12},(_,i)=>new Date(Date.UTC(2026,10+i,1)).toISOString().slice(0,10))
    const periods=(v:number)=>closed.map(month=>({month,current_year:v,last_year:v,difference_pct:null}))
    const snapshot={id:'x',snapshot_key:'current',filename:'test',uploaded_by:null,uploaded_at:'',source_meta:{},cashflow:{current_cash_balance:0,minimum_cash_floor:600000,weeks:[]},payroll:{departments:[{department:'Grand Total',periods:periods(80)}]},pnl:{accounts:[{account:'Income',periods:periods(1000)},{account:'COGS',periods:periods(400)},{account:'Expense',periods:periods(400)},{account:'Grand Total',periods:periods(200)}]},budget:{sales:[...closed,...future].map(month=>({month,budgeted_sales:1000}))},sales_simulation:{noi_benchmark_pct:.09,latest_income:0,latest_noi:0,latest_noi_pct:null,sales_needed_for_benchmark:null}} as LeadershipToolSnapshot
    const history=future.map(month=>({month:`${Number(month.slice(0,4))-1}${month.slice(4)}`,income:1000,cogs:null,expenses:null,ordinaryIncome:null,netIncome:null}))
    const input:FinanceDeckInput={snapshot,history,channelHistory:[],details:{channels:[],classBudgets:[{month:'2026-10-01',channel:'Unbudgeted class',budget:null,actual:500,variance:null}],cashWeeks:[{week:1,date:'2026-11-02',endingCash:500000,vsFloor:-100000}],payrollTotals:closed.map(month=>({month,payroll:80}))},warehouse:[],asOf:'2026-11-06',statuses:{close:'green'},notes:{close:'</script><script>unsafe</script>'},workflowAdoptionPct:12.5,workflowAdoptionDate:'2026-11-04'}
    const html=generateFinanceDeck(input)
    expect(html).toMatch(/<polyline[^>]+stroke="#234b38"/)
    expect(html).toMatch(/<polyline[^>]+stroke="#bf7540"/)
    expect(html).toMatch(/<polyline[^>]+stroke="#bf7540"[^>]+stroke-dasharray="9 5"/)
    expect(html).toContain('@keyframes chart-appear{from{opacity:.65}to{opacity:1}}')
    expect(html).toContain('.paused .graph polyline,.paused .graph circle{animation:none!important;opacity:1}')
    expect(html).toContain('@media(prefers-reduced-motion:reduce){*{animation:none!important}}')
    expect(html).toContain('YELLOW')
    expect(html).toContain('Finance plan · 12 months')
    const slides=splitFinanceDeckHtml(html)
    expect(slides).toHaveLength(7)
    for(const index of [0,2]){
      const table=new DOMParser().parseFromString(slides[index],'text/html').querySelector('table')!
      const headers=[...table.querySelectorAll('th')].map(cell=>cell.textContent)
      const row=[...table.querySelectorAll('tbody tr')].find(item=>item.querySelector('td')?.textContent==='Oct 26')!
      expect([...row.querySelectorAll('td')][headers.indexOf('Actual sales')].textContent).toBe('$1,000')
      expect(headers.indexOf('Actual sales')).toBe(headers.length-2)
    }
    const incompleteSnapshot={...snapshot,pnl:{accounts:snapshot.pnl.accounts.map(account=>account.account==='Grand Total'?{...account,periods:account.periods.filter(row=>row.month!=='2026-09-01')}:account)}}
    const incompleteSlides=splitFinanceDeckHtml(generateFinanceDeck({...input,snapshot:incompleteSnapshot,details:{...input.details,payrollTotals:input.details.payrollTotals.filter(row=>row.month!=='2026-09-01')}}))
    for(const index of [0,2]){
      const table=new DOMParser().parseFromString(incompleteSlides[index],'text/html').querySelector('table')!
      const headers=[...table.querySelectorAll('th')].map(cell=>cell.textContent)
      const row=[...table.querySelectorAll('tbody tr')].find(item=>item.querySelector('td')?.textContent==='Sep 26')!
      const cells=[...row.querySelectorAll('td')]
      expect(cells[headers.indexOf('Actual sales')].textContent).toBe('$1,000')
      expect(cells[cells.length-1].textContent).toBe('Pending / Pending')
    }
    const graph=new DOMParser().parseFromString(slides[0],'text/html').querySelector('svg.graph')!
    // Stitch strips scripts, so chart reveal must be a complete CSS animation
    // with a full-size fallback when motion is disabled.
    expect(slides[0]).not.toContain('<script')
    expect(slides[0]).toContain('@keyframes reveal-plot{from{transform:scaleX(0)}to{transform:scaleX(1)}}')
    expect(graph.querySelector('g[clip-path="url(#plot-reveal)"] polyline')).not.toBeNull()
    expect(graph.querySelector('clipPath#plot-reveal rect')?.getAttribute('width')).toBe('1160')
    expect(slides[0]).toContain('@media(prefers-reduced-motion:reduce){*{animation:none!important}}')
    expect(graph.querySelectorAll('line[stroke="#e2dfd5"]')).toHaveLength(5)
    expect([...graph.querySelectorAll('circle[fill="#234b38"] title')].map(node=>node.textContent)).toContain('Nov 26 · Current forecast: 20.0% · NOI $200')
    expect([...graph.querySelectorAll('circle[fill="#bf7540"] title')].map(node=>node.textContent)).toContain('Nov 26 · 30% growth goal: 29.2% · NOI $380')
    expect(graph.querySelector('circle[fill="#3476b1"] title')?.textContent).toBe('Jul 26 · Actual NOI: 20.0% · NOI $200')
    const savedChart=readFinanceDeckSavedInputs(html)!.chartHistory
    expect(savedChart.find(row=>row.month==='2026-11-01')).toMatchObject({forecastNoiPct:.2,actualNoiPct:null})
    const accountsWithNovember=snapshot.pnl.accounts.map(account=>({ ...account, periods:[...account.periods,{month:'2026-11-01',current_year:account.account==='Income'?1200:account.account==='Grand Total'?180:account.account==='COGS'?700:400,last_year:0,difference_pct:null}]}))
    const nextInput={...input,asOf:'2026-12-06',snapshot:{...snapshot,pnl:{accounts:accountsWithNovember}},details:{...input.details,payrollTotals:[...input.details.payrollTotals,{month:'2026-11-01',payroll:120}]},chartHistory:savedChart}
    const nextHtml=generateFinanceDeck(nextInput)
    const nextChart=readFinanceDeckSavedInputs(nextHtml)!.chartHistory
    const november=nextChart.find(row=>row.month==='2026-11-01')!
    const latestPastForecast=buildPnlForecastPath(nextInput.snapshot,.09,'2026-11-01',{expenseAnchorMonth:'2026-12-01',allowBelowFloorForecast:true}).months[0]
    expect(november).toMatchObject({forecastIncome:latestPastForecast.forecastedSales,forecastNoi:latestPastForecast.noi,actualNoi:180,actualNoiPct:.15,actualPayroll:120,actualPayrollPct:.1})
    expect(november.forecastNoiPct).toBeCloseTo(latestPastForecast.noiPct!)
    expect(november.forecastPayrollPct).toBeCloseTo(90/latestPastForecast.forecastedSales!)
    expect(november.goalNoiPct).not.toBeCloseTo(savedChart.find(row=>row.month==='2026-11-01')!.goalNoiPct!)
    const nextSlides=splitFinanceDeckHtml(nextHtml)
    expect(nextSlides[0]).toContain('Nov 26 · Actual NOI: 15.0% · NOI $180')
    expect(nextSlides[2]).toContain('Nov 26 · Actual payroll / income: 10.0%')
    expect(nextSlides[0]).toContain('Forecasts and goals for all displayed months are recalculated')
    const missingPastBudget={...nextInput.snapshot,budget:{sales:nextInput.snapshot.budget.sales.filter(row=>row.month!=='2026-11-01'&&row.month!=='2025-11-01')}}
    const pendingPast=readFinanceDeckSavedInputs(generateFinanceDeck({...nextInput,snapshot:missingPastBudget}))!.chartHistory.find(row=>row.month==='2026-11-01')!
    expect(pendingPast).toMatchObject({forecastIncome:null,forecastNoiPct:null,actualNoiPct:.15})
    const afterMissing=generateFinanceDeck({...nextInput,asOf:'2027-01-06',snapshot,details:input.details,chartHistory:nextChart})
    expect(readFinanceDeckSavedInputs(afterMissing)!.chartHistory.find(row=>row.month==='2026-11-01')).toMatchObject({forecastNoiPct:.2,actualNoiPct:.15,actualPayrollPct:.1})
    const noPriorDeck=splitFinanceDeckHtml(generateFinanceDeck({...input,asOf:'2027-03-06'}))[0]
    expect(noPriorDeck).toContain('Jul 26 · Actual NOI: 20.0%')
    const legacyDocument=new DOMParser().parseFromString(html,'text/html')
    const metadata=legacyDocument.querySelector('script[data-finance-inputs]')!
    const legacyInputs=JSON.parse(metadata.textContent!);delete legacyInputs.chartHistory;metadata.textContent=JSON.stringify(legacyInputs).replace(/</g,'\\u003c')
    const legacyHistory=readFinanceDeckSavedInputs(legacyDocument.documentElement.outerHTML)!.chartHistory
    expect(legacyHistory.find(row=>row.month==='2026-11-01')).toMatchObject({forecastNoiPct:.2,forecastPayrollPct:.08,actualNoiPct:null})
    expect(slides.every(slide=>slide.includes('As of 2026-11-06 · Leadership Tool: test'))).toBe(true)
    expect(slides[0]).toContain('30% growth goal')
    expect(slides[0]).toContain('Current-year budget × fulfillment')
    expect(slides[0]).toContain('Budget fulfillment: 100.0%')
    expect(slides[0]).toContain('Budget fulfillment uses all available completed months with matching income and budget.')
    expect(slides[0]).toContain('Cost assumptions use up to four completed months (Jul 26, Aug 26, Sep 26, Oct 26).')
    const channelRanking=splitFinanceDeckHtml(generateFinanceDeck({...input,details:{...input.details,channels:[
      {month:'2026-10-01',channel:'Strong',income:1000,grossMargin:.5,operatingMargin:.2},
      {month:'2026-10-01',channel:'Weak',income:10,grossMargin:.2,operatingMargin:-.5},
      {month:'2026-10-01',channel:'No revenue',income:0,grossMargin:.2,operatingMargin:-.9},
    ]}}))[1]
    const channelTables=new DOMParser().parseFromString(channelRanking,'text/html').querySelectorAll('table')
    expect([...channelTables[1].querySelectorAll('tbody tr')].map(row=>row.querySelector('td')?.textContent)).toEqual(['Weak','Strong'])
    const channelHeaders=[...channelTables[0].querySelectorAll('th')].map(cell=>cell.textContent)
    const strongCells=[...channelTables[0].querySelector('tbody tr')!.querySelectorAll('td')].map(cell=>cell.textContent)
    expect(strongCells[channelHeaders.indexOf('Oct 26 actual NOI $ / %')]).toBe('$200 / 20.0%')
    expect(strongCells[channelHeaders.indexOf('Sep 26 actual NOI $ / %')]).toBe('Pending / Pending')
    expect(channelRanking).toContain('Bottom 10 NOI % · latest eligible month')
    const delayedRows=['2026-06-01','2026-07-01','2026-08-01','2026-09-01'].map(month=>({month,channel:'Target',income:1000,grossMargin:.6,operatingMargin:.2}))
    const delayedHistory=history.map(row=>({...row,channel:'Target',income:500}))
    const delayedSlide=(latestMargin:number)=>splitFinanceDeckHtml(generateFinanceDeck({...input,details:{...input.details,channels:[...delayedRows,{month:'2026-10-01',channel:'Target',income:9000,grossMargin:.1,operatingMargin:latestMargin}]},channelHistory:delayedHistory}))[1]
    expect(delayedSlide(-.9)).toBe(delayedSlide(.9))
    expect(delayedSlide(-.9)).toContain('$4,000 · Jun 26–Sep 26')
    expect(delayedSlide(-.9)).toContain('Sep 26 · $200 / 20.0%')
    expect(delayedSlide(-.9)).toContain('Oct 26 actual NOI $ / %')
    expect(delayedSlide(-.9)).toContain('Pending · not closed')
    expect(delayedSlide(-.9)).toContain('−$100 (-20.0%) / −$10 (-1.5%)')
    const partialSlide=splitFinanceDeckHtml(generateFinanceDeck({...input,details:{...input.details,channels:[delayedRows[0]]},channelHistory:delayedHistory}))[1]
    expect(partialSlide).toContain('$1,000 · Jun 26–Sep 26 · 1/4 months')
    expect(partialSlide).toContain('Sep 26 · Pending / Pending')
    const lowMarginSnapshot={...snapshot,pnl:{accounts:snapshot.pnl.accounts.map(account=>account.account==='COGS'?{...account,periods:periods(950)}:account)}}
    const lowMarginForecast=buildPnlForecastPath(lowMarginSnapshot,.09,'2026-11-01',{expenseAnchorMonth:'2026-11-01',allowBelowFloorForecast:true})
    expect(lowMarginForecast.months[0].noiPct).toBeCloseTo(-.35)
    expect(lowMarginForecast.months[0].salesGap).toBeNull()
    expect(lowMarginForecast.totalSalesGap).toBeNull()
    const lowMarginSlide=splitFinanceDeckHtml(generateFinanceDeck({...input,snapshot:lowMarginSnapshot}))[0]
    expect(lowMarginSlide).toContain('sales growth alone cannot reach the NOI floor')
    expect(lowMarginSlide).toContain('-35.0%')
    expect(lowMarginSlide).toContain('-25.8%')
    expect(lowMarginSlide).toMatch(/<polyline[^>]+stroke="#234b38"/)
    const withPace = splitFinanceDeckHtml(generateFinanceDeck({ ...input, currentMonthProjectedSales: 1200 }))[0]
    expect(withPace).not.toContain('Current-month sales pace')
    expect(withPace).toContain('Current-year budget × fulfillment')
    const paceTable=new DOMParser().parseFromString(withPace,'text/html').querySelector('table')!
    const firstTwoRows=[...paceTable.querySelectorAll('tbody tr')].filter(row=>['Nov 26','Dec 26'].includes(row.querySelector('td')?.textContent??'')).map(row=>[...row.querySelectorAll('td')].slice(0,3).map(cell=>cell.textContent))
    expect(firstTwoRows).toEqual([['Nov 26','$1,000','Current-year budget × fulfillment'],['Dec 26','$1,000','Current-year budget × fulfillment']])
    const fallbackSnapshot = { ...snapshot, budget: { ...snapshot.budget, sales: [...snapshot.budget.sales.filter(row=>row.month!=='2026-11-01'), { month:'2025-11-01', budgeted_sales:900 }] } }
    const withFallback = splitFinanceDeckHtml(generateFinanceDeck({ ...input, snapshot:fallbackSnapshot }))[0]
    expect(withFallback).toContain('Prior-year budget × fulfillment')
    expect(slides[6]).toContain('Finance plan · 12 months')
    expect(slides[6]).toContain('Cash vs floor · YELLOW')
    expect(slides[6]).toContain('NOI 20.0%')
    expect(slides[6]).toContain('Payroll 8.0%')
    expect(slides[6]).toContain('Workflow adoption · 12.5% · 2026-11-04 (manual)')
    const waterfallDocument = new DOMParser().parseFromString(slides[6], 'text/html')
    expect(slides[6]).toContain('.waterfall g:hover text,.waterfall g:focus text')
    expect(waterfallDocument.querySelector('svg.waterfall g')?.getAttribute('tabindex')).toBe('0')
    const payrollGraph=new DOMParser().parseFromString(slides[2],'text/html').querySelector('svg.graph')!
    expect(payrollGraph.getAttribute('aria-label')).toBe('Actual and projected payroll as a percentage of income')
    expect(payrollGraph.querySelector('polyline[stroke="#234b38"]')).not.toBeNull()
    expect(payrollGraph.querySelector('polyline[stroke="#bf7540"]')).not.toBeNull()
    expect(payrollGraph.textContent).toContain('8% target')
    const departmentSlide=splitFinanceDeckHtml(generateFinanceDeck({...input,details:{...input.details,payrollDepartments:closed.map(month=>({month,department:'Finance',payroll:30}))}}))[2]
    const departmentPoint=new DOMParser().parseFromString(departmentSlide,'text/html').querySelector('svg.graph circle[fill="#234b38"] title')!
    expect(departmentPoint.textContent).toContain('Finance: 37.5%')
    expect(departmentPoint.textContent).not.toContain('$')
    const goalPoint=new DOMParser().parseFromString(departmentSlide,'text/html').querySelector('svg.graph circle[fill="#bf7540"] title')!
    expect(goalPoint.textContent).toContain('Finance: 37.5%')
    expect(goalPoint.textContent).not.toContain('$')
    const actualPoint=new DOMParser().parseFromString(departmentSlide,'text/html').querySelector('svg.graph circle[fill="#3476b1"] title')!
    expect(actualPoint.textContent).toContain('Finance: 37.5%')
    const departmentSaved=readFinanceDeckSavedInputs(generateFinanceDeck({...input,details:{...input.details,payrollDepartments:closed.map(month=>({month,department:'Finance',payroll:30}))}}))!.chartHistory
    expect(departmentSaved.find(row=>row.month==='2026-11-01')?.payrollDetails).toContain('Finance: 37.5%')
    const cashSlides=splitFinanceDeckHtml(generateFinanceDeck({...input,details:{...input.details,cashWeeks:[
      {week:1,date:'2026-11-02',endingCash:700000,vsFloor:100000},
      {week:2,date:'2026-11-09',endingCash:500000,vsFloor:-250000},
      {week:3,date:'2026-11-16',endingCash:-10000,vsFloor:-610000},
      {week:4,date:'2026-11-23',endingCash:200000,vsFloor:null},
    ]}}))
    const cashDoc=new DOMParser().parseFromString(cashSlides[5],'text/html')
    expect(cashDoc.querySelector('svg.graph')).toBeNull()
    expect([...cashDoc.querySelectorAll('tbody tr')].map(row=>row.querySelectorAll('td')[1]?.textContent)).toEqual(['GREEN','YELLOW','RED','PENDING'])
    expect(cashDoc.body.textContent).not.toContain('$')
    const milestoneDetails = waterfallDocument.querySelector<HTMLDetailsElement>('details.milestone-details')!
    expect(milestoneDetails.open).toBe(false)
    expect(milestoneDetails.textContent).toContain('2026-12-31 · Finance close workflows mapped')
    expect(milestoneDetails.textContent).toContain('</script><script>unsafe</script>')
    expect(milestoneDetails.querySelector('script')).toBeNull()
    milestoneDetails.querySelector('summary')!.click()
    expect(milestoneDetails.open).toBe(true)
    expect(slides[6]).toContain('Channel NOI · Pending')
    expect(slides[6]).toContain('Class budget · Pending · 1 incomplete')
    expect(slides[6]).toContain('Warehouse · Pending')
    expect(slides[3]).toContain('Unbudgeted class')
    expect(slides[3]).toContain('Budget missing')
    expect(slides[3]).toContain('No comparable class budgets and actuals')
    expect(slides[4]).toContain('No comparable warehouse budgets and actuals')
    const budgetSlide=splitFinanceDeckHtml(generateFinanceDeck({...input,details:{...input.details,classBudgets:[
      {month:'2026-07-01',channel:'Shop',budget:90,actual:95,variance:-5},
      {month:'2026-08-01',channel:'Shop',budget:95,actual:100,variance:-5},
      {month:'2026-09-01',channel:'Shop',budget:100,actual:105,variance:-5},
      {month:'2026-10-01',channel:'Shop',budget:100,actual:125,variance:-25},
      {month:'2026-11-01',channel:'Shop',budget:110,actual:null,variance:null},
      {month:'2026-12-01',channel:'Shop',budget:120,actual:null,variance:null},
    ]}}))[3]
    expect(budgetSlide).toContain('Nov 26 budget')
    for(const month of ['Jul 26','Aug 26','Sep 26','Oct 26']) expect(budgetSlide).toContain(`${month} actual`)
    expect(budgetSlide).toContain('Nov 26 projected')
    const budgetDoc=new DOMParser().parseFromString(budgetSlide,'text/html')
    const budgetHeaders=[...budgetDoc.querySelectorAll('table:first-of-type th')].map(cell=>cell.textContent)
    const budgetCells=[...budgetDoc.querySelectorAll('table:first-of-type tbody tr:first-child td')].map(cell=>cell.textContent)
    expect(budgetCells[budgetHeaders.indexOf('Jul 26 actual')]).toBe('$95')
    expect(budgetCells[budgetHeaders.indexOf('Oct 26 actual')]).toBe('$125')
    expect(budgetCells[budgetHeaders.indexOf('Nov 26 projected')]).toBe('$106')
    expect(budgetSlide).toContain('Dec 26 budget')
    expect(budgetSlide).toContain('$110')
    expect(budgetSlide).toContain('$120')
    expect(budgetSlide).toContain('Jan 27 budget')
    expect(budgetSlide).toContain('Pending')
    const coverage = splitFinanceDeckHtml(generateFinanceDeck({ ...input,
      details: { ...input.details, classBudgets:[{month:'2026-10-01',channel:'Matched',budget:100,actual:90,variance:10}] },
      warehouse:[{month:'2026-10-01',section:'Shipping',account:'Freight',budget:100,actual:90,variance:10},{month:'2026-10-01',section:'Storage',account:'Unbudgeted',budget:null,actual:45,variance:null}],
    }))
    expect(coverage[3]).toContain('No unfavorable variances among matched classes')
    expect(coverage[4]).toContain('No unfavorable variances among matched accounts')
    expect(coverage[4]).toContain('Storage · Unbudgeted')
    expect(coverage[4]).toContain('1 account(s) with actuals have no matched budget')
    const warehouseHistory=splitFinanceDeckHtml(generateFinanceDeck({...input,warehouse:[
      {month:'2026-07-01',section:'Shipping',account:'Freight',budget:100,actual:110,variance:-10},
      {month:'2026-08-01',section:'Shipping',account:'Freight',budget:100,actual:130,variance:-30},
      {month:'2026-09-01',section:'Shipping',account:'Freight',budget:90,actual:95,variance:-5},
      {month:'2026-10-01',section:'Shipping',account:'Freight',budget:100,actual:125,variance:-25},
      {month:'2026-11-01',section:'Shipping',account:'Freight',budget:130,actual:null,variance:null},
    ]}))[4]
    const warehouseDoc=new DOMParser().parseFromString(warehouseHistory,'text/html')
    const firstWarehouseTable=warehouseDoc.querySelector('table')!
    expect([...firstWarehouseTable.querySelectorAll('th')].map(cell=>cell.textContent)).toEqual([
      'Class / account','Status','Total variance · 4 months',...['Jul 26','Aug 26','Sep 26','Oct 26'].flatMap(month=>[`${month} budget`,`${month} actual`,`${month} variance`,`${month} variance %`]),
    ])
    expect([...firstWarehouseTable.querySelectorAll('tbody td')].map(cell=>cell.textContent)).toEqual([
      'Shipping · Freight','Matched','−$70','$100','$110','−$10','-10.0%','$100','$130','−$30','-30.0%','$90','$95','−$5','-5.6%','$100','$125','−$25','-25.0%',
    ])
    expect(warehouseDoc.body.textContent).not.toContain('Nov 26')
    expect(warehouseDoc.body.textContent).not.toContain('projected')
    const sortedWarehouse=splitFinanceDeckHtml(generateFinanceDeck({...input,warehouse:[
      {month:'2026-07-01',section:'WH',account:'Large cumulative',budget:100,actual:220,variance:-120},
      {month:'2026-10-01',section:'WH',account:'Large cumulative',budget:100,actual:90,variance:10},
      {month:'2026-10-01',section:'WH',account:'Small partial',budget:100,actual:130,variance:-30},
      {month:'2026-10-01',section:'WH',account:'Favorable',budget:100,actual:80,variance:20},
    ]}))[4]
    const ranked=[...new DOMParser().parseFromString(sortedWarehouse,'text/html').querySelectorAll('table:first-of-type tbody tr')].map(row=>[...row.querySelectorAll('td')].slice(0,3).map(cell=>cell.textContent))
    expect(ranked.slice(0,2)).toEqual([['WH · Large cumulative','Matched','−$110 · 2/4 months'],['WH · Small partial','Matched','−$30 · 1/4 months']])
    expect(ranked.flat()).not.toContain('WH · Favorable')
    const mappedHtml=generateFinanceDeck({...input,details:{...input.details,classBudgets:[
      {month:'2026-10-01',channel:'Budget name',budget:100,actual:null,variance:null},
      {month:'2026-10-01',channel:'Actual name',budget:null,actual:125,variance:null},
    ]},classMappings:{'budget name':'Actual name'}})
    const mappedSlide=splitFinanceDeckHtml(mappedHtml)[3]
    expect(mappedSlide).toContain('−$25')
    expect(mappedSlide).toContain('Manually confirmed budget class matches')
    expect(readFinanceDeckSavedInputs(mappedHtml)?.classMappings).toEqual({'budget name':'Actual name'})
    const channelHistory=history.map(row=>({...row,channel:'Shop',income:500}))
    const channelDetails={...input.details,channels:closed.map(month=>({month,channel:'Shop Online',income:1000,grossMargin:.6,operatingMargin:.2}))}
    const noHistoryMatch=splitFinanceDeckHtml(generateFinanceDeck({...input,details:channelDetails,channelHistory}))[1]
    expect(noHistoryMatch).toContain('Pending / Pending')
    const channelMappedHtml=generateFinanceDeck({...input,details:channelDetails,channelHistory,channelMappings:{'shop online':'Shop'}})
    const channelMapped=splitFinanceDeckHtml(channelMappedHtml)[1]
    expect(channelMapped).toContain('−$100 (-20.0%) / −$10 (-1.5%)')
    expect(channelMapped).toContain('Manually confirmed historical channel matches')
    expect(readFinanceDeckSavedInputs(channelMappedHtml)?.channelMappings).toEqual({'shop online':'Shop'})
    expect(()=>generateFinanceDeck({...input,details:{...channelDetails,channels:[...channelDetails.channels,{month:'2026-10-01',channel:'Shop',income:900,grossMargin:.6,operatingMargin:.2}]},channelHistory,channelMappings:{'shop online':'Shop'}})).toThrow('assigned to more than one')
    expect(()=>generateFinanceDeck({...input,details:channelDetails,channelHistory:[...channelHistory,{...channelHistory[0],channel:'SHOP!'}],channelMappings:{'shop online':'Shop'}})).toThrow('More than one historical class')
    const summary = splitFinanceDeckHtml(generateFinanceDeck({ ...input,
      details: { ...input.details,
        channels:[{month:'2026-10-01',channel:'A',income:1000,grossMargin:.5,operatingMargin:.08},{month:'2026-10-01',channel:'B',income:900,grossMargin:.5,operatingMargin:null}],
        classBudgets:[{month:'2026-10-01',channel:'A',budget:100,actual:110,variance:-10},{month:'2026-10-01',channel:'B',budget:null,actual:40,variance:null}],
      },
      warehouse:[{month:'2026-10-01',section:'Shipping',account:'Freight',budget:100,actual:90,variance:10},{month:'2026-10-01',section:'Storage',account:'Unbudgeted',budget:null,actual:45,variance:null}],
    }))[6]
    expect(summary).toContain('Channel NOI · 1/1 below 9% · 1 pending')
    expect(summary).toContain('Class budget · 1/1 overspent · 1 pending')
    expect(summary).toContain('Warehouse · 0/1 overspent · 1 pending')
    expect(summary).toContain('class="pending">Warehouse')
    expect(slides.every(s=>!s.includes('<script'))).toBe(true)
    expect(readFinanceDeckSavedInputs(html)).toMatchObject({ statuses: { close: 'green' }, notes: { close: '</script><script>unsafe</script>' } })
    expect(readFinanceDeckSavedInputs(html)).toMatchObject({workflowAdoptionPct:12.5,workflowAdoptionDate:'2026-11-04'})
    const edits={warehouse1:{date:'2027-03-15',label:'Choose regional site'},warehouse2:{date:'2028-01-05',label:'Open regional site'}}
    const editedHtml=generateFinanceDeck({...input,milestoneEdits:edits})
    const edited=splitFinanceDeckHtml(editedHtml)[6]
    expect(edited).toContain('2027-03-15 · Choose regional site')
    expect(edited).toContain('2028-01-05 · Open regional site · completion unconfirmed · outside plan')
    const editedDoc=new DOMParser().parseFromString(edited,'text/html')
    expect(editedDoc.querySelector('svg.waterfall')?.textContent).not.toContain('Open regional site')
    expect(edited).toContain('1 milestone(s) outside the plan appear in the details below.')
    expect(readFinanceDeckSavedInputs(editedHtml)?.milestoneEdits).toEqual(edits)
    const custom={id:'custom-test-1',lane:'Execution' as const,date:'2027-05-09',label:'Review close process'}
    const customHtml=generateFinanceDeck({...input,customMilestones:[custom],statuses:{...input.statuses,[custom.id]:'yellow'}})
    expect(splitFinanceDeckHtml(customHtml)[6]).toContain('Review close process')
    expect(readFinanceDeckSavedInputs(customHtml)?.customMilestones).toEqual([custom])
    const removedHtml=generateFinanceDeck({...input,removedMilestoneIds:['close']})
    expect(splitFinanceDeckHtml(removedHtml)[6]).not.toContain('Finance close workflows mapped')
    expect(readFinanceDeckSavedInputs(removedHtml)?.removedMilestoneIds).toEqual(['close'])
    expect(readFinanceMilestoneInputs(JSON.stringify({version:1,customMilestones:[],removedMilestoneIds:['close','unknown']}))?.removedMilestoneIds).toEqual(['close'])
    expect(readFinanceDeckSavedInputs(customHtml)?.statuses[custom.id]).toBe('yellow')
    expect(()=>generateFinanceDeck({...input,milestoneEdits:{warehouse1:{date:'2027-02-30',label:'Invalid'}}})).toThrow('valid date')
    const overdueInput={...input,milestoneEdits:{close:{date:'2026-11-05',label:'Close playbook'}},completion:{close:'unfinished' as const}}
    const overdueHtml=generateFinanceDeck(overdueInput)
    const overdueDoc=new DOMParser().parseFromString(splitFinanceDeckHtml(overdueHtml)[6],'text/html')
    const closeMarker=[...overdueDoc.querySelectorAll('svg.waterfall g')].find(g=>g.querySelector('title')?.textContent?.includes('Close playbook'))!
    expect(closeMarker.querySelector('circle')?.getAttribute('fill')).toBe('#b64d40')
    expect(readFinanceDeckSavedInputs(overdueHtml)?.completion.close).toBe('unfinished')
    const achievedDoc=new DOMParser().parseFromString(splitFinanceDeckHtml(generateFinanceDeck({...overdueInput,completion:{close:'achieved'}}))[6],'text/html')
    const achievedMarker=[...achievedDoc.querySelectorAll('svg.waterfall g')].find(g=>g.querySelector('title')?.textContent?.includes('Close playbook'))!
    expect(achievedMarker.querySelector('circle')?.getAttribute('fill')).toBe('#31804e')
    const unknownDoc=new DOMParser().parseFromString(splitFinanceDeckHtml(generateFinanceDeck({...overdueInput,completion:{close:'unknown'}}))[6],'text/html')
    const unknownMarker=[...unknownDoc.querySelectorAll('svg.waterfall g')].find(g=>g.querySelector('title')?.textContent?.includes('Close playbook'))!
    expect(unknownMarker.querySelector('circle')?.getAttribute('fill')).toBe('#31804e')
    const dueTodayDoc=new DOMParser().parseFromString(splitFinanceDeckHtml(generateFinanceDeck({...overdueInput,milestoneEdits:{close:{date:'2026-11-06',label:'Close playbook'}}}))[6],'text/html')
    const dueToday=[...dueTodayDoc.querySelectorAll('svg.waterfall g')].find(g=>g.querySelector('title')?.textContent?.includes('Close playbook'))!
    expect(dueToday.querySelector('circle')?.getAttribute('fill')).toBe('#31804e')
    const unknownAdoption = splitFinanceDeckHtml(generateFinanceDeck({ ...input, workflowAdoptionPct:null, workflowAdoptionDate:null }))[6]
    expect(unknownAdoption).toContain('Workflow adoption · Pending (manual)')
    expect(new DOMParser().parseFromString(html, 'text/html').querySelectorAll('script')).toHaveLength(2)
    expect(readFinanceDeckSavedInputs(html)?.history).toHaveLength(12)
    const documentCopy = new DOMParser().parseFromString(html, 'text/html')
    const controller = [...documentCopy.querySelectorAll('script')].find(script => !script.hasAttribute('data-finance-inputs'))
    expect(controller?.textContent).toBeTruthy()
    new Function('document', controller!.textContent!)(documentCopy)
    const visible = () => documentCopy.querySelector('section.active')?.getAttribute('data-finance-slide')
    expect(visible()).toBe('NOI · two paths')
    const scrollRegion=documentCopy.querySelector<HTMLElement>('[data-finance-scroll]')!
    expect(scrollRegion.getAttribute('tabindex')).toBe('0')
    Object.defineProperties(scrollRegion,{scrollWidth:{value:1000},clientWidth:{value:500}})
    const scrollKey=new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true})
    scrollRegion.dispatchEvent(scrollKey)
    expect(scrollKey.defaultPrevented).toBe(false)
    expect(visible()).toBe('NOI · two paths')
    expect(slides[1]).toContain('Scroll horizontally to see all months.')
    const forecast=buildPnlForecastPath(snapshot,.09,'2026-11-01',{expenseAnchorMonth:'2026-11-01'})
    expect(forecast.expenseBaseMonths).toEqual(closed)
    documentCopy.querySelector<HTMLButtonElement>('#n')!.click()
    expect(visible()).toBe('NOI by channel')
    documentCopy.querySelector<HTMLButtonElement>('#p')!.click()
    expect(visible()).toBe('NOI · two paths')
    documentCopy.querySelector<HTMLButtonElement>('#motion')!.click()
    expect(documentCopy.body.classList.contains('paused')).toBe(true)
    expect(documentCopy.querySelector('#motion')?.getAttribute('aria-pressed')).toBe('true')
    const fullscreen=vi.fn(async()=>{})
    Object.defineProperty(documentCopy.documentElement,'requestFullscreen',{value:fullscreen,configurable:true})
    documentCopy.querySelector<HTMLButtonElement>('#fs')!.click()
    expect(fullscreen).toHaveBeenCalledOnce()
    const missingPayroll = generateFinanceDeck({ ...input, details: { ...input.details, payrollTotals: [
      { month:'2026-10-01', payroll:null }, { month:'2026-06-01', payroll:80 },
    ] } })
    const payrollSlide = splitFinanceDeckHtml(missingPayroll)[2]
    expect(payrollSlide).toContain('0 available month(s)')
    expect(new DOMParser().parseFromString(payrollSlide,'text/html').querySelector('strong.pending')?.textContent).toBe('Pending')
    const incompleteHistory = splitFinanceDeckHtml(generateFinanceDeck({ ...input, history: history.slice(0, 1) }))[0]
    expect(incompleteHistory).toContain('Prior-year Total Income is missing for:')
    expect(incompleteHistory).toContain('Dec 26')
  })
})
