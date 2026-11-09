import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import FinanceDeckBuilder from '@/components/FinanceDeckBuilder'
import { readFinanceDeckSavedInputs, splitFinanceDeckHtml } from '@/lib/financeDeckGenerator'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function workbookFile(name: string, sheets: Record<string, unknown[][]>): File {
  const book = XLSX.utils.book_new()
  for (const [sheet, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), sheet)
  const bytes = XLSX.write(book, { type:'array', bookType:'xlsx' }) as ArrayBuffer
  const file = new File([bytes], name)
  Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes })
  return file
}

function csvFile(name: string, csv: string): File {
  const bytes = new TextEncoder().encode(csv)
  const file = new File([bytes], name)
  Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes.buffer })
  return file
}

describe('Finance deck upload integration', () => {
  it('uses real workbook and CSV parsers with the manual answers to generate the seven-slide deck', async () => {
    const closed = ['2026-07-01','2026-08-01','2026-09-01','2026-10-01']
    const future = Array.from({length:12}, (_, i) => new Date(Date.UTC(2026,10+i,1)).toISOString().slice(0,10))
    const header = ['Account', ...closed.flatMap(() => ['This Year','Last Year','Difference'])]
    const months = ['', ...closed.flatMap(month => [month,null,null])]
    const account = (name:string, amount:number) => [name, ...closed.flatMap(() => [amount,amount,null])]
    const budget = [...closed,...future].map(month => ['Shop','Sales',month,'Shop','Income',1000])
    const serial = (Date.UTC(2026,10,2)-Date.UTC(1899,11,30))/86400000
    const leadership = workbookFile('Leadership.xlsx', {
      PnL: [months,header,account('Income',1000),account('COGS',400),account('Expense',400),account('Grand Total',200)],
      Payroll: [months,['Department',...header.slice(1)],account('Grand Total',80)],
      Summary_13wks: [['Week #','Week Start Date','','','','','','','','','Ending Cash','Ending Cash vs Floor'],[1,serial,null,null,null,null,null,null,null,null,500000,-100000]],
      'Monthly view by Class': [['','2026-10-01'],['Parent Class','Total Income','Profit Margin Current Year, %','','','','Operating Margin Current Year, %'],['Shop',1000,.6,null,null,null,.2]],
      BgtData: [['Class','Account','Month','Landing Class','Section','Budget Amount'],...budget,['Shop','Fees','2026-10-01','Shop','Expense',-100],['Legacy','Fees','2026-10-01','Legacy Budget','Expense',-100]],
      dataPnL: [['Period','Account','Class','AmountCY','Parent Class','Section','IsTotalRow'],['2026-10-01','Fees','Shop',-125,'Shop','Expense',false],['2026-10-01','Fees','New Actual',-125,'New Actual','Expense',false]],
    })
    const warehouse = workbookFile('Warehouse.xlsx', {
      'Budget Source': [['Account','Include in Budget','Oct 26','Nov 26']],
      'Variance Table': [['Section','Account','Status','Month','Budget','Actual'],['Warehouse','Rent','Matched','Oct 26',100,120],['Warehouse','Rent','Missing in Actuals','Nov 26',100,null]],
    })
    const company = csvFile('Company.csv','Account,Nov 25,Dec 25,Jan 26,Feb 26,Mar 26,Apr 26,May 26,Jun 26,Jul 26,Aug 26,Sep 26,Oct 26\nTotal Income,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000\nNet Ordinary Income,200,200,200,200,200,200,200,200,200,200,200,200')
    const historicalClass = csvFile('Nov 2025.csv',',Legacy Shop,Total Legacy Shop,Total\nTotal Income,0,500,500\nNet Ordinary Income,0,100,100')
    const host = document.createElement('div'); document.body.append(host)
    const root = createRoot(host)
    let generated = ''
    await act(async () => root.render(createElement(FinanceDeckBuilder, { periodMonth:'2026-11-01',savedHtml:'',onGenerated:(html:string)=>{generated=html},onCancel:()=>{} })))
    const files = host.querySelectorAll<HTMLInputElement>('input[type=file]')
    await act(async () => { for (const [i,file] of [leadership,warehouse,company,historicalClass].entries()) { Object.defineProperty(files[i],'files',{configurable:true,value:[file]});files[i].dispatchEvent(new Event('change',{bubbles:true})) } })
    await act(async () => { [...host.querySelectorAll('button')].find(b=>b.textContent==='Review class matches')!.click(); await new Promise(resolve=>setTimeout(resolve,30)) })
    const classMatch=host.querySelector<HTMLSelectElement>('select[aria-label="Match budget class Legacy Budget"]')!
    expect([...classMatch.options].map(option=>option.value)).toContain('New Actual')
    await act(async () => {classMatch.value='New Actual';classMatch.dispatchEvent(new Event('change',{bubbles:true}))})
    expect(host.textContent).toContain('legacy budget → New Actual')
    await act(async () => { [...host.querySelectorAll('button')].find(b=>b.textContent==='Review channel history matches')!.click(); await new Promise(resolve=>setTimeout(resolve,30)) })
    const channelMatch=host.querySelector<HTMLSelectElement>('select[aria-label="Match channel history Shop"]')!
    await act(async () => {channelMatch.value='Legacy Shop';channelMatch.dispatchEvent(new Event('change',{bubbles:true}))})
    await act(async () => { [...host.querySelectorAll('button')].find(b=>b.textContent==='Answer milestone questions')!.click() })
    const status = host.querySelector<HTMLSelectElement>('select[aria-label="Finance close workflows mapped status"]')!
    const adoption = host.querySelector<HTMLInputElement>('input[aria-label="Current finance workflow adoption percentage"]')!
    await act(async () => {
      status.value='yellow'; status.dispatchEvent(new Event('change',{bubbles:true}))
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(adoption,'35');adoption.dispatchEvent(new Event('input',{bubbles:true}))
    })
    await act(async () => { [...host.querySelectorAll('button')].find(b=>b.textContent==='Generate HTML')!.click(); await new Promise(resolve=>setTimeout(resolve,30)) })
    expect(host.querySelector('[role=alert]')?.textContent).toBeUndefined()
    const slides = splitFinanceDeckHtml(generated)
    expect(slides).toHaveLength(7)
    expect(slides[0]).toMatch(/<polyline[^>]+stroke="#234b38"/)
    expect(slides[0]).toMatch(/<polyline[^>]+stroke="#bf7540"/)
    expect(slides[0]).toContain('$1,300')
    expect(slides[1]).toContain('-20.0% / -1.5%')
    expect(slides[3]).toContain('−$25')
    expect(slides[3]).toContain('Manually confirmed budget class matches')
    expect(slides[3]).toContain('New Actual')
    expect(slides[4]).toContain('−$20')
    expect(slides[5]).toContain('YELLOW')
    expect(slides[6]).toContain('Workflow adoption · 35%')
    expect(readFinanceDeckSavedInputs(generated)).toMatchObject({statuses:{close:'yellow'},workflowAdoptionPct:35})
    expect(readFinanceDeckSavedInputs(generated)?.classMappings).toEqual({'legacy budget':'New Actual'})
    expect(readFinanceDeckSavedInputs(generated)?.channelMappings).toEqual({'shop':'Legacy Shop'})
    await act(async () => root.unmount())
    host.remove()
  })
})
