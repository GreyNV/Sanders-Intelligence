// ─── Users ──────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'purchasing' | 'csuite'

export interface AppUser {
  id: string
  email: string
  name: string
  role: UserRole
  department: string | null
  is_active: boolean
  created_at: string
}

// ─── Uploads ─────────────────────────────────────────────────────────────────

export type UploadStatus = 'processing' | 'complete' | 'failed'

export interface Upload {
  id: string
  uploaded_by: string
  uploaded_at: string
  filename: string
  row_count: number | null
  status: UploadStatus
  notes: string | null
  uploader?: { name: string; email: string }
}

// ─── Inventory ───────────────────────────────────────────────────────────────

export type InventoryStatus = 'Ok' | 'Excess stock' | 'Potential s/o' | 'Stocked out' | 'Surplus orders' | 'New item'

export interface InventoryRecord {
  id: string
  upload_id: string
  warehouse: string
  product_code: string
  description: string
  supplier_code: string
  supplier_description: string
  brand_code: string
  brand_name: string
  category_code: string
  category_name: string
  on_hand: number
  days_on_hand: number
  cost_price: number
  on_hand_value: number
  classification: string   // A | B | C | X | S
  velocity: string         // H | M | L | X
  status: InventoryStatus
  status_units: number
  status_value: number
  excess_units: number
  excess_value: number
  recommended_order: number
  recommended_order_value: number
  recommended_order_days: number
  age: number
  average_sales: number
  average_forecasted_sales: number
  lt_days: number
  on_order: number
  back_orders: number
  total_customer_orders: number
  unsatisfied_customer_orders_units: number
  unsatisfied_customer_orders_value: number
  moq: number
  order_multiples: number
  selling_price: number
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export type TaskStatus   = 'todo' | 'in_progress' | 'done' | 'cancelled' | 'postponed'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type TaskSource   = 'manual' | 'auto'
export type TaskCommentKind = 'comment' | 'cancel' | 'postpone'
export type TaskActivityKind = 'created' | 'status_changed'

export interface Task {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  department: string
  assigned_to: string | null
  created_by: string
  created_at: string
  updated_at: string
  postponed_until: string | null
  sku_code: string | null
  source: TaskSource
  rule_id: string | null
  vendor_supplier_code: string | null
  vendor_name: string | null
  affected_skus: string[] | null
  upload_id: string | null
  reopened_from_task_id: string | null
  assignee?: { name: string; email: string } | null
  creator?: { name: string; email: string } | null
}

export interface AutomationConfig {
  key: string
  enabled: boolean
  system_user_id: string | null
  default_assignee_user_id: string | null
  updated_at: string
}

export interface TaskComment {
  id: string
  task_id: string
  author_id: string
  body: string
  kind: TaskCommentKind
  created_at: string
  author?: { name: string; email: string } | null
}

export interface TaskActivityEvent {
  id: string
  task_id: string
  actor_id: string | null
  kind: TaskActivityKind
  from_status: TaskStatus | null
  to_status: TaskStatus | null
  created_at: string
  actor?: { name: string; email: string } | null
}

export interface TaskFormValues {
  title: string
  description: string
  priority: TaskPriority
  due_date: string
  assigned_to: string
  sku_code: string
  department: string
}

// ─── Data freshness ──────────────────────────────────────────────────────────

export type FreshnessStatus = 'fresh' | 'stale' | 'no_data'

export interface Freshness {
  status: FreshnessStatus
  date: string | null
  metricsRefreshedAt: string | null
}

// Purchase Orders

export type POStatus = 'Saved' | 'Ordered' | 'Received' | 'Pending' | 'Cancelled' | 'Completed' | string

export interface PurchaseOrder {
  id: number
  purchase_title: string | null
  vendor_id: number | null
  vendor_name: string | null
  po_status: POStatus
  po_status_code: number | null
  payment_status: string | null
  payment_status_code: number | null
  shipping_status: string | null
  shipping_status_code: number | null
  receiving_status: string | null
  receiving_status_code: number | null
  is_active: boolean
  date_ordered: string | null
  expected_delivery_date: string | null
  created_on: string | null
  shipped_on: string | null
  grand_total: number | null
  order_total: number | null
  tax_total: number | null
  shipping_total: number | null
  unit_counts: number | null
  warehouse_id: number | null
  company_id: number | null
  memo: string | null
  tracking_numbers: Array<Record<string, unknown>> | null
  approved: boolean | null
  cancelled_po_id: number | null
  updated_on: string | null
  synced_at: string
}

export interface POItem {
  id: number
  po_id: number
  source_sku: string
  planning_sku: string | null
  product_name: string | null
  qty_units_ordered: number | null
  qty_units_received: number | null
  qty_units_open: number | null
  qty_units_per_case: number | null
  unit_price: number | null
  case_price: number | null
  discount_type: string | null
  discount_value: number | null
  expected_delivery_date: string | null
  receiving_status: string | null
  receiving_status_code: number | null
}

export interface POInboundItem {
  id: number
  po_id: number
  source_sku: string
  planning_sku: string | null
  product_name: string | null
  qty_units_ordered: number | null
  qty_units_received: number | null
  qty_units_open: number | null
  unit_price: number | null
  expected_delivery_date: string | null
  receiving_status: string | null
  receiving_status_code: number | null
  purchase_order: Pick<
    PurchaseOrder,
    | 'id'
    | 'vendor_id'
    | 'vendor_name'
    | 'po_status'
    | 'shipping_status'
    | 'receiving_status'
    | 'date_ordered'
    | 'expected_delivery_date'
    | 'updated_on'
    | 'is_active'
  > | null
}

// News feed

export interface NewsItem {
  id: string
  provider: string
  title: string
  source: string | null
  url: string
  published_at: string | null
  snippet: string | null
  query: string
  created_at: string
}

// North Star / Business Plan Review

export type NorthStarStatus = 'on_plan' | 'at_risk' | 'off_plan'

export interface NorthStarRow {
  id: string
  period_month: string
  period_week: string
  slot_index: number
  pillar: string
  owner: string | null
  north_star: string
  constraint_now: string | null
  weekly_move: string | null
  last_week_result: string | null
  status: NorthStarStatus
  is_locked: boolean
  updated_by: string | null
  updated_at: string
  created_at: string
}

export interface NorthStarHistory {
  id: string
  row_id: string | null
  field_name: string
  old_value: string | null
  new_value: string | null
  edited_by: string | null
  edited_at: string
  period_week: string
}

export interface MonthlyStar {
  id: string
  period_month: string
  target_sales: number
  mtd_actual: number
  ly_mtd_actual: number
  days_elapsed: number
  days_remaining: number
  channel_deltas: Array<{ channel: string; delta: number }>
  updated_by: string | null
  updated_at: string
  created_at: string
}
