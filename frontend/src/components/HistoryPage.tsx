import { useState, useEffect } from "react"
import axios from "axios"
import { format } from "date-fns"
import { CheckCircle2, XCircle } from "lucide-react"

export function HistoryPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get("http://localhost:8000/api/history").then(res => {
      setLogs(res.data)
      setLoading(false)
    }).catch(e => {
      console.error(e)
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="p-8 text-zinc-400">Loading history...</div>

  return (
    <div className="max-w-4xl mx-auto p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-[#12141a] rounded-2xl border border-white/5 shadow-xl overflow-hidden">
        <div className="px-6 py-5 border-b border-white/5">
          <h3 className="text-lg font-bold text-white">Scraper Run History</h3>
          <p className="text-sm text-zinc-400">Logs from background cron executions</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-zinc-400 bg-black/20 uppercase">
              <tr>
                <th className="px-6 py-4 font-medium">Timestamp</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Jobs Found</th>
                <th className="px-6 py-4 font-medium">Error Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-zinc-500">No logs found yet. Scraper hasn't run in the background.</td>
                </tr>
              ) : logs.map((log) => (
                <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 text-zinc-300 whitespace-nowrap">
                    {format(new Date(log.timestamp), "MMM d, yyyy HH:mm:ss")}
                  </td>
                  <td className="px-6 py-4">
                    {log.status === "SUCCESS" ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Success
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
                  <td className="px-6 py-4 text-zinc-500 max-w-xs truncate">
                    {log.error_message || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
