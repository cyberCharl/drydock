"use client"

import { useQuery } from "@tanstack/react-query"

import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { getItem } from "@/lib/api"
import {
  formatPriorityLabel,
  formatStatusLabel,
  getPriorityBadgeClassName,
  getStatusBadgeClassName,
} from "@/lib/types"
import { cn } from "@/lib/utils"

export function ItemDetailSheet({
  itemId,
  open,
  onOpenChange,
}: {
  itemId: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const itemQuery = useQuery({
    queryKey: ["item", itemId],
    queryFn: () => getItem(itemId as number),
    enabled: open && itemId !== null,
  })

  const item = itemQuery.data

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-2xl overflow-y-auto border-white/10 bg-[#050b16] text-slate-100 sm:max-w-2xl"
      >
        <SheetHeader className="border-b border-white/10 pb-5">
          <p className="text-xs uppercase tracking-[0.35em] text-sky-300/70">
            Item Detail
          </p>
          <SheetTitle className="mt-3 text-2xl font-semibold text-white">
            {item?.title ?? "Loading item"}
          </SheetTitle>
          <SheetDescription className="text-slate-400">
            Full editing lands in task 2.4. This slide-over is already shared by
            the board and list views.
          </SheetDescription>
          {item ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge className={cn("text-xs", getStatusBadgeClassName(item.status))}>
                {formatStatusLabel(item.status)}
              </Badge>
              <Badge className={cn("text-xs", getPriorityBadgeClassName(item.priority))}>
                {formatPriorityLabel(item.priority)}
              </Badge>
            </div>
          ) : null}
        </SheetHeader>

        <div className="space-y-6 py-6">
          {itemQuery.isPending ? (
            <p className="text-sm text-slate-400">Loading item details...</p>
          ) : null}
          {itemQuery.isError ? (
            <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              {itemQuery.error.message}
            </div>
          ) : null}

          {item ? (
            <>
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <p className="text-sm font-medium text-slate-100">Summary</p>
                <p className="mt-3 text-sm leading-7 text-slate-400">
                  Description, dependencies, agent run controls, and changelog
                  editing are next. The data query is already shared so the full
                  panel can expand in place.
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
      </SheetContent>
    </Sheet>
  )
}
