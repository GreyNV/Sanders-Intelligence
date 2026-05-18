import { useState, useEffect, FormEvent, useMemo } from 'react'
import Modal from '@/components/ui/Modal'
import { useCreateTask, useUpdateTask } from '@/hooks/useTasks'
import { useUsers } from '@/hooks/useUsers'
import { useAuth } from '@/contexts/AuthContext'
import { Task, TaskPriority, InventoryRecord } from '@/types'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { fmtNumber, fmtCurrency } from '@/lib/utils'
import { ArrowDown, ArrowUp, ChevronsUpDown, Package, Search, X } from 'lucide-react'
import {
  buildVendorTaskDescription,
  dedupeInventoryRecords,
  filterSkuSelectorRows,
  SKU_SELECTOR_STATUS_OPTIONS,
  sortSkuSelectorRows,
  type SkuSelectorSortField,
  type SkuSelectorSortState,
} from './TaskModal.helpers'

interface TaskModalProps {
  open: boolean
  onClose: () => void
  task?: Task                           // edit mode when provided
  prefillSku?: string                   // single-SKU mode (from row-level task button)
  prefillTitle?: string
  prefillVendor?: string                // vendor-order mode
  prefillVendorSkus?: InventoryRecord[] // pre-loaded SKUs for that vendor
  atRiskByVendor?: Record<string, InventoryRecord[]> // all at-risk grouped by vendor
  availableSkus?: InventoryRecord[]     // searchable pool for adding SKUs to vendor orders
}

type Mode = 'single' | 'vendor'

/** Parse "Vendor: XXX" from the first line of a description */
function parseVendorLine(desc: string | null | undefined): string {
  if (!desc) return ''
  const m = desc.match(/^Vendor:\s*(.+)/m)
  return m ? m[1].trim() : ''
}

/** Replace or prepend the "Vendor: XXX" first line in a description */
function replaceVendorLine(desc: string, newVendor: string): string {
  if (/^Vendor:\s*.+/m.test(desc)) {
    return desc.replace(/^Vendor:\s*.+/m, `Vendor: ${newVendor}`)
  }
  return `Vendor: ${newVendor}\n${desc}`
}

function SortIcon({ field, sort }: { field: SkuSelectorSortField; sort: SkuSelectorSortState }) {
  if (sort.field !== field) return <ChevronsUpDown size={11} className="text-text2/50 ml-0.5" />
  return sort.dir === 'asc'
    ? <ArrowUp size={11} className="text-accent ml-0.5" />
    : <ArrowDown size={11} className="text-accent ml-0.5" />
}

function SortableTh({
  field, label, sort, onSort, className = '',
}: { field: SkuSelectorSortField; label: string; sort: SkuSelectorSortState; onSort: (f: SkuSelectorSortField) => void; className?: string }) {
  return (
    <th
      className={`cursor-pointer select-none hover:text-text1 transition-colors ${sort.field === field ? 'text-accent' : ''} ${className}`}
      onClick={() => onSort(field)}
    >
      <span className="flex items-center gap-0.5 whitespace-nowrap">
        {label}
        <SortIcon field={field} sort={sort} />
      </span>
    </th>
  )
}

