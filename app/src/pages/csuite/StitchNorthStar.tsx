import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  Code2,
  Edit3,
  Layers,
  Maximize2,
  Monitor,
  Search,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  X,
} from 'lucide-react'
import Badge from '@/components/ui/Badge'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/contexts/AuthContext'
import { useLeadershipSnapshot } from '@/hooks/useLeadershipSnapshot'
import { useMonthlyStar, useMonthlyStarSales, useNorthStarRows, useUpdateNorthStarProgress, useUpdateNorthStarRow } from '@/hooks/useNorthStar'
import { useStitchSlideHtmlBlocks, useUpsertStitchSlideHtmlBlock } from '@/hooks/useStitchSlideHtmlBlocks'
import { cn, fmtCurrency, fmtNumber } from '@/lib/utils'
import type { NorthStarStatus, StitchSlideHtmlBlock, StitchSlideHtmlViewMode } from '@/types'
import {
  STATUS_LABELS,
  addMonthsToPeriod,
  buildNorthStarProgressPayload,
  buildNorthStarUpdatePayload,
  computeMonthlyStarMetrics,
  deriveMonthlyStarFromSalesRows,
  formatMonthlyStarDragChannelNotes,
  formatPeriodMonth,
  isNorthStarProgressField,
  mergeNorthStarRows,
  monthlyStarSalesWindows,
  monthlyStarToInput,
  periodMonth,
  periodWeek,
  sortNorthStarRows,
  type NorthStarDisplayRow,
  type NorthStarEditableField,
} from './NorthStar.helpers'
import {
  STITCH_ALL_PILLARS_TAB,
  MONTHLY_STAR_FINANCE_NORTH_STAR,
  buildLeadershipFinanceRows,
  buildStitchFinanceMetricRow,
  buildOwnerSlideDeck,
  buildStitchPillarTabs,
  filterRowsByPillar,
  isStitchAutoFinanceField,
  leadershipToolOverrideSourceVersion,
  mergeStitchFinanceRows,
  monthlyStarOverrideSourceVersion,
  readStitchAutoRowOverrides,
  scaledChartDomain,
  stitchSlideHtmlKey,
  stitchAutoRowOverrideKey,
  writeStitchAutoRowOverride,
  type StitchAutoRowOverrideMap,
  type StitchAutoRowOverrideSourceVersions,
  type StitchOwnerDeck,
} from './StitchNorthStar.helpers'

const STATUS_VARIANT: Record<NorthStarStatus, 'ok' | 'warning' | 'danger'> = {
  on_plan: 'ok',
  at_risk: 'warning',
  off_plan: 'danger',
}

const STATUS_ACCENT_CLASS: Record<NorthStarStatus, string> = {
  on_plan: 'border-success/30 bg-success/10',
  at_risk: 'border-warning/35 bg-warning/10',
  off_plan: 'border-danger/35 bg-danger/10',
}

const STATUS_TEXT_CLASS: Record<NorthStarStatus, string> = {
  on_plan: 'text-success',
  at_risk: 'text-warning',
  off_plan: 'text-danger',
}

const COMPACT_FIELDS = new Set<NorthStarEditableField>(['pillar', 'owner', 'plan_value', 'actual_mtd', 'forecast'])

type StitchHtmlSaveHandler = (row: NorthStarDisplayRow, viewMode: StitchSlideHtmlViewMode, htmlCode: string) => Promise<void>

