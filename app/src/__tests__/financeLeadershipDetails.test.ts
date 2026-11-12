import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { applyFinanceClassMappings, parseFinanceLeadershipDetails, parseFinanceLeadershipWorkbookSheets, readFinanceLeadershipWorkbook } from '@/lib/financeLeadershipDetails'
import { buildPnlForecastPath } from '@/pages/csuite/StitchNorthStar.helpers'

describe('Leadership Tool finance details', () => {
  it('preserves the general upload for a workbook without optional Finance sheets and reports the missing data', async () => {
    const workbook=XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['','2026-10-01'],['Account','Current','Prior','Difference'],['Income',1000,900,null]]),'PnL')
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['','2026-10-01'],['Department','Current','Prior','Difference'],['Grand Total',80,70,null]]),'Payroll')
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['Week #']]),'Summary_13wks')
    const bytes=XLSX.write(workbook,{bookType:'xlsx',type:'array'}) as ArrayBuffer
    const file=new File([],'partial.xlsx')
    Object.defineProperty(file,'arrayBuffer',{value:async()=>bytes})
    await expect(readFinanceLeadershipWorkbook(file)).rejects.toThrow('requires Monthly view by Class')
    const result=await readFinanceLeadershipWorkbook(file,{allowMissingFinanceSheets:true})
    expect(result.parsed.source_meta.finance_missing_sheets).toEqual(['Monthly view by Class','dataPnL','BgtData'])
    expect(result.parsed.pnl.accounts.find(account=>account.account==='Income')?.periods[0].current_year).toBe(1000)
    expect(result.details.channels).toEqual([])
    expect(result.details.payrollTotals[0]).toEqual({month:'2026-10-01',payroll:80})
  })
  it('reads channel operating margin, signed expense variance and cash column L', () => {
    const sheets={
      'Monthly view by Class': [['', '2026-10-01'], ['Parent Class','Total Income','Profit Margin Current Year, %','','','','Operating Margin Current Year, %'], ['Shop',1000,.6,null,null,null,.1]],
      BgtData: [['Class','Account','Month','Budget','Landing Class','Section','Budget Amount'],['Shop','Fees','2026-10-01',-100,'Shop','Expense',-100]],
      dataPnL: [['Period','Account','Class','AmountCY','Parent Class','Section','IsTotalRow'],['2026-10-01','Fees','Shop',-125,'Shop','Expense',false],['2026-10-01','Total Fees','Shop',-125,'Shop','Expense',true]],
      Summary_13wks: [['Week #','Week Start Date','','','','','','','','','Ending Cash','Ending Cash vs Floor'],[1,null,null,null,null,null,null,null,null,null,500000,-100000]],
      Payroll: [['','2026-10-01',null,null,'2026-09-01'],['Department','This Year, $','Last Year, $','Difference, %','This Year, $'],['Grand Total',null,100,null,200]],
    }
    const result=parseFinanceLeadershipDetails(sheets)
    expect(result.channels[0]).toMatchObject({income:1000,grossMargin:.6,operatingMargin:.1})
    expect(result.classBudgets[0]).toMatchObject({budget:100,actual:125,variance:-25})
    expect(result.cashWeeks[0]).toMatchObject({endingCash:500000,vsFloor:-100000})
    expect(result.payrollTotals).toEqual([{month:'2026-10-01',payroll:null},{month:'2026-09-01',payroll:200}])
  })

  it('excludes blank current-year P&L values from the four-month base while preserving real zeroes', () => {
    const months=['2026-07-01','2026-08-01','2026-09-01','2026-10-01']
    const row=(name:string, values:(number|null)[])=>[name,...values.flatMap(value=>[value,100,null])]
    const sheets={
      PnL:[['',...months.flatMap(m=>[m,null,null])],['Account',...months.flatMap(()=>['Current','Prior','Difference'])],
        row('Income',[1000,1000,1000,1000]),row('COGS',[400,400,null,400]),row('Expense',[400,0,400,400]),row('Grand Total',[200,600,200,null])],
      Payroll:[['','2026-10-01'],['Department','Current','Prior','Difference'],['Grand Total',80,80,null]],
      Summary_13wks:[['Week #']],
      'Monthly view by Class':[['','2026-10-01'],['Parent Class','Total Income'],['Shop',1000]],
      BgtData:[['Class','Account','Month','Landing Class','Section','Budget Amount'],...months.map(m=>['Shop','Sales',m,'Shop','Income',1000])],
      dataPnL:[['Period','Account','Class','AmountCY','Parent Class','Section','IsTotalRow']],
    }
    const { parsed }=parseFinanceLeadershipWorkbookSheets(sheets)
    const account=(name:string)=>parsed.pnl.accounts.find(a=>a.account===name)!
    expect(account('COGS').periods.map(p=>p.month)).not.toContain('2026-09-01')
    expect(account('Grand Total').periods.map(p=>p.month)).not.toContain('2026-10-01')
    expect(account('Expense').periods.find(p=>p.month==='2026-08-01')?.current_year).toBe(0)
    const forecast=buildPnlForecastPath(parsed,.09,'2026-11-01',{expenseAnchorMonth:'2026-11-01'})
    expect(forecast.expenseBaseMonths).toEqual(['2026-07-01','2026-08-01','2026-10-01'])
    expect(forecast.monthlyExpenseRunRate).toBeCloseTo(800/3,2)
  })

  it('matches only explicitly selected budget and actual classes and rejects ambiguous matches', () => {
    const rows=[
      {month:'2026-10-01',channel:'Old Budget Name',budget:100,actual:null,variance:null},
      {month:'2026-10-01',channel:'Actual Name',budget:null,actual:125,variance:null},
      {month:'2026-11-01',channel:'Old Budget Name',budget:110,actual:null,variance:null},
      {month:'2026-10-01',channel:'Unmatched',budget:null,actual:50,variance:null},
    ]
    const matched=applyFinanceClassMappings(rows,{'old budget name':'Actual Name'})
    expect(matched.find(r=>r.month==='2026-10-01'&&r.channel==='Actual Name')).toMatchObject({budget:100,actual:125,variance:-25})
    expect(matched.find(r=>r.month==='2026-11-01'&&r.channel==='Actual Name')).toMatchObject({budget:110,actual:null,variance:null})
    expect(matched.find(r=>r.channel==='Unmatched')?.variance).toBeNull()
    expect(()=>applyFinanceClassMappings(rows,{'missing name':'Actual Name'})).toThrow('not present')
    const conflict=[...rows,{month:'2026-10-01',channel:'Second Budget',budget:20,actual:null,variance:null}]
    expect(()=>applyFinanceClassMappings(conflict,{'old budget name':'Actual Name','second budget':'Actual Name'})).toThrow('More than one')
    const overlapping=[...rows,{month:'2026-10-01',channel:'Actual Name',budget:80,actual:null,variance:null}]
    expect(()=>applyFinanceClassMappings(overlapping,{'old budget name':'Actual Name'})).toThrow('Multiple budget classes')
  })
})
