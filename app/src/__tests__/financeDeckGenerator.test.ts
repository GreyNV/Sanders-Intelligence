import { describe, expect, it, vi } from 'vitest'
import { generateFinanceDeck, readFinanceDeckSavedInputs, splitFinanceDeckHtml, topFinanceChannels, type FinanceDeckInput } from '@/lib/financeDeckGenerator'
import type { LeadershipToolSnapshot } from '@/types'
import { buildPnlForecastPath } from '@/pages/csuite/StitchNorthStar.helpers'

describe('Finance deck generation', () => {
  it('ranks channels by four completed months, retaining a missing last month as pending', () => {
    const row=(month:string,channel:string,income:number)=>({month,channel,income,grossMargin:.5,operatingMargin:.1})
    const channels=topFinanceChannels([row('2026-07-01','A',1000),row('2026-10-01','B',800),row('2026-11-01','B',5000)],'2026-11-01')
    expect(channels.map(c=>c.channel)).toEqual(['A','B'])
    expect(channels[0]).toMatchObject({fourMonthIncome:1000,income:null,operatingMargin:null})
    expect(channels[1]).toMatchObject({fourMonthIncome:800,income:800})
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
    const graph=new DOMParser().parseFromString(slides[0],'text/html').querySelector('svg.graph')!
    expect(graph.querySelectorAll('line[stroke="#e2dfd5"]')).toHaveLength(5)
    expect(graph.querySelector('circle[fill="#234b38"] title')?.textContent).toBe('Nov 26 · Current forecast: 20.0% · NOI $200')
    expect(graph.querySelector('circle[fill="#bf7540"] title')?.textContent).toBe('Nov 26 · 30% growth goal: 29.2% · NOI $380')
    expect(slides.every(slide=>slide.includes('As of 2026-11-06 · Leadership Tool: test'))).toBe(true)
    expect(slides[0]).toContain('30% growth goal scenario')
    expect(slides[0]).toContain('Current-year budget × fulfillment')
    expect(slides[0]).toContain('Budget fulfillment: 100.0%')
    expect(slides[0]).toContain('Budget fulfillment uses all available completed months with matching income and budget.')
    expect(slides[0]).toContain('Cost assumptions use up to four completed months (Jul 26, Aug 26, Sep 26, Oct 26).')
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
    const firstTwoRows=[...paceTable.querySelectorAll('tbody tr')].slice(0,2).map(row=>[...row.querySelectorAll('td')].slice(0,3).map(cell=>cell.textContent))
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
    expect(payrollGraph.getAttribute('aria-label')).toBe('Projected payroll as a percentage of income')
    expect(payrollGraph.querySelector('polyline[stroke="#234b38"]')).not.toBeNull()
    expect(payrollGraph.querySelector('polyline[stroke="#bf7540"]')).not.toBeNull()
    expect(payrollGraph.textContent).toContain('8% target')
    const departmentSlide=splitFinanceDeckHtml(generateFinanceDeck({...input,details:{...input.details,payrollDepartments:closed.map(month=>({month,department:'Finance',payroll:30}))}}))[2]
    const departmentPoint=new DOMParser().parseFromString(departmentSlide,'text/html').querySelector('svg.graph circle[fill="#234b38"] title')!
    expect(departmentPoint.textContent).toContain('Projected payroll $80')
    expect(departmentPoint.textContent).toContain('Finance: $30')
    const cashSlides=splitFinanceDeckHtml(generateFinanceDeck({...input,details:{...input.details,cashWeeks:[
      {week:1,date:'2026-11-02',endingCash:700000,vsFloor:100000},
      {week:2,date:'2026-11-09',endingCash:500000,vsFloor:-250000},
      {week:3,date:'2026-11-16',endingCash:-10000,vsFloor:-610000},
      {week:4,date:'2026-11-23',endingCash:200000,vsFloor:null},
    ]}}))
    const cashGraph=new DOMParser().parseFromString(cashSlides[5],'text/html').querySelector('svg.graph')!
    expect(cashGraph.getAttribute('aria-label')).toBe('Projected weekly cash status')
    expect(cashGraph.querySelector('circle[fill="#31804e"] title')?.textContent).toContain('GREEN')
    expect(cashGraph.querySelector('circle[fill="#c99425"] title')?.textContent).toContain('YELLOW')
    expect(cashGraph.querySelector('circle[fill="#b64d40"] title')?.textContent).toContain('RED')
    expect(cashGraph.querySelector('circle[fill="#9b9c94"] title')?.textContent).toContain('PENDING')
    expect(new DOMParser().parseFromString(cashSlides[5],'text/html').body.textContent).not.toContain('$')
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
      {month:'2026-10-01',channel:'Shop',budget:100,actual:125,variance:-25},
      {month:'2026-11-01',channel:'Shop',budget:110,actual:null,variance:null},
      {month:'2026-12-01',channel:'Shop',budget:120,actual:null,variance:null},
    ]}}))[3]
    expect(budgetSlide).toContain('Nov 26 budget')
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