export default function StitchNorthStar() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const canEditProgress = isAdmin || profile?.role === 'csuite'
  const currentMonth = useMemo(() => periodMonth(), [])
  const currentWeek = useMemo(() => periodWeek(), [])
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [selectedPillar, setSelectedPillar] = useState(STITCH_ALL_PILLARS_TAB)
  const [search, setSearch] = useState('')
  const [presentingOwner, setPresentingOwner] = useState<string | null>(null)
  const [activeSlide, setActiveSlide] = useState(0)
  const [generatedRowOverrides, setGeneratedRowOverrides] = useState<StitchAutoRowOverrideMap>({})

  const { data: savedRows = [], isLoading: rowsLoading, error: rowsError } = useNorthStarRows()
  const { data: monthlyStar = null, isLoading: monthlyLoading, error: monthlyError } = useMonthlyStar(selectedMonth)
  const { data: salesRows, isLoading: salesLoading, error: salesError } = useMonthlyStarSales(selectedMonth)
  const { data: leadershipSnapshot = null, isLoading: leadershipLoading, error: leadershipError } = useLeadershipSnapshot()
  const { data: htmlBlocks = [], isLoading: htmlLoading, error: htmlError } = useStitchSlideHtmlBlocks(selectedMonth)
  const updateRow = useUpdateNorthStarRow()
  const updateProgress = useUpdateNorthStarProgress()
  const upsertHtmlBlock = useUpsertStitchSlideHtmlBlock()

  const baseRows = useMemo(() => mergeNorthStarRows(savedRows, selectedMonth, currentWeek), [savedRows, selectedMonth, currentWeek])
  const salesWindows = useMemo(() => monthlyStarSalesWindows(selectedMonth), [selectedMonth])
  const manualMonthlyInput = useMemo(() => monthlyStarToInput(monthlyStar, selectedMonth), [monthlyStar, selectedMonth])
  const autoRowSourceVersions = useMemo<StitchAutoRowOverrideSourceVersions>(() => ({
    monthly_star: monthlyStarOverrideSourceVersion(selectedMonth, monthlyStar, salesRows),
    leadership_tool: leadershipToolOverrideSourceVersion(leadershipSnapshot),
  }), [selectedMonth, monthlyStar, salesRows, leadershipSnapshot])
  const monthlyStarRowOverrideKey = useMemo(
    () => stitchAutoRowOverrideKey({ source: 'monthly_star', chart: { kind: 'sales' }, north_star: MONTHLY_STAR_FINANCE_NORTH_STAR }),
    []
  )
  const monthlyStarMetricOverrides = useMemo(() => {
    const rowOverrides = generatedRowOverrides[monthlyStarRowOverrideKey]
    return {
      target_sales: metricOverrideNumber(rowOverrides?.plan_value),
      mtd_actual: metricOverrideNumber(rowOverrides?.actual_mtd),
      forecast: metricOverrideNumber(rowOverrides?.forecast),
    }
  }, [generatedRowOverrides, monthlyStarRowOverrideKey])
  const monthlyInput = useMemo(() => {
    if (!salesRows?.current.length) return manualMonthlyInput
    return deriveMonthlyStarFromSalesRows({
      periodMonth: selectedMonth,
      targetSales: manualMonthlyInput.target_sales,
      rows: salesRows.current,
      previousYearRows: salesRows.previousYear,
      daysElapsed: Math.max(1, salesWindows.daysElapsed),
      daysRemaining: salesWindows.daysRemaining,
    })
  }, [salesRows, manualMonthlyInput, selectedMonth, salesWindows])
  const displayedMonthlyInput = useMemo(() => ({
    ...monthlyInput,
    target_sales: monthlyStarMetricOverrides.target_sales ?? monthlyInput.target_sales,
    mtd_actual: monthlyStarMetricOverrides.mtd_actual ?? monthlyInput.mtd_actual,
  }), [monthlyInput, monthlyStarMetricOverrides.mtd_actual, monthlyStarMetricOverrides.target_sales])
  const displayedMonthlyMetrics = useMemo(() => {
    const metrics = computeMonthlyStarMetrics(displayedMonthlyInput)
    if (monthlyStarMetricOverrides.forecast === undefined) return metrics

    return {
      ...metrics,
      projectedMonthEnd: monthlyStarMetricOverrides.forecast,
      onTrack: monthlyStarMetricOverrides.forecast >= displayedMonthlyInput.target_sales,
    }
  }, [displayedMonthlyInput, monthlyStarMetricOverrides.forecast])
  const financeMetricRow = useMemo(() => {
    return buildStitchFinanceMetricRow(baseRows, displayedMonthlyInput, displayedMonthlyMetrics, currentWeek)
  }, [baseRows, displayedMonthlyInput, displayedMonthlyMetrics, currentWeek])
  const leadershipFinanceRows = useMemo(
    () => buildLeadershipFinanceRows([...baseRows, financeMetricRow], leadershipSnapshot, selectedMonth, currentWeek, {
      currentMonthProjectedSales: displayedMonthlyMetrics.projectedMonthEnd,
    }),
    [baseRows, financeMetricRow, leadershipSnapshot, selectedMonth, currentWeek, displayedMonthlyMetrics.projectedMonthEnd]
  )
  const rows = useMemo(
    () => sortNorthStarRows(
      mergeStitchFinanceRows(baseRows, [financeMetricRow, ...leadershipFinanceRows])
        .map(row => applyGeneratedRowOverrides(row, generatedRowOverrides)),
      { field: 'slot_index', dir: 'asc' }
    ),
    [baseRows, financeMetricRow, leadershipFinanceRows, generatedRowOverrides]
  )
  const tabs = useMemo(() => buildStitchPillarTabs(rows), [rows])
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return filterRowsByPillar(rows, selectedPillar).filter(row => {
      if (!query) return true
      return [row.pillar, row.owner, row.north_star, row.constraint_now, row.weekly_move, row.last_week_result]
        .some(value => (value ?? '').toLowerCase().includes(query))
    })
  }, [rows, selectedPillar, search])
  const ownerDecks = useMemo(() => buildOwnerSlideDeck(rows), [rows])
  const selectedDeck = ownerDecks.find(deck => deck.owner === presentingOwner) ?? null
  const selectedDeckIndex = selectedDeck ? ownerDecks.findIndex(deck => deck.owner === selectedDeck.owner) : -1
  const statusCounts = useMemo(() => countStatuses(rows), [rows])
  const htmlBlocksByKey = useMemo(() => new Map(htmlBlocks.map(block => [block.slide_key, block])), [htmlBlocks])
  const dailyLift = Math.max(0, displayedMonthlyMetrics.dailyNeeded - displayedMonthlyMetrics.dailyPace)
  const liftPct = displayedMonthlyMetrics.liftNeededPct === null ? 'n/a' : `${Math.max(0, displayedMonthlyMetrics.liftNeededPct).toFixed(1)}%`

  useEffect(() => {
    if (!tabs.some(tab => tab.id === selectedPillar)) {
      setSelectedPillar(STITCH_ALL_PILLARS_TAB)
    }
  }, [selectedPillar, tabs])

  useEffect(() => {
    setActiveSlide(0)
  }, [presentingOwner])

  useEffect(() => {
    setGeneratedRowOverrides(readStitchAutoRowOverrides(selectedMonth, autoRowSourceVersions))
  }, [selectedMonth, autoRowSourceVersions])

  useEffect(() => {
    if (presentingOwner && !selectedDeck) {
      setPresentingOwner(null)
    }
  }, [presentingOwner, selectedDeck])

  if (rowsLoading || monthlyLoading || salesLoading || leadershipLoading || htmlLoading) return <PageLoader />

  const error = rowsError ?? monthlyError ?? salesError ?? leadershipError ?? htmlError
  if (error) {
    return (
      <div className="card text-center py-16">
        <AlertTriangle size={32} className="text-danger mx-auto mb-3" />
        <div className="text-text1 font-semibold">Failed to load Stitch North Star</div>
        <div className="text-text2 text-sm mt-1">{(error as Error)?.message ?? 'Try refreshing the page.'}</div>
      </div>
    )
  }

  const isSaving = updateRow.isPending || updateProgress.isPending || upsertHtmlBlock.isPending

  function canEditField(row: NorthStarDisplayRow, field: NorthStarEditableField): boolean {
    if (row.source === 'monthly_star') {
      if (field === 'pillar' || field === 'owner') return false
      return canEditProgress
    }
    if (row.source === 'leadership_tool') {
      if (field === 'pillar' || field === 'owner') return false
      return canEditProgress
    }
    if (isStitchAutoFinanceField(row, field)) return false
    if (row.source === 'monthly_star' && field === 'pillar') return false
    if (field === 'pillar' || field === 'owner' || field === 'north_star') return isAdmin
    return canEditProgress && (isAdmin || Boolean(row.id))
  }

  async function handleCellSave(row: NorthStarDisplayRow, field: NorthStarEditableField, value: string | NorthStarStatus) {
    if (handleGeneratedRowSessionSave(row, field, value)) return
    if (isStitchAutoFinanceField(row, field)) return

    if (!isAdmin && isNorthStarProgressField(field)) {
      if (!row.id) throw new Error('Admin must create the row before progress can be edited')
      await updateProgress.mutateAsync({ ...buildNorthStarProgressPayload(row, field, value), id: row.id })
      return
    }

    await updateRow.mutateAsync(buildNorthStarUpdatePayload(row, field, value))
  }

  async function handleHtmlBlockSave(row: NorthStarDisplayRow, viewMode: StitchSlideHtmlViewMode, htmlCode: string) {
    await upsertHtmlBlock.mutateAsync({
      period_month: selectedMonth,
      slide_key: stitchSlideHtmlKey(row),
      view_mode: viewMode,
      html_code: htmlCode,
    })
  }

  function movePresenter(direction: -1 | 1) {
    if (ownerDecks.length === 0 || selectedDeckIndex < 0) return
    const nextIndex = (selectedDeckIndex + direction + ownerDecks.length) % ownerDecks.length
    setPresentingOwner(ownerDecks[nextIndex].owner)
    setActiveSlide(0)
  }

  function handleGeneratedRowSessionSave(row: NorthStarDisplayRow, field: NorthStarEditableField, value: string | NorthStarStatus): boolean {
    if (row.source === 'monthly_star' && (field === 'plan_value' || field === 'actual_mtd' || field === 'forecast')) {
      const parsed = parseMetricNumber(String(value))
      if (!Number.isFinite(parsed)) throw new Error('Enter a valid number')
    }

    if (row.source !== 'monthly_star' && row.source !== 'leadership_tool') return false
    if (field === 'pillar' || field === 'owner') return true

    const textValue = typeof value === 'string' ? value.trim() : value
    const key = stitchAutoRowOverrideKey(row)
    const sourceVersion = autoRowSourceVersions[row.source]
    setGeneratedRowOverrides(previous => ({
      ...previous,
      [key]: {
        ...previous[key],
        [field]: textValue,
      },
    }))
    if (sourceVersion) {
      writeStitchAutoRowOverride(selectedMonth, row.source, sourceVersion, key, field, textValue)
    }
    return true
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-accent/25 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent">
            <Sparkles size={13} />
            Stitch North Star
          </div>
          <h1 className="text-2xl font-bold text-text1">Stitch North Star</h1>
          <p className="mt-1 text-sm text-text2">Business plan review for the week of {currentWeek}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center overflow-hidden rounded-lg border border-border bg-surface">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center text-text2 transition hover:bg-surface2 hover:text-text1"
              onClick={() => setSelectedMonth(month => addMonthsToPeriod(month, -1))}
              title="Previous month"
              aria-label="Previous month"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="min-w-[132px] border-x border-border px-3 text-center text-sm font-semibold text-text1">
              {formatPeriodMonth(selectedMonth)}
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center text-text2 transition hover:bg-surface2 hover:text-text1 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => setSelectedMonth(month => addMonthsToPeriod(month, 1))}
              disabled={selectedMonth >= currentMonth}
              title="Next month"
              aria-label="Next month"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          {ownerDecks[0] && (
            <button type="button" className="btn-primary text-xs" onClick={() => setPresentingOwner(ownerDecks[0].owner)}>
              <Monitor size={14} />
              Present
            </button>
          )}
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        <StitchMetric label="MTD sales" value={fmtCurrency(displayedMonthlyInput.mtd_actual)} sub={`${fmtCurrency(displayedMonthlyMetrics.dailyPace)} / day`} icon={<BarChart3 size={16} />} tone="info" />
        <StitchMetric label="Projected" value={fmtCurrency(displayedMonthlyMetrics.projectedMonthEnd)} sub="Month-end pace" icon={displayedMonthlyMetrics.onTrack ? <TrendingUp size={16} /> : <TrendingDown size={16} />} tone={displayedMonthlyMetrics.onTrack ? 'success' : 'warning'} />
        <StitchMetric label="Gap" value={fmtCurrency(displayedMonthlyMetrics.remainingToTarget)} sub="To monthly target" icon={<Target size={16} />} tone={displayedMonthlyMetrics.remainingToTarget > 0 ? 'warning' : 'success'} />
        <StitchMetric label="Daily lift" value={fmtCurrency(dailyLift)} sub="Extra per day needed" icon={<TrendingUp size={16} />} tone={displayedMonthlyMetrics.onTrack ? 'success' : 'warning'} />
        <StitchMetric label="Lift %" value={liftPct} sub="Required pace lift" icon={<Target size={16} />} tone={displayedMonthlyMetrics.onTrack ? 'success' : 'warning'} />
        <StitchMetric label="Pillars" value={fmtNumber(rows.length)} sub={`${fmtNumber(ownerDecks.length)} owner decks`} icon={<Layers size={16} />} />
        <StitchMetric label="Off Track" value={fmtNumber(statusCounts.off_plan)} sub={`${fmtNumber(statusCounts.at_risk)} with plan`} icon={<AlertTriangle size={16} />} tone={statusCounts.off_plan > 0 ? 'danger' : 'success'} />
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap gap-2">
            {tabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                className={cn(
                  'inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition',
                  selectedPillar === tab.id
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-border bg-surface2 text-text2 hover:border-accent/50 hover:text-text1'
                )}
                onClick={() => setSelectedPillar(tab.id)}
              >
                {tab.label}
                <span className="rounded bg-bg px-1.5 py-0.5 text-[10px] text-text2">{tab.count}</span>
              </button>
            ))}
          </div>
          <div className="relative w-full lg:w-72">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text2" />
            <input
              className="input w-full pl-9"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search pillars"
            />
          </div>
        </div>
      </section>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="space-y-4">
          {filteredRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-surface p-10 text-center text-sm text-text2">No pillars match the current view.</div>
          ) : (
            filteredRows.map(row => (
              <PillarWorkspaceCard
                key={`${row.slot_index}-${row.id ?? 'draft'}`}
                row={row}
                canEditField={canEditField}
                htmlBlock={htmlBlocksByKey.get(stitchSlideHtmlKey(row)) ?? null}
                canEditHtml={canEditProgress}
                isSaving={isSaving}
                onSave={handleCellSave}
                onHtmlBlockSave={handleHtmlBlockSave}
              />
            ))
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-text1">Owner decks</div>
                <div className="mt-0.5 text-xs text-text2">By owner</div>
              </div>
              <Users size={16} className="text-accent" />
            </div>
            <div className="space-y-2">
              {ownerDecks.map(deck => (
                <button
                  key={deck.owner}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-surface2 px-3 py-2 text-left transition hover:border-accent/50 hover:text-accent"
                  onClick={() => setPresentingOwner(deck.owner)}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-text1">{deck.owner}</span>
                    <span className="text-xs text-text2">{deck.rows.length} slides</span>
                  </span>
                  <Maximize2 size={14} className="text-text2" />
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-text2">Dragging channels</div>
            <div className="mt-3 space-y-2">
              {displayedMonthlyMetrics.draggingChannels.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-text2">No negative channel deltas recorded.</div>
              ) : (
                displayedMonthlyMetrics.draggingChannels.map(channel => (
                  <div key={channel.channel} className="flex items-center justify-between gap-3 rounded-lg bg-surface2 px-3 py-2">
                    <span className="truncate text-sm text-text1">{channel.channel}</span>
                    <span className="text-sm font-semibold text-danger tabular-nums">{fmtCurrency(channel.delta)}</span>
                  </div>
                ))
              )}
            </div>
            {monthlyInput.dragging_channel_notes && (
              <div className="mt-3 whitespace-pre-wrap rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text2">
                {monthlyInput.dragging_channel_notes}
              </div>
            )}
            {!monthlyInput.dragging_channel_notes && displayedMonthlyMetrics.draggingChannels.length > 0 && (
              <div className="mt-3 whitespace-pre-wrap rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text2">
                {formatMonthlyStarDragChannelNotes(monthlyInput.channel_deltas)}
              </div>
            )}
          </div>
        </aside>
      </div>

      {selectedDeck && (
        <OwnerDeckModal
          deck={selectedDeck}
          activeSlide={Math.min(activeSlide, selectedDeck.rows.length - 1)}
          presenterIndex={selectedDeckIndex}
          presenterCount={ownerDecks.length}
          canEditField={canEditField}
          htmlBlocksByKey={htmlBlocksByKey}
          canEditHtml={canEditProgress}
          isSaving={isSaving}
          onSave={handleCellSave}
          onHtmlBlockSave={handleHtmlBlockSave}
          onSlideChange={setActiveSlide}
          onPresenterChange={movePresenter}
          onClose={() => setPresentingOwner(null)}
        />
      )}
    </div>
  )
}

function PillarWorkspaceCard({
  row,
  canEditField,
  htmlBlock,
  canEditHtml,
  isSaving,
  onSave,
  onHtmlBlockSave,
}: {
  row: NorthStarDisplayRow
  canEditField: (row: NorthStarDisplayRow, field: NorthStarEditableField) => boolean
  htmlBlock: StitchSlideHtmlBlock | null
  canEditHtml: boolean
  isSaving: boolean
  onSave: (row: NorthStarDisplayRow, field: NorthStarEditableField, value: string | NorthStarStatus) => Promise<void>
  onHtmlBlockSave: StitchHtmlSaveHandler
}) {
  const isHtmlMode = htmlBlock?.view_mode === 'html'

  return (
    <article className={cn('overflow-hidden rounded-xl border bg-surface p-4', STATUS_ACCENT_CLASS[row.status])}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABELS[row.status]}</Badge>
            <span className="shrink-0 whitespace-nowrap text-xs font-semibold uppercase tracking-wider text-text2">#{row.slot_index}</span>
          </div>
          <EditableText
            row={row}
            field="pillar"
            value={row.pillar}
            canEdit={canEditField(row, 'pillar')}
            isSaving={isSaving}
            onSave={onSave}
            displayClassName="text-xl font-bold text-text1"
            placeholder="Untitled pillar"
          />
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-text2">
            <span className="shrink-0 whitespace-nowrap">Owner</span>
            <EditableText
              row={row}
              field="owner"
              value={row.owner ?? ''}
              canEdit={canEditField(row, 'owner')}
              isSaving={isSaving}
              onSave={onSave}
              displayClassName="font-semibold text-text1"
              placeholder="Unassigned"
            />
          </div>
        </div>
        <div className="shrink-0">
          <StatusSelect row={row} canEdit={canEditField(row, 'status')} isSaving={isSaving} onSave={onSave} />
        </div>
      </div>

      {isHtmlMode ? (
        <div className="mt-4">
          <StitchHtmlModePanel
            row={row}
            htmlBlock={htmlBlock}
            canEdit={canEditHtml}
            isSaving={isSaving}
            onSave={onHtmlBlockSave}
          />
        </div>
      ) : (
        <>
      <div className="mt-4 rounded-lg border border-border bg-bg/40 p-4">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text2">Metric</div>
        <EditableText
          row={row}
          field="north_star"
          value={row.north_star}
          canEdit={canEditField(row, 'north_star')}
          isSaving={isSaving}
          onSave={onSave}
          multiline
          displayClassName="text-base font-semibold text-text1"
          placeholder="Not set"
        />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <ValueTile label="Plan" row={row} field="plan_value" value={row.plan_value ?? ''} canEdit={canEditField(row, 'plan_value')} isSaving={isSaving} onSave={onSave} />
        <ValueTile label="Actual" row={row} field="actual_mtd" value={row.actual_mtd ?? ''} canEdit={canEditField(row, 'actual_mtd')} isSaving={isSaving} onSave={onSave} />
        <ValueTile label="Forecast" row={row} field="forecast" value={row.forecast ?? ''} canEdit={canEditField(row, 'forecast')} isSaving={isSaving} onSave={onSave} />
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <NarrativeBox
          label="Constraint now"
          row={row}
          field="constraint_now"
          value={row.constraint_now ?? ''}
          canEdit={canEditField(row, 'constraint_now')}
          isSaving={isSaving}
          onSave={onSave}
          tone="danger"
        />
        <NarrativeBox
          label="This week's move"
          row={row}
          field="weekly_move"
          value={row.weekly_move ?? ''}
          canEdit={canEditField(row, 'weekly_move')}
          isSaving={isSaving}
          onSave={onSave}
          tone="accent"
        />
      </div>
      <div className="mt-3">
        <NarrativeBox
          label={commentBoxLabel(row)}
          row={row}
          field="last_week_result"
          value={row.last_week_result ?? ''}
          canEdit={canEditField(row, 'last_week_result')}
          isSaving={isSaving}
          onSave={onSave}
          tone="neutral"
        />
      </div>
          <div className="mt-4">
            <StitchHtmlModePanel
              row={row}
              htmlBlock={htmlBlock}
              canEdit={canEditHtml}
              isSaving={isSaving}
              onSave={onHtmlBlockSave}
            />
          </div>
        </>
      )}
    </article>
  )
}

