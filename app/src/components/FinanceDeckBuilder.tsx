import { useEffect, useRef, useState } from 'react'
import { parseWarehouseBudgetFile } from '@/lib/financeWarehouseBudget'
import { normalizeFinanceClassName, readFinanceLeadershipWorkbook, type FinanceClassMappings } from '@/lib/financeLeadershipDetails'
import { assertUniqueHistoricalMonths, parseHistoricalCompanyStatement, parseHistoricalClassStatement, readHistoricalCsv, type HistoricalChannelStatement } from '@/lib/financeHistoricalStatements'
import { FINANCE_MILESTONES, bottomFinanceChannels, generateFinanceDeck, readFinanceDeckSavedInputs, topFinanceChannels, validFinanceMilestoneDate, type FinanceDeckInput, type FinanceMilestone, type FinanceMilestoneInputs, type FinanceMilestoneEdits, type MilestoneStatus, type MilestoneCompletion } from '@/lib/financeDeckGenerator'
import type { LeadershipToolSnapshot } from '@/types'

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function endOfMonth(periodMonth: string) {
  const [year, month] = periodMonth.slice(0, 7).split('-').map(Number)
  return `${periodMonth.slice(0, 7)}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`
}
function monthFromFilename(name: string): string | null {
  const m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(20\d\d)/i.exec(name)
  if (!m) return null
  const month = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[1].toLowerCase()) + 1
  return `${m[2]}-${String(month).padStart(2,'0')}-01`
}

