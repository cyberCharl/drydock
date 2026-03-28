"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { formatDistanceStrict } from "date-fns"
import {
  Check,
  ExternalLink,
  LoaderCircle,
  LockKeyhole,
  Plus,
  Unlink2,
  X,
} from "lucide-react"
import { useState } from "react"
import ReactMarkdown from "react-markdown"

import {
  addDependency,
  addItemTag,
  createRun,
  fetchItemChangelog,
  fetchItemChildren,
  fetchItemRuns,
  getItem,
  listItems,
  listTags,
  removeDependency,
  removeItemTag,
  updateItem,
  updateRun,
} from "@/lib/api"
import {
  ALL_PRIORITIES,
  ALL_STATUSES,
  formatPriorityLabel,
  formatStatusLabel,
  getCIStatusBadgeClassName,
  getPriorityBadgeClassName,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"

type ItemPatch = Partial<{
  title: string
  status: ItemStatus
  priority: ItemPriority
  description: string | null
}>

export function ItemDetailSheet({
  itemId,
  open,
  onOpenChange,
  onSelectItem,
}: {
  itemId: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectItem: (itemId: number) => void
}) {
  const queryClient = useQueryClient()

  const itemQuery = useQuery({
    queryKey: ["item", itemId],
    queryFn: () => getItem(itemId as number),
    enabled: open && itemId !== null,
  })

  const runsQuery = useQuery({
    queryKey: ["item-runs", itemId],
    queryFn: () => fetchItemRuns(itemId as number),
    enabled: open && itemId !== null,
  })

  const tagsQuery = useQuery({
    queryKey: ["tags"],
    queryFn: listTags,
    enabled: open,
  })

  const allItemsQuery = useQuery({
    queryKey: ["items", "workbench", { limit: 100 }],
    queryFn: () => listItems({ limit: 100 }),
    enabled: open,
  })

  const changelogQuery = useQuery({
    queryKey: ["item-changelog", itemId],
    queryFn: () => fetchItemChangelog(itemId as number),
    enabled: open && itemId !== null,
  })

  const childrenQuery = useQuery({
    queryKey: ["item-children", itemId],
    queryFn: () => fetchItemChildren(itemId as number),
    enabled: open && itemId !== null,
  })

  const patchItemMutation = useMutation({
    mutationFn: (patch: ItemPatch) => updateItem(itemId as number, patch),
    onSuccess: async () => {
      await invalidateItemScope(queryClient, itemId as number)
    },
  })

  const addTagMutation = useMutation({
    mutationFn: (tagId: number) => addItemTag(itemId as number, { tag_id: tagId }),
    onSuccess: async () => {
      await invalidateItemScope(queryClient, itemId as number)
      await queryClient.invalidateQueries({ queryKey: ["tags"] })
    },
  })

  const removeTagMutation = useMutation({
    mutationFn: (tagId: number) => removeItemTag(itemId as number, tagId),
    onSuccess: async () => {
      await invalidateItemScope(queryClient, itemId as number)
    },
  })

  const addDependencyMutation = useMutation({
    mutationFn: (dependsOnId: number) => addDependency(itemId as number, dependsOnId),
    onSuccess: async () => {
      await invalidateItemScope(queryClient, itemId as number)
    },
  })

  const removeDependencyMutation = useMutation({
    mutationFn: (dependsOnId: number) => removeDependency(itemId as number, dependsOnId),
    onSuccess: async () => {
      await invalidateItemScope(queryClient, itemId as number)
    },
  })

  const createRunMutation = useMutation({
    mutationFn: (payload: {
      agent: string
      branch?: string
      status?: AgentRun["status"]
      pr_url?: string
      ci_status?: AgentRun["ci_status"]
      notes?: string
    }) => createRun(itemId as number, payload),
    onSuccess: async () => {
      await invalidateItemScope(queryClient, itemId as number)
      await queryClient.invalidateQueries({ queryKey: ["item-runs", itemId] })
    },
  })

  const updateRunMutation = useMutation({
    mutationFn: ({
      runId,
      patch,
    }: {
      runId: number
      patch: Record<string, unknown>
    }) => updateRun(runId, patch),
    onSuccess: async () => {
      await invalidateItemScope(queryClient, itemId as number)
      await queryClient.invalidateQueries({ queryKey: ["item-runs", itemId] })
    },
  })

  const item = itemQuery.data
  const runs = runsQuery.data ?? item?.recent_runs ?? []
  const tags = tagsQuery.data ?? []
  const allItems = allItemsQuery.data?.data ?? []
  const changelog = changelogQuery.data ?? []
  const children = childrenQuery.data ?? []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-3xl overflow-y-auto border-white/10 bg-[#050b16] text-slate-100 sm:max-w-3xl"
      >
        <SheetHeader className="border-b border-white/10 pb-5">
          <p className="text-xs uppercase tracking-[0.35em] text-sky-300/70">
            Item Detail
          </p>
          <SheetTitle className="sr-only">Item detail panel</SheetTitle>
          <SheetDescription className="sr-only">
            Edit the selected item, manage runs, dependencies, and changelog data.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {itemQuery.isPending ? (
            <p className="text-sm text-slate-400">Loading item details...</p>
          ) : null}
          {itemQuery.isError ? (
            <ErrorBanner message={itemQuery.error.message} />
          ) : null}

          {item ? (
            <>
              <HeaderEditor
                key={`header-${item.id}-${item.updated_at}`}
                item={item}
                saving={patchItemMutation.isPending}
                onSave={(patch) => patchItemMutation.mutateAsync(patch)}
              />

              <DescriptionEditor
                key={`description-${item.id}-${item.updated_at}`}
                item={item}
                saving={patchItemMutation.isPending}
                onSave={(description) => patchItemMutation.mutateAsync({ description })}
              />

              <TagsSection
                item={item}
                allTags={tags}
                isAdding={addTagMutation.isPending}
                isRemoving={removeTagMutation.isPending}
                onAddTag={(tagId) => addTagMutation.mutateAsync(tagId)}
                onRemoveTag={(tagId) => removeTagMutation.mutateAsync(tagId)}
              />

              <RunsSection
                key={`runs-${item.id}`}
                runs={runs}
                isCreating={createRunMutation.isPending}
                isUpdating={updateRunMutation.isPending}
                onCreateRun={(payload) => createRunMutation.mutateAsync(payload)}
                onUpdateRun={(runId, patch) =>
                  updateRunMutation.mutateAsync({ runId, patch })
                }
              />

              <DependenciesSection
                item={item}
                allItems={allItems}
                isAdding={addDependencyMutation.isPending}
                isRemoving={removeDependencyMutation.isPending}
                onAddDependency={(dependsOnId) =>
                  addDependencyMutation.mutateAsync(dependsOnId)
                }
                onRemoveDependency={(dependsOnId) =>
                  removeDependencyMutation.mutateAsync(dependsOnId)
                }
                onSelectItem={onSelectItem}
              />

              <ChangelogSection entries={changelog} loading={changelogQuery.isPending} />

              <ChildrenSection items={children} onSelectItem={onSelectItem} />
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function HeaderEditor({
  item,
  saving,
  onSave,
}: {
  item: DetailedItem
  saving: boolean
  onSave: (patch: ItemPatch) => Promise<unknown>
}) {
  const [title, setTitle] = useState(item.title)

  async function commitTitle() {
    const nextTitle = title.trim()

    if (!nextTitle || nextTitle === item.title) {
      setTitle(item.title)
      return
    }

    await onSave({ title: nextTitle })
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex-1 space-y-3">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => void commitTitle()}
            className="h-auto border-white/10 bg-white/[0.04] px-0 py-0 text-3xl font-semibold tracking-tight text-white shadow-none outline-none focus-visible:ring-0"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={item.status}
              onValueChange={(value) => void onSave({ status: value as ItemStatus })}
            >
              <SelectTrigger className="w-[14rem] border-white/10 bg-white/[0.05] text-slate-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-[#09111d] text-slate-100">
                {ALL_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {formatStatusLabel(status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={item.priority}
              onValueChange={(value) => void onSave({ priority: value as ItemPriority })}
            >
              <SelectTrigger className="w-[14rem] border-white/10 bg-white/[0.05] text-slate-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-[#09111d] text-slate-100">
                {ALL_PRIORITIES.map((priority) => (
                  <SelectItem key={priority} value={priority}>
                    {formatPriorityLabel(priority)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {item.blocked ? (
              <Badge className="border-amber-400/30 bg-amber-400/10 text-amber-100">
                <LockKeyhole className="size-3.5" />
                Blocked
              </Badge>
            ) : null}
          </div>
        </div>

        {saving ? (
          <div className="inline-flex items-center gap-2 text-sm text-slate-400">
            <LoaderCircle className="size-4 animate-spin" />
            Saving
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Badge className={cn("text-xs", getStatusBadgeClassName(item.status))}>
          {formatStatusLabel(item.status)}
        </Badge>
        <Badge className={cn("text-xs", getPriorityBadgeClassName(item.priority))}>
          {formatPriorityLabel(item.priority)}
        </Badge>
      </div>
    </section>
  )
}

function DescriptionEditor({
  item,
  saving,
  onSave,
}: {
  item: DetailedItem
  saving: boolean
  onSave: (description: string | null) => Promise<unknown>
}) {
  const [draft, setDraft] = useState(item.description ?? "")
  const [mode, setMode] = useState<"edit" | "preview">("edit")

  async function commitDescription() {
    const nextValue = draft.trim()
    const normalized = nextValue.length > 0 ? draft : null

    if ((item.description ?? null) === normalized) {
      return
    }

    await onSave(normalized)
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-100">Description</p>
          <p className="mt-1 text-sm text-slate-500">
            Save with blur or use the save button.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={mode === "edit" ? "secondary" : "ghost"}
            className="border-white/10 bg-white/[0.05] text-slate-100 hover:bg-white/[0.08]"
            onClick={() => setMode("edit")}
          >
            Edit
          </Button>
          <Button
            variant={mode === "preview" ? "secondary" : "ghost"}
            className="border-white/10 bg-white/[0.05] text-slate-100 hover:bg-white/[0.08]"
            onClick={() => setMode("preview")}
          >
            Preview
          </Button>
        </div>
      </div>

      {mode === "edit" ? (
        <div className="mt-4 space-y-3">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => void commitDescription()}
            className="min-h-[180px] border-white/10 bg-white/[0.04] text-slate-100"
          />
          <div className="flex justify-end">
            <Button
              className="border-white/10 bg-white/[0.08] text-slate-100 hover:bg-white/[0.12]"
              disabled={saving}
              onClick={() => void commitDescription()}
            >
              {saving ? <LoaderCircle className="size-4 animate-spin" /> : null}
              Save Description
            </Button>
          </div>
        </div>
      ) : (
        <div className="prose prose-invert mt-4 max-w-none rounded-3xl border border-white/10 bg-white/[0.02] p-5 prose-headings:text-white prose-p:text-slate-300 prose-strong:text-white prose-code:text-sky-200">
          {draft.trim().length > 0 ? (
            <ReactMarkdown>{draft}</ReactMarkdown>
          ) : (
            <p className="text-slate-500">No description yet.</p>
          )}
        </div>
      )}
    </section>
  )
}

function TagsSection({
  item,
  allTags,
  isAdding,
  isRemoving,
  onAddTag,
  onRemoveTag,
}: {
  item: DetailedItem
  allTags: Tag[]
  isAdding: boolean
  isRemoving: boolean
  onAddTag: (tagId: number) => Promise<unknown>
  onRemoveTag: (tagId: number) => Promise<unknown>
}) {
  const availableTags = allTags.filter(
    (tag) => !item.tags.some((assignedTag) => assignedTag.id === tag.id),
  )

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-100">Tags</p>
          <p className="mt-1 text-sm text-slate-500">
            Remove current tags or add another from the shared tag list.
          </p>
        </div>
        <EntityPicker
          buttonLabel={isAdding ? "Adding..." : "Add tag"}
          disabled={isAdding || availableTags.length === 0}
          items={availableTags}
          getKey={(tag) => tag.id}
          getLabel={(tag) => tag.name}
          getDescription={(tag) => tag.color ?? "No custom color"}
          onSelect={(tag) => void onAddTag(tag.id)}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {item.tags.length > 0 ? (
          item.tags.map((tag) => (
            <Badge
              key={tag.id}
              className="gap-2 border-white/10 bg-white/[0.05] text-slate-100"
            >
              {tag.name}
              <button
                type="button"
                className="rounded-full text-slate-400 transition hover:text-white"
                onClick={() => void onRemoveTag(tag.id)}
                disabled={isRemoving}
                aria-label={`Remove ${tag.name} tag`}
              >
                <X className="size-3.5" />
              </button>
            </Badge>
          ))
        ) : (
          <p className="text-sm text-slate-500">No tags assigned.</p>
        )}
      </div>
    </section>
  )
}

function RunsSection({
  runs,
  isCreating,
  isUpdating,
  onCreateRun,
  onUpdateRun,
}: {
  runs: AgentRun[]
  isCreating: boolean
  isUpdating: boolean
  onCreateRun: (payload: {
    agent: string
    branch?: string
    status?: AgentRun["status"]
    pr_url?: string
    ci_status?: AgentRun["ci_status"]
    notes?: string
  }) => Promise<unknown>
  onUpdateRun: (runId: number, patch: Record<string, unknown>) => Promise<unknown>
}) {
  const [agent, setAgent] = useState("codex")
  const [branch, setBranch] = useState("")
  const [status, setStatus] = useState<AgentRun["status"]>("running")
  const [prUrl, setPrUrl] = useState("")
  const [ciStatus, setCiStatus] = useState<AgentRun["ci_status"]>("unknown")
  const [notes, setNotes] = useState("")

  async function handleCreateRun() {
    if (!agent.trim()) {
      return
    }

    await onCreateRun({
      agent: agent.trim(),
      branch: branch.trim() || undefined,
      status,
      pr_url: prUrl.trim() || undefined,
      ci_status: ciStatus,
      notes: notes.trim() || undefined,
    })

    setBranch("")
    setStatus("running")
    setPrUrl("")
    setCiStatus("unknown")
    setNotes("")
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-100">Agent Runs</p>
          <p className="mt-1 text-sm text-slate-500">
            Add a run and update its status inline.
          </p>
        </div>
        {isUpdating ? (
          <div className="inline-flex items-center gap-2 text-sm text-slate-400">
            <LoaderCircle className="size-4 animate-spin" />
            Updating run
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 rounded-3xl border border-white/10 bg-white/[0.02] p-4 md:grid-cols-2">
        <Input
          value={agent}
          onChange={(event) => setAgent(event.target.value)}
          placeholder="Agent name"
          className="border-white/10 bg-white/[0.04] text-slate-100"
        />
        <Input
          value={branch}
          onChange={(event) => setBranch(event.target.value)}
          placeholder="Branch name"
          className="border-white/10 bg-white/[0.04] font-mono text-slate-100"
        />

        <Select value={status} onValueChange={(value) => setStatus(value as AgentRun["status"])}>
          <SelectTrigger className="border-white/10 bg-white/[0.04] text-slate-100">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-white/10 bg-[#09111d] text-slate-100">
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="succeeded">Succeeded</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={ciStatus}
          onValueChange={(value) => setCiStatus(value as AgentRun["ci_status"])}
        >
          <SelectTrigger className="border-white/10 bg-white/[0.04] text-slate-100">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-white/10 bg-[#09111d] text-slate-100">
            <SelectItem value="unknown">Unknown CI</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="passed">Passed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>

        <Input
          value={prUrl}
          onChange={(event) => setPrUrl(event.target.value)}
          placeholder="PR URL"
          className="border-white/10 bg-white/[0.04] text-slate-100 md:col-span-2"
        />
        <Textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Notes"
          className="min-h-[110px] border-white/10 bg-white/[0.04] text-slate-100 md:col-span-2"
        />

        <div className="md:col-span-2 md:flex md:justify-end">
          <Button
            className="border-white/10 bg-white/[0.08] text-slate-100 hover:bg-white/[0.12]"
            disabled={isCreating || !agent.trim()}
            onClick={() => void handleCreateRun()}
          >
            {isCreating ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Add Run
          </Button>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {runs.length > 0 ? (
          runs.map((run) => (
            <div
              key={run.id}
              className="rounded-3xl border border-white/10 bg-white/[0.02] p-4"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="border-white/10 bg-white/[0.05] text-slate-100">
                      {run.agent}
                    </Badge>
                    <Badge className={cn("text-xs", getCIStatusBadgeClassName(run.ci_status))}>
                      CI {run.ci_status}
                    </Badge>
                    <span className="text-sm text-slate-500">
                      {describeRunDuration(run)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
                    {run.branch ? <code className="rounded bg-white/[0.04] px-2 py-1">{run.branch}</code> : null}
                    {run.pr_url ? (
                      <a
                        href={run.pr_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200"
                      >
                        PR link
                        <ExternalLink className="size-3.5" />
                      </a>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Select
                    value={run.status}
                    onValueChange={(value) =>
                      void onUpdateRun(run.id, { status: value })
                    }
                  >
                    <SelectTrigger className="w-[12rem] border-white/10 bg-white/[0.04] text-slate-100">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-white/10 bg-[#09111d] text-slate-100">
                      <SelectItem value="running">Running</SelectItem>
                      <SelectItem value="succeeded">Succeeded</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={run.ci_status}
                    onValueChange={(value) =>
                      void onUpdateRun(run.id, { ci_status: value })
                    }
                  >
                    <SelectTrigger className="w-[12rem] border-white/10 bg-white/[0.04] text-slate-100">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-white/10 bg-[#09111d] text-slate-100">
                      <SelectItem value="unknown">Unknown CI</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="passed">Passed</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <details className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-200">
                  Notes
                </summary>
                <p className="mt-3 text-sm leading-7 text-slate-400">
                  {run.notes ?? "No notes provided."}
                </p>
              </details>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">No agent runs recorded yet.</p>
        )}
      </div>
    </section>
  )
}

function DependenciesSection({
  item,
  allItems,
  isAdding,
  isRemoving,
  onAddDependency,
  onRemoveDependency,
  onSelectItem,
}: {
  item: DetailedItem
  allItems: Item[]
  isAdding: boolean
  isRemoving: boolean
  onAddDependency: (dependsOnId: number) => Promise<unknown>
  onRemoveDependency: (dependsOnId: number) => Promise<unknown>
  onSelectItem: (itemId: number) => void
}) {
  const availableDependencies = allItems.filter(
    (candidate) =>
      candidate.id !== item.id &&
      !item.dependencies.some((dependency) => dependency.id === candidate.id),
  )

  return (
    <>
      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-100">Dependencies</p>
            <p className="mt-1 text-sm text-slate-500">
              Manage the items this one depends on.
            </p>
          </div>
          <EntityPicker
            buttonLabel={isAdding ? "Adding..." : "Add dependency"}
            disabled={isAdding || availableDependencies.length === 0}
            items={availableDependencies}
            getKey={(candidate) => candidate.id}
            getLabel={(candidate) => candidate.title}
            getDescription={(candidate) => formatStatusLabel(candidate.status)}
            onSelect={(candidate) => void onAddDependency(candidate.id)}
          />
        </div>

        <div className="mt-4 space-y-3">
          {item.dependencies.length > 0 ? (
            item.dependencies.map((dependency) => (
              <LinkedItemRow
                key={dependency.id}
                item={dependency}
                actionLabel="Remove dependency"
                actionIcon={<Unlink2 className="size-4" />}
                onAction={() => void onRemoveDependency(dependency.id)}
                actionDisabled={isRemoving}
                onSelectItem={onSelectItem}
              />
            ))
          ) : (
            <p className="text-sm text-slate-500">No dependencies.</p>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
        <p className="text-sm font-medium text-slate-100">Dependents</p>
        <p className="mt-1 text-sm text-slate-500">
          Other items that currently depend on this item.
        </p>
        <div className="mt-4 space-y-3">
          {item.dependents.length > 0 ? (
            item.dependents.map((dependent) => (
              <LinkedItemRow
                key={dependent.id}
                item={dependent}
                onSelectItem={onSelectItem}
              />
            ))
          ) : (
            <p className="text-sm text-slate-500">No dependents.</p>
          )}
        </div>
      </section>
    </>
  )
}

function ChangelogSection({
  entries,
  loading,
}: {
  entries: ChangelogEntry[]
  loading: boolean
}) {
  return (
    <details className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <summary className="cursor-pointer text-sm font-medium text-slate-100">
        Changelog
      </summary>
      <div className="mt-4 space-y-3">
        {loading ? <p className="text-sm text-slate-500">Loading changelog...</p> : null}
        {!loading && entries.length === 0 ? (
          <p className="text-sm text-slate-500">No changelog entries yet.</p>
        ) : null}
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="rounded-2xl border border-white/10 bg-white/[0.02] p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-white/10 bg-white/[0.05] text-slate-100">
                {entry.field_name}
              </Badge>
              <span className="text-xs text-slate-500">
                {entry.changed_by ?? "system"} · {new Date(entry.changed_at).toLocaleString()}
              </span>
            </div>
            <p className="mt-3 text-sm text-slate-300">
              <span className="text-slate-500">{entry.old_value ?? "∅"}</span> →{" "}
              <span>{entry.new_value ?? "∅"}</span>
            </p>
          </div>
        ))}
      </div>
    </details>
  )
}

function ChildrenSection({
  items,
  onSelectItem,
}: {
  items: Item[]
  onSelectItem: (itemId: number) => void
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <p className="text-sm font-medium text-slate-100">Children</p>
      <p className="mt-1 text-sm text-slate-500">
        Child items inherit the same sheet and open in place.
      </p>
      <div className="mt-4 space-y-3">
        {items.length > 0 ? (
          items.map((child) => (
            <LinkedItemRow key={child.id} item={child} onSelectItem={onSelectItem} />
          ))
        ) : (
          <p className="text-sm text-slate-500">No child items.</p>
        )}
      </div>
    </section>
  )
}

function LinkedItemRow({
  item,
  onAction,
  actionIcon,
  actionLabel,
  actionDisabled,
  onSelectItem,
}: {
  item: Item
  onAction?: () => void
  actionIcon?: React.ReactNode
  actionLabel?: string
  actionDisabled?: boolean
  onSelectItem: (itemId: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
      <button
        type="button"
        className="flex-1 text-left"
        onClick={() => onSelectItem(item.id)}
      >
        <p className="font-medium text-slate-100">{item.title}</p>
        <div className="mt-2 flex items-center gap-2">
          <Badge className={cn("text-xs", getStatusBadgeClassName(item.status))}>
            {formatStatusLabel(item.status)}
          </Badge>
          <span className="font-mono text-xs text-slate-500">#{item.id}</span>
        </div>
      </button>

      {onAction ? (
        <Button
          variant="ghost"
          className="border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
          disabled={actionDisabled}
          onClick={onAction}
          aria-label={actionLabel}
        >
          {actionIcon}
        </Button>
      ) : null}
    </div>
  )
}

function EntityPicker<T>({
  buttonLabel,
  disabled,
  items,
  getKey,
  getLabel,
  getDescription,
  onSelect,
}: {
  buttonLabel: string
  disabled: boolean
  items: T[]
  getKey: (item: T) => number
  getLabel: (item: T) => string
  getDescription: (item: T) => string
  onSelect: (item: T) => void
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="border-white/10 bg-white/[0.05] text-slate-100 hover:bg-white/[0.08]"
          disabled={disabled}
        >
          <Plus className="size-4" />
          {buttonLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[26rem] border-white/10 bg-[#09111d] p-0 text-slate-100"
      >
        <Command className="bg-transparent text-slate-100">
          <CommandInput placeholder="Search..." />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={getKey(item)}
                  value={getLabel(item)}
                  onSelect={() => onSelect(item)}
                >
                  <Check className="size-4 opacity-0" />
                  <div className="flex flex-col">
                    <span>{getLabel(item)}</span>
                    <span className="text-xs text-slate-500">{getDescription(item)}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function describeRunDuration(run: AgentRun) {
  const start = new Date(run.started_at)
  const end = run.completed_at ? new Date(run.completed_at) : new Date()
  const prefix = run.completed_at ? "" : "running for "

  return `${prefix}${formatDistanceStrict(end, start)}`
}

async function invalidateItemScope(queryClient: ReturnType<typeof useQueryClient>, itemId: number) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["item", itemId] }),
    queryClient.invalidateQueries({ queryKey: ["items"] }),
    queryClient.invalidateQueries({ queryKey: ["item-runs", itemId] }),
    queryClient.invalidateQueries({ queryKey: ["item-changelog", itemId] }),
    queryClient.invalidateQueries({ queryKey: ["item-children", itemId] }),
  ])
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
      {message}
    </div>
  )
}