function OwnerDeckModal({
  deck,
  activeSlide,
  presenterIndex,
  presenterCount,
  canEditField,
  htmlBlocksByKey,
  canEditHtml,
  isSaving,
  onSave,
  onHtmlBlockSave,
  onSlideChange,
  onPresenterChange,
  onClose,
}: {
  deck: StitchOwnerDeck
  activeSlide: number
  presenterIndex: number
  presenterCount: number
  canEditField: (row: NorthStarDisplayRow, field: NorthStarEditableField) => boolean
  htmlBlocksByKey: Map<string, StitchSlideHtmlBlock>
  canEditHtml: boolean
  isSaving: boolean
  onSave: (row: NorthStarDisplayRow, field: NorthStarEditableField, value: string | NorthStarStatus) => Promise<void>
  onHtmlBlockSave: StitchHtmlSaveHandler
  onSlideChange: (slide: number) => void
  onPresenterChange: (direction: -1 | 1) => void
  onClose: () => void
}) {
  const row = deck.rows[activeSlide]
  if (!row) return null
  const htmlBlock = htmlBlocksByKey.get(stitchSlideHtmlKey(row)) ?? null
  const isHtmlMode = htmlBlock?.view_mode === 'html'
  const presenterPosition = presenterIndex >= 0 ? presenterIndex + 1 : 1

  function previous() {
    onSlideChange(activeSlide === 0 ? deck.rows.length - 1 : activeSlide - 1)
  }

  function next() {
    onSlideChange(activeSlide === deck.rows.length - 1 ? 0 : activeSlide + 1)
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-bg">
      <section className="flex h-screen max-h-screen w-screen max-w-none flex-col overflow-hidden border-0 bg-surface shadow-2xl">
        <div className="relative border-b border-border px-5 py-4 lg:px-8">
          <div className="absolute left-1/2 top-0 hidden -translate-x-1/2 rounded-b-lg border-x border-b border-border bg-surface2 px-5 py-1 text-[10px] font-bold uppercase tracking-widest text-text2 md:block">
            Presented by {deck.owner}
          </div>
          <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0 pt-2">
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text2">
                <span>{formatPeriodMonth(row.period_month)}</span>
                <span className="h-1 w-1 rounded-full bg-border" />
                <span>Slide {activeSlide + 1} of {deck.rows.length}</span>
                <span className="h-1 w-1 rounded-full bg-border" />
                <span>Presenter {presenterPosition} of {presenterCount}</span>
              </div>
              <EditableText
                row={row}
                field="pillar"
                value={row.pillar}
                canEdit={canEditField(row, 'pillar')}
                isSaving={isSaving}
                onSave={onSave}
                displayClassName="text-3xl font-bold text-text1"
                placeholder="Untitled pillar"
              />
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <div className="inline-flex overflow-hidden rounded-lg border border-border bg-surface2">
                <button
                  type="button"
                  className="inline-flex h-10 items-center gap-2 px-3 text-xs font-semibold uppercase tracking-wider text-text2 transition hover:bg-surface hover:text-text1 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => onPresenterChange(-1)}
                  disabled={presenterCount <= 1}
                  aria-label="Previous presenter"
                  title="Previous presenter"
                >
                  <Users size={15} />
                  <ChevronLeft size={16} />
                  <span>Presenter</span>
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 items-center gap-2 border-l border-border px-3 text-xs font-semibold uppercase tracking-wider text-text2 transition hover:bg-surface hover:text-text1 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => onPresenterChange(1)}
                  disabled={presenterCount <= 1}
                  aria-label="Next presenter"
                  title="Next presenter"
                >
                  <span>Presenter</span>
                  <ChevronRight size={16} />
                  <Users size={15} />
                </button>
              </div>
              <div className="inline-flex overflow-hidden rounded-lg border border-border bg-surface2">
                <button type="button" className="inline-flex h-10 w-10 items-center justify-center text-text2 transition hover:bg-surface hover:text-text1" onClick={previous} aria-label="Previous slide">
                  <ChevronLeft size={18} />
                </button>
                <button type="button" className="inline-flex h-10 w-10 items-center justify-center border-l border-border text-text2 transition hover:bg-surface hover:text-text1" onClick={next} aria-label="Next slide">
                  <ChevronRight size={18} />
                </button>
              </div>
              <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface2 text-text2 transition hover:text-danger" onClick={onClose} aria-label="Close presentation">
                <X size={20} />
              </button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          {isHtmlMode ? (
            <div className="p-5 lg:p-8">
              <StitchHtmlModePanel
                row={row}
                htmlBlock={htmlBlock}
                canEdit={canEditHtml}
                isSaving={isSaving}
                onSave={onHtmlBlockSave}
                presentation
              />
            </div>
          ) : (
          <div className="grid min-h-full min-w-0 gap-8 p-6 lg:p-8 2xl:grid-cols-[minmax(0,1fr)_400px]">
            <div className="min-w-0 space-y-7">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABELS[row.status]}</Badge>
                  <span className="min-w-0 truncate text-xs font-semibold uppercase tracking-wider text-text2">Owner {deck.owner}</span>
                </div>
                <EditableText
                  row={row}
                  field="north_star"
                  value={row.north_star}
                  canEdit={canEditField(row, 'north_star')}
                  isSaving={isSaving}
                  onSave={onSave}
                  multiline
                  displayClassName="text-2xl font-semibold leading-snug text-text1"
                  placeholder="Not set"
                />
              </div>

              <FinanceSlideGraph row={row} />

              <div className="grid gap-4 sm:grid-cols-2">
                <NarrativeBox
                  label="Constraint now"
                  row={row}
                  field="constraint_now"
                  value={row.constraint_now ?? ''}
                  canEdit={canEditField(row, 'constraint_now')}
                  isSaving={isSaving}
                  onSave={onSave}
                  tone="danger"
                  large
                />
                <NarrativeBox
                  label="This week's move"
                  row={row}
                  field="weekly_move"
                  value={row.weekly_move ?? ''}
                  canEdit={canEditField(row, 'weekly_move')}
                  isSaving={isSaving}
                  onSave={onSave}
                  tone="accent"
                  large
                />
              </div>

              <NarrativeBox
                label={commentBoxLabel(row)}
                row={row}
                field="last_week_result"
                value={row.last_week_result ?? ''}
                canEdit={canEditField(row, 'last_week_result')}
                isSaving={isSaving}
                onSave={onSave}
                tone="neutral"
              />

              <NarrativeBox
                label="Plan"
                row={row}
                field="plan_value"
                value={row.plan_value ?? ''}
                canEdit={canEditField(row, 'plan_value')}
                isSaving={isSaving}
                onSave={onSave}
                tone="neutral"
              />

              <StitchHtmlModePanel
                row={row}
                htmlBlock={htmlBlock}
                canEdit={canEditHtml}
                isSaving={isSaving}
                onSave={onHtmlBlockSave}
                presentation
              />
            </div>

            <aside className="min-w-0 space-y-5">
              <div className="rounded-xl border border-border bg-surface2 p-4">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-text2">Metrics</div>
                <div className="grid gap-3">
                  <ValueTile label={actualMetricLabel(row)} row={row} field="actual_mtd" value={row.actual_mtd ?? ''} canEdit={canEditField(row, 'actual_mtd')} isSaving={isSaving} onSave={onSave} expandToContent />
                  <ValueTile label="Forecast" row={row} field="forecast" value={row.forecast ?? ''} canEdit={canEditField(row, 'forecast')} isSaving={isSaving} onSave={onSave} expandToContent />
                </div>
                <div className="mt-3">
                  <StatusSelect row={row} canEdit={canEditField(row, 'status')} isSaving={isSaving} onSave={onSave} />
                </div>
              </div>

              <div className="rounded-xl border border-border bg-surface2 p-4">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-text2">Slides</div>
                <div className="space-y-2">
                  {deck.rows.map((slide, index) => (
                    <button
                      key={`${slide.slot_index}-${slide.id ?? 'draft'}-thumb`}
                      type="button"
                      className={cn(
                        'flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition',
                        index === activeSlide ? 'border-accent bg-accent/15' : 'border-border bg-surface hover:border-accent/50'
                      )}
                      onClick={() => onSlideChange(index)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-text1">{slide.pillar}</span>
                        <span className="text-xs text-text2">{slide.north_star || 'Not set'}</span>
                      </span>
                      <span className={cn('text-xs font-bold tabular-nums', STATUS_TEXT_CLASS[slide.status])}>{index + 1}</span>
                    </button>
                  ))}
                </div>
              </div>
            </aside>
          </div>
          )}
        </div>
      </section>
    </div>
  )
}

