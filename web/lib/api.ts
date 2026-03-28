import type {
  CreateItemInput,
  DetailedItem,
  ItemListResponse,
  ListItem,
} from "@/lib/types"

const API_PREFIX = "/api"

type QueryValue = string | number | boolean | null | undefined
type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}) {
  const headers = new Headers(options.headers)
  const method = options.method ?? "GET"

  if (options.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json")
  }

  if (method !== "GET" && method !== "HEAD" && !headers.has("x-drydock-user")) {
    headers.set("x-drydock-user", "charl")
  }

  const response = await fetch(`${API_PREFIX}${path}`, {
    ...options,
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  const payload = (await response.json().catch(() => null)) as
    | { data?: T; error?: { message?: string } }
    | null

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `Request failed with status ${response.status}.`)
  }

  return payload?.data as T
}

export function buildQuery(params: Record<string, QueryValue>) {
  const searchParams = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue
    }

    searchParams.set(key, String(value))
  }

  const query = searchParams.toString()
  return query ? `?${query}` : ""
}

export async function listItems(params: Record<string, QueryValue>) {
  const response = await fetch(`${API_PREFIX}/items${buildQuery(params)}`)
  const payload = (await response.json()) as ItemListResponse

  if (!response.ok) {
    throw new Error("Unable to load items.")
  }

  return payload
}

export function getItem(itemId: number) {
  return apiRequest<DetailedItem>(`/items/${itemId}`)
}

export function createItem(input: CreateItemInput) {
  return apiRequest<ListItem>("/items", {
    method: "POST",
    body: input,
  })
}