export default function TaskModal({
  open, onClose, task,
  prefillSku = '', prefillTitle = '',
  prefillVendor, prefillVendorSkus = [],
  atRiskByVendor = {}, availableSkus = [],
}: TaskModalProps) {
  const { profile }           = useAuth()
  const { data: users = [] }  = useUsers()
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()

  const isEdit = !!task

  // Vendor context exists in create mode when at-risk data or prefill is present
  const hasVendorContext = !isEdit && (!!prefillVendor || Object.keys(atRiskByVendor).length > 0)

  const [mode, setMode] = useState<Mode>(
    (!isEdit && (prefillVendor || prefillVendorSkus.length > 0)) ? 'vendor' : 'single'
  )

  // Shared fields
  const [title, setTitle]           = useState('')
  const [description, setDesc]      = useState('')
  const [priority, setPriority]     = useState<TaskPriority>('medium')
  const [dueDate, setDueDate]       = useState('')
  const [assignedTo, setAssigned]   = useState('')
  const [department, setDepartment] = useState('')
  const [error, setError]           = useState<string | null>(null)
  const [skuSelectorOpen, setSkuSelectorOpen] = useState(false)
  const [skuSearch, setSkuSearch] = useState('')
  const [skuVendorFilter, setSkuVendorFilter] = useState('')
  const [skuStatusFilter, setSkuStatusFilter] = useState('')
  const [skuCategoryFilter, setSkuCategoryFilter] = useState('')
  const [skuSort, setSkuSort] = useState<SkuSelectorSortState>({ field: 'recommended_order_value', dir: 'desc' })
  const [selectedSkuCodes, setSelectedSkuCodes] = useState<Set<string>>(new Set())

  // Single-SKU mode
  const [skuCode, setSkuCode] = useState('')

  // Create/vendor mode — vendor selector
  const vendorList = useMemo(() => Object.keys(atRiskByVendor).sort(), [atRiskByVendor])
  const [selectedVendor, setSelectedVendor] = useState(prefillVendor ?? '')

  // Edit mode — vendor line exposed as separate field
  const [editVendor, setEditVendor] = useState('')

  const defaultVendorSkus: InventoryRecord[] = useMemo(() => {
    if (prefillVendorSkus.length > 0 && selectedVendor === (prefillVendor ?? selectedVendor)) {
      return prefillVendorSkus
    }
    return atRiskByVendor[selectedVendor] ?? []
  }, [selectedVendor, atRiskByVendor, prefillVendorSkus, prefillVendor])

  const selectableSkus = useMemo(
    () => dedupeInventoryRecords([
      ...prefillVendorSkus,
      ...Object.values(atRiskByVendor).flat(),
      ...availableSkus,
    ]),
    [prefillVendorSkus, atRiskByVendor, availableSkus]
  )

  const selectableSkuMap = useMemo(
    () => new Map(selectableSkus.map(r => [r.product_code, r])),
    [selectableSkus]
  )

  const skuVendorOptions = useMemo(
    () => Array.from(new Set(selectableSkus.map(r => r.supplier_description).filter(Boolean))).sort(),
    [selectableSkus]
  )

  const skuCategoryOptions = useMemo(
    () => Array.from(new Set(selectableSkus.map(r => r.category_name).filter(Boolean))).sort(),
    [selectableSkus]
  )

  const vendorSkus: InventoryRecord[] = useMemo(() => {
    const selected = Array.from(selectedSkuCodes)
      .map(code => selectableSkuMap.get(code))
      .filter(Boolean) as InventoryRecord[]

    return selected.sort((a, b) => {
      const vendorCmp = a.supplier_description.localeCompare(b.supplier_description)
      if (vendorCmp !== 0) return vendorCmp
      return a.product_code.localeCompare(b.product_code)
    })
  }, [selectedSkuCodes, selectableSkuMap])

  const selectorRows = useMemo(() => {
    const filteredRows = filterSkuSelectorRows(selectableSkus, skuSearch, {
      vendor: skuVendorFilter,
      status: skuStatusFilter,
      category: skuCategoryFilter,
    })

    return sortSkuSelectorRows(filteredRows, skuSort, selectedSkuCodes).slice(0, 200)
  }, [selectableSkus, skuSearch, skuVendorFilter, skuStatusFilter, skuCategoryFilter, skuSort, selectedSkuCodes])

  // Distinct departments from all users for dropdown
  const departments = useMemo(
    () => Array.from(new Set(users.map(u => u.department).filter(Boolean))).sort() as string[],
    [users]
  )

  // ── Re-initialise when modal opens ───────────────────────────
  useEffect(() => {
    if (!open) return

    if (task) {
      setMode('single')
      setTitle(task.title)
      setDesc(task.description ?? '')
      setPriority(task.priority)
      setDueDate(task.due_date ?? '')
      setAssigned(task.assigned_to ?? '')
      setSkuCode(task.sku_code ?? '')
      setDepartment(task.department ?? profile?.department ?? '')
      setEditVendor(parseVendorLine(task.description))
    } else {
      const isVendorMode = !!prefillVendor || prefillVendorSkus.length > 0
      setMode(isVendorMode ? 'vendor' : 'single')
      setSelectedVendor(prefillVendor ?? '')
      setTitle(prefillTitle)
      setDesc('')
      setPriority('medium')
      setDueDate('')
      setAssigned('')
      setSkuCode(prefillSku)
      setDepartment(profile?.department ?? 'purchasing')
      setEditVendor('')
      setSelectedSkuCodes(new Set((prefillVendorSkus.length > 0 ? prefillVendorSkus : atRiskByVendor[prefillVendor ?? ''] ?? []).map(r => r.product_code)))
      setSkuSearch('')
      setSkuVendorFilter('')
      setSkuStatusFilter('')
      setSkuCategoryFilter('')
      setSkuSort({ field: 'recommended_order_value', dir: 'desc' })
      setSkuSelectorOpen(false)
    }
    setError(null)
  }, [open, task?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill title when vendor changes (create / vendor mode)
  useEffect(() => {
    if (mode !== 'vendor' || isEdit) return
    setTitle(selectedVendor ? `Order: ${selectedVendor}` : '')
    setSelectedSkuCodes(new Set(defaultVendorSkus.map(r => r.product_code)))
  }, [selectedVendor, mode, isEdit, defaultVendorSkus])

  // Sync editVendor field → description first line (edit mode)
  useEffect(() => {
    if (!isEdit || !open) return
    if (editVendor.trim()) {
      setDesc(prev => replaceVendorLine(prev, editVendor.trim()))
    }
  }, [editVendor]) // eslint-disable-line react-hooks/exhaustive-deps

  // Build auto-generated vendor task description (create mode)
  const vendorDescription = useMemo(() =>
    mode === 'vendor' ? buildVendorTaskDescription(selectedVendor, vendorSkus) : ''
  , [mode, selectedVendor, vendorSkus])

  // Users eligible to be assigned — same dept as task, or all if admin
  const deptUsers = users.filter(u =>
    u.is_active && (u.department === (department || profile?.department) || profile?.role === 'admin')
  )

  // Does the task being edited have a vendor prefix?
  const editHasVendor = isEdit && !!parseVendorLine(task?.description)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required'); return }
    if (mode === 'vendor' && !selectedVendor) { setError('Please select a vendor'); return }
    if (mode === 'vendor' && vendorSkus.length === 0) { setError('Select at least one SKU for this vendor order'); return }
    setError(null)

    const finalDescription = mode === 'vendor'
      ? vendorDescription + (description ? `\n\nNotes:\n${description}` : '')
      : description

    const finalSkuCode = mode === 'vendor'
      ? (vendorSkus[0]?.supplier_code ?? '')
      : skuCode

    const values = {
      title:       title.trim(),
      description: finalDescription,
      priority,
      due_date:    dueDate,
      assigned_to: assignedTo,
      sku_code:    finalSkuCode,
      department:  department || profile?.department || 'purchasing',
    }

    try {
      if (isEdit) {
        await updateTask.mutateAsync({ id: task!.id, values })
      } else {
        await createTask.mutateAsync(values)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : isEdit ? 'Failed to update task' : 'Failed to create task')
    }
  }

  function toggleSku(productCode: string) {
    setSelectedSkuCodes(prev => {
      const next = new Set(prev)
      if (next.has(productCode)) next.delete(productCode)
      else next.add(productCode)
      return next
    })
  }

  function removeSku(productCode: string) {
    setSelectedSkuCodes(prev => {
      const next = new Set(prev)
      next.delete(productCode)
      return next
    })
  }

  function toggleSkuSort(field: SkuSelectorSortField) {
    setSkuSort(s => s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' })
  }

  function clearSkuFilters() {
    setSkuVendorFilter('')
    setSkuStatusFilter('')
    setSkuCategoryFilter('')
  }

  const isPending = createTask.isPending || updateTask.isPending

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Task' : 'New Task'}>
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Mode switcher — create mode, vendor context available */}
        {!isEdit && hasVendorContext && (
          <div className="flex rounded-lg border border-border overflow-hidden text-[13px]">
            <button type="button" onClick={() => setMode('single')}
              className={`flex-1 py-1.5 transition-colors ${mode === 'single' ? 'bg-accent/15 text-accent font-medium' : 'text-text2 hover:bg-surface2'}`}>
              Single SKU
            </button>
            <button type="button" onClick={() => setMode('vendor')}
              className={`flex-1 py-1.5 transition-colors ${mode === 'vendor' ? 'bg-accent/15 text-accent font-medium' : 'text-text2 hover:bg-surface2'}`}>
              Vendor Order
            </button>
          </div>
        )}

        {/* Vendor selector — create / vendor mode */}
        {mode === 'vendor' && !isEdit && (
          <div>
            <label className="block text-xs font-medium text-text2 mb-1.5">Vendor *</label>
            {vendorList.length > 0 ? (
              <select className="select w-full" value={selectedVendor}
                onChange={e => setSelectedVendor(e.target.value)} required>
                <option value="">Select a vendor…</option>
                {vendorList.map(v => (
                  <option key={v} value={v}>{v} ({atRiskByVendor[v]?.length ?? 0} at-risk SKUs)</option>
                ))}
              </select>
            ) : (
              <div className="input w-full text-text2 text-sm">{selectedVendor || '—'}</div>
            )}

            <div className="mt-2 rounded-lg border border-border bg-surface2 p-2">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="text-[10px] font-semibold text-text2 uppercase tracking-wider flex items-center gap-1">
                  <Package size={10} /> {vendorSkus.length} SKUs selected
                </div>
                <button
                  type="button"
                  onClick={() => setSkuSelectorOpen(true)}
                  className="btn-secondary text-[11px] py-1 px-2"
                >
                  Edit SKUs
                </button>
              </div>
              {vendorSkus.length === 0 ? (
                <div className="text-[11px] text-danger py-2">No SKUs selected. Add at least one SKU before creating the task.</div>
              ) : (
                <div className="max-h-32 overflow-y-auto">
                  {vendorSkus.map(r => (
                    <div key={r.id} className="text-[11px] text-text2 py-0.5 flex items-center gap-2 font-mono">
                      <span className="text-accent shrink-0">{r.product_code}</span>
                      <span className="truncate text-text1">{r.description}</span>
                      <span className="shrink-0 text-warning">{r.days_on_hand}d OH</span>
                      <button
                        type="button"
                        onClick={() => removeSku(r.product_code)}
                        className="ml-auto text-text2 hover:text-danger"
                        title="Remove SKU from this order"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Vendor field — edit mode, only for tasks that have a vendor prefix */}
        {editHasVendor && (
          <div>
            <label className="block text-xs font-medium text-text2 mb-1.5">Vendor</label>
            <input
              className="input w-full"
              value={editVendor}
              onChange={e => setEditVendor(e.target.value)}
              placeholder="Vendor name…"
            />
            <p className="text-[10px] text-text2 mt-1">Updates the vendor reference in the description.</p>
          </div>
        )}

        {/* Title */}
        <div>
          <label className="block text-xs font-medium text-text2 mb-1.5">Title *</label>
          <input
            className="input w-full"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={mode === 'vendor' && !isEdit ? 'Auto-filled from vendor name…' : 'Task title…'}
            required
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-text2 mb-1.5">
            {mode === 'vendor' && !isEdit ? 'Additional Notes' : 'Description'}
          </label>
          {mode === 'vendor' && !isEdit && vendorSkus.length > 0 && (
            <p className="text-[11px] text-text2 mb-1.5">SKU list will be auto-included in task details.</p>
          )}
          <textarea
            className="input w-full resize-none"
            rows={editHasVendor ? 5 : 3}
            value={description}
            onChange={e => setDesc(e.target.value)}
            placeholder={mode === 'vendor' && !isEdit ? 'Add any additional notes or context…' : 'Optional details…'}
          />
        </div>

        {/* Priority + Due Date */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-text2 mb-1.5">Priority</label>
            <select className="select w-full" value={priority}
              onChange={e => setPriority(e.target.value as TaskPriority)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-text2 mb-1.5">Due Date</label>
            <input type="date" className="input w-full" value={dueDate}
              onChange={e => setDueDate(e.target.value)} />
          </div>
        </div>

        {/* Assign to + SKU / Department */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-text2 mb-1.5">Assign to</label>
            <select className="select w-full" value={assignedTo}
              onChange={e => setAssigned(e.target.value)}>
              <option value="">Unassigned</option>
              {deptUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          {mode === 'single' && !isEdit && (
            <div>
              <label className="block text-xs font-medium text-text2 mb-1.5">SKU (optional)</label>
              <input className="input w-full" value={skuCode}
                onChange={e => setSkuCode(e.target.value)} placeholder="product-code" />
            </div>
          )}
          {isEdit && (
            <div>
              <label className="block text-xs font-medium text-text2 mb-1.5">SKU (optional)</label>
              <input className="input w-full" value={skuCode}
                onChange={e => setSkuCode(e.target.value)} placeholder="product-code" />
            </div>
          )}
        </div>

        {/* Department / Category — always shown */}
        <div>
          <label className="block text-xs font-medium text-text2 mb-1.5">Department / Category</label>
          <select className="select w-full" value={department}
            onChange={e => setDepartment(e.target.value)}>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
            {/* Ensure current value is always present even if not in user list */}
            {department && !departments.includes(department) && (
              <option value={department}>{department}</option>
            )}
            {departments.length === 0 && (
              <option value={profile?.department ?? 'purchasing'}>{profile?.department ?? 'purchasing'}</option>
            )}
          </select>
        </div>

        {error && (
          <div className="text-danger text-xs bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{error}</div>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={isPending} className="btn-primary">
            {isPending ? <LoadingSpinner size="sm" /> : isEdit ? 'Save Changes' : 'Create Task'}
          </button>
        </div>
      </form>

      {skuSelectorOpen && (
        <Modal
          open={skuSelectorOpen}
          onClose={() => setSkuSelectorOpen(false)}
          title="Select SKUs"
          width="max-w-5xl"
        >
          <div className="space-y-4">
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[220px]">
                <label className="block text-[10px] font-semibold text-text2 uppercase tracking-wider mb-1">Search</label>
                <Search size={14} className="absolute left-3 top-[34px] -translate-y-1/2 text-text2" />
                <input
                  className="input w-full pl-9"
                  placeholder="Search SKU, description, vendor, brand, or category..."
                  value={skuSearch}
                  onChange={e => setSkuSearch(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-text2 uppercase tracking-wider mb-1">Vendor</label>
                <select className="select text-sm min-w-[150px]" value={skuVendorFilter} onChange={e => setSkuVendorFilter(e.target.value)}>
                  <option value="">All vendors</option>
                  {skuVendorOptions.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-text2 uppercase tracking-wider mb-1">Status</label>
                <select className="select text-sm min-w-[140px]" value={skuStatusFilter} onChange={e => setSkuStatusFilter(e.target.value)}>
                  <option value="">All statuses</option>
                  {SKU_SELECTOR_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-text2 uppercase tracking-wider mb-1">Category</label>
                <select className="select text-sm min-w-[150px]" value={skuCategoryFilter} onChange={e => setSkuCategoryFilter(e.target.value)}>
                  <option value="">All categories</option>
                  {skuCategoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {(skuVendorFilter || skuStatusFilter || skuCategoryFilter) && (
                <button type="button" className="btn-ghost text-xs text-danger mb-1" onClick={clearSkuFilters}>
                  Clear filters
                </button>
              )}
              <div className="text-xs text-text2 shrink-0">
                {vendorSkus.length} selected
              </div>
            </div>

            <div className="tbl-wrap max-h-[440px]">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="w-10"></th>
                    <SortableTh field="product_code" label="SKU" sort={skuSort} onSort={toggleSkuSort} />
                    <SortableTh field="description" label="Description" sort={skuSort} onSort={toggleSkuSort} />
                    <SortableTh field="supplier_description" label="Vendor" sort={skuSort} onSort={toggleSkuSort} />
                    <SortableTh field="category_name" label="Category" sort={skuSort} onSort={toggleSkuSort} />
                    <SortableTh field="status" label="Status" sort={skuSort} onSort={toggleSkuSort} />
                    <SortableTh field="on_hand" label="On Hand" sort={skuSort} onSort={toggleSkuSort} />
                    <SortableTh field="days_on_hand" label="Days OH" sort={skuSort} onSort={toggleSkuSort} />
                    <SortableTh field="recommended_order" label="Rec. Order" sort={skuSort} onSort={toggleSkuSort} />
                    <SortableTh field="recommended_order_value" label="Order Value" sort={skuSort} onSort={toggleSkuSort} />
                  </tr>
                </thead>
                <tbody>
                  {selectorRows.length === 0 ? (
                    <tr><td colSpan={10} className="py-10 text-center text-text2">No SKUs match your search</td></tr>
                  ) : (
                    selectorRows.map(r => {
                      const selected = selectedSkuCodes.has(r.product_code)
                      return (
                        <tr
                          key={r.id}
                          className={selected ? 'bg-accent/5' : ''}
                          onClick={() => toggleSku(r.product_code)}
                        >
                          <td>
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleSku(r.product_code)}
                              onClick={e => e.stopPropagation()}
                            />
                          </td>
                          <td className="font-mono text-[11px] text-accent">{r.product_code}</td>
                          <td className="max-w-[280px]">
                            <span className="block truncate text-text1" title={r.description}>{r.description}</span>
                            <span className="text-[10px] text-text2">{r.brand_name}</span>
                          </td>
                          <td className="max-w-[160px]"><span className="block truncate" title={r.supplier_description}>{r.supplier_description}</span></td>
                          <td className="max-w-[140px]"><span className="block truncate" title={r.category_name}>{r.category_name}</span></td>
                          <td className="text-xs text-text2">{r.status}</td>
                          <td className="tabular-nums">{fmtNumber(r.on_hand)}</td>
                          <td className="tabular-nums">{r.days_on_hand}d</td>
                          <td className="tabular-nums font-semibold">{fmtNumber(r.recommended_order)}</td>
                          <td className="tabular-nums">{fmtCurrency(r.recommended_order_value)}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setSkuSelectorOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  )
}
