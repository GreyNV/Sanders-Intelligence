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

export type InventoryStatus = 'Ok' | 'Excess stock' | 'Potential s/o'

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

export type TaskStatus   = 'todo' | 'in_progress' | 'done' | 'cancelled'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type TaskSource   = 'manual' | 'auto'

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
  sku_code: string | null
  source: TaskSource
  assignee?: { name: string; email: string } | null
  creator?: { name: string; email: string } | null
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
}