function StitchHtmlModePanel({
  row,
  htmlBlock,
  canEdit,
  isSaving,
  onSave,
  presentation = false,
}: {
  row: NorthStarDisplayRow
  htmlBlock: StitchSlideHtmlBlock | null
  canEdit: boolean
  isSaving: boolean
  onSave: StitchHtmlSaveHandler
  presentation?: boolean
}) {
  const persistedMode = htmlBlock?.view_mode ?? 'fields'
  const htmlCode = htmlBlock?.html_code ?? ''
  const [draftMode, setDraftMode] = useState<StitchSlideHtmlViewMode>(persistedMode)
  const [draft, setDraft] = useState(htmlCode)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    setDraftMode(persistedMode)
    setDraft(htmlCode)
    setEditing(false)
  }, [htmlCode, persistedMode])

  async function chooseFields() {
    if (!canEdit || isSaving) return
    setDraftMode('fields')
    setEditing(false)
    if (persistedMode !== 'fields') {
      await onSave(row, 'fields', htmlCode)
    }
  }

  async function chooseHtml() {
    if (!canEdit || isSaving) return
    setDraftMode('html')
    if (!htmlCode.trim()) {
      setEditing(true)
      return
    }
    if (persistedMode !== 'html') {
      await onSave(row, 'html', htmlCode)
    }
  }

  async function saveHtml() {
    if (!canEdit || isSaving) return
    await onSave(row, 'html', draft)
    setEditing(false)
  }

  function cancelEdit() {
    setDraft(htmlCode)
    setDraftMode(persistedMode)
    setEditing(false)
  }

  const activeMode = editing ? draftMode : persistedMode
  const showEditor = activeMode === 'html' && (editing || !htmlCode.trim())
  const showFrame = persistedMode === 'html' && !editing && htmlCode.trim().length > 0

  return (
    <section className="rounded-lg border border-border bg-bg/40 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-text2">
          <Code2 size={13} />
          Optional HTML code
        </div>
        <div className="inline-flex overflow-hidden rounded-lg border border-border bg-surface">
          <button
            type="button"
            className={cn(
              'h-8 px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
              activeMode === 'fields' ? 'bg-accent text-white' : 'text-text2 hover:bg-surface2 hover:text-text1'
            )}
            onClick={chooseFields}
            disabled={!canEdit || isSaving}
          >
            Fields
          </button>
          <button
            type="button"
            className={cn(
              'h-8 border-l border-border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
              activeMode === 'html' ? 'bg-accent text-white' : 'text-text2 hover:bg-surface2 hover:text-text1'
            )}
            onClick={chooseHtml}
            disabled={!canEdit || isSaving}
          >
            HTML
          </button>
        </div>
      </div>

      {showEditor && (
        <div className="mt-3 space-y-2">
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-text2" htmlFor={`html-code-${stitchSlideHtmlKey(row)}`}>
            Optional HTML code
          </label>
          <textarea
            id={`html-code-${stitchSlideHtmlKey(row)}`}
            className={cn('input w-full resize-y py-2 font-mono text-xs leading-relaxed', presentation ? 'min-h-[360px]' : 'min-h-[220px]')}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            aria-label={`Optional HTML code for ${row.pillar}`}
            spellCheck={false}
          />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary h-8 px-3 text-xs" onClick={cancelEdit} disabled={isSaving}>
              <X size={13} />
              Cancel
            </button>
            <button type="button" className="btn-primary h-8 px-3 text-xs" onClick={saveHtml} disabled={isSaving}>
              <Check size={13} />
              Save HTML
            </button>
          </div>
        </div>
      )}

      {showFrame && (
        <div className="mt-3 space-y-2">
          <div className="flex justify-end">
            <button type="button" className="btn-secondary h-8 px-3 text-xs" onClick={() => setEditing(true)} disabled={!canEdit || isSaving}>
              <Edit3 size={13} />
              Edit HTML
            </button>
          </div>
          <StitchHtmlFrame row={row} htmlCode={htmlCode} presentation={presentation} />
        </div>
      )}
    </section>
  )
}

