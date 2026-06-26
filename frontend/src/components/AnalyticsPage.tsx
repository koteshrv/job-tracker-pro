import { useState, useEffect } from "react"
import axios from "axios"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts"

export function AnalyticsPage() {
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get("http://localhost:8000/api/jobs?limit=5000").then(res => {
      setJobs(res.data)
      setLoading(false)
    }).catch(e => {
      console.error(e)
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="p-8 text-zinc-400">Loading analytics...</div>

  // Calculate stats
  const statusCounts = jobs.reduce((acc: any, job: any) => {
    acc[job.status] = (acc[job.status] || 0) + 1
    return acc
  }, {})

  const pieData = [
    { name: "New Matches", value: statusCounts["NEW"] || 0, color: "#3b82f6" },
    { name: "Applied", value: statusCounts["APPLIED"] || 0, color: "#a855f7" },
    { name: "Interviewing", value: statusCounts["INTERVIEWING"] || 0, color: "#eab308" },
    { name: "Rejected/Ignored", value: (statusCounts["REJECTED"] || 0) + (statusCounts["IGNORED"] || 0), color: "#ef4444" },
  ].filter(d => d.value > 0)

  // Top companies
  const companyCounts = jobs.reduce((acc: any, job: any) => {
    acc[job.company] = (acc[job.company] || 0) + 1
    return acc
  }, {})
  
  const barData = Object.entries(companyCounts)
    .map(([name, count]) => ({ name, jobs: count }))
    .sort((a, b) => (b.jobs as number) - (a.jobs as number))
    .slice(0, 10)

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#12141a] rounded-2xl border border-white/5 p-6 shadow-xl flex flex-col items-center justify-center">
          <p className="text-zinc-400 text-sm font-medium mb-1">Total Jobs Scraped</p>
          <p className="text-4xl font-bold text-white">{jobs.length}</p>
        </div>
        <div className="bg-[#12141a] rounded-2xl border border-white/5 p-6 shadow-xl flex flex-col items-center justify-center">
          <p className="text-zinc-400 text-sm font-medium mb-1">Application Rate</p>
          <p className="text-4xl font-bold text-purple-400">
            {jobs.length > 0 ? Math.round(((statusCounts["APPLIED"] || 0) / jobs.length) * 100) : 0}%
          </p>
        </div>
        <div className="bg-[#12141a] rounded-2xl border border-white/5 p-6 shadow-xl flex flex-col items-center justify-center">
          <p className="text-zinc-400 text-sm font-medium mb-1">Interview Rate</p>
          <p className="text-4xl font-bold text-yellow-400">
            {statusCounts["APPLIED"] > 0 ? Math.round(((statusCounts["INTERVIEWING"] || 0) / statusCounts["APPLIED"]) * 100) : 0}%
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-[#12141a] rounded-2xl border border-white/5 p-6 shadow-xl">
          <h3 className="text-lg font-bold text-white mb-6">Pipeline Breakdown</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={80} outerRadius={110} paddingAngle={5} dataKey="value">
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#000', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-4 mt-4">
            {pieData.map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-zinc-300">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }}></div>
                {d.name} ({d.value})
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#12141a] rounded-2xl border border-white/5 p-6 shadow-xl">
          <h3 className="text-lg font-bold text-white mb-6">Top Sourced Companies</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="name" stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
                <RechartsTooltip 
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  contentStyle={{ backgroundColor: '#000', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }}
                />
                <Bar dataKey="jobs" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

    </div>
  )
}
