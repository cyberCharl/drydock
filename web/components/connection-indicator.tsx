"use client"

import { useWebSocket, type ConnectionStatus } from "@/hooks/use-websocket"
import { cn } from "@/lib/utils"

const STATUS_CONFIG: Record<
  ConnectionStatus,
  { color: string; pulse: boolean; label: string }
> = {
  connected: { color: "bg-emerald-400", pulse: false, label: "Live" },
  reconnecting: {
    color: "bg-amber-400",
    pulse: true,
    label: "Reconnecting",
  },
  disconnected: {
    color: "bg-red-400",
    pulse: false,
    label: "Disconnected",
  },
}

export function ConnectionIndicator() {
  const { status } = useWebSocket()
  const config = STATUS_CONFIG[status]

  return (
    <div className="flex items-center gap-1.5">
      <span className="relative flex size-2">
        {config.pulse && (
          <span
            className={cn(
              "absolute inline-flex size-full animate-ping rounded-full opacity-75",
              config.color,
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            config.color,
          )}
        />
      </span>
      <span className="text-[10px] text-slate-500">{config.label}</span>
    </div>
  )
}
