import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FinanceDeckBuilder from '@/components/FinanceDeckBuilder'
import { generateFinanceDeck } from '@/lib/financeDeckGenerator'
import { parseHistoricalClassStatement } from '@/lib/financeHistoricalStatements'
import { readFinanceLeadershipWorkbook } from '@/lib/financeLeadershipDetails'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/lib/financeLeadershipDetails', () => ({ normalizeFinanceClassName:(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(), readFinanceLeadershipWorkbook: vi.fn(async () => ({ parsed:{cashflow:{},payroll:{},pnl:{},budget:{},sales_simulation:{},source_meta:{}}, details:{channels:[],classBudgets:[],cashWeeks:[]} })) }))
vi.mock('@/lib/financeWarehouseBudget', () => ({ parseWarehouseBudgetFile: vi.fn(async () => []), cashFloorStatus: () => 'pending' }))
vi.mock('@/lib/financeHistoricalStatements', () => ({ assertUniqueHistoricalMonths: vi.fn(), readHistoricalCsv: vi.fn(async () => []), parseHistoricalCompanyStatement: vi.fn(() => [{month:'2025-11-01',income:100}]), parseHistoricalClassStatement: vi.fn(() => []) }))
vi.mock('@/lib/financeDeckGenerator', async importOriginal => {
  const original=await importOriginal<typeof import('@/lib/financeDeckGenerator')>()
  return { ...original, generateFinanceDeck:vi.fn(() => '<html>generated</html>') }
})