function StitchHtmlFrame({
  row,
  htmlCode,
  presentation,
}: {
  row: NorthStarDisplayRow
  htmlCode: string
  presentation: boolean
}) {
  return (
    <div className={cn('overflow-hidden rounded-lg border border-border bg-white', presentation ? 'h-[min(72vh,760px)]' : 'h-[460px]')}>
      <iframe
        title={`HTML view for ${row.pillar}`}
        className="h-full w-full bg-white"
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        srcDoc={htmlCode}
      />
    </div>
  )
}

function FinanceSlideGraph({ row }: { row: NorthStarDisplayRow }) {
  const chart = row.chart
  if (!chart) return null
  const hasChartPoints = chart.points.length > 0 || chart.payrollPies?.some(pie => pie.points.length > 0)
  if (!hasChartPoints) return null

  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface2 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-text2">Trend</div>
        {chart.benchmarkLabel && <div className="truncate text-xs font-semibold text-text2">{chart.benchmarkLabel}</div>}
      </div>
      {chart.kind === 'payroll' && (chart.payrollPies?.length || chart.comparisonPoints?.length) ? (
        <PayrollPieComparisonChart chart={chart} />
      ) : chart.kind === 'cash_runway' ? (
        <CashflowThresholdChart chart={chart} />
      ) : (
        <RangeColumnChart chart={chart} />
      )}
    </div>
  )
}

