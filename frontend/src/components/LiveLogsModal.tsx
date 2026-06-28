import { useEffect, useState, useRef } from "react"
import { X, Trash2, Terminal } from "lucide-react"
import { API_BASE } from "@/lib/api"

interface LiveLogsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function LiveLogsModal({ isOpen, onClose }: LiveLogsModalProps) {
  const [logs, setLogs] = useState<string[]>([])
  const ws = useRef<WebSocket | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) {
      if (ws.current) {
        ws.current.close()
        ws.current = null
      }
      return
    }

    // Clear logs when reopening
    setLogs([])

    const wsBase = API_BASE.replace(/^http/, "ws")
    const wsUrl = `${wsBase}/api/ws/logs`

    let socket: WebSocket | null = null
    let reconnectAttempts = 0
    let reconnectTimeout: NodeJS.Timeout

    const connect = () => {
      socket = new WebSocket(wsUrl)
      ws.current = socket

      socket.onopen = () => {
        reconnectAttempts = 0
      }

      socket.onmessage = (event) => {
        setLogs((prev) => {
          const newLogs = [...prev, event.data]
          if (newLogs.length > 500) {
            return newLogs.slice(newLogs.length - 500)
          }
          return newLogs
        })
      }

      socket.onclose = () => {
        if (reconnectAttempts < 5 && isOpen) {
          const delay = Math.pow(2, reconnectAttempts) * 500
          reconnectTimeout = setTimeout(() => {
            reconnectAttempts += 1
            connect()
          }, delay)
        }
      }
    }

    connect()

    return () => {
      clearTimeout(reconnectTimeout)
      if (socket) {
        socket.close()
      }
      ws.current = null
    }
  }, [isOpen])

  // Auto-scroll to bottom
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [logs])

  if (!isOpen) return null

  // Helper to colorize log levels
  const formatLogLine = (line: string, index: number) => {
    let colorClass = "text-zinc-300"
    if (line.includes("- ERROR -") || line.includes("Exception")) {
      colorClass = "text-red-400"
    } else if (line.includes("- WARNING -")) {
      colorClass = "text-yellow-400"
    } else if (line.includes("- INFO -")) {
      colorClass = "text-emerald-400"
    }

    return (
      <div key={index} className="font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap">
        <span className={colorClass}>{line}</span>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0f1115] border border-white/10 rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-[#16191f]">
          <div className="flex items-center gap-2 text-white">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold tracking-wide">Live System Logs</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLogs([])}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded transition-colors"
              title="Clear Terminal"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Terminal Window */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#0a0a0c]">
          {logs.length === 0 ? (
            <div className="text-zinc-600 text-xs font-mono italic">Waiting for log stream...</div>
          ) : (
            logs.map((line, i) => formatLogLine(line, i))
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  )
}