describe('Finance deck workflow', () => {
  afterEach(() => { document.body.innerHTML=''; vi.clearAllMocks() })
  it('collects the two workbooks, history, milestone status and note before generating', async () => {
    const container=document.createElement('div');document.body.append(container)
    const root=createRoot(container), done=vi.fn()
    const now=new Date(), periodMonth=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`
    await act(async()=>{root.render(createElement(FinanceDeckBuilder, { savedHtml: "", periodMonth, onGenerated: done, onCancel: () => {} }))})
    const generate=()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Generate HTML')!
    expect(generate().disabled).toBe(true)
    const inputs=container.querySelectorAll<HTMLInputElement>('input[type=file]')
    await act(async()=>{for(const [i,name] of ['leadership.xlsm','warehouse.xlsm','history.csv'].entries()){Object.defineProperty(inputs[i],'files',{configurable:true,value:[new File(['x'],name)]});inputs[i].dispatchEvent(new Event('change',{bubbles:true}))}})
    expect(generate().disabled).toBe(false)
    await act(async()=>{[...container.querySelectorAll('button')].find(b=>b.textContent==='Answer milestone questions')!.click()})
    const first=container.querySelector<HTMLSelectElement>('select')!
    const note=container.querySelector<HTMLInputElement>('input[placeholder="Outcome / evidence"]')!
    const adoption=container.querySelector<HTMLInputElement>('input[aria-label="Current finance workflow adoption percentage"]')!
    const description=container.querySelector<HTMLInputElement>('input[aria-label="Finance close workflows mapped description"]')!
    const milestoneDate=container.querySelector<HTMLInputElement>('input[aria-label="Finance close workflows mapped date"]')!
    const completion=container.querySelector<HTMLSelectElement>('select[aria-label="Finance close workflows mapped completion"]')!
    await act(async()=>{first.value='green';first.dispatchEvent(new Event('change',{bubbles:true}))})
    await act(async()=>{completion.value='unfinished';completion.dispatchEvent(new Event('change',{bubbles:true}))})
    await act(async()=>{
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(description,'Close playbook confirmed');description.dispatchEvent(new Event('input',{bubbles:true}))
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(milestoneDate,'2027-01-15');milestoneDate.dispatchEvent(new Event('input',{bubbles:true}));milestoneDate.dispatchEvent(new Event('change',{bubbles:true}))
    })
    expect(first.value).toBe('pending')
    expect(completion.value).toBe('unknown')
    await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(adoption,'101');adoption.dispatchEvent(new Event('input',{bubbles:true}))})
    expect(generate().disabled).toBe(true)
    await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(adoption,'12.5');adoption.dispatchEvent(new Event('input',{bubbles:true}))})
    expect(generate().disabled).toBe(false)
    await act(async()=>{first.value='green';first.dispatchEvent(new Event('change',{bubbles:true}));completion.value='unfinished';completion.dispatchEvent(new Event('change',{bubbles:true}));Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(note,'Approved');note.dispatchEvent(new Event('input',{bubbles:true}))})
    await act(async()=>{generate().click()})
    expect(done).toHaveBeenCalledWith('<html>generated</html>')
    const arg=vi.mocked(generateFinanceDeck).mock.calls[0][0]
    expect(arg.statuses.close).toBe('green')
    expect(arg.completion?.close).toBe('unfinished')
    expect(arg.notes.close).toBe('Approved')
    expect(arg.workflowAdoptionPct).toBe(12.5)
    expect(arg.workflowAdoptionDate).toBe(arg.asOf)
    expect(arg.milestoneEdits?.close).toEqual({date:'2027-01-15',label:'Close playbook confirmed'})
    expect(arg.history).toHaveLength(1)
    await act(async()=>root.unmount())
  })

  it('carries saved history and answers forward with only the two workbook uploads', async () => {
    const saved = `<script type="application/json" data-finance-inputs>${JSON.stringify({version:1,history:[{month:'2025-11-01',income:100}],channelHistory:[],statuses:{close:'yellow'},notes:{close:'In progress'},milestoneEdits:{close:{date:'2027-01-15',label:'Close playbook confirmed'}},workflowAdoptionPct:35,workflowAdoptionDate:'2026-01-01'})}</script>`
    const container=document.createElement('div');document.body.append(container)
    const root=createRoot(container), done=vi.fn()
    const now=new Date(), periodMonth=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`
    await act(async()=>{root.render(createElement(FinanceDeckBuilder,{savedHtml:saved,periodMonth,onGenerated:done,onCancel:()=>{}}))})
    const inputs=container.querySelectorAll<HTMLInputElement>('input[type=file]')
    await act(async()=>{for(const [i,name] of ['leadership.xlsm','warehouse.xlsm'].entries()){Object.defineProperty(inputs[i],'files',{configurable:true,value:[new File(['x'],name)]});inputs[i].dispatchEvent(new Event('change',{bubbles:true}))}})
    const generate=[...container.querySelectorAll('button')].find(b=>b.textContent==='Generate HTML')!
    expect(generate.disabled).toBe(false)
    await act(async()=>{generate.click()})
    const arg=vi.mocked(generateFinanceDeck).mock.calls[0][0]
    expect(arg.history).toHaveLength(1)
    expect(arg.statuses.close).toBe('yellow')
    expect(arg.notes.close).toBe('In progress')
    expect(arg.workflowAdoptionPct).toBe(35)
    expect(arg.workflowAdoptionDate).toBe('2026-01-01')
    expect(arg.milestoneEdits?.close).toEqual({date:'2027-01-15',label:'Close playbook confirmed'})
    await act(async()=>root.unmount())
  })

  it('uses the selected historical month and never applies today’s sales projection to it', async () => {
    const saved = `<script type="application/json" data-finance-inputs>${JSON.stringify({version:1,history:[{month:'2025-08-01',income:100}],channelHistory:[],statuses:{},notes:{}})}</script>`
    const container=document.createElement('div');document.body.append(container)
    const root=createRoot(container), done=vi.fn()
    await act(async()=>{root.render(createElement(FinanceDeckBuilder,{savedHtml:saved,periodMonth:'2026-08-01',currentMonthProjectedSales:999,onGenerated:done,onCancel:()=>{}}))})
    const date=container.querySelector<HTMLInputElement>('input[type=date]')!
    expect(date.value).toBe('2026-08-31')
    const inputs=container.querySelectorAll<HTMLInputElement>('input[type=file]')
    await act(async()=>{for(const [i,name] of ['leadership.xlsm','warehouse.xlsm'].entries()){Object.defineProperty(inputs[i],'files',{configurable:true,value:[new File(['x'],name)]});inputs[i].dispatchEvent(new Event('change',{bubbles:true}))}})
    const generate=[...container.querySelectorAll('button')].find(b=>b.textContent==='Generate HTML')!
    await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(date,'2026-07-31');date.dispatchEvent(new Event('input',{bubbles:true}));date.dispatchEvent(new Event('change',{bubbles:true}))})
    expect(generate.disabled).toBe(true)
    await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(date,'2026-08-31');date.dispatchEvent(new Event('input',{bubbles:true}));date.dispatchEvent(new Event('change',{bubbles:true}))})
    await act(async()=>{generate.click()})
    const arg=vi.mocked(generateFinanceDeck).mock.calls[0][0]
    expect(arg.asOf).toBe('2026-08-31')
    expect(arg.currentMonthProjectedSales).toBeNull()
    await act(async()=>root.unmount())
  })

  it('asks for one class file per month instead of choosing a duplicate silently', async () => {
    const saved = `<script type="application/json" data-finance-inputs>${JSON.stringify({version:1,history:[{month:'2025-08-01',income:100}],channelHistory:[],statuses:{},notes:{}})}</script>`
    const container=document.createElement('div');document.body.append(container)
    const root=createRoot(container), done=vi.fn()
    await act(async()=>{root.render(createElement(FinanceDeckBuilder,{savedHtml:saved,periodMonth:'2026-08-01',onGenerated:done,onCancel:()=>{}}))})
    const inputs=container.querySelectorAll<HTMLInputElement>('input[type=file]')
    await act(async()=>{
      for(const [i,files] of [[0,[new File(['x'],'leadership.xlsm')]],[1,[new File(['x'],'warehouse.xlsm')]],[3,[new File(['x'],'Jan 2026.csv'),new File(['x'],'Jan 2026 copy.csv')]]] as const){
        Object.defineProperty(inputs[i],'files',{configurable:true,value:files});inputs[i].dispatchEvent(new Event('change',{bubbles:true}))
      }
    })
    await act(async()=>{[...container.querySelectorAll('button')].find(b=>b.textContent==='Generate HTML')!.click()})
    expect(container.querySelector('[role=alert]')?.textContent).toContain('More than one class statement')
    expect(done).not.toHaveBeenCalled()
    await act(async()=>root.unmount())
  })

  it('replaces uploaded class months while preserving saved months', async () => {
    const statement = (month:string, channel:string, income:number) => ({month,channel,income,cogs:null,expenses:null,ordinaryIncome:null,netIncome:null})
    const saved = `<script type="application/json" data-finance-inputs>${JSON.stringify({version:1,history:[{month:'2025-08-01',income:100}],channelHistory:[statement('2026-01-01','Old January',10),statement('2026-02-01','February',20)],statuses:{},notes:{}})}</script>`
    vi.mocked(parseHistoricalClassStatement).mockReturnValueOnce([statement('2026-01-01','New January',30)])
    const container=document.createElement('div');document.body.append(container)
    const root=createRoot(container), done=vi.fn()
    await act(async()=>{root.render(createElement(FinanceDeckBuilder,{savedHtml:saved,periodMonth:'2026-08-01',onGenerated:done,onCancel:()=>{}}))})
    const inputs=container.querySelectorAll<HTMLInputElement>('input[type=file]')
    await act(async()=>{
      for(const [i,files] of [[0,[new File(['x'],'leadership.xlsm')]],[1,[new File(['x'],'warehouse.xlsm')]],[3,[new File(['x'],'Jan 2026.csv')]]] as const){
        Object.defineProperty(inputs[i],'files',{configurable:true,value:files});inputs[i].dispatchEvent(new Event('change',{bubbles:true}))
      }
    })
    await act(async()=>{[...container.querySelectorAll('button')].find(b=>b.textContent==='Generate HTML')!.click()})
    expect(vi.mocked(generateFinanceDeck).mock.calls[0][0].channelHistory).toEqual([statement('2026-02-01','February',20),statement('2026-01-01','New January',30)])
    await act(async()=>root.unmount())
  })

  it('rejects an empty class statement without replacing saved history', async () => {
    const saved = `<script type="application/json" data-finance-inputs>${JSON.stringify({version:1,history:[{month:'2025-08-01',income:100}],channelHistory:[],statuses:{},notes:{}})}</script>`
    const container=document.createElement('div');document.body.append(container)
    const root=createRoot(container), done=vi.fn()
    await act(async()=>{root.render(createElement(FinanceDeckBuilder,{savedHtml:saved,periodMonth:'2026-08-01',onGenerated:done,onCancel:()=>{}}))})
    const inputs=container.querySelectorAll<HTMLInputElement>('input[type=file]')
    await act(async()=>{
      for(const [i,files] of [[0,[new File(['x'],'leadership.xlsm')]],[1,[new File(['x'],'warehouse.xlsm')]],[3,[new File(['x'],'Jan 2026.csv')]]] as const){
        Object.defineProperty(inputs[i],'files',{configurable:true,value:files});inputs[i].dispatchEvent(new Event('change',{bubbles:true}))
      }
    })
    await act(async()=>{[...container.querySelectorAll('button')].find(b=>b.textContent==='Generate HTML')!.click()})
    expect(container.querySelector('[role=alert]')?.textContent).toContain('No class data was found')
    expect(done).not.toHaveBeenCalled()
    await act(async()=>root.unmount())
  })

  it('lets Ryan review unmatched classes and carries only a selected manual match into generation', async () => {
    vi.mocked(readFinanceLeadershipWorkbook).mockResolvedValueOnce({parsed:{cashflow:{},payroll:{},pnl:{},budget:{},sales_simulation:{},source_meta:{}},details:{channels:[],cashWeeks:[],payrollTotals:[],classBudgets:[
      {month:'2026-07-01',channel:'Budget name',budget:100,actual:null,variance:null},
      {month:'2026-07-01',channel:'Actual name',budget:null,actual:125,variance:null},
    ]}} as never)
    const saved = `<script type="application/json" data-finance-inputs>${JSON.stringify({version:1,history:[{month:'2025-08-01',income:100}],channelHistory:[],statuses:{},notes:{}})}</script>`
    const container=document.createElement('div');document.body.append(container)
    const root=createRoot(container), done=vi.fn()
    await act(async()=>{root.render(createElement(FinanceDeckBuilder,{savedHtml:saved,periodMonth:'2026-08-01',onGenerated:done,onCancel:()=>{}}))})
    const inputs=container.querySelectorAll<HTMLInputElement>('input[type=file]')
    await act(async()=>{for(const [i,name] of ['leadership.xlsm','warehouse.xlsm'].entries()){Object.defineProperty(inputs[i],'files',{configurable:true,value:[new File(['x'],name)]});inputs[i].dispatchEvent(new Event('change',{bubbles:true}))}})
    await act(async()=>{[...container.querySelectorAll('button')].find(b=>b.textContent==='Review class matches')!.click()})
    expect(container.textContent).toContain('1 actual class(es) without a matched budget')
    const select=container.querySelector<HTMLSelectElement>('select[aria-label="Match budget class Budget name"]')!
    expect(select.value).toBe('')
    await act(async()=>{select.value='Actual name';select.dispatchEvent(new Event('change',{bubbles:true}))})
    await act(async()=>{[...container.querySelectorAll('button')].find(b=>b.textContent==='Generate HTML')!.click()})
    expect(vi.mocked(generateFinanceDeck).mock.calls[0][0].classMappings).toEqual({'budget name':'Actual name'})
    expect(vi.mocked(readFinanceLeadershipWorkbook)).toHaveBeenCalledTimes(1)
    await act(async()=>root.unmount())
  })

  it('allows an explicit historical channel match and retains the selected source', async () => {
    vi.mocked(readFinanceLeadershipWorkbook).mockResolvedValueOnce({parsed:{cashflow:{},payroll:{},pnl:{},budget:{},sales_simulation:{},source_meta:{}},details:{channels:[{month:'2026-07-01',channel:'Current channel',income:1000,grossMargin:.6,operatingMargin:.2}],cashWeeks:[],payrollTotals:[],classBudgets:[]}} as never)
    const saved = `<script type="application/json" data-finance-inputs>${JSON.stringify({version:1,history:[{month:'2025-08-01',income:1000}],channelHistory:[{month:'2025-08-01',channel:'Historical class',income:500}],statuses:{},notes:{}})}</script>`
    const container=document.createElement('div');document.body.append(container)
    const root=createRoot(container), done=vi.fn()
    await act(async()=>{root.render(createElement(FinanceDeckBuilder,{savedHtml:saved,periodMonth:'2026-08-01',onGenerated:done,onCancel:()=>{}}))})
    const inputs=container.querySelectorAll<HTMLInputElement>('input[type=file]')
    await act(async()=>{for(const [i,name] of ['leadership.xlsm','warehouse.xlsm'].entries()){Object.defineProperty(inputs[i],'files',{configurable:true,value:[new File(['x'],name)]});inputs[i].dispatchEvent(new Event('change',{bubbles:true}))}})
    await act(async()=>{[...container.querySelectorAll('button')].find(b=>b.textContent==='Review channel history matches')!.click()})
    const select=container.querySelector<HTMLSelectElement>('select[aria-label="Match channel history Current channel"]')!
    expect(select.value).toBe('')
    await act(async()=>{select.value='Historical class';select.dispatchEvent(new Event('change',{bubbles:true}))})
    expect(container.textContent).toContain('1/12 prior-year months available')
    await act(async()=>{[...container.querySelectorAll('button')].find(b=>b.textContent==='Generate HTML')!.click()})
    expect(vi.mocked(generateFinanceDeck).mock.calls[0][0].channelMappings).toEqual({'current channel':'Historical class'})
    await act(async()=>root.unmount())
  })
})
