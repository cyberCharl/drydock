"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"

export type ConnectionStatus = "connected" | "reconnecting" | "disconnected"

const MAX_BACKOFF = 30_000
const BASE_BACKOFF = 1_000

export function useWebSocket() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<ConnectionStatus>("disconnected")
  const wsRef = useRef<WebSocket | null>(null)
  const retriesRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const invalidateAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["items"] })
    void queryClient.invalidateQueries({ queryKey: ["tags"] })
  }, [queryClient])

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          type: string
          data: Record<string, unknown>
        }

        switch (msg.type) {
          case "item.created":
          case "item.updated":
            void queryClient.invalidateQueries({ queryKey: ["items"] })
            if (msg.data?.id) {
              void queryClient.invalidateQueries({
                queryKey: ["item", msg.data.id],
              })
              void queryClient.invalidateQueries({
                queryKey: ["item-changelog", msg.data.id],
              })
            }
            if (msg.data?.item_id) {
              void queryClient.invalidateQueries({
                queryKey: ["item", msg.data.item_id],
              })
            }
            break

          case "run.created":
          case "run.updated":
            if (msg.data?.item_id) {
              void queryClient.invalidateQueries({
                queryKey: ["item", msg.data.item_id],
              })
              void queryClient.invalidateQueries({
                queryKey: ["item-runs", msg.data.item_id],
              })
            }
            void queryClient.invalidateQueries({ queryKey: ["items"] })
            break

          case "dependency.created":
          case "dependency.removed":
            if (msg.data?.item_id) {
              void queryClient.invalidateQueries({
                queryKey: ["item", msg.data.item_id],
              })
            }
            if (msg.data?.depends_on_id) {
              void queryClient.invalidateQueries({
                queryKey: ["item", msg.data.depends_on_id],
              })
            }
            void queryClient.invalidateQueries({ queryKey: ["items"] })
            break

          default:
            invalidateAll()
        }
      } catch {
        invalidateAll()
      }
    },
    [queryClient, invalidateAll],
  )

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const wsUrl =
      typeof window !== "undefined"
        ? (process.env.NEXT_PUBLIC_WS_URL ?? `ws://${window.location.hostname}:3000/ws`)
        : ""

    if (!wsUrl) return

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setStatus("connected")
        retriesRef.current = 0
      }

      ws.onmessage = handleMessage

      ws.onclose = () => {
        wsRef.current = null
        setStatus("reconnecting")
        const delay = Math.min(
          BASE_BACKOFF * 2 ** retriesRef.current,
          MAX_BACKOFF,
        )
        retriesRef.current++
        timerRef.current = setTimeout(connect, delay)
      }

      ws.onerror = () => {
        ws.close()
      }
    } catch {
      setStatus("disconnected")
    }
  }, [handleMessage])

  useEffect(() => {
    connect()

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  return { status }
}