export default function FinanceDeckBuilder({ onGenerated, onCancel, currentMonthProjectedSales, savedHtml, periodMonth, savedBaseline, onSaveBaseline, savedMilestones, onSaveMilestones }: {
  onGenerated: (html: string) => void
  onCancel: () => void
  currentMonthProjectedSales?: number | null
  savedHtml: string
  periodMonth: string
  savedBaseline?: { history: FinanceDeckInput['history']; channelHistory: HistoricalChannelStatement[] } | null
  onSaveBaseline?: (baseline: { history: FinanceDeckInput['history']; channelHistory: HistoricalChannelStatement[] }) => Promise<void>
  savedMilestones?: FinanceMilestoneInputs | null
  onSaveMilestones?: (inputs:FinanceMilestoneInputs) => Promise<void>
}) {
  const [saved] = useState(() => readFinanceDeckSavedInputs(savedHtml))
  const [baseline, setBaseline] = useState(() => ({
    history:savedBaseline?.history.length ? savedBaseline.history : saved?.history??[],
    channelHistory:savedBaseline?.channelHistory.length ? savedBaseline.channelHistory : saved?.channelHistory??[],
  }))
  const [leadership, setLeadership] = useState<File | null>(null)
  const [inspected, setInspected] = useState<{file:File; data:Awaited<ReturnType<typeof readFinanceLeadershipWorkbook>>} | null>(null)
  const [warehouse, setWarehouse] = useState<File | null>(null)
  const [history, setHistory] = useState<File | null>(null)
  const [classes, setClasses] = useState<File[]>([])
  const [channelReview, setChannelReview] = useState<HistoricalChannelStatement[] | null>(null)
  const periodStart = `${periodMonth.slice(0, 7)}-01`
  const periodEnd = endOfMonth(periodMonth)
  const [asOf, setAsOf] = useState(() => today().slice(0, 7) === periodMonth.slice(0, 7) ? today() : periodEnd)
  const [questions, setQuestions] = useState(false)
  const [statuses, setStatuses] = useState<Record<string, MilestoneStatus>>(savedMilestones?.statuses ?? saved?.statuses ?? {})
  const [notes, setNotes] = useState<Record<string, string>>(savedMilestones?.notes ?? saved?.notes ?? {})
  const [customMilestones, setCustomMilestones] = useState<FinanceMilestone[]>(savedMilestones?.customMilestones ?? saved?.customMilestones ?? [])
  const [newMilestoneLane, setNewMilestoneLane] = useState<FinanceMilestone['lane']>('Guardrail')
  const [newMilestoneLabel, setNewMilestoneLabel] = useState('')
  const [newMilestoneDate, setNewMilestoneDate] = useState('')
  const [milestoneEdits, setMilestoneEdits] = useState<FinanceMilestoneEdits>(savedMilestones?.milestoneEdits ?? saved?.milestoneEdits ?? {})
  const [completion, setCompletion] = useState<Record<string, MilestoneCompletion>>(savedMilestones?.completion ?? saved?.completion ?? {})
  const [classMappings, setClassMappings] = useState<FinanceClassMappings>(saved?.classMappings ?? {})
  const [channelMappings, setChannelMappings] = useState<Record<string,string>>(saved?.channelMappings ?? {})
  const [workflowAdoption, setWorkflowAdoption] = useState(saved?.workflowAdoptionPct == null ? '' : String(saved.workflowAdoptionPct))
  const [workflowAdoptionDate, setWorkflowAdoptionDate] = useState(saved?.workflowAdoptionDate ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [milestoneSaveError,setMilestoneSaveError]=useState('')
  const [milestoneSaving,setMilestoneSaving]=useState(false)
  const milestoneSnapshot=JSON.stringify({customMilestones,milestoneEdits,statuses,completion,notes})
  const latestMilestoneSnapshot=useRef(milestoneSnapshot)
  latestMilestoneSnapshot.current=milestoneSnapshot
  // Migrate legacy custom milestones, but do not create an empty record merely by opening the builder.
  const savedMilestoneSnapshot=useRef(savedMilestones||!customMilestones.length?milestoneSnapshot:'')
  const milestoneSaveHandler=useRef(onSaveMilestones)
  milestoneSaveHandler.current=onSaveMilestones
  const milestoneSaveQueue=useRef<Promise<void>>(Promise.resolve())
  const milestonePendingWrites=useRef(0)
  const milestoneSaveGeneration=useRef(0)
  function persistMilestones(snapshot:string):Promise<void> {
    const save=milestoneSaveHandler.current
    if(!save||(snapshot===savedMilestoneSnapshot.current&&milestonePendingWrites.current===0))return Promise.resolve()
    milestonePendingWrites.current++
    const queued=milestoneSaveQueue.current.catch(()=>{}).then(async()=>{
      if(snapshot===savedMilestoneSnapshot.current)return
      await save(JSON.parse(snapshot) as FinanceMilestoneInputs)
      savedMilestoneSnapshot.current=snapshot
    }).finally(()=>{milestonePendingWrites.current--})
    milestoneSaveQueue.current=queued
    return queued
  }
  useEffect(()=>{
    if(!onSaveMilestones||(milestoneSnapshot===savedMilestoneSnapshot.current&&milestonePendingWrites.current===0))return
    const generation=++milestoneSaveGeneration.current
    const timer=setTimeout(()=>{
      setMilestoneSaving(true);setMilestoneSaveError('')
      void persistMilestones(milestoneSnapshot).catch(e=>setMilestoneSaveError(e instanceof Error?e.message:'Could not save milestones.')).finally(()=>{if(generation===milestoneSaveGeneration.current)setMilestoneSaving(false)})
    },400)
    return ()=>clearTimeout(timer)
  },[milestoneSnapshot,onSaveMilestones])
  useEffect(()=>()=>{
    // Preserve the latest edits even if the modal is closed before debounce fires.
    void persistMilestones(latestMilestoneSnapshot.current).catch(()=>{})
  },[])
  const validAsOf = /^\d{4}-\d{2}-\d{2}$/.test(asOf) && asOf >= periodStart && asOf <= periodEnd
  const workflowAdoptionPct = workflowAdoption.trim() === '' ? null : Number(workflowAdoption)
  const validWorkflowAdoption = workflowAdoptionPct === null || (Number.isFinite(workflowAdoptionPct) && workflowAdoptionPct >= 0 && workflowAdoptionPct <= 100 && /^\d{4}-\d{2}-\d{2}$/.test(workflowAdoptionDate) && workflowAdoptionDate <= asOf)
  const validMilestones = Object.values(milestoneEdits).every(edit => validFinanceMilestoneDate(edit.date) && edit.label.trim().length>0 && edit.label.length<=80)
  const [year,monthNumber]=asOf.slice(0,7).split('-').map(Number)
  const comparisonMonth=validAsOf?new Date(Date.UTC(year,monthNumber-2,1)).toISOString().slice(0,10):''
  const comparisonRows=inspected?.data.details.classBudgets.filter(row=>row.month===comparisonMonth)??[]
  const unmatchedBudgets=comparisonRows.filter(row=>row.budget!==null&&row.actual===null).sort((a,b)=>a.channel.localeCompare(b.channel))
  const unmatchedActuals=comparisonRows.filter(row=>row.actual!==null&&row.budget===null).sort((a,b)=>a.channel.localeCompare(b.channel))
  const channelSource=inspected?.data.details.channels??[], channelPeriod=`${asOf.slice(0,7)}-01`
  const topChannels=[...new Map([...topFinanceChannels(channelSource,channelPeriod),...bottomFinanceChannels(channelSource,channelPeriod)].map(channel=>[normalizeFinanceClassName(channel.channel),channel])).values()]
  const historyNames=[...new Map((channelReview??[]).map(row=>[normalizeFinanceClassName(row.channel),row.channel])).values()].sort((a,b)=>a.localeCompare(b))
  const priorMonths=new Set(validAsOf?Array.from({length:12},(_,i)=>new Date(Date.UTC(year-1,monthNumber-1+i,1)).toISOString().slice(0,10)):[])
  const historyCoverage=(name:string)=>new Set((channelReview??[]).filter(row=>normalizeFinanceClassName(row.channel)===normalizeFinanceClassName(name)&&priorMonths.has(row.month)&&row.income!==null).map(row=>row.month)).size

  async function saveUploadedBaseline(companyFile:File|null, classFiles:File[]) {
    if (!onSaveBaseline) { if(companyFile) setHistory(companyFile); if(classFiles.length) setClasses(classFiles); return }
    setBusy(true); setError('')
    try {
      const nextHistory=companyFile?parseHistoricalCompanyStatement(await readHistoricalCsv(companyFile)):baseline.history
      assertUniqueHistoricalMonths(nextHistory)
      if (companyFile && !nextHistory.length) throw new Error('No historical income data was found in the company file.')
      const selected=new Set<string>()
      const statements=await Promise.all(classFiles.map(async file=>{
        const month=monthFromFilename(file.name)
        if(!month) throw new Error(`Cannot identify the month in ${file.name}; use a name such as Jan 2026.csv.`)
        if(selected.has(month)) throw new Error(`More than one class statement was selected for ${month}.`)
        selected.add(month)
        const rows=parseHistoricalClassStatement(await readHistoricalCsv(file),month)
        if(!rows.length) throw new Error(`No class data was found in ${file.name}.`)
        return rows
      }))
      // The deck needs income only; do not persist unrelated statement details.
      const next={history:nextHistory.map(row=>({month:row.month,income:row.income,cogs:null,expenses:null,ordinaryIncome:null,netIncome:null})),channelHistory:[...baseline.channelHistory.filter(row=>!selected.has(row.month)),...statements.flat()].map(row=>({month:row.month,channel:row.channel,income:row.income,cogs:null,expenses:null,ordinaryIncome:null,netIncome:null}))}
      await onSaveBaseline(next)
      setBaseline(next);setHistory(null);setClasses([]);setChannelReview(null)
    } catch(e) {setError(e instanceof Error?`Could not save historical inputs: ${e.message}`:'Could not save historical inputs.')}
    finally {setBusy(false)}
  }

  async function loadChannelHistory(): Promise<HistoricalChannelStatement[]> {
    const selectedMonths=new Set<string>()
    const classFiles=classes.map(file=>{
      const month=monthFromFilename(file.name)
      if(!month)throw new Error(`Cannot identify the month in ${file.name}; use a name such as Jan 2026.csv.`)
      if(selectedMonths.has(month))throw new Error(`More than one class statement was selected for ${month}. Select only one per month.`)
      selectedMonths.add(month);return {file,month}
    })
    if(!classFiles.length)return baseline.channelHistory
    const rows=await Promise.all(classFiles.map(async ({file,month})=>{
      const result=parseHistoricalClassStatement(await readHistoricalCsv(file),month)
      if(!result.length)throw new Error(`No class data was found in ${file.name}.`)
      return result
    }))
    return [...baseline.channelHistory.filter(row=>!selectedMonths.has(row.month)),...rows.flat()]
  }

  async function inspectClassMatches() {
    if (!leadership) return
    setBusy(true);setError('')
    try { setInspected({file:leadership,data:await readFinanceLeadershipWorkbook(leadership)}) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not read the Leadership Tool.') }
    finally { setBusy(false) }
  }

  async function inspectChannelMatches() {
    if(!leadership)return
    setBusy(true);setError('')
    try {
      const [data,history]=await Promise.all([inspected?.file===leadership?Promise.resolve(inspected.data):readFinanceLeadershipWorkbook(leadership),loadChannelHistory()])
      setInspected({file:leadership,data});setChannelReview(history)
    } catch(e) {setError(e instanceof Error?e.message:'Could not review channel history.')}
    finally {setBusy(false)}
  }

  async function generate() {
    if (!leadership || !warehouse || !validAsOf || !validWorkflowAdoption || !validMilestones || (!history && !baseline.history.length)) return
    setBusy(true); setError('')
    try {
      const [leadershipData, warehouseRows, historyRows, channelRows] = await Promise.all([
        inspected?.file===leadership ? Promise.resolve(inspected.data) : readFinanceLeadershipWorkbook(leadership), parseWarehouseBudgetFile(warehouse),
        history ? readHistoricalCsv(history).then(parseHistoricalCompanyStatement) : Promise.resolve(baseline.history),
        channelReview!==null ? Promise.resolve(channelReview) : loadChannelHistory(),
      ])
      assertUniqueHistoricalMonths(historyRows)
      await persistMilestones(milestoneSnapshot)
      const snapshot: LeadershipToolSnapshot = { id:'local-preview', snapshot_key:'current', filename:leadership.name, uploaded_by:null, uploaded_at:new Date().toISOString(), ...leadershipData.parsed }
      const input: FinanceDeckInput = { snapshot, details:leadershipData.details, warehouse:warehouseRows, history:historyRows, channelHistory:channelRows, statuses, notes, customMilestones, milestoneEdits, completion, classMappings, channelMappings, workflowAdoptionPct, workflowAdoptionDate:workflowAdoptionPct === null ? null : workflowAdoptionDate, asOf, currentMonthProjectedSales: asOf === today() ? currentMonthProjectedSales : null }
      onGenerated(generateFinanceDeck(input))
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not read the supplied files.') }
    finally { setBusy(false) }
  }

  return <div className="space-y-5">
    <p className="text-sm text-text2">Files are read in your browser to prepare HTML for Ryan’s deck. The historical income statement supplies the matching prior-year months for the 30% growth line. Choose workbook versions that match the as-of date.</p>
    <div className="grid gap-4 md:grid-cols-2">
      <label className="text-sm font-semibold">Leadership Tool <span className="text-danger">*</span><input type="file" accept=".xlsx,.xlsm" className="input mt-1 w-full text-xs" onChange={e => {setLeadership(e.target.files?.[0] ?? null);setInspected(null);setChannelReview(null);setError('')}} /></label>
      <label className="text-sm font-semibold">Warehouse Budget <span className="text-danger">*</span><input type="file" accept=".xlsx,.xlsm" className="input mt-1 w-full text-xs" onChange={e => setWarehouse(e.target.files?.[0] ?? null)} /></label>
      <label className="text-sm font-semibold">Prior-year company income statement <span className="font-normal text-text2">· required once for the 30% line</span><input type="file" accept=".csv" disabled={busy} className="input mt-1 w-full text-xs" onChange={e => {const file=e.target.files?.[0]??null;if(file) void saveUploadedBaseline(file,[])}} /></label>
      <label className="text-sm font-semibold">Prior-year class statements <span className="font-normal text-text2">· optional, one file per month</span><input type="file" accept=".csv" multiple disabled={busy} className="input mt-1 w-full text-xs" onChange={e => {const files=Array.from(e.target.files??[]);if(files.length) void saveUploadedBaseline(null,files);setChannelReview(null)}} /></label>
      <label className="text-sm font-semibold">As of date<input type="date" className="input mt-1 w-full" min={periodStart} max={periodEnd} value={asOf} onChange={e => setAsOf(e.target.value)} /></label>
    </div>
    {!validAsOf && <p role="alert" className="text-xs text-danger">Choose a date in the month selected in Stitch North Star.</p>}
    {!history && !baseline.history.length && <p className="rounded-lg bg-warning/10 p-3 text-xs text-text2">The 30% scenario remains pending until the prior-year company income statement is selected.</p>}
    {baseline.history.length || baseline.channelHistory.length ? <p className="text-xs text-text2">Saved historical inputs: {baseline.history.length} company month(s) and {new Set(baseline.channelHistory.map(row=>row.month)).size} class month(s). A company CSV replaces its baseline; class CSVs replace only the months supplied.</p> : null}
    <div><button type="button" className="btn-secondary" disabled={!leadership || busy || !validAsOf} onClick={() => void inspectClassMatches()}>Review class matches</button></div>
    {Object.keys(classMappings).length>0 && <div className="rounded-lg border border-border p-3 text-xs"><strong>Saved manual matches</strong>{Object.entries(classMappings).map(([source,target])=><div key={source} className="mt-2 flex items-center justify-between gap-3"><span>{source} → {target}</span><button type="button" className="btn-secondary text-xs" aria-label={`Remove match ${source}`} onClick={()=>setClassMappings(old=>{const next={...old};delete next[source];return next})}>Remove</button></div>)}</div>}
    {inspected && <div className="space-y-3 rounded-lg border border-border p-3"><p className="text-xs text-text2">Before manual matches, {comparisonMonth.slice(0,7)} has {unmatchedActuals.length} actual class(es) without a matched budget and {unmatchedBudgets.length} budget class(es) without a matched actual. Match only names you know refer to the same class; the match applies across all months. Missing budgets stay pending.</p>{unmatchedActuals.length>0 && <details className="text-xs text-text2"><summary className="cursor-pointer font-semibold">Actual classes without a matched budget</summary><ul className="mt-2 list-disc pl-5">{unmatchedActuals.map(row=><li key={row.channel}>{row.channel}</li>)}</ul></details>}{unmatchedBudgets.map(source=>{
      const key=normalizeFinanceClassName(source.channel), selected=classMappings[key]??''
      return <label key={key} className="block text-sm">Budget class: <strong>{source.channel}</strong><select aria-label={`Match budget class ${source.channel}`} className="input mt-1 w-full text-sm" value={selected} onChange={e=>{const value=e.target.value;setClassMappings(old=>{const next={...old};if(value)next[key]=value;else delete next[key];return next})}}><option value="">Keep unmatched</option>{selected&&!unmatchedActuals.some(row=>row.channel===selected)&&<option value={selected}>{selected} · saved match</option>}{unmatchedActuals.map(target=><option key={target.channel} value={target.channel}>{target.channel}</option>)}</select></label>
    })}</div>}
    <div><button type="button" className="btn-secondary" disabled={!leadership || busy || !validAsOf} onClick={() => void inspectChannelMatches()}>Review channel history matches</button></div>
    {Object.keys(channelMappings).length>0 && <div className="rounded-lg border border-border p-3 text-xs"><strong>Saved historical channel matches</strong>{Object.entries(channelMappings).map(([source,target])=><div key={source} className="mt-2 flex items-center justify-between gap-3"><span>{source} → {target}</span><button type="button" className="btn-secondary text-xs" aria-label={`Remove channel history match ${source}`} onClick={()=>setChannelMappings(old=>{const next={...old};delete next[source];return next})}>Remove</button></div>)}</div>}
    {channelReview!==null && <div className="space-y-3 rounded-lg border border-border p-3"><p className="text-xs text-text2">Channel forecasts use prior-year class statements. Select a historical class only when you know it represents the current channel. Matches apply across all months; unavailable history remains pending.</p>{!channelReview.length?<p className="text-xs text-text2">No historical class statements are available. Upload the prior-year class CSVs to review matches.</p>:topChannels.filter(channel=>historyCoverage(channelMappings[normalizeFinanceClassName(channel.channel)]??channel.channel)<12||Boolean(channelMappings[normalizeFinanceClassName(channel.channel)])).map(channel=>{
      const key=normalizeFinanceClassName(channel.channel), selected=channelMappings[key]??'', coverage=historyCoverage(selected||channel.channel)
      return <label key={key} className="block text-sm">Current channel: <strong>{channel.channel}</strong> <span className="text-xs text-text2">· {coverage}/12 prior-year months available</span><select aria-label={`Match channel history ${channel.channel}`} className="input mt-1 w-full text-sm" value={selected} onChange={e=>{const value=e.target.value;setChannelMappings(old=>{const next={...old};if(value)next[key]=value;else delete next[key];return next})}}><option value="">Use exact name</option>{selected&&!historyNames.includes(selected)&&<option value={selected}>{selected} · saved match unavailable</option>}{historyNames.map(name=><option key={name} value={name}>{name}</option>)}</select></label>
    })}</div>}
    <div><button type="button" className="btn-secondary" onClick={() => setQuestions(v => !v)}>{questions ? 'Hide milestone questions' : 'Answer milestone questions'}</button></div>
    {questions && <fieldset disabled={busy} className="max-h-[42vh] space-y-3 overflow-y-auto rounded-lg border border-border p-3">
      <label className="block border-b border-border pb-3 text-sm font-semibold">Current finance workflow adoption (%)
        <input aria-label="Current finance workflow adoption percentage" type="number" min="0" max="100" step="any" className="input ml-2 w-28 text-sm" value={workflowAdoption} onChange={e => { setWorkflowAdoption(e.target.value); setWorkflowAdoptionDate(e.target.value ? asOf : '') }} />
        <span className="block text-xs font-normal text-text2">Enter the percentage of finance tasks on workflows. Leave blank if unknown; milestone colors are selected separately.</span>
      </label>
      {workflowAdoptionPct !== null && <label className="block text-sm font-semibold">Adoption reported as of <input type="date" aria-label="Workflow adoption date" max={asOf} className="input ml-2 text-sm" value={workflowAdoptionDate} onChange={e => setWorkflowAdoptionDate(e.target.value)} /></label>}
      {!validWorkflowAdoption && <p role="alert" className="text-xs text-danger">Enter an adoption percentage from 0 to 100 and a reporting date no later than the deck’s as-of date.</p>}
      <p className="text-xs text-text2">Enter status and completion separately. A milestone marked unfinished turns red after its due date; unconfirmed completion is never assumed to be unfinished. Changing the date or description resets both fields. Dates outside November 2026–October 2027 appear in the milestone details.</p>
      {onSaveMilestones && <p className="text-xs text-text2" aria-live="polite">{milestoneSaving?'Saving milestone changes…':milestoneSaveError?'Milestone changes could not be saved. Try generating again.':'Milestone changes save automatically.'}</p>}
      <div className="grid gap-2 rounded-lg bg-surface2 p-3 md:grid-cols-[140px_1fr_150px_auto]">
        <select aria-label="New milestone category" className="input text-sm" value={newMilestoneLane} onChange={e=>setNewMilestoneLane(e.target.value as FinanceMilestone['lane'])}><option>Guardrail</option><option>Growth lever</option><option>Execution</option></select>
        <input aria-label="New milestone description" className="input text-sm" maxLength={80} placeholder="Milestone description" value={newMilestoneLabel} onChange={e=>setNewMilestoneLabel(e.target.value)} />
        <input aria-label="New milestone date" className="input text-sm" type="date" value={newMilestoneDate} onChange={e=>setNewMilestoneDate(e.target.value)} />
        <button type="button" className="btn-secondary text-xs" disabled={!newMilestoneLabel.trim()||!validFinanceMilestoneDate(newMilestoneDate)} onClick={()=>{setCustomMilestones(old=>[...old,{id:`custom-${crypto.randomUUID()}`,lane:newMilestoneLane,label:newMilestoneLabel.trim(),date:newMilestoneDate}]);setNewMilestoneLabel('');setNewMilestoneDate('')}}>Add milestone</button>
      </div>
      {[...FINANCE_MILESTONES,...customMilestones].map(m => <div key={m.id} className="grid gap-2 border-b border-border pb-3 md:grid-cols-[1fr_125px_1fr]">
      <div className="space-y-1 text-sm"><div className="text-xs text-text2">{m.lane} {m.id.startsWith('custom-')&&<button type="button" className="underline" aria-label={`Remove ${m.label}`} onClick={()=>{setCustomMilestones(old=>old.filter(item=>item.id!==m.id));setMilestoneEdits(old=>{const next={...old};delete next[m.id];return next})}}>Remove</button>}</div><input className="input w-full text-sm" aria-label={`${m.label} description`} maxLength={80} value={milestoneEdits[m.id]?.label ?? m.label} onChange={e => {const label=e.target.value;setMilestoneEdits(old=>({...old,[m.id]:{date:old[m.id]?.date??m.date,label}}));setStatuses(old=>({...old,[m.id]:'pending'}));setCompletion(old=>({...old,[m.id]:'unknown'}))}} /><input type="date" className="input w-full text-sm" aria-label={`${m.label} date`} value={milestoneEdits[m.id]?.date ?? m.date} onChange={e => {const date=e.target.value;setMilestoneEdits(old=>({...old,[m.id]:{label:old[m.id]?.label??m.label,date}}));setStatuses(old=>({...old,[m.id]:'pending'}));setCompletion(old=>({...old,[m.id]:'unknown'}))}} /></div>
      <select aria-label={`${m.label} status`} className="input text-sm" value={statuses[m.id] ?? 'pending'} onChange={e => setStatuses(old => ({ ...old, [m.id]:e.target.value as MilestoneStatus }))}><option value="pending">Pending</option><option value="green">Green</option><option value="yellow">Yellow</option><option value="red">Red</option></select>
      <div className="space-y-1"><select aria-label={`${m.label} completion`} className="input w-full text-sm" value={completion[m.id] ?? 'unknown'} onChange={e => setCompletion(old=>({...old,[m.id]:e.target.value as MilestoneCompletion}))}><option value="unknown">Completion unconfirmed</option><option value="unfinished">Unfinished</option><option value="achieved">Action and outcome achieved by due date</option></select><input className="input w-full text-sm" aria-label={`${m.label} note`} placeholder="Outcome / evidence" value={notes[m.id] ?? ''} onChange={e => setNotes(old => ({ ...old, [m.id]:e.target.value }))} /></div>
    </div>)}</fieldset>}
    {!validMilestones && <p role="alert" className="text-xs text-danger">Every edited milestone needs a valid date and a description of at most 80 characters.</p>}
    <p className="text-xs text-text2">Unanswered milestones remain pending. The workbooks do not establish when these actions were completed. NOI, payroll and cash indicators are calculated separately; cash uses the Leadership Tool’s column L and ending cash.</p>
    {error && <div role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</div>}
    {milestoneSaveError && <div role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">Could not save milestones: {milestoneSaveError}</div>}
    <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button><button type="button" className="btn-primary" disabled={!leadership || !warehouse || !validAsOf || !validWorkflowAdoption || !validMilestones || (!history && !baseline.history.length) || busy} onClick={() => void generate()}>{busy ? 'Saving or preparing…' : 'Generate HTML'}</button></div>
  </div>
}