function RangeColumnChart({ chart }: { chart: NonNullable<NorthStarDisplayRow['chart']> }) {
  const domain = scaledChartDomain(chart.points.flatMap(point => [point.value, point.benchmark ?? point.value]))
  const chartHeight = 124
  const topPad = 8
  const bottomPad = 18
  const plotHeight = chartHeight - topPad - bottomPad

  function y(value: number): number {
    const span = Math.max(1, domain.max - domain.min)
    return topPad + (1 - (value - domain.min) / span) * plotHeight
  }

  return (
    <div className="rounded-lg border border-border bg-bg/45 px-3 py-3">
      <svg viewBox="0 0 320 156" className="h-40 w-full overflow-visible" role="img" aria-label={`${chart.kind} trend chart`}>
        <line x1="24" y1={y(domain.max)} x2="304" y2={y(domain.max)} className="stroke-border/70" strokeDasharray="2 4" />
        <line x1="24" y1={y(domain.min)} x2="304" y2={y(domain.min)} className="stroke-border/70" strokeDasharray="2 4" />
        <text x="0" y={y(domain.max) + 4} className="fill-text2 text-[9px]">{formatGraphValue(domain.max, chart.valueFormat)}</text>
        <text x="0" y={y(domain.min) + 4} className="fill-text2 text-[9px]">{formatGraphValue(domain.min, chart.valueFormat)}</text>
        {chart.points.map((point, index) => {
          const x = 46 + index * (240 / Math.max(1, chart.points.length - 1))
          const barTop = y(point.value)
          const barBottom = y(domain.min)
          const barHeight = Math.max(4, barBottom - barTop)
          return (
            <g key={`${chart.kind}-${point.label}`}>
              <rect
                x={x - 13}
                y={barBottom - barHeight}
                width="26"
                height={barHeight}
                rx="5"
                className={cn('stroke-accent/30', point.value < 0 ? 'fill-danger/70' : 'fill-accent/75')}
              >
                <title>{`${point.label}: ${formatGraphValue(point.value, chart.valueFormat)}`}</title>
              </rect>
              <text x={x} y="150" textAnchor="middle" className="fill-text2 text-[9px] font-semibold uppercase tracking-wide">{point.label}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function CashflowThresholdChart({ chart }: { chart: NonNullable<NorthStarDisplayRow['chart']> }) {
  const threshold = chart.threshold ?? 0
  const domain = scaledChartDomain([...chart.points.map(point => point.value), threshold])
  const chartHeight = 124
  const topPad = 8
  const bottomPad = 18
  const plotHeight = chartHeight - topPad - bottomPad

  function y(value: number): number {
    const span = Math.max(1, domain.max - domain.min)
    return topPad + (1 - (value - domain.min) / span) * plotHeight
  }

  const thresholdY = y(threshold)

  return (
    <div className="rounded-lg border border-border bg-bg/45 px-3 py-3">
      <svg viewBox="0 0 340 156" className="h-40 w-full overflow-visible" role="img" aria-label="Cashflow threshold chart">
        <line x1="30" y1={thresholdY} x2="320" y2={thresholdY} className="stroke-text2" strokeDasharray="6 5" />
        <text x="2" y={thresholdY - 4} className="fill-text2 text-[9px]">{formatGraphValue(threshold, chart.valueFormat)}</text>
        {chart.points.map((point, index) => {
          const spacing = 278 / Math.max(1, chart.points.length)
          const x = 42 + index * spacing
          const valueY = y(point.value)
          const barY = Math.min(valueY, thresholdY)
          const barHeight = Math.max(3, Math.abs(thresholdY - valueY))
          const isAbove = point.value >= threshold
          return (
            <g key={`${chart.kind}-${point.label}`}>
              <rect
                x={x}
                y={barY}
                width={Math.max(8, spacing * 0.55)}
                height={barHeight}
                rx="4"
                className={cn(isAbove ? 'fill-success/75 stroke-success/40' : 'fill-danger/75 stroke-danger/40')}
              >
                <title>{`${point.label}: ${formatGraphValue(point.value, chart.valueFormat)} (${isAbove ? 'above' : 'below'} floor)`}</title>
              </rect>
              <text x={x + Math.max(8, spacing * 0.55) / 2} y="150" textAnchor="middle" className="fill-text2 text-[8px] font-semibold uppercase tracking-wide">{point.label}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function PayrollPieComparisonChart({ chart }: { chart: NonNullable<NorthStarDisplayRow['chart']> }) {
  const points = chart.comparisonPoints ?? []
  const payrollPies = chart.payrollPies ?? []
  const labels = payrollPies.length
    ? payrollPies.flatMap(pie => pie.points.map(point => point.label))
    : points.map(point => point.label)
  const colorByLabel = buildPieColorMap(labels)

  if (payrollPies.length) {
    return (
      <div className="grid min-w-0 gap-3 rounded-lg border border-border bg-bg/45 p-3 sm:grid-cols-2 xl:grid-cols-4">
        {payrollPies.map(pie => (
          <PiePanel
            key={`${pie.periodMonth}-${pie.title}`}
            title={pie.title}
            points={pie.points}
            format={chart.valueFormat}
            colorByLabel={colorByLabel}
            salesTotal={pie.salesTotal}
            stats={<PayrollPieStats pie={pie} />}
          />
        ))}
        <PayrollPieLegend colorByLabel={colorByLabel} className="sm:col-span-2 xl:col-span-4" />
      </div>
    )
  }

  return (
    <div className="grid gap-3 rounded-lg border border-border bg-bg/45 p-3 sm:grid-cols-2">
      <PiePanel title="Last year" points={points.map(point => ({ label: point.label, value: point.previousValue }))} format={chart.valueFormat} colorByLabel={colorByLabel} />
      <PiePanel title="This year" points={points.map(point => ({ label: point.label, value: point.currentValue }))} format={chart.valueFormat} colorByLabel={colorByLabel} />
      <PayrollPieLegend colorByLabel={colorByLabel} className="sm:col-span-2" />
    </div>
  )
}

function PiePanel({
  title,
  points,
  format,
  colorByLabel,
  salesTotal,
  stats,
}: {
  title: string
  points: Array<{ label: string; value: number }>
  format: 'currency' | 'percent' | 'number'
  colorByLabel: Map<string, string>
  salesTotal?: number | null
  stats?: React.ReactNode
}) {
  const slices = pieSlices(points)
  return (
    <div className="grid min-h-[232px] min-w-0 grid-rows-[2.5rem_7rem_auto] overflow-hidden">
      <div className="flex items-start justify-center px-1 text-center text-[10px] font-semibold uppercase tracking-wider text-text2">{title}</div>
      <div className="flex h-28 items-center justify-center">
        <svg viewBox="0 0 120 120" className="h-28 w-28" role="img" aria-label={`${title} payroll mix`}>
          {slices.length === 0 ? (
            <circle cx="60" cy="60" r="42" className="fill-surface stroke-border" />
          ) : (
            slices.map(slice => (
              <path key={`${title}-${slice.label}`} d={slice.path} fill={colorByLabel.get(slice.label) ?? PIE_COLORS[0]} className="stroke-bg stroke-[1.5]">
                <title>{pieSliceTitle(slice, format, salesTotal)}</title>
              </path>
            ))
          )}
        </svg>
      </div>
      {stats}
    </div>
  )
}

function PayrollPieStats({ pie }: { pie: NonNullable<NonNullable<NorthStarDisplayRow['chart']>['payrollPies']>[number] }) {
  return (
    <dl className="mt-2 min-w-0 space-y-1 text-[10px] font-semibold text-text2">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <dt className="truncate">Payroll</dt>
        <dd className="shrink-0 tabular-nums text-text1">{fmtCurrency(pie.payrollTotal)}</dd>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <dt className="truncate">Sales</dt>
        <dd className="shrink-0 tabular-nums text-text1">{pie.salesTotal !== null ? fmtCurrency(pie.salesTotal) : 'n/a'}</dd>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <dt className="truncate">Payroll / sales</dt>
        <dd className="shrink-0 tabular-nums text-text1">{formatNullablePercent(pie.payrollToSalesPct)}</dd>
      </div>
    </dl>
  )
}

function PayrollPieLegend({ colorByLabel, className }: { colorByLabel: Map<string, string>; className?: string }) {
  return (
    <div className={className}>
      <div className="grid max-h-24 grid-cols-2 gap-x-3 gap-y-1 overflow-y-auto pr-1 sm:grid-cols-3" aria-label="Payroll pie color legend">
        {Array.from(colorByLabel.entries()).map(([label, color]) => (
          <div key={label} className="flex min-w-0 items-center gap-2 text-[10px] font-semibold text-text2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-bg" style={{ backgroundColor: color }} aria-hidden="true" />
            <span className="truncate" title={label}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function buildPieColorMap(labels: string[]): Map<string, string> {
  const colorByLabel = new Map<string, string>()
  labels.forEach(label => {
    if (!colorByLabel.has(label)) {
      colorByLabel.set(label, PIE_COLORS[colorByLabel.size % PIE_COLORS.length])
    }
  })
  return colorByLabel
}

function pieSlices(points: Array<{ label: string; value: number }>) {
  const sanitized = points
    .map(point => ({ ...point, value: Math.max(0, Number(point.value) || 0) }))
    .filter(point => point.value > 0)
  const total = sanitized.reduce((sum, point) => sum + point.value, 0)
  if (total <= 0) return []

  let startAngle = -90
  return sanitized.map(point => {
    const angle = (point.value / total) * 360
    const endAngle = startAngle + angle
    const slice = {
      label: point.label,
      value: point.value,
      percent: (point.value / total) * 100,
      path: describePieSlice(60, 60, 42, startAngle, endAngle),
    }
    startAngle = endAngle
    return slice
  })
}

function describePieSlice(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): string {
  if (endAngle - startAngle >= 359.99) {
    return `M ${cx} ${cy - radius} A ${radius} ${radius} 0 1 1 ${cx - 0.01} ${cy - radius} Z`
  }
  const start = polarToCartesian(cx, cy, radius, endAngle)
  const end = polarToCartesian(cx, cy, radius, startAngle)
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1
  return [`M ${cx} ${cy}`, `L ${start.x} ${start.y}`, `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`, 'Z'].join(' ')
}

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  }
}

const PIE_COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#4b5563', '#be123c']

function formatGraphValue(value: number, format: 'currency' | 'percent' | 'number'): string {
  if (format === 'currency') return fmtCurrency(value)
  if (format === 'percent') return `${(value * 100).toFixed(1)}%`
  return fmtNumber(value)
}

function formatNullablePercent(value: number | null): string {
  return value === null || !Number.isFinite(value) ? 'n/a' : `${(value * 100).toFixed(1)}%`
}

function pieSliceTitle(
  slice: { label: string; value: number; percent: number },
  format: 'currency' | 'percent' | 'number',
  salesTotal?: number | null
): string {
  const salesShare = salesTotal && salesTotal > 0 ? `; ${((slice.value / salesTotal) * 100).toFixed(1)}% of total sales` : ''
  return `${slice.label}: ${formatGraphValue(slice.value, format)} (${slice.percent.toFixed(1)}% of payroll${salesShare})`
}

function actualMetricLabel(row: NorthStarDisplayRow): string {
  return row.north_star === 'PnL / 9% NOI' || row.north_star === 'Payroll by department' ? 'Last month' : 'Actual'
}

function commentBoxLabel(row: NorthStarDisplayRow): string {
  return row.source === 'monthly_star' ? 'Comment' : 'Last week'
}

function StitchMetric({
  label,
  value,
  sub,
  icon,
  tone = 'default',
}: {
  label: string
  value: string
  sub: string
  icon: React.ReactNode
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info'
}) {
  const toneClass = {
    default: 'text-text1',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
    info: 'text-accent',
  }[tone]
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text2">{label}</span>
        <span className={cn('text-text2', toneClass)}>{icon}</span>
      </div>
      <div className={cn('text-xl font-bold tabular-nums', toneClass)}>{value}</div>
      <div className="mt-1 text-xs text-text2">{sub}</div>
    </div>
  )
}

function ValueTile({
  label,
  row,
  field,
  value,
  canEdit,
  isSaving,
  onSave,
  multiline = false,
  expandToContent = false,
}: {
  label: string
  row: NorthStarDisplayRow
  field: NorthStarEditableField
  value: string
  canEdit: boolean
  isSaving: boolean
  onSave: (row: NorthStarDisplayRow, field: NorthStarEditableField, value: string | NorthStarStatus) => Promise<void>
  multiline?: boolean
  expandToContent?: boolean
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-surface2 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-text2">{label}</div>
      <EditableText
        row={row}
        field={field}
        value={value}
        canEdit={canEdit}
        isSaving={isSaving}
        onSave={onSave}
        multiline={multiline || expandToContent}
        expandToContent={expandToContent}
        displayClassName="mt-1 text-lg font-bold tabular-nums text-text1"
        placeholder="Not set"
      />
    </div>
  )
}

function NarrativeBox({
  label,
  row,
  field,
  value,
  canEdit,
  isSaving,
  onSave,
  tone,
  large = false,
}: {
  label: string
  row: NorthStarDisplayRow
  field: NorthStarEditableField
  value: string
  canEdit: boolean
  isSaving: boolean
  onSave: (row: NorthStarDisplayRow, field: NorthStarEditableField, value: string | NorthStarStatus) => Promise<void>
  tone: 'accent' | 'danger' | 'neutral'
  large?: boolean
}) {
  const toneClass = {
    accent: 'border-accent/30 bg-accent/10',
    danger: 'border-danger/30 bg-danger/10',
    neutral: 'border-border bg-surface2',
  }[tone]
  const labelClass = {
    accent: 'text-accent',
    danger: 'text-danger',
    neutral: 'text-text2',
  }[tone]

  return (
    <div className={cn('rounded-xl border p-4', toneClass, large ? 'min-h-[190px]' : 'min-h-[120px]')}>
      <div className={cn('mb-3 text-[10px] font-bold uppercase tracking-wider', labelClass)}>{label}</div>
      <EditableText
        row={row}
        field={field}
        value={value}
        canEdit={canEdit}
        isSaving={isSaving}
        onSave={onSave}
        multiline
        displayClassName={cn('whitespace-pre-wrap break-words leading-relaxed text-text1', large ? 'text-lg font-semibold' : 'text-sm')}
        placeholder="Not set"
      />
    </div>
  )
}

function StatusSelect({
  row,
  canEdit,
  isSaving,
  onSave,
}: {
  row: NorthStarDisplayRow
  canEdit: boolean
  isSaving: boolean
  onSave: (row: NorthStarDisplayRow, field: NorthStarEditableField, value: string | NorthStarStatus) => Promise<void>
}) {
  if (!canEdit) return <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABELS[row.status]}</Badge>

  return (
    <select
      className="select w-full min-w-[176px] max-w-full shrink-0 py-1.5 text-xs"
      value={row.status}
      onChange={event => onSave(row, 'status', event.target.value as NorthStarStatus)}
      disabled={isSaving}
      aria-label={`Status for ${row.pillar}`}
    >
      <option value="on_plan">{STATUS_LABELS.on_plan}</option>
      <option value="at_risk">{STATUS_LABELS.at_risk}</option>
      <option value="off_plan">{STATUS_LABELS.off_plan}</option>
    </select>
  )
}

function EditableText({
  row,
  field,
  value,
  canEdit,
  isSaving,
  onSave,
  multiline = false,
  expandToContent = false,
  displayClassName,
  placeholder,
}: {
  row: NorthStarDisplayRow
  field: NorthStarEditableField
  value: string
  canEdit: boolean
  isSaving: boolean
  onSave: (row: NorthStarDisplayRow, field: NorthStarEditableField, value: string | NorthStarStatus) => Promise<void>
  multiline?: boolean
  expandToContent?: boolean
  displayClassName?: string
  placeholder: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const isCompact = COMPACT_FIELDS.has(field)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const shouldUseMultiline = multiline || expandToContent

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    if (!editing || !expandToContent || !shouldUseMultiline || !textareaRef.current) return
    const textarea = textareaRef.current
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [draft, editing, expandToContent, shouldUseMultiline])

  async function save() {
    await onSave(row, field, draft)
    setEditing(false)
  }

  function cancel() {
    setDraft(value)
    setEditing(false)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      cancel()
      return
    }
    if (!shouldUseMultiline && event.key === 'Enter') {
      event.preventDefault()
      save()
      return
    }
    if (shouldUseMultiline && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      save()
    }
  }

  if (!canEdit) {
    return <ReadOnlyText value={value} placeholder={placeholder} className={displayClassName} compact={isCompact && !expandToContent} />
  }

  if (editing) {
    return (
      <div className="space-y-2">
        {shouldUseMultiline ? (
          <textarea
            ref={textareaRef}
            className={cn('input min-h-[92px] w-full resize-y py-2 text-sm leading-relaxed', expandToContent && 'overflow-hidden')}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            placeholder={placeholder}
          />
        ) : (
          <input
            className="input w-full py-1.5 text-sm"
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            placeholder={placeholder}
          />
        )}
        <div className="flex justify-end gap-1">
          <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-success hover:bg-success/10 disabled:opacity-50" onClick={save} disabled={isSaving} title="Save">
            <Check size={14} />
          </button>
          <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text2 hover:bg-surface2" onClick={cancel} title="Cancel">
            <X size={14} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      className="group/edit flex min-h-[28px] w-full min-w-0 items-start justify-between gap-2 overflow-hidden rounded-lg text-left transition hover:bg-surface2/70"
      onClick={() => setEditing(true)}
      title="Edit"
    >
      <ReadOnlyText value={value} placeholder={placeholder} className={displayClassName} compact={isCompact && !expandToContent} />
      <span className="mt-1 shrink-0 text-text2 opacity-0 transition group-hover/edit:opacity-100">
        <Edit3 size={12} />
      </span>
    </button>
  )
}

function ReadOnlyText({ value, placeholder, className, compact }: { value: string; placeholder: string; className?: string; compact?: boolean }) {
  const textClass = compact
    ? 'block min-w-0 max-w-full truncate whitespace-nowrap leading-snug'
    : 'block whitespace-pre-wrap break-words leading-relaxed'

  if (!value.trim()) return <span className={cn('text-text2/70', textClass, className)}>{placeholder}</span>
  return <span className={cn(textClass, className)}>{value}</span>
}

function countStatuses(rows: NorthStarDisplayRow[]): Record<NorthStarStatus, number> {
  return rows.reduce<Record<NorthStarStatus, number>>(
    (counts, row) => {
      counts[row.status] += 1
      return counts
    },
    { on_plan: 0, at_risk: 0, off_plan: 0 }
  )
}

function applyGeneratedRowOverrides(row: NorthStarDisplayRow, overrides: StitchAutoRowOverrideMap): NorthStarDisplayRow {
  if (row.source !== 'monthly_star' && row.source !== 'leadership_tool') return row
  const rowOverrides = overrides[stitchAutoRowOverrideKey(row)]
  if (!rowOverrides) return row
  return { ...row, ...rowOverrides } as NorthStarDisplayRow
}

function parseMetricNumber(value: string): number {
  return Number(value.replace(/[$,\s]/g, ''))
}

function metricOverrideNumber(value: string | NorthStarStatus | undefined): number | undefined {
  if (typeof value !== 'string') return undefined
  const parsed = parseMetricNumber(value)
  return Number.isFinite(parsed) ? parsed : undefined
}
