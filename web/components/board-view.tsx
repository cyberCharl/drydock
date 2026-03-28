"use client"

import { CheckCircle2, LoaderCircle, LockKeyhole, XCircle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  BOARD_COLUMN_STATUSES,
  PRIORITY_ORDER,
  formatStatusLabel,
  getPriorityBadgeClassName,
  getRunStatusIconClassName,
  getRunStatusLabel,
  getStatusBadgeClassName,
  type DetailedItem,
  type ItemStatus,
} from "@/lib/types"
import { cn } from "@/lib/utils"

export function BoardView({
  items,
  onSelectItem,
}: {
  items: DetailedItem[]
  onSelectItem: (itemId: number) => void
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-6">
      {BOARD_COLUMN_STATUSES.map((status) => (
        <StatusColumn
          key={status}
          status={status}
          items={items.filter((item) => item.status === status).sort(compareBoardItems)}
          onSelectItem={onSelectItem}
        />
      ))}
    </div>
  )
}

export function BoardLoadingState() {
  return (
    <div className="grid gap-5 xl:grid-cols-6">
      {BOARD_COLUMN_STATUSES.map((status) => (
        <section
          key={status}
          className="min-h-[34rem] rounded-[28px] border border-white/10 bg-black/20 p-4"
        >
          <div className="h-10 rounded-2xl bg-white/5" />
          <div className="mt-4 space-y-3">
            <div className="h-32 rounded-[22px] bg-white/5" />
            <div className="h-28 rounded-[22px] bg-white/5" />
            <div className="h-36 rounded-[22px] bg-white/5" />
          </div>
        </section>
      ))}
    </div>
  )
}

function StatusColumn({
  status,
  items,
  onSelectItem,
}: {
  status: ItemStatus
  items: DetailedItem[]
  onSelectItem: (itemId: number) => void
}) {
  return (
    <section className="flex min-h-[34rem] flex-col rounded-[28px] border border-white/10 bg-black/20 shadow-[0_24px_80px_rgba(2,6,23,0.45)] backdrop-blur">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-4">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-white">
            {formatStatusLabel(status)}
          </h2>
          <p className="mt-1 text-xs text-slate-500">{items.length} items</p>
        </div>
        <Badge className={cn("text-xs", getStatusBadgeClassName(status))}>
          {formatStatusLabel(status)}
        </Badge>
      </header>

      <div className="flex flex-1 flex-col gap-3 p-3">
        {items.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/[0.03] p-6 text-center text-sm leading-6 text-slate-500">
            Nothing here yet.
          </div>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectItem(item.id)}
              className="group rounded-[24px] border border-white/10 bg-white/[0.045] p-4 text-left transition hover:border-sky-300/35 hover:bg-white/[0.08]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <p className="text-sm font-medium leading-6 text-slate-100 transition group-hover:text-white">
                    {item.title}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={cn("text-xs", getPriorityBadgeClassName(item.priority))}>
                      {item.priority}
                    </Badge>
                    {item.blocked ? (
                      <Badge className="border-amber-400/30 bg-amber-400/12 text-amber-100">
                        <LockKeyhole className="size-3.5" />
                        Blocked
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {item.tags.length > 0 ? (
                  item.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-slate-300"
                      style={{
                        borderColor: tag.color ? `${tag.color}55` : undefined,
                        backgroundColor: tag.color ? `${tag.color}22` : undefined,
                      }}
                    >
                      {tag.name}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-500">No tags</span>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
                {item.recent_runs[0] ? (
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <RunStatusIcon status={item.recent_runs[0].status} />
                    <span className="font-medium text-slate-100">
                      {item.recent_runs[0].agent}
                    </span>
                    <span className="text-slate-500">
                      {getRunStatusLabel(item.recent_runs[0].status)}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-slate-500">No agent runs</span>
                )}

                <span className="font-mono text-[11px] text-slate-500">#{item.id}</span>
              </div>
            </button>
          ))
        )}
      </div>
    </section>
  )
}

function RunStatusIcon({ status }: { status: DetailedItem["recent_runs"][number]["status"] }) {
  const className = getRunStatusIconClassName(status)

  if (status === "running") {
    return <LoaderCircle className={cn("size-3.5 animate-spin", className)} />
  }

  if (status === "succeeded") {
    return <CheckCircle2 className={cn("size-3.5", className)} />
  }

  return <XCircle className={cn("size-3.5", className)} />
}

function compareBoardItems(left: DetailedItem, right: DetailedItem) {
  if (left.blocked !== right.blocked) {
    return left.blocked ? 1 : -1
  }

  if (PRIORITY_ORDER[left.priority] !== PRIORITY_ORDER[right.priority]) {
    return PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority]
  }

  return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
}
