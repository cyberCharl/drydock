"use client"

import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertCircle, LayoutGrid, List, LoaderCircle, Plus, Workflow } from "lucide-react"
import { useEffect, useState } from "react"

import { BoardLoadingState, BoardView } from "@/components/board-view"
import { ConnectionIndicator } from "@/components/connection-indicator"
import { ItemDetailSheet } from "@/components/item-detail-sheet"
import { ListView } from "@/components/list-view"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createItem, getItem, listItems, listTags } from "@/lib/api"
import {
  HIDDEN_BOARD_STATUSES,
  isHiddenBoardStatus,
  type DetailedItem,
  type ViewMode,
} from "@/lib/types"

const VIEW_STORAGE_KEY = "drydock:view-mode"

export function WorkbenchApp() {
  const queryClient = useQueryClient()
  const [draftTitle, setDraftTitle] = useState("")
  const [showHidden, setShowHidden] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") {
      return "board"
    }

    const storedValue = window.localStorage.getItem(VIEW_STORAGE_KEY)
    return storedValue === "list" ? "list" : "board"
  })

  useEffect(() => {
    window.localStorage.setItem(VIEW_STORAGE_KEY, viewMode)
  }, [viewMode])

  const itemListQuery = useQuery({
    queryKey: ["items", "workbench", { limit: 100 }],
    queryFn: () => listItems({ limit: 100 }),
  })

  const tagListQuery = useQuery({
    queryKey: ["tags"],
    queryFn: listTags,
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

  const isWorkbenchLoading =
    itemListQuery.isPending ||
    (itemListQuery.isSuccess &&
      itemDetailQueries.length > 0 &&
      detailedItems.length === 0 &&
      itemDetailQueries.some((query) => query.isPending))

  const boardItems = detailedItems.filter((item) =>
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
                  {viewMode === "board" ? "Board View" : "List View"}
                </Badge>
              </div>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
                Board and list views share the same enriched item cache, so table
                filters and card clicks stay in sync.
              </p>
            </div>

            <form className="flex w-full max-w-xl gap-3" onSubmit={handleQuickCreate}>
              <Input
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                placeholder="Quick create an item title"
                aria-label="Quick create item"
                className="border-white/10 bg-white/[0.05] text-slate-100 placeholder:text-slate-500"
              />
              <Button
                type="submit"
                className="border-sky-400/30 bg-sky-400/15 text-sky-50 hover:bg-sky-400/22"
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
              variant={viewMode === "board" ? "secondary" : "ghost"}
              className={
                viewMode === "board"
                  ? "border-white/10 bg-white/[0.08] text-slate-100"
                  : "border-white/10 text-slate-300 hover:bg-white/[0.05]"
              }
              onClick={() => setViewMode("board")}
            >
              <LayoutGrid className="size-4" />
              Board
            </Button>
            <Button
              type="button"
              variant={viewMode === "list" ? "secondary" : "ghost"}
              className={
                viewMode === "list"
                  ? "border-white/10 bg-white/[0.08] text-slate-100"
                  : "border-white/10 text-slate-300 hover:bg-white/[0.05]"
              }
              onClick={() => setViewMode("list")}
            >
              <List className="size-4" />
              List
            </Button>
            {viewMode === "board" ? (
              <Button
                type="button"
                variant={showHidden ? "secondary" : "ghost"}
                className={
                  showHidden
                    ? "border-white/10 bg-white/[0.08] text-slate-100"
                    : "border-white/10 text-slate-300 hover:bg-white/[0.05]"
                }
                onClick={() => setShowHidden((current) => !current)}
              >
                <Workflow className="size-4" />
                {showHidden
                  ? `Hide ${HIDDEN_BOARD_STATUSES.join(" / ")}`
                  : `Show ${HIDDEN_BOARD_STATUSES.join(" / ")}`}
              </Button>
            ) : null}
            <div className="ml-auto">
              <ConnectionIndicator />
            </div>
          </div>

          {createItemMutation.isError ? (
            <InlineError message={createItemMutation.error.message} />
          ) : null}
          {itemListQuery.isError ? <InlineError message={itemListQuery.error.message} /> : null}
          {tagListQuery.isError ? <InlineError message={tagListQuery.error.message} /> : null}
        </header>

        <section className="flex-1 py-8">
          {isWorkbenchLoading ? (
            <BoardLoadingState />
          ) : viewMode === "board" ? (
            <BoardView items={boardItems} onSelectItem={setSelectedItemId} />
          ) : (
            <ListView
              items={detailedItems}
              tags={tagListQuery.data ?? []}
              onSelectItem={setSelectedItemId}
            />
          )}
        </section>
      </div>

      <ItemDetailSheet
        itemId={selectedItemId}
        open={selectedItemId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedItemId(null)
          }
        }}
        onSelectItem={setSelectedItemId}
      />
    </main>
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
