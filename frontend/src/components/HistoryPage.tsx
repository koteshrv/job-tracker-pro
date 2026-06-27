import { useState, useEffect, Fragment } from "react"
import { api } from "@/lib/api"
import { formatISTDateTime } from "@/lib/datetime"
import { Skeleton } from "@/components/ui/skeleton"
import { CheckCircle2, XCircle, ChevronDown, RefreshCw, Clock, Hand, Loader2 } from "lucide-react"

export function HistoryPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)

  const fetchLogs = async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const res = await api.get("/api/history")
      setLogs(res.data)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
    if (!silent) setRefreshing(false)
  }

  useEffect(() => {
    fetchLogs()
    // Poll so manual/cron runs (and their RUNNING -> SUCCESS transition) appear live.
    const interval = setInterval(() => fetchLogs(true), 4000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="bg-[#12141a] rounded-2xl border border-white/5 shadow-xl p-6 space-y-4">
        <Skeleton className="h-6 w-48" />
        {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-[#12141a] rounded-2xl border border-white/5 shadow-xl overflow-hidden">
        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">Scraper Run History</h3>
            <p className="text-sm text-zinc-400">Logs from background cron executions</p>
          </div>
          <button
            onClick={() => fetchLogs()}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold bg-zinc-800/50 text-zinc-300 border border-white/5 hover:bg-zinc-800 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-zinc-400 bg-black/20 uppercase">
              <tr>
                <th className="px-6 py-4 font-medium">Timestamp</th>
                <th className="px-6 py-4 font-medium">Trigger</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Jobs Found</th>
                <th className="px-6 py-4 font-medium">Error Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-zinc-500">No logs found yet. Run the scraper from Settings or wait for the cron schedule.</td>
                </tr>
              ) : logs.map((log) => {
                const hasError = !!log.error_message
                const isOpen = expanded === log.id
                return (
                <Fragment key={log.id}>
                <tr
                  onClick={() => hasError && setExpanded(isOpen ? null : log.id)}
                  className={`hover:bg-white/[0.02] transition-colors ${hasError ? "cursor-pointer" : ""}`}
                >
                  <td className="px-6 py-4 text-zinc-300 whitespace-nowrap">
                    {formatISTDateTime(log.timestamp)}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                      log.trigger_source === "CRON"
                        ? "bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
                        : "bg-blue-500/10 text-blue-300 border border-blue-500/20"
                    }`}>
                      {log.trigger_source === "CRON" ? <Clock className="w-3.5 h-3.5" /> : <Hand className="w-3.5 h-3.5" />}
                      {log.trigger_source === "CRON" ? "Cron" : "Manual"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {log.status === "SUCCESS" ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Success
                      </span>
                    ) : log.status === "RUNNING" ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Running
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                        <XCircle className="w-3.5 h-3.5" />
                        Failed
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-zinc-300">
                    <span className="font-semibold text-white">{log.jobs_found}</span> jobs
                  </td>
                  <td className="px-6 py-4 text-zinc-500 max-w-xs">
                    {hasError ? (
                      <span className="flex items-center gap-1.5">
                        <span className="truncate">{log.error_message}</span>
                        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </span>
                    ) : "-"}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="bg-black/40">
                    <td colSpan={5} className="px-6 py-4">
                      <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wider font-semibold">Full error detail</p>
                      <pre className="text-xs text-red-300 bg-red-500/5 border border-red-500/20 rounded-lg p-4 whitespace-pre-wrap break-words overflow-x-auto">
                        {log.error_message}
                      </pre>
                    </td>
                  </tr>
                )}
                </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
