export type ItemStatus =
  | "idea"
  | "speccing"
  | "ready"
  | "building"
  | "evaluating"
  | "shipped"
  | "parked"
  | "dead"

export type ItemPriority = "critical" | "high" | "medium" | "low" | "none"

export type RunStatus = "running" | "succeeded" | "failed" | "cancelled"
export type CIStatus = "pending" | "passed" | "failed" | "unknown"
export type RunReviewStatus =
  | "pending"
  | "approved"
  | "changes_requested"
  | "no_reviews"
export type ViewMode = "board" | "list"

export interface Tag {
  id: number
  name: string
  color: string | null
  created_at: string
  updated_at: string
}

export interface AgentRun {
  id: number
  item_id: number
  agent: string
  branch: string | null
  session_id: string | null
  status: RunStatus
  pr_url: string | null
  ci_status: CIStatus
  review_status: RunReviewStatus
  retry_count: number
  repo: string | null
  notes: string | null
  started_at: string
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface Item {
  id: number
  title: string
  status: ItemStatus
  priority: ItemPriority
  description: string | null
  parent_id: number | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface DetailedItem extends Item {
  tags: Tag[]
  recent_runs: AgentRun[]
  dependencies: Item[]
  dependents: Item[]
  blocked: boolean
}

export interface ChangelogEntry {
  id: number
  item_id: number
  field_name: string
  old_value: string | null
  new_value: string | null
  changed_by: string | null
  changed_at: string
}

export const BOARD_STATUSES: ItemStatus[] = [
  "idea",
  "speccing",
  "ready",
  "building",
  "evaluating",
  "shipped",
]

export const ALL_STATUSES: ItemStatus[] = [
  "idea",
  "speccing",
  "ready",
  "building",
  "evaluating",
  "shipped",
  "parked",
  "dead",
]

export const ALL_PRIORITIES: ItemPriority[] = [
  "critical",
  "high",
  "medium",
  "low",
  "none",
]

export const PRIORITY_CONFIG: Record<
  ItemPriority,
  { label: string; color: string; className: string }
> = {
  critical: {
    label: "Critical",
    color: "oklch(0.55 0.2 27)",
    className: "bg-chart-1/15 text-chart-1 border-chart-1/30",
  },
  high: {
    label: "High",
    color: "oklch(0.7 0.16 50)",
    className: "bg-chart-2/15 text-chart-2 border-chart-2/30",
  },
  medium: {
    label: "Medium",
    color: "oklch(0.8 0.14 85)",
    className: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  },
  low: {
    label: "Low",
    color: "oklch(0.65 0.14 230)",
    className: "bg-chart-4/15 text-chart-4 border-chart-4/30",
  },
  none: {
    label: "None",
    color: "oklch(0.55 0.02 264)",
    className: "bg-chart-5/15 text-chart-5 border-chart-5/30",
  },
}

export const STATUS_CONFIG: Record<
  ItemStatus,
  { label: string; emoji: string }
> = {
  idea: { label: "Idea", emoji: "💡" },
  speccing: { label: "Speccing", emoji: "📐" },
  ready: { label: "Ready", emoji: "🟢" },
  building: { label: "Building", emoji: "🔨" },
  evaluating: { label: "Evaluating", emoji: "🔍" },
  shipped: { label: "Shipped", emoji: "🚀" },
  parked: { label: "Parked", emoji: "⏸️" },
  dead: { label: "Dead", emoji: "💀" },
}

export const BOARD_COLUMN_STATUSES: ItemStatus[] = BOARD_STATUSES
export const HIDDEN_BOARD_STATUSES: ItemStatus[] = ["parked", "dead"]

export const PRIORITY_ORDER: Record<ItemPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
}

export function formatStatusLabel(status: ItemStatus): string {
  return STATUS_CONFIG[status].label
}

export function isHiddenBoardStatus(status: ItemStatus): boolean {
  return status === "parked" || status === "dead"
}

export function getPriorityBadgeClassName(priority: ItemPriority): string {
  return PRIORITY_CONFIG[priority].className
}

export function formatPriorityLabel(priority: ItemPriority): string {
  return PRIORITY_CONFIG[priority].label
}

export function getStatusBadgeClassName(status: ItemStatus): string {
  const map: Record<ItemStatus, string> = {
    idea: "border-violet-400/30 bg-violet-400/10 text-violet-200",
    speccing: "border-sky-400/30 bg-sky-400/10 text-sky-200",
    ready: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
    building: "border-amber-400/30 bg-amber-400/10 text-amber-200",
    evaluating: "border-orange-400/30 bg-orange-400/10 text-orange-200",
    shipped: "border-green-400/30 bg-green-400/10 text-green-200",
    parked: "border-slate-400/30 bg-slate-400/10 text-slate-300",
    dead: "border-red-400/30 bg-red-400/10 text-red-300",
  }
  return map[status]
}

export function getRunStatusLabel(status: RunStatus): string {
  const map: Record<RunStatus, string> = {
    running: "Running",
    succeeded: "Succeeded",
    failed: "Failed",
    cancelled: "Cancelled",
  }
  return map[status]
}

export function getRunStatusIconClassName(status: RunStatus): string {
  const map: Record<RunStatus, string> = {
    running: "text-sky-400",
    succeeded: "text-emerald-400",
    failed: "text-red-400",
    cancelled: "text-slate-400",
  }
  return map[status]
}

export function getCIStatusClassName(status: CIStatus): string {
  const map: Record<CIStatus, string> = {
    pending: "text-yellow-400",
    passed: "text-emerald-400",
    failed: "text-red-400",
    unknown: "text-slate-400",
  }
  return map[status]
}

export function getCIStatusBadgeClassName(status: CIStatus | "none"): string {
  const map: Record<CIStatus | "none", string> = {
    pending: "border-yellow-400/30 bg-yellow-400/10 text-yellow-100",
    passed: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
    failed: "border-red-400/30 bg-red-400/10 text-red-100",
    unknown: "border-slate-400/30 bg-slate-400/10 text-slate-200",
    none: "border-white/10 bg-white/[0.04] text-slate-400",
  }
  return map[status]
}
