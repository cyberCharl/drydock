"use client"

import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  LockKeyhole,
  Plus,
  Workflow,
  X,
  XCircle,
} from "lucide-react"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createItem, getItem, listItems } from "@/lib/api"
import {
  BOARD_COLUMN_STATUSES,
  HIDDEN_BOARD_STATUSES,
  PRIORITY_ORDER,
  formatStatusLabel,
  getPriorityBadgeClassName,
  getRunStatusIconClassName,
  getRunStatusLabel,
  getStatusBadgeClassName,
  isHiddenBoardStatus,
  type DetailedItem,
  type ItemStatus,
} from "@/lib/types"
import { cn } from "@/lib/utils"

export function WorkbenchApp() {
  const queryClient = useQueryClient()
  const [draftTitle, setDraftTitle] = useState("")
  const [showHidden, setShowHidden] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)

  const itemListQuery = useQuery({
    queryKey: ["items", "board", { limit: 100 }],
    queryFn: () => listItems({ limit: 100 }),
  })

  const itemDetailQueries = useQueries({
    queries: (itemListQuery.data?.data ?? []).map((item) => ({
      queryKey: ["item", item.id],
      queryFn: () => getItem(item.id),
      staleTime: 15_000,
    })),
  })

  const createItemMutation = useMutation({
    mutationFn: createItem,
    onSuccess: (item) => {
      setDraftTitle("")
      void queryClient.invalidateQueries({ queryKey: ["items"] })
      void queryClient.invalidateQueries({ queryKey: ["item", item.id] })
      setSelectedItemId(item.id)
    },
  })

  const detailedItems = itemDetailQueries
    .map((query) => query.data)
    .filter((item): item is DetailedItem => item !== undefined)

  const isBoardLoading =
    itemListQuery.isPending ||
    (itemListQuery.isSuccess &&
      itemDetailQueries.length > 0 &&
      detailedItems.length === 0 &&
      itemDetailQueries.some((query) => query.isPending))

  const boardStatuses = showHidden
    ? [...BOARD_COLUMN_STATUSES, ...HIDDEN_BOARD_STATUSES]
    : BOARD_COLUMN_STATUSES

  const visibleItems = detailedItems.filter((item) =>
    showHidden ? true : !isHiddenBoardStatus(item.status),
  )

  async function handleQuickCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const title = draftTitle.trim()
    if (!title || createItemMutation.isPending) {
      return
    }

    await createItemMutation.mutateAsync({ title })
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.14),_transparent_34%),radial-gradient(circle_at_bottom_left,_rgba(217,119,6,0.1),_transparent_30%),linear-gradient(180deg,_#07111f_0%,_#030712_48%,_#02040a_100%)]">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-6 py-8">
        <header className="flex flex-col gap-6 border-b border-white/10 pb-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.45em] text-sky-300/75">
                Gyre Workbench
              </p>
              <div className="mt-3 flex items-center gap-3">
                <h1 className="text-3xl font-semibold tracking-tight text-white">
                  Drydock
                </h1>
                <Badge className="border-sky-400/30 bg-sky-400/10 text-sky-100">
                  Board View
                </Badge>
              </div>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
                Items are grouped by status with quick-create at the top. Hidden
                parked and dead work can be toggled into view without leaving the
                board.
              </p>
            </div>

            <form className="flex w-full max-w-xl gap-3" onSubmit={handleQuickCreate}>
              <Input
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                placeholder="Quick create an item title"
                aria-label="Quick create item"
              />
              <Button
                type="submit"
                disabled={!draftTitle.trim() || createItemMutation.isPending}
              >
                {createItemMutation.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                New Item
              </Button>
            </form>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant={showHidden ? "secondary" : "ghost"}
              onClick={() => setShowHidden((current) => !current)}
            >
              <Workflow className="size-4" />
              {showHidden ? "Hide parked / dead" : "Show parked / dead"}
            </Button>
            <p className="text-xs text-slate-500">
              REST requests are proxied through <code>/api</code>.
            </p>
          </div>

          {createItemMutation.isError ? (
            <InlineError message={createItemMutation.error.message} />
          ) : null}
          {itemListQuery.isError ? <InlineError message={itemListQuery.error.message} /> : null}
        </header>

        <section className="flex-1 py-8">
          {isBoardLoading ? (
            <BoardLoadingState />
          ) : (
            <div className="grid gap-5 xl:grid-cols-6">
              {boardStatuses.map((status) => {
                const items = visibleItems
                  .filter((item) => item.status === status)
                  .sort(compareBoardItems)

                return (
                  <StatusColumn
                    key={status}
                    status={status}
                    items={items}
                    onSelectItem={setSelectedItemId}
                  />
                )
              })}
            </div>
          )}
        </section>
      </div>

      <ItemPeekPanel itemId={selectedItemId} onClose={() => setSelectedItemId(null)} />
    </main>
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

function BoardLoadingState() {
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

function ItemPeekPanel({
  itemId,
  onClose,
}: {
  itemId: number | null
  onClose: () => void
}) {
  const itemQuery = useQuery({
    queryKey: ["item", itemId],
    queryFn: () => getItem(itemId as number),
    enabled: itemId !== null,
  })

  if (itemId === null) {
    return null
  }

  const item = itemQuery.data

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/55 backdrop-blur-sm">
      <button
        type="button"
        className="flex-1 cursor-default"
        aria-label="Close detail panel overlay"
        onClick={onClose}
      />
      <aside className="flex h-full w-full max-w-xl flex-col border-l border-white/10 bg-[#050b16] px-6 py-6 shadow-2xl shadow-black/40">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-sky-300/70">
              Item Detail
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-white">
              {item?.title ?? "Loading item"}
            </h2>
            {item ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge className={cn("text-xs", getStatusBadgeClassName(item.status))}>
                  {formatStatusLabel(item.status)}
                </Badge>
                <Badge className={cn("text-xs", getPriorityBadgeClassName(item.priority))}>
                  {item.priority}
                </Badge>
              </div>
            ) : null}
          </div>

          <Button type="button" variant="ghost" size="icon" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto py-6">
          {itemQuery.isPending ? (
            <p className="text-sm text-slate-400">Loading item details…</p>
          ) : null}
          {itemQuery.isError ? <InlineError message={itemQuery.error.message} /> : null}

          {item ? (
            <>
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <p className="text-sm font-medium text-slate-100">Summary</p>
                <p className="mt-3 text-sm leading-7 text-slate-400">
                  Full editing lands in task 2.4. The panel is already wired to
                  the shared item query and opens from the board now.
                </p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <p className="text-sm font-medium text-slate-100">Tags</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.tags.length > 0 ? (
                    item.tags.map((tag) => (
                      <Badge
                        key={tag.id}
                        className="border-white/10 bg-white/[0.04] text-slate-200"
                      >
                        {tag.name}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">No tags assigned.</p>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  )
}

function InlineError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
      <AlertCircle className="size-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
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
