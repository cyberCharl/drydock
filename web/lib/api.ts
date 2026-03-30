import type {
  Item,
  DetailedItem,
  Tag,
  AgentRun,
  ChangelogEntry,
} from "./types"

const BASE = "/api"
const ACTOR_HEADER = { "X-Drydock-User": "charl" }

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...ACTOR_HEADER,
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(
      body?.error?.message ?? `API error: ${res.status} ${res.statusText}`
    )
  }
  const json = await res.json()
  return json.data !== undefined ? json.data : json
}

// Items
export async function fetchItems(params?: Record<string, string>) {
  const qs = params ? `?${new URLSearchParams(params)}` : ""
  return request<Item[]>(`/items${qs}`)
}

export async function listItems(params?: { limit?: number; offset?: number; status?: string; priority?: string; tag?: string; sort?: string; direction?: string }) {
  const qs = new URLSearchParams()
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) qs.set(k, String(v))
    }
  }
  const qstr = qs.toString()
  const res = await fetch(`${BASE}/items${qstr ? `?${qstr}` : ""}`, {
    headers: { ...ACTOR_HEADER },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error?.message ?? `API error: ${res.status}`)
  }
  return res.json() as Promise<{ data: Item[]; total: number; limit: number; offset: number }>
}

export async function fetchItem(id: number) {
  return request<DetailedItem>(`/items/${id}`)
}

export const getItem = fetchItem

export async function createItem(data: {
  title: string
  status?: string
  priority?: string
  description?: string
  parent_id?: number
}) {
  return request<Item>("/items", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function updateItem(
  id: number,
  data: Record<string, unknown>
) {
  return request<Item>(`/items/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

export async function deleteItem(id: number) {
  return request<Item>(`/items/${id}`, { method: "DELETE" })
}

export async function fetchItemChildren(id: number) {
  return request<Item[]>(`/items/${id}/children`)
}

export async function fetchItemChangelog(id: number) {
  return request<ChangelogEntry[]>(`/items/${id}/changelog`)
}

// Tags
export async function fetchTags() {
  return request<Tag[]>("/tags")
}

export const listTags = fetchTags

export async function createTag(data: { name: string; color?: string }) {
  return request<Tag>("/tags", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function addItemTag(
  itemId: number,
  data: { tag_id?: number; tag_name?: string }
) {
  return request<unknown>(`/items/${itemId}/tags`, {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function removeItemTag(itemId: number, tagId: number) {
  return request<unknown>(`/items/${itemId}/tags/${tagId}`, {
    method: "DELETE",
  })
}

// Agent Runs
export async function fetchItemRuns(itemId: number) {
  return request<AgentRun[]>(`/items/${itemId}/runs`)
}

export async function createRun(
  itemId: number,
  data: {
    agent: string
    branch?: string
    session_id?: string
    status?: string
    pr_url?: string
    ci_status?: string
    review_status?: string
    retry_count?: number
    repo?: string
    notes?: string
  }
) {
  return request<AgentRun>(`/items/${itemId}/runs`, {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function updateRun(
  runId: number,
  data: Record<string, unknown>
) {
  return request<AgentRun>(`/runs/${runId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

export async function fetchPausedState() {
  return request<{ paused: boolean }>("/meta/paused")
}

export async function updatePausedState(paused: boolean) {
  return request<{ paused: boolean }>("/meta/paused", {
    method: "PUT",
    body: JSON.stringify({ paused }),
  })
}

// Dependencies
export async function addDependency(itemId: number, dependsOnId: number) {
  return request<unknown>(`/items/${itemId}/dependencies`, {
    method: "POST",
    body: JSON.stringify({ depends_on: dependsOnId }),
  })
}

export async function removeDependency(
  itemId: number,
  dependsOnId: number
) {
  return request<unknown>(`/items/${itemId}/dependencies/${dependsOnId}`, {
    method: "DELETE",
  })
}

export async function fetchDependencies(itemId: number) {
  return request<Item[]>(`/items/${itemId}/dependencies`)
}

export async function fetchDependents(itemId: number) {
  return request<Item[]>(`/items/${itemId}/dependents`)
}
