import { useState, useEffect } from "react"
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatISTDate } from "@/lib/datetime"
import { api } from "@/lib/api"
import { BriefcaseBusiness, Calendar, ExternalLink, ChevronDown, ChevronUp, MapPin, Eye, EyeOff, Search, Trash2, Check, X } from "lucide-react"
import { JobModal } from "./JobModal"
import { useToast } from "./Toast"
import { ConfirmDialog } from "./ConfirmDialog"

export type Job = {
  id: number
  company: string
  title: string
  url: string
  location: string | null
  status: string
  notes: string | null
  description: string | null
  cover_letter?: string
  tailored_resume?: string
  created_at: string
  applied_at?: string
}

const COLUMNS = [
  { id: "NEW", title: "New Matches", color: "from-blue-500/20 to-cyan-500/10", border: "border-blue-500/20", badge: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  { id: "APPLIED", title: "Applied", color: "from-indigo-500/20 to-purple-500/10", border: "border-indigo-500/20", badge: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" },
  { id: "INTERVIEWING", title: "Interviewing", color: "from-amber-500/20 to-orange-500/10", border: "border-amber-500/20", badge: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  { id: "REJECTED", title: "Rejected", color: "from-red-500/20 to-rose-600/10", border: "border-red-500/20", badge: "bg-red-500/20 text-red-300 border-red-500/30" },
  { id: "IGNORED", title: "Ignored", color: "from-zinc-500/20 to-zinc-600/10", border: "border-zinc-500/20", badge: "bg-zinc-800 text-zinc-400 border-zinc-700" },
  { id: "TRASH", title: "Trash", color: "from-red-950/20 to-red-900/10", border: "border-red-900/30 border-dashed", badge: "bg-red-900/20 text-red-500 border-red-900/30" }
]

const ARCHIVED_STATUSES = ["REJECTED", "IGNORED", "TRASH"]

export function KanbanBoard() {
  const { toast } = useToast()
  const [jobs, setJobs] = useState<Job[]>([])
  const [expandedCompanies, setExpandedCompanies] = useState<Record<string, boolean>>({})
  const [showArchived, setShowArchived] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [clearing, setClearing] = useState(false)
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)

  useEffect(() => {
    fetchJobs()

    const handleFocus = () => {
      fetchJobs()
    }

    window.addEventListener("focus", handleFocus)
    return () => {
      window.removeEventListener("focus", handleFocus)
    }
  }, [])

  const moveToTrash = async (jobId: number) => {
    try {
      await api.put(`/api/jobs/${jobId}`, { status: "TRASH" })
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: "TRASH" } : j))
      toast("Moved to Trash", "success")
    } catch (e) {
      toast("Failed to move to Trash", "error")
    }
  }

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const bulkSetStatus = async (status: string) => {
    const ids = selectedIds
    try {
      await api.post("/api/jobs/bulk-status", { ids, status })
      setJobs(prev => prev.map(j => ids.includes(j.id) ? { ...j, status } : j))
      setSelectedIds([])
      toast(`Moved ${ids.length} job${ids.length > 1 ? "s" : ""} to ${status}`, "success")
    } catch (e) {
      toast("Bulk update failed", "error")
    }
  }

  const bulkDelete = async () => {
    const ids = selectedIds
    setConfirmBulkDelete(false)
    try {
      await api.post("/api/jobs/bulk-delete", { ids })
      setJobs(prev => prev.filter(j => !ids.includes(j.id)))
      setSelectedIds([])
      toast(`Deleted ${ids.length} job${ids.length > 1 ? "s" : ""}`, "success")
    } catch (e) {
      toast("Bulk delete failed", "error")
    }
  }

  const handleClearAll = async () => {
    setConfirmClearOpen(false)
    setClearing(true)
    try {
      const { data } = await api.delete("/api/jobs")
      setJobs([])
      toast(`Cleared ${data.deleted} jobs`, "success")
    } catch (e) {
      toast("Failed to clear jobs", "error")
    }
    setClearing(false)
  }

  const handleDeleteJob = async (jobId: number) => {
    try {
      await api.delete(`/api/jobs/${jobId}`)
      setJobs(prev => prev.filter(j => j.id !== jobId))
      setSelectedJob(null)
      toast("Job deleted", "success")
    } catch (e) {
      toast("Failed to delete job", "error")
    }
  }
  
  const fetchJobs = async () => {
    try {
      const { data } = await api.get("/api/jobs?limit=500")
      const mapped = data.map((j: Job) => ({...j, status: j.status || 'NEW'}))
      setJobs(mapped)
    } catch (e) {
      console.error(e)
    }
  }

  const toggleCompany = (company: string) => {
    setExpandedCompanies(prev => ({ ...prev, [company]: !prev[company] }))
  }

  const onDragEnd = async (result: any) => {
    if (!result.destination) return
    const { source, destination, draggableId } = result
    if (source.droppableId === destination.droppableId) return

    const newStatus = destination.droppableId
    const jobId = parseInt(draggableId)
    
    // Optimistic UI update
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: newStatus } : j))
    
    try {
      await api.put(`/api/jobs/${jobId}`, { status: newStatus })
    } catch (e) {
      console.error("Failed to update status", e)
      fetchJobs() // revert on fail
    }
  }

  const renderJobCard = (job: Job, snapshot: any, provided: any) => {
    const loc = job.location && job.location.trim() !== "" ? job.location : null;
    const isSelected = selectedIds.includes(job.id)
    return (
    <div
      ref={provided.innerRef}
      {...provided.draggableProps}
      {...provided.dragHandleProps}
      style={provided.draggableProps.style}
      className="mb-3"
      onClick={(e) => {
        // Don't open modal when clicking the external link or the select checkbox.
        if (!(e.target as HTMLElement).closest('a') && !(e.target as HTMLElement).closest('[data-select]')) {
          setSelectedJob(job)
        }
      }}
    >
      <Card className={`bg-zinc-950/90 border-white/5 hover:border-white/20 hover:bg-zinc-900 cursor-pointer transition-colors shadow-lg ${snapshot.isDragging ? 'ring-2 ring-indigo-500/50 shadow-indigo-500/20 z-50' : ''} ${isSelected ? 'ring-2 ring-blue-500/60' : ''}`}>
        <CardContent className="p-4">
          <div className="flex justify-between items-start gap-3 mb-2">
            <div className="flex items-center gap-2 text-zinc-300 font-medium text-sm truncate flex-1">
              <button
                data-select
                onClick={(e) => { e.stopPropagation(); toggleSelect(job.id) }}
                className={`w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-white/20 hover:border-white/50'}`}
                title="Select"
              >
                {isSelected && <Check className="w-3 h-3 text-white" />}
              </button>
              <div className="w-6 h-6 rounded bg-white/10 flex items-center justify-center shrink-0">
                <BriefcaseBusiness className="w-3 h-3 text-zinc-400" />
              </div>
              <span className="truncate" title={job.company}>{job.company}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <a href={job.url} target="_blank" rel="noreferrer" className="p-1 text-zinc-500 hover:text-white hover:bg-white/10 rounded transition-colors" title="View Job">
                <ExternalLink className="w-4 h-4" />
              </a>
              {job.status !== "TRASH" && (
                <button
                  onClick={(e) => { e.stopPropagation(); moveToTrash(job.id) }}
                  className="p-1 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                  title="Move to Trash"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          
          <p className="text-sm font-semibold text-white leading-tight mb-3 line-clamp-2" title={job.title}>
            {job.title}
          </p>
          
          <div className="flex items-center justify-between pt-3 border-t border-white/5">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 font-medium">
                <Calendar className="w-3.5 h-3.5" />
                {formatISTDate(job.created_at)}
              </div>
              {loc && (
                <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 font-medium">
                  <MapPin className="w-3.5 h-3.5" />
                  {loc}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )}

  const filteredJobs = jobs.filter(j => {
    const q = searchQuery.toLowerCase()
    return j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q)
  })

  const archivedCount = filteredJobs.filter(j => ARCHIVED_STATUSES.includes(j.status)).length
  const columnsToRender = COLUMNS.filter(c => showArchived || !ARCHIVED_STATUSES.includes(c.id))

  return (
    <div className="flex flex-col h-full relative">
      
      {/* Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="relative max-w-md w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input 
            type="text" 
            placeholder="Search roles, companies..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900/50 border border-white/10 rounded-full pl-10 pr-4 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50 focus:bg-zinc-900 transition-all"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all ${
              showArchived
              ? 'bg-red-500/10 text-red-400 border border-red-500/20'
              : 'bg-zinc-800/50 text-zinc-400 border border-white/5 hover:bg-zinc-800'
            }`}
          >
            {showArchived ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showArchived ? 'Hide Closed' : 'Show Closed'}
            {archivedCount > 0 && (
              <span className="bg-white/10 px-1.5 py-0.5 rounded-md ml-1">{archivedCount} jobs</span>
            )}
          </button>

          <button
            onClick={() => setConfirmClearOpen(true)}
            disabled={clearing || jobs.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold bg-zinc-800/50 text-zinc-400 border border-white/5 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {clearing ? 'Clearing...' : 'Clear All'}
          </button>
        </div>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className={`grid gap-6 h-full items-start ${showArchived ? 'grid-cols-1 lg:grid-cols-6' : 'grid-cols-1 lg:grid-cols-3'}`}>
        {columnsToRender.map((col) => {
          const columnJobs = filteredJobs.filter(j => j.status === col.id)
          
          return (
            <div 
              key={col.id} 
              className={`flex flex-col bg-[#12141a] rounded-2xl border ${col.border} p-5 h-[calc(100vh-10rem)] shadow-xl relative group`}
            >
              {/* Subtle Gradient Background */}
              <div className={`absolute inset-0 bg-gradient-to-b ${col.color} opacity-30 group-hover:opacity-50 transition-opacity duration-500 pointer-events-none rounded-2xl`} />

              <div className="flex items-center justify-between mb-4 shrink-0">
                <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">{col.title}</h3>
                <Badge variant="outline" className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${col.badge}`}>
                  {columnJobs.length}
                </Badge>
              </div>
              
              <Droppable droppableId={col.id}>
                {(provided, snapshot) => (
                  <div 
                    {...provided.droppableProps} 
                    ref={provided.innerRef}
                    className={`flex-1 overflow-y-auto p-1 custom-scrollbar transition-colors duration-300 ${snapshot.isDraggingOver ? 'bg-white/5 rounded-xl' : ''}`}
                  >
                    
                    {/* Render Grouped Companies for NEW column */}
                    {col.id === "NEW" ? (
                      (() => {
                        const companies = Array.from(new Set(columnJobs.map(j => j.company)))
                        return companies.map((company) => {
                          const companyJobs = columnJobs.filter(j => j.company === company)
                          const isExpanded = expandedCompanies[company] || false
                          
                          return (
                            <div key={company} className="mb-4 bg-black/40 rounded-xl border border-white/5">
                              <button 
                                onClick={() => toggleCompany(company)}
                                className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors rounded-xl"
                              >
                                <span className="font-semibold text-sm text-zinc-200 truncate">{company}</span>
                                <div className="flex items-center gap-2">
                                  <Badge className="bg-blue-500/20 text-blue-300 hover:bg-blue-500/30">{companyJobs.length}</Badge>
                                  {isExpanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
                                </div>
                              </button>
                              
                                {isExpanded && (
                                  <div className="px-2">
                                    <div className="pt-2 pb-1">
                                      {companyJobs.map((job) => {
                                        // Global index for draggables
                                        const globalIndex = filteredJobs.findIndex(j => j.id === job.id)
                                        return (
                                          <Draggable key={job.id} draggableId={job.id.toString()} index={globalIndex}>
                                            {(provided, snapshot) => renderJobCard(job, snapshot, provided)}
                                          </Draggable>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}
                            </div>
                          )
                        })
                      })()
                    ) : (
                      /* Standard flat rendering for other columns */
                      columnJobs.map((job) => {
                        const globalIndex = filteredJobs.findIndex(j => j.id === job.id)
                        return (
                          <Draggable key={job.id} draggableId={job.id.toString()} index={globalIndex}>
                            {(provided, snapshot) => renderJobCard(job, snapshot, provided)}
                          </Draggable>
                        )
                      })
                    )}
                    
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          )
        })}
        </div>
      </DragDropContext>

      {/* Modal Overlay */}
      {selectedJob && (
        <JobModal
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onUpdate={(updatedJob) => {
            setJobs(jobs.map(j => j.id === updatedJob.id ? updatedJob : j))
            setSelectedJob(updatedJob)
          }}
          onDelete={handleDeleteJob}
        />
      )}

      <ConfirmDialog
        open={confirmClearOpen}
        danger
        title="Clear all jobs?"
        message={`This permanently deletes all ${jobs.length} jobs from the database. This cannot be undone.`}
        confirmLabel="Delete All"
        onConfirm={handleClearAll}
        onCancel={() => setConfirmClearOpen(false)}
      />

      <ConfirmDialog
        open={confirmBulkDelete}
        danger
        title={`Delete ${selectedIds.length} selected job${selectedIds.length > 1 ? "s" : ""}?`}
        message="The selected jobs will be permanently removed."
        confirmLabel="Delete"
        onConfirm={bulkDelete}
        onCancel={() => setConfirmBulkDelete(false)}
      />

      {/* Bulk action bar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] flex items-center gap-2 bg-[#12141a] border border-white/10 rounded-full shadow-2xl px-3 py-2 animate-in slide-in-from-bottom-4 fade-in duration-200">
          <span className="text-xs font-semibold text-zinc-300 px-2">{selectedIds.length} selected</span>
          <div className="w-px h-5 bg-white/10" />
          {[
            { label: "Applied", status: "APPLIED" },
            { label: "Interviewing", status: "INTERVIEWING" },
            { label: "Rejected", status: "REJECTED" },
            { label: "Ignored", status: "IGNORED" },
            { label: "Trash", status: "TRASH" },
          ].map(a => (
            <button
              key={a.status}
              onClick={() => bulkSetStatus(a.status)}
              className="px-3 py-1.5 rounded-full text-xs font-medium text-zinc-300 hover:bg-white/10 transition-colors"
            >
              {a.label}
            </button>
          ))}
          <button
            onClick={() => setConfirmBulkDelete(true)}
            className="px-3 py-1.5 rounded-full text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
          <button
            onClick={() => setSelectedIds([])}
            className="p-1.5 rounded-full text-zinc-500 hover:text-white hover:bg-white/10 transition-colors"
            title="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
