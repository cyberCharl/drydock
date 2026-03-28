export const ITEM_STATUSES = [
  "idea",
  "speccing",
  "ready",
  "building",
  "evaluating",
  "shipped",
  "parked",
  "dead",
] as const

export const BOARD_COLUMN_STATUSES = [
  "idea",
  "speccing",
  "ready",
  "building",
  "evaluating",
  "shipped",
] as const

export const HIDDEN_BOARD_STATUSES = ["parked", "dead"] as const

export const ITEM_PRIORITIES = ["critical", "high", "medium", "low", "none"] as const

export const RUN_STATUSES = ["running", "succeeded", "failed", "cancelled"] as const

export type ItemStatus = (typeof ITEM_STATUSES)[number]
export type ItemPriority = (typeof ITEM_PRIORITIES)[number]
export type RunStatus = (typeof RUN_STATUSES)[number]

export type ItemTag = {
  id: number
  name: string
  color: string | null
  created_at: string
  updated_at: string
}

export type AgentRun = {
  id: number
  item_id: number
  agent: string
  branch: string | null
  status: RunStatus
  pr_url: string | null
  ci_status: "pending" | "passed" | "failed" | "unknown"
  notes: string | null
  started_at: string
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type ListItem = {
  id: number
  title: string
  status: ItemStatus
  priority: ItemPriority
  description: string | null
  parent_id: number | null
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
}

export type DetailedItem = ListItem & {
  tags: ItemTag[]
  recent_runs: AgentRun[]
  dependencies: DetailedItem[]
  dependents: DetailedItem[]
  blocked: boolean
}

export type Pagination = {
  limit: number
  offset: number
  total: number
}

export type ItemListResponse = {
  data: ListItem[]
  pagination: Pagination
}

export type CreateItemInput = {
  title: string
  status?: ItemStatus
  priority?: ItemPriority
  description?: string | null
  parent_id?: number | null
}

export const PRIORITY_ORDER: Record<ItemPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
}

export function formatStatusLabel(status: ItemStatus) {
  return status.replaceAll("_", " ").replace(/^\w/, (character) => character.toUpperCase())
}

export function getStatusBadgeClassName(status: ItemStatus) {
  switch (status) {
    case "idea":
      return "border-violet-400/30 bg-violet-400/10 text-violet-100"
    case "speccing":
      return "border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
    case "ready":
      return "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
    case "building":
      return "border-sky-400/30 bg-sky-400/10 text-sky-100"
    case "evaluating":
      return "border-amber-400/30 bg-amber-400/10 text-amber-100"
    case "shipped":
      return "border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-100"
    case "parked":
      return "border-slate-400/30 bg-slate-400/10 text-slate-200"
    case "dead":
      return "border-rose-400/30 bg-rose-400/10 text-rose-100"
  }
}

export function getPriorityBadgeClassName(priority: ItemPriority) {
  switch (priority) {
    case "critical":
      return "border-red-400/30 bg-red-400/10 text-red-100"
    case "high":
      return "border-orange-400/30 bg-orange-400/10 text-orange-100"
    case "medium":
      return "border-yellow-400/30 bg-yellow-400/10 text-yellow-100"
    case "low":
      return "border-blue-400/30 bg-blue-400/10 text-blue-100"
    case "none":
      return "border-slate-400/30 bg-slate-400/10 text-slate-200"
  }
}

export function getRunStatusLabel(status: RunStatus) {
  return status
}

export function getRunStatusIconClassName(status: RunStatus) {
  switch (status) {
    case "running":
      return "text-sky-300"
    case "succeeded":
      return "text-emerald-300"
    case "failed":
      return "text-rose-300"
    case "cancelled":
      return "text-slate-400"
  }
}

export function isHiddenBoardStatus(status: ItemStatus) {
  return HIDDEN_BOARD_STATUSES.includes(status as (typeof HIDDEN_BOARD_STATUSES)[number])
}
