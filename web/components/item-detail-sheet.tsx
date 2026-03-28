"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { formatDistanceToNow, formatDistance } from "date-fns"
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  LockKeyhole,
  Minus,
  Plus,
  Trash2,
  X,
  XCircle,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import Markdown from "react-markdown"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import {
  addDependency,
  addItemTag,
  fetchItemChangelog,
  fetchItemChildren,
  fetchItemRuns,
  fetchItems,
  getItem,
  listTags,
  removeDependency,
  removeItemTag,
  updateItem,
} from "@/lib/api"
import {
  ALL_PRIORITIES,
  ALL_STATUSES,
  formatPriorityLabel,
  formatStatusLabel,
  getCIStatusBadgeClassName,
  getPriorityBadgeClassName,
  getRunStatusIconClassName,
  getRunStatusLabel,
  getStatusBadgeClassName,
  type AgentRun,
  type ChangelogEntry,
  type DetailedItem,
  type Item,
  type ItemPriority,
  type ItemStatus,
  type Tag,
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
  const queryClient = useQueryClient()

  const itemQuery = useQuery({
    queryKey: ["item", itemId],
    queryFn: () => getItem(itemId as number),
    enabled: open && itemId !== null,
  })

  const item = itemQuery.data

  function invalidateItem() {
    void queryClient.invalidateQueries({ queryKey: ["item", itemId] })
    void queryClient.invalidateQueries({ queryKey: ["items"] })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-2xl overflow-y-auto border-white/10 bg-[#050b16] text-slate-100 sm:max-w-2xl [&>button]:hidden"
      >
        <SheetHeader className="border-b border-white/10 pb-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-xs uppercase tracking-[0.35em] text-sky-300/70">
                Item Detail
              </p>
              {item ? (
                <EditableTitle item={item} onSaved={invalidateItem} />
              ) : (
                <SheetTitle className="mt-3 text-2xl font-semibold text-white">
                  Loading...
                </SheetTitle>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-slate-400 hover:text-white"
              onClick={() => onOpenChange(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
          {item ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusSelect item={item} onChanged={invalidateItem} />
              <PrioritySelect item={item} onChanged={invalidateItem} />
              {item.blocked && (
                <Badge className="border-amber-400/30 bg-amber-400/12 text-amber-100">
                  <LockKeyhole className="size-3" />
                  Blocked
                </Badge>
              )}
            </div>
          ) : null}
        </SheetHeader>

        <div className="space-y-6 py-6">
          {itemQuery.isPending ? (
            <p className="text-sm text-slate-400">Loading item details...</p>
          ) : null}
          {itemQuery.isError ? (
            <ErrorBox message={itemQuery.error.message} />
          ) : null}

          {item ? (
            <>
              <DescriptionSection item={item} onSaved={invalidateItem} />
              <TagsSection item={item} onChanged={invalidateItem} />
              <AgentRunsSection itemId={item.id} />
              <DependenciesSection item={item} onChanged={invalidateItem} />
              <DependentsSection item={item} />
              <ChildrenSection itemId={item.id} />
              <ChangelogSection itemId={item.id} />
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function SectionBox({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
        {title}
      </p>
      {children}
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
      {message}
    </div>
  )
}

// ── Editable Title ──────────────────────────────────────────────────
function EditableTitle({
  item,
  onSaved,
}: {
  item: DetailedItem
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(item.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTitle(item.title)
  }, [item.title])

  const mutation = useMutation({
    mutationFn: (newTitle: string) => updateItem(item.id, { title: newTitle }),
    onSuccess: () => {
      setEditing(false)
      onSaved()
    },
  })

  function handleBlur() {
    const trimmed = title.trim()
    if (trimmed && trimmed !== item.title) {
      mutation.mutate(trimmed)
    } else {
      setTitle(item.title)
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleBlur()
          if (e.key === "Escape") {
            setTitle(item.title)
            setEditing(false)
          }
        }}
        className="mt-2 border-white/10 bg-white/[0.05] text-xl font-semibold text-white"
        autoFocus
      />
    )
  }

  return (
    <SheetTitle
      className="mt-3 cursor-pointer text-2xl font-semibold text-white transition hover:text-sky-200"
      onClick={() => {
        setEditing(true)
        setTimeout(() => inputRef.current?.focus(), 0)
      }}
    >
      {item.title}
    </SheetTitle>
  )
}

// ── Status / Priority Dropdowns ─────────────────────────────────────
function StatusSelect({
  item,
  onChanged,
}: {
  item: DetailedItem
  onChanged: () => void
}) {
  const mutation = useMutation({
    mutationFn: (status: string) => updateItem(item.id, { status }),
    onSuccess: onChanged,
  })

  return (
    <Select
      value={item.status}
      onValueChange={(v) => mutation.mutate(v)}
      disabled={mutation.isPending}
    >
      <SelectTrigger
        className={cn(
          "h-7 w-auto gap-1.5 rounded-full border px-3 text-xs font-semibold",
          getStatusBadgeClassName(item.status),
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="border-white/10 bg-[#09111d] text-slate-100">
        {ALL_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {formatStatusLabel(s)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function PrioritySelect({
  item,
  onChanged,
}: {
  item: DetailedItem
  onChanged: () => void
}) {
  const mutation = useMutation({
    mutationFn: (priority: string) => updateItem(item.id, { priority }),
    onSuccess: onChanged,
  })

  return (
    <Select
      value={item.priority}
      onValueChange={(v) => mutation.mutate(v)}
      disabled={mutation.isPending}
    >
      <SelectTrigger
        className={cn(
          "h-7 w-auto gap-1.5 rounded-full border px-3 text-xs font-semibold",
          getPriorityBadgeClassName(item.priority),
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="border-white/10 bg-[#09111d] text-slate-100">
        {ALL_PRIORITIES.map((p) => (
          <SelectItem key={p} value={p}>
            {formatPriorityLabel(p)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// ── Description ─────────────────────────────────────────────────────
function DescriptionSection({
  item,
  onSaved,
}: {
  item: DetailedItem
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [desc, setDesc] = useState(item.description ?? "")

  useEffect(() => {
    setDesc(item.description ?? "")
  }, [item.description])

  const mutation = useMutation({
    mutationFn: (description: string) =>
      updateItem(item.id, { description: description || null }),
    onSuccess: () => {
      setEditing(false)
      onSaved()
    },
  })

  function handleSave() {
    if (desc !== (item.description ?? "")) {
      mutation.mutate(desc)
    } else {
      setEditing(false)
    }
  }

  return (
    <SectionBox title="Description">
      {editing ? (
        <div className="space-y-2">
          <Textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={6}
            className="border-white/10 bg-white/[0.05] text-sm text-slate-200"
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="border-sky-400/30 bg-sky-400/15 text-sky-50 hover:bg-sky-400/22"
              onClick={handleSave}
              disabled={mutation.isPending}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDesc(item.description ?? "")
                setEditing(false)
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="w-full text-left"
          onClick={() => setEditing(true)}
        >
          {item.description ? (
            <div className="prose prose-sm prose-invert max-w-none text-slate-300">
              <Markdown>{item.description}</Markdown>
            </div>
          ) : (
            <p className="text-sm italic text-slate-500">
              Click to add a description...
            </p>
          )}
        </button>
      )}
    </SectionBox>
  )
}

// ── Tags ────────────────────────────────────────────────────────────
function TagsSection({
  item,
  onChanged,
}: {
  item: DetailedItem
  onChanged: () => void
}) {
  const [addOpen, setAddOpen] = useState(false)
  const queryClient = useQueryClient()

  const tagsQuery = useQuery({
    queryKey: ["tags"],
    queryFn: listTags,
  })

  const addMutation = useMutation({
    mutationFn: (tagName: string) => addItemTag(item.id, { tag_name: tagName }),
    onSuccess: () => {
      onChanged()
      void queryClient.invalidateQueries({ queryKey: ["tags"] })
    },
  })

  const removeMutation = useMutation({
    mutationFn: (tagId: number) => removeItemTag(item.id, tagId),
    onSuccess: onChanged,
  })

  const availableTags = (tagsQuery.data ?? []).filter(
    (t) => !item.tags.some((it) => it.id === t.id),
  )

  return (
    <SectionBox title="Tags">
      <div className="flex flex-wrap gap-2">
        {item.tags.map((tag) => (
          <Badge
            key={tag.id}
            className="gap-1.5 border-white/10 bg-white/[0.04] text-slate-200"
            style={{
              borderColor: tag.color ? `${tag.color}55` : undefined,
              backgroundColor: tag.color ? `${tag.color}18` : undefined,
            }}
          >
            {tag.name}
            <button
              type="button"
              onClick={() => removeMutation.mutate(tag.id)}
              className="rounded-full p-0.5 transition hover:bg-white/10"
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}

        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-6 gap-1 border-dashed border-white/10 px-2 text-xs text-slate-400"
            >
              <Plus className="size-3" />
              Add tag
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[220px] border-white/10 bg-[#09111d] p-0">
            <Command className="bg-transparent text-slate-100">
              <CommandInput placeholder="Search or create..." />
              <CommandList>
                <CommandEmpty className="p-3 text-center text-xs text-slate-500">
                  Press Enter to create a new tag
                </CommandEmpty>
                <CommandGroup>
                  {availableTags.map((tag) => (
                    <CommandItem
                      key={tag.id}
                      value={tag.name}
                      onSelect={() => {
                        addMutation.mutate(tag.name)
                        setAddOpen(false)
                      }}
                      className="text-slate-200"
                    >
                      <span
                        className="mr-2 inline-block size-2.5 rounded-full"
                        style={{ backgroundColor: tag.color ?? "#64748b" }}
                      />
                      {tag.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </SectionBox>
  )
}

// ── Agent Runs ──────────────────────────────────────────────────────
function AgentRunsSection({ itemId }: { itemId: number }) {
  const runsQuery = useQuery({
    queryKey: ["runs", itemId],
    queryFn: () => fetchItemRuns(itemId),
  })

  const runs = runsQuery.data ?? []

  return (
    <SectionBox title="Agent Runs">
      {runs.length === 0 ? (
        <p className="text-sm text-slate-500">No agent runs yet.</p>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <RunEntry key={run.id} run={run} />
          ))}
        </div>
      )}
    </SectionBox>
  )
}

function RunEntry({ run }: { run: AgentRun }) {
  const [expanded, setExpanded] = useState(false)
  const iconClass = getRunStatusIconClassName(run.status)

  const duration =
    run.started_at && run.completed_at
      ? formatDistance(new Date(run.started_at), new Date(run.completed_at))
      : run.started_at && run.status === "running"
        ? `running for ${formatDistanceToNow(new Date(run.started_at))}`
        : null

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center gap-3">
        {run.status === "running" ? (
          <LoaderCircle className={cn("size-4 animate-spin", iconClass)} />
        ) : run.status === "succeeded" ? (
          <CheckCircle2 className={cn("size-4", iconClass)} />
        ) : run.status === "failed" ? (
          <XCircle className={cn("size-4", iconClass)} />
        ) : (
          <Minus className="size-4 text-slate-500" />
        )}

        <span className="font-mono text-sm font-medium text-slate-100">{run.agent}</span>

        <Badge className="text-[10px]">{getRunStatusLabel(run.status)}</Badge>

        {run.ci_status && (
          <Badge className={cn("text-[10px]", getCIStatusBadgeClassName(run.ci_status))}>
            CI: {run.ci_status}
          </Badge>
        )}

        {duration && (
          <span className="ml-auto text-xs text-slate-500">{duration}</span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
        {run.branch && (
          <code className="rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[11px] text-slate-300">
            {run.branch}
          </code>
        )}
        {run.pr_url && (
          <a
            href={run.pr_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sky-400 transition hover:text-sky-300"
          >
            PR <ExternalLink className="size-3" />
          </a>
        )}
      </div>

      {run.notes && (
        <div className="mt-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-slate-500 transition hover:text-slate-300"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            Notes
          </button>
          {expanded && (
            <p className="mt-1 text-sm leading-relaxed text-slate-400">{run.notes}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Dependencies ────────────────────────────────────────────────────
function DependenciesSection({
  item,
  onChanged,
}: {
  item: DetailedItem
  onChanged: () => void
}) {
  const [searchOpen, setSearchOpen] = useState(false)

  const itemsQuery = useQuery({
    queryKey: ["items", "search"],
    queryFn: () => fetchItems({ limit: "100" }),
    enabled: searchOpen,
  })

  const addMutation = useMutation({
    mutationFn: (depId: number) => addDependency(item.id, depId),
    onSuccess: onChanged,
  })

  const removeMutation = useMutation({
    mutationFn: (depId: number) => removeDependency(item.id, depId),
    onSuccess: onChanged,
  })

  const existingIds = new Set([
    item.id,
    ...item.dependencies.map((d) => d.id),
  ])
  const searchableItems = (itemsQuery.data ?? []).filter(
    (i) => !existingIds.has(i.id),
  )

  return (
    <SectionBox title="Dependencies">
      {item.dependencies.length === 0 ? (
        <p className="mb-3 text-sm text-slate-500">No dependencies.</p>
      ) : (
        <div className="mb-3 space-y-2">
          {item.dependencies.map((dep) => (
            <div
              key={dep.id}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"
            >
              <span className="flex-1 text-sm text-slate-200 truncate">{dep.title}</span>
              <Badge
                className={cn("shrink-0 text-[10px]", getStatusBadgeClassName(dep.status))}
              >
                {formatStatusLabel(dep.status)}
              </Badge>
              <button
                type="button"
                onClick={() => removeMutation.mutate(dep.id)}
                className="shrink-0 rounded p-1 text-slate-500 transition hover:bg-white/10 hover:text-red-400"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Popover open={searchOpen} onOpenChange={setSearchOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-dashed border-white/10 text-xs text-slate-400"
          >
            <Plus className="size-3" />
            Add dependency
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] border-white/10 bg-[#09111d] p-0">
          <Command className="bg-transparent text-slate-100">
            <CommandInput placeholder="Search items..." />
            <CommandList>
              <CommandEmpty className="p-3 text-center text-xs text-slate-500">
                No items found.
              </CommandEmpty>
              <CommandGroup>
                {searchableItems.map((i) => (
                  <CommandItem
                    key={i.id}
                    value={`${i.id} ${i.title}`}
                    onSelect={() => {
                      addMutation.mutate(i.id)
                      setSearchOpen(false)
                    }}
                    className="text-slate-200"
                  >
                    <span className="truncate">{i.title}</span>
                    <Badge
                      className={cn(
                        "ml-auto shrink-0 text-[10px]",
                        getStatusBadgeClassName(i.status),
                      )}
                    >
                      {formatStatusLabel(i.status)}
                    </Badge>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </SectionBox>
  )
}

// ── Dependents ──────────────────────────────────────────────────────
function DependentsSection({ item }: { item: DetailedItem }) {
  if (item.dependents.length === 0) return null

  return (
    <SectionBox title="Depended on by">
      <div className="space-y-2">
        {item.dependents.map((dep) => (
          <div
            key={dep.id}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"
          >
            <span className="flex-1 text-sm text-slate-200 truncate">{dep.title}</span>
            <Badge className={cn("shrink-0 text-[10px]", getStatusBadgeClassName(dep.status))}>
              {formatStatusLabel(dep.status)}
            </Badge>
          </div>
        ))}
      </div>
    </SectionBox>
  )
}

// ── Children ────────────────────────────────────────────────────────
function ChildrenSection({ itemId }: { itemId: number }) {
  const childrenQuery = useQuery({
    queryKey: ["children", itemId],
    queryFn: () => fetchItemChildren(itemId),
  })

  const children = childrenQuery.data ?? []
  if (children.length === 0) return null

  return (
    <SectionBox title="Children">
      <div className="space-y-2">
        {children.map((child) => (
          <div
            key={child.id}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"
          >
            <span className="flex-1 text-sm text-slate-200 truncate">{child.title}</span>
            <Badge
              className={cn("shrink-0 text-[10px]", getStatusBadgeClassName(child.status))}
            >
              {formatStatusLabel(child.status)}
            </Badge>
          </div>
        ))}
      </div>
    </SectionBox>
  )
}

// ── Changelog ───────────────────────────────────────────────────────
function ChangelogSection({ itemId }: { itemId: number }) {
  const [expanded, setExpanded] = useState(false)

  const changelogQuery = useQuery({
    queryKey: ["changelog", itemId],
    queryFn: () => fetchItemChangelog(itemId),
    enabled: expanded,
  })

  const entries = changelogQuery.data ?? []

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-slate-500 transition hover:text-slate-300"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        Changelog
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {changelogQuery.isPending ? (
            <p className="text-xs text-slate-500">Loading...</p>
          ) : entries.length === 0 ? (
            <p className="text-xs text-slate-500">No changes recorded.</p>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-baseline gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs"
              >
                <span className="shrink-0 font-mono font-medium text-sky-300">
                  {entry.field_name}
                </span>
                <span className="text-slate-500 line-through">{entry.old_value ?? "null"}</span>
                <ArrowRight className="size-3 shrink-0 text-slate-600" />
                <span className="text-slate-300">{entry.new_value ?? "null"}</span>
                <span className="ml-auto shrink-0 text-slate-600">
                  {entry.changed_by && (
                    <span className="text-slate-400">{entry.changed_by} · </span>
                  )}
                  {formatDistanceToNow(new Date(entry.changed_at), { addSuffix: true })}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
