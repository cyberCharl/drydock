"use client"

import { formatDistanceToNow } from "date-fns"
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react"
import { useEffect, useState } from "react"

import { TagMultiSelect } from "@/components/tag-multi-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ALL_PRIORITIES,
  ALL_STATUSES,
  PRIORITY_ORDER,
  formatPriorityLabel,
  formatStatusLabel,
  getCIStatusBadgeClassName,
  getPriorityBadgeClassName,
  getStatusBadgeClassName,
  type DetailedItem,
  type ItemPriority,
  type ItemStatus,
  type Tag,
} from "@/lib/types"
import { cn } from "@/lib/utils"

type SortColumn = "title" | "status" | "priority" | "agent" | "ci_status" | "updated_at"
type SortDirection = "asc" | "desc"

const PAGE_SIZE = 12

export function ListView({
  items,
  tags,
  onSelectItem,
}: {
  items: DetailedItem[]
  tags: Tag[]
  onSelectItem: (itemId: number) => void
}) {
  const [statusFilter, setStatusFilter] = useState<"all" | ItemStatus>("all")
  const [priorityFilter, setPriorityFilter] = useState<"all" | ItemPriority>("all")
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])
  const [sortColumn, setSortColumn] = useState<SortColumn>("updated_at")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [page, setPage] = useState(1)

  useEffect(() => {
    setPage(1)
  }, [statusFilter, priorityFilter, selectedTagIds, sortColumn, sortDirection])

  const filteredItems = items.filter((item) => {
    if (statusFilter !== "all" && item.status !== statusFilter) {
      return false
    }

    if (priorityFilter !== "all" && item.priority !== priorityFilter) {
      return false
    }

    if (
      selectedTagIds.length > 0 &&
      !selectedTagIds.some((tagId) => item.tags.some((tag) => tag.id === tagId))
    ) {
      return false
    }

    return true
  })

  const sortedItems = [...filteredItems].sort((left, right) => {
    const latestLeftRun = left.recent_runs[0]
    const latestRightRun = right.recent_runs[0]

    switch (sortColumn) {
      case "title":
        return compareText(left.title, right.title, sortDirection)
      case "status":
        return compareText(left.status, right.status, sortDirection)
      case "priority":
        return compareNumber(
          PRIORITY_ORDER[left.priority],
          PRIORITY_ORDER[right.priority],
          sortDirection,
        )
      case "agent":
        return compareText(latestLeftRun?.agent ?? "", latestRightRun?.agent ?? "", sortDirection)
      case "ci_status":
        return compareText(
          latestLeftRun?.ci_status ?? "",
          latestRightRun?.ci_status ?? "",
          sortDirection,
        )
      case "updated_at":
        return compareNumber(
          new Date(left.updated_at).getTime(),
          new Date(right.updated_at).getTime(),
          sortDirection,
        )
    }
  })

  const totalPages = Math.max(1, Math.ceil(sortedItems.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedItems = sortedItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const pageStart = sortedItems.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const pageEnd = (currentPage - 1) * PAGE_SIZE + pagedItems.length

  return (
    <div className="space-y-6">
      <div className="grid gap-3 rounded-[28px] border border-white/10 bg-black/20 p-4 md:grid-cols-3">
        <FilterBlock label="Status">
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as "all" | ItemStatus)}
          >
            <SelectTrigger className="border-white/10 bg-white/[0.05] text-slate-100">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent className="border-white/10 bg-[#09111d] text-slate-100">
              <SelectItem value="all">All statuses</SelectItem>
              {ALL_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {formatStatusLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterBlock>

        <FilterBlock label="Priority">
          <Select
            value={priorityFilter}
            onValueChange={(value) => setPriorityFilter(value as "all" | ItemPriority)}
          >
            <SelectTrigger className="border-white/10 bg-white/[0.05] text-slate-100">
              <SelectValue placeholder="All priorities" />
            </SelectTrigger>
            <SelectContent className="border-white/10 bg-[#09111d] text-slate-100">
              <SelectItem value="all">All priorities</SelectItem>
              {ALL_PRIORITIES.map((priority) => (
                <SelectItem key={priority} value={priority}>
                  {formatPriorityLabel(priority)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterBlock>

        <FilterBlock label="Tags">
          <TagMultiSelect
            tags={tags}
            selectedTagIds={selectedTagIds}
            onSelectedTagIdsChange={setSelectedTagIds}
          />
        </FilterBlock>
      </div>

      <div className="overflow-hidden rounded-[28px] border border-white/10 bg-black/20">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-transparent">
              <TableHead className="pl-6">
                <SortButton
                  label="Title"
                  column="title"
                  activeColumn={sortColumn}
                  direction={sortDirection}
                  onSortChange={handleSortChange}
                />
              </TableHead>
              <TableHead>
                <SortButton
                  label="Status"
                  column="status"
                  activeColumn={sortColumn}
                  direction={sortDirection}
                  onSortChange={handleSortChange}
                />
              </TableHead>
              <TableHead>
                <SortButton
                  label="Priority"
                  column="priority"
                  activeColumn={sortColumn}
                  direction={sortDirection}
                  onSortChange={handleSortChange}
                />
              </TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>
                <SortButton
                  label="Agent"
                  column="agent"
                  activeColumn={sortColumn}
                  direction={sortDirection}
                  onSortChange={handleSortChange}
                />
              </TableHead>
              <TableHead>
                <SortButton
                  label="CI status"
                  column="ci_status"
                  activeColumn={sortColumn}
                  direction={sortDirection}
                  onSortChange={handleSortChange}
                />
              </TableHead>
              <TableHead className="pr-6">
                <SortButton
                  label="Last updated"
                  column="updated_at"
                  activeColumn={sortColumn}
                  direction={sortDirection}
                  onSortChange={handleSortChange}
                />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedItems.length === 0 ? (
              <TableRow className="border-white/10">
                <TableCell colSpan={7} className="px-6 py-16 text-center text-slate-500">
                  No items match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              pagedItems.map((item) => {
                const latestRun = item.recent_runs[0]

                return (
                  <TableRow
                    key={item.id}
                    className="cursor-pointer border-white/10 hover:bg-white/[0.04]"
                    onClick={() => onSelectItem(item.id)}
                  >
                    <TableCell className="pl-6">
                      <div className="space-y-1">
                        <p className="font-medium text-slate-100">{item.title}</p>
                        <p className="font-mono text-xs text-slate-500">#{item.id}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("text-xs", getStatusBadgeClassName(item.status))}>
                        {formatStatusLabel(item.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={cn("text-xs", getPriorityBadgeClassName(item.priority))}
                      >
                        {formatPriorityLabel(item.priority)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {item.tags.length > 0 ? (
                          item.tags.map((tag) => (
                            <span
                              key={tag.id}
                              className="rounded-full border border-white/10 px-2 py-1 text-[11px] text-slate-300"
                            >
                              {tag.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-500">None</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-300">
                      {latestRun?.agent ?? <span className="text-slate-500">None</span>}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          "text-xs",
                          getCIStatusBadgeClassName(latestRun?.ci_status ?? "none"),
                        )}
                      >
                        {latestRun?.ci_status ?? "none"}
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-6 text-slate-400">
                      {formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>

        <div className="flex flex-col gap-3 border-t border-white/10 px-6 py-4 text-sm text-slate-400 md:flex-row md:items-center md:justify-between">
          <p>
            Showing {pageStart}-{pageEnd} of {sortedItems.length}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="border-white/10 bg-white/[0.04] text-slate-100 hover:bg-white/[0.08]"
              disabled={currentPage === 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <span className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Page {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              className="border-white/10 bg-white/[0.04] text-slate-100 hover:bg-white/[0.08]"
              disabled={currentPage === totalPages}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )

  function handleSortChange(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"))
      return
    }

    setSortColumn(column)
    setSortDirection(column === "updated_at" ? "desc" : "asc")
  }
}

function FilterBlock({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{label}</p>
      {children}
    </div>
  )
}

function SortButton({
  label,
  column,
  activeColumn,
  direction,
  onSortChange,
}: {
  label: string
  column: SortColumn
  activeColumn: SortColumn
  direction: SortDirection
  onSortChange: (column: SortColumn) => void
}) {
  const isActive = activeColumn === column

  return (
    <button
      type="button"
      onClick={() => onSortChange(column)}
      className="inline-flex items-center gap-2 font-medium text-slate-400 transition hover:text-slate-100"
    >
      <span>{label}</span>
      {isActive ? (
        direction === "asc" ? (
          <ArrowUp className="size-3.5" />
        ) : (
          <ArrowDown className="size-3.5" />
        )
      ) : (
        <ArrowUpDown className="size-3.5 opacity-70" />
      )}
    </button>
  )
}

function compareText(left: string, right: string, direction: SortDirection) {
  return direction === "asc"
    ? left.localeCompare(right)
    : right.localeCompare(left)
}

function compareNumber(left: number, right: number, direction: SortDirection) {
  return direction === "asc" ? left - right : right - left
}
