import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Stitch North Star page contract', () => {
  const appSource = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8')
  const sidebarSource = readFileSync(resolve(__dirname, '../components/layout/Sidebar.tsx'), 'utf8')
  const pageSource = readFileSync(resolve(__dirname, '../pages/csuite/StitchNorthStar.tsx'), 'utf8')
  const htmlHookSource = readFileSync(resolve(__dirname, '../hooks/useStitchSlideHtmlBlocks.ts'), 'utf8')

  it('registers Stitch North Star as a C-Suite route and sidebar item', () => {
    expect(appSource).toContain("const StitchNorthStar = lazy(() => import('@/pages/csuite/StitchNorthStar'))")
    expect(appSource).toContain('path="/executive/stitch-north-star"')
    expect(appSource).toContain("<RoleGuard allow={['admin', 'csuite']}><StitchNorthStar /></RoleGuard>")

    expect(sidebarSource).toContain("to: '/executive/stitch-north-star'")
    expect(sidebarSource).toContain("label: 'Stitch North Star'")
  })

  it('reuses current North Star data and update paths instead of adding a new table', () => {
    expect(pageSource).toContain('useNorthStarRows')
    expect(pageSource).toContain('useMonthlyStar')
    expect(pageSource).toContain('useMonthlyStarSales')
    expect(pageSource).toContain('useUpdateNorthStarRow')
    expect(pageSource).toContain('useUpdateNorthStarProgress')
    expect(pageSource).not.toContain('stitch_north_star')
  })

  it('renders pillar tabs and an editable owner presentation deck', () => {
    expect(pageSource).toContain('buildStitchPillarTabs')
    expect(pageSource).toContain('filterRowsByPillar')
    expect(pageSource).toContain('buildOwnerSlideDeck')
    expect(pageSource).toContain('OwnerDeckModal')
    expect(pageSource).toContain('FinanceSlideGraph')
    expect(pageSource).toContain('PayrollPieComparisonChart')
    expect(pageSource).toContain('PayrollPieLegend')
    expect(pageSource).toContain('payrollPies')
    expect(pageSource).toContain('PayrollPieStats')
    expect(pageSource).toContain('Payroll / sales')
    expect(pageSource).toContain('salesTotal={pie.salesTotal}')
    expect(pageSource).toContain('of total sales')
    expect(pageSource).toContain('chart.payrollPies?.some')
    expect(pageSource).toContain('buildPieColorMap')
    expect(pageSource).toContain('aria-label="Payroll pie color legend"')
    expect(pageSource).toContain('CashflowThresholdChart')
    expect(pageSource).toContain('RangeColumnChart')
    expect(pageSource).toContain("This week's move")
    expect(pageSource).toContain('field="constraint_now"')
    expect(pageSource).toContain('field="weekly_move"')
    expect(pageSource).toContain('label="Plan"')
  })

  it('merges live Monthly Star finance metrics into the same table and deck rows', () => {
    expect(pageSource).toContain('buildStitchFinanceMetricRow')
    expect(pageSource).toContain('buildLeadershipFinanceRows')
    expect(pageSource).toContain('mergeStitchFinanceRows')
    expect(pageSource).toContain('isStitchAutoFinanceField')
    expect(pageSource).toContain('canEditField')
  })

  it('keeps compact labels and controls from collapsing into vertical text', () => {
    expect(pageSource).toContain('whitespace-nowrap')
    expect(pageSource).toContain('truncate')
    expect(pageSource).toContain('shrink-0')
    expect(pageSource).toContain('min-w-[176px]')
  })

  it('keeps presentation mode full-screen and presenter navigable without closing the deck', () => {
    expect(pageSource).toContain('const selectedDeckIndex = selectedDeck ? ownerDecks.findIndex')
    expect(pageSource).toContain('function movePresenter(direction: -1 | 1)')
    expect(pageSource).toContain('presenterIndex={selectedDeckIndex}')
    expect(pageSource).toContain('presenterCount={ownerDecks.length}')
    expect(pageSource).toContain('onPresenterChange={movePresenter}')
    expect(pageSource).toContain('aria-label="Previous presenter"')
    expect(pageSource).toContain('aria-label="Next presenter"')
    expect(pageSource).toContain('fixed inset-0 z-50 flex bg-bg')
    expect(pageSource).toContain('h-screen max-h-screen w-screen max-w-none')
    expect(pageSource).toContain('min-h-0 flex-1 overflow-y-auto overflow-x-hidden')
    expect(pageSource).toContain('2xl:grid-cols-[minmax(0,1fr)_400px]')
    expect(pageSource).not.toContain('lg:grid-cols-[minmax(0,1fr)_360px]')
    expect(pageSource).toContain('className="min-w-0 space-y-7"')
    expect(pageSource).toContain('className="min-w-0 space-y-5"')
    expect(pageSource).toContain('grid min-w-0 gap-3 rounded-lg border border-border bg-bg/45 p-3 sm:grid-cols-2 xl:grid-cols-4')
    expect(pageSource).toContain('group/edit flex min-h-[28px] w-full min-w-0 items-start justify-between gap-2 overflow-hidden')
  })

  it('lets presentation Metrics actual and forecast values expand to fit long text', () => {
    expect(pageSource).toContain('function ValueTile({')
    expect(pageSource).toContain('expandToContent = false')
    expect(pageSource).toContain('compact={isCompact && !expandToContent}')
    expect(pageSource).toContain('multiline={multiline || expandToContent}')
    expect(pageSource).toContain('label={actualMetricLabel(row)} row={row} field="actual_mtd"')
    expect(pageSource).toContain('field="actual_mtd" value={row.actual_mtd ?? \'\'} canEdit={canEditField(row, \'actual_mtd\')} isSaving={isSaving} onSave={onSave} expandToContent')
    expect(pageSource).toContain('field="forecast" value={row.forecast ?? \'\'} canEdit={canEditField(row, \'forecast\')} isSaving={isSaving} onSave={onSave} expandToContent')
  })

  it('persists auto-populated slide overrides until source data changes', () => {
    expect(pageSource).toContain('generatedRowOverrides')
    expect(pageSource).toContain('setGeneratedRowOverrides')
    expect(pageSource).toContain('monthlyStarOverrideSourceVersion')
    expect(pageSource).toContain('leadershipToolOverrideSourceVersion')
    expect(pageSource).toContain('readStitchAutoRowOverrides')
    expect(pageSource).toContain('writeStitchAutoRowOverride')
    expect(pageSource).toContain('stitchAutoRowOverrideKey')
    expect(pageSource).toContain('label={commentBoxLabel(row)}')
    expect(pageSource).toContain("return row.source === 'monthly_star' ? 'Comment' : 'Last week'")
    expect(pageSource).toContain('useLeadershipSnapshot')
    expect(pageSource).not.toContain('useUpdateMonthlyStar')
  })

  it('renders per-card Fields/HTML view modes with raw sandboxed iframe srcdoc', () => {
    expect(pageSource).toContain('useStitchSlideHtmlBlocks')
    expect(pageSource).toContain('StitchHtmlModePanel')
    expect(pageSource).toContain('Optional HTML code')
    expect(pageSource).toContain('Fields')
    expect(pageSource).toContain('HTML')
    expect(pageSource).toContain('sandbox="allow-scripts"')
    expect(pageSource).toContain('srcDoc={htmlCode}')
    expect(pageSource).toContain('canEditHtml={canEditProgress}')
    expect(pageSource).not.toContain('DOMParser')
    expect(pageSource).not.toContain('dangerouslySetInnerHTML')
  })

  it('persists Stitch HTML blocks through a month-scoped Supabase hook', () => {
    expect(htmlHookSource).toContain('useStitchSlideHtmlBlocks')
    expect(htmlHookSource).toContain('useUpsertStitchSlideHtmlBlock')
    expect(htmlHookSource).toContain("['stitch_slide_html_blocks', periodMonth]")
    expect(htmlHookSource).toContain("from('stitch_slide_html_blocks')")
    expect(htmlHookSource).toContain("onConflict: 'period_month,slide_key'")
    expect(htmlHookSource).toContain("invalidateQueries({ queryKey: ['stitch_slide_html_blocks', payload.period_month] })")
    expect(htmlHookSource).toContain("view_mode")
    expect(htmlHookSource).toContain("html_code")
  })
})
