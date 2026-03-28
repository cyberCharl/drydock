"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"

export type ConnectionStatus = "connected" | "reconnecting" | "disconnected"

const MAX_BACKOFF = 30_000
const BASE_BACKOFF = 1_000

export function useWebSocket() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<ConnectionStatus>("disconnected")

  useEffect(() => {
    let socket: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let retries = 0
    let disposed = false

    const invalidateAll = () => {
      void queryClient.invalidateQueries({ queryKey: ["items"] })
      void queryClient.invalidateQueries({ queryKey: ["tags"] })
    }

    const invalidateItemScope = (itemId: number) => {
      void queryClient.invalidateQueries({ queryKey: ["item", itemId] })
      void queryClient.invalidateQueries({ queryKey: ["item-runs", itemId] })
      void queryClient.invalidateQueries({ queryKey: ["item-changelog", itemId] })
      void queryClient.invalidateQueries({ queryKey: ["item-children", itemId] })
    }

    const handleMessage = (raw: string) => {
      try {
        const message = JSON.parse(raw) as {
          type?: string
          data?: Record<string, unknown>
        }

        if (!message.type) {
          invalidateAll()
          return
        }

        if (message.type.startsWith("tag.")) {
          void queryClient.invalidateQueries({ queryKey: ["tags"] })
        }

        void queryClient.invalidateQueries({ queryKey: ["items"] })

        const relatedItemIds = new Set<number>()

        if (
          message.type.startsWith("item.") &&
          typeof message.data?.id === "number"
        ) {
          relatedItemIds.add(message.data.id)
        }

        if (typeof message.data?.item_id === "number") {
          relatedItemIds.add(message.data.item_id)
        }

        if (typeof message.data?.depends_on_id === "number") {
          relatedItemIds.add(message.data.depends_on_id)
        }

        for (const itemId of relatedItemIds) {
          invalidateItemScope(itemId)
        }
      } catch {
        invalidateAll()
      }
    }

    const resolveWebSocketUrl = () => {
      if (typeof window === "undefined") {
        return ""
      }

      return process.env.NEXT_PUBLIC_WS_URL ?? `ws://${window.location.hostname}:3000/ws`
    }

    const connect = () => {
      if (disposed) {
        return
      }

      const wsUrl = resolveWebSocketUrl()
      if (!wsUrl) {
        return
      }

      socket = new WebSocket(wsUrl)

      socket.onopen = () => {
        retries = 0
        setStatus("connected")
      }

      socket.onmessage = (event) => {
        handleMessage(String(event.data))
      }

      socket.onclose = () => {
        socket = null

        if (disposed) {
          return
        }

        setStatus("reconnecting")
        const delay = Math.min(BASE_BACKOFF * 2 ** retries, MAX_BACKOFF)
        retries += 1
        reconnectTimer = setTimeout(() => {
          connect()
        }, delay)
      }

      socket.onerror = () => {
        socket?.close()
      }
    }

    connect()

    return () => {
      disposed = true

      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
      }

      socket?.close()
    }
  }, [queryClient])

  return { status }
}
