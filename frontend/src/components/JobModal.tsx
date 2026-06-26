import { useState } from "react"
import type { Job } from "./KanbanBoard"
import { Button } from "@/components/ui/button"
import { Sparkles, MapPin, Calendar, ExternalLink, X } from "lucide-react"
import { format } from "date-fns"
import axios from "axios"

interface JobModalProps {
  job: Job
  onClose: () => void
  onUpdate: (updatedJob: Job) => void
}

export function JobModal({ job, onClose, onUpdate }: JobModalProps) {
  const [notes, setNotes] = useState(job.notes || "")
  const [savingNotes, setSavingNotes] = useState(false)
  const [generatingCL, setGeneratingCL] = useState(false)

  const handleSaveNotes = async () => {
    setSavingNotes(true)
    try {
      const res = await axios.put(`http://localhost:8000/api/jobs/${job.id}`, { notes })
      onUpdate(res.data)
    } catch (e) {
      alert("Error saving notes")
    }
    setSavingNotes(false)
  }

  const handleGenerateCL = async () => {
    setGeneratingCL(true)
    try {
      const res = await axios.post(`http://localhost:8000/api/jobs/${job.id}/cover-letter`)
      onUpdate({...job, cover_letter: res.data.cover_letter})
    } catch (e: any) {
      alert(e.response?.data?.detail || "Error generating cover letter. Make sure you uploaded a resume.")
    }
    setGeneratingCL(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" 
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-[#12141a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-white/5">
          <div>
            <h2 className="text-xl font-bold text-white">{job.title}</h2>
            <div className="flex items-center gap-4 mt-2 text-sm text-zinc-400">
              <span className="font-semibold text-blue-400">{job.company}</span>
              {job.location && (
                <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{job.location}</span>
              )}
              <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{format(new Date(job.created_at), 'MMM d, yyyy')}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href={job.url} target="_blank" rel="noopener noreferrer" className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
              <ExternalLink className="w-5 h-5" />
            </a>
            <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          
          {/* Notes Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Status & Notes</h3>
            <textarea 
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Ghosted, HR screening completed, passed OA..."
              className="w-full h-32 bg-black/40 border border-white/10 rounded-xl p-4 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50 resize-none"
            />
            <div className="flex justify-end">
              <Button 
                onClick={handleSaveNotes} 
                disabled={savingNotes || notes === (job.notes || "")}
                className="bg-zinc-800 hover:bg-zinc-700 text-white h-8 text-xs"
              >
                {savingNotes ? "Saving..." : "Save Notes"}
              </Button>
            </div>
          </div>

          {/* AI Cover Letter Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" /> AI Cover Letter
              </h3>
              <Button 
                onClick={handleGenerateCL}
                disabled={generatingCL}
                className="bg-purple-600 hover:bg-purple-500 text-white h-8 text-xs shadow-lg shadow-purple-500/20"
              >
                {generatingCL ? "Generating..." : "Generate with Gemini"}
              </Button>
            </div>
            
            {job.cover_letter ? (
              <div className="bg-zinc-900/50 border border-purple-500/20 rounded-xl p-6 text-sm text-zinc-300 whitespace-pre-wrap font-serif leading-relaxed">
                {job.cover_letter}
              </div>
            ) : (
              <div className="bg-black/20 border border-white/5 border-dashed rounded-xl p-8 text-center text-zinc-500 text-sm">
                No cover letter generated yet.
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
