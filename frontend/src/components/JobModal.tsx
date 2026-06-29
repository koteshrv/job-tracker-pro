import { useState, useEffect } from "react"
import type { Job } from "./KanbanBoard"
import { Button } from "@/components/ui/button"
import { Sparkles, MapPin, Calendar, ExternalLink, X, FileText, Trash2, Download, Globe } from "lucide-react"
import { formatISTDate } from "@/lib/datetime"
import { api } from "@/lib/api"
import { useToast } from "./Toast"
import { ConfirmDialog } from "./ConfirmDialog"

interface JobModalProps {
  job: Job
  onClose: () => void
  onUpdate: (updatedJob: Job) => void
  onDelete: (jobId: number) => void // Used for permanent deletion now
}

export function JobModal({ job, onClose, onUpdate, onDelete }: JobModalProps) {
  const { toast } = useToast()
  const [notes, setNotes] = useState(job.notes || "")
  const [description, setDescription] = useState(job.description || "")
  const [fetchingJD, setFetchingJD] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)
  const [generatingCL, setGeneratingCL] = useState(false)
  const [clError, setClError] = useState<string | null>(null)
  const [tailoredResume, setTailoredResume] = useState<string | null>(job.tailored_resume || null)
  const [generatingResume, setGeneratingResume] = useState(false)
  const [resumeError, setResumeError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [resumes, setResumes] = useState<string[]>([])
  const [selectedResume, setSelectedResume] = useState<string>("")
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [extractedKeywords, setExtractedKeywords] = useState<string[]>([])
  const [matchScore, setMatchScore] = useState<number | null>(null)

  useEffect(() => {
    api.get("/api/resumes").then(res => {
      const list = res.data.resumes || []
      setResumes(list)
      if (list.length) setSelectedResume(list[0])
    })
    api.get("/api/settings").then(res => {
      if (res.data.extracted_keywords) {
        try {
          const kws = JSON.parse(res.data.extracted_keywords)
          if (Array.isArray(kws)) setExtractedKeywords(kws)
        } catch (e) {}
      }
    })
  }, [])

const TECH_KEYWORDS = [
  "python", "javascript", "typescript", "java", "c++", "c#", ".net", "ruby", "golang", "rust", "php", 
  "sql", "nosql", "react", "angular", "vue", "node", "express", "django", "flask", "fastapi", "spring", 
  "docker", "kubernetes", "aws", "azure", "gcp", "terraform", "ansible", "jenkins", "git", "ci/cd", 
  "graphql", "rest api", "postgresql", "mongodb", "redis", "mysql", "elasticsearch", "kafka", "rabbitmq", 
  "machine learning", "deep learning", "ai", "llm", "nlp", "pytorch", "tensorflow", "agile", "scrum", 
  "sre", "devops", "security", "testing", "pytest", "mocha", "jest", "cypress", "webpack", "vite", 
  "css", "html", "sass", "tailwind", "linux", "bash", "shell", "prometheus", "grafana", "microservices", 
  "serverless", "amplitude", "tableau", "power bi", "apim", "azure apim", "web security", "k8s", "openshift"
];

  useEffect(() => {
    if (description && extractedKeywords.length > 0) {
      const jdLower = description.toLowerCase()
      
      // 1. Identify which of the master tech keywords are requested in the JD
      const jdSkills = TECH_KEYWORDS.filter(skill => {
        const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const regex = new RegExp(`(?:^|\\s|[^a-zA-Z0-9+])(${escaped})(?:$|\\s|[^a-zA-Z0-9+])`, 'i')
        return regex.test(jdLower)
      })

      if (jdSkills.length > 0) {
        // 2. See how many of those JD skills are in the user's resume
        const matched = jdSkills.filter(skill => 
          extractedKeywords.some(ek => ek.toLowerCase().includes(skill.toLowerCase()) || skill.toLowerCase().includes(ek.toLowerCase()))
        ).length
        setMatchScore(Math.round((matched / jdSkills.length) * 100))
      } else {
        // Fallback to original ratio if no master keywords found in JD
        const found = extractedKeywords.filter(k => jdLower.includes(k.toLowerCase())).length
        setMatchScore(Math.round((found / extractedKeywords.length) * 100))
      }
    } else {
      setMatchScore(null)
    }
  }, [description, extractedKeywords])


  const handleSaveNotes = async () => {
    setSavingNotes(true)
    try {
      const res = await api.put(`/api/jobs/${job.id}`, { notes })
      onUpdate(res.data)
      toast("Notes saved", "success")
    } catch (e) {
      toast("Error saving notes", "error")
    }
    setSavingNotes(false)
  }

  const handleSaveDescription = async () => {
    try {
      const res = await api.put(`/api/jobs/${job.id}`, { description })
      onUpdate(res.data)
      toast("Description saved", "success")
    } catch {
      toast("Error saving description", "error")
    }
  }

  const handleFetchJD = async () => {
    setFetchingJD(true)
    try {
      const res = await api.post(`/api/jobs/${job.id}/fetch-jd`)
      setDescription(res.data.description)
      onUpdate({...job, description: res.data.description})
      toast("Job Description fetched!", "success")
    } catch (e: any) {
      const msg = e.response?.data?.detail || "Failed to fetch JD. You can paste it manually."
      toast(msg, "error")
    }
    setFetchingJD(false)
  }

  const handleSoftDelete = async () => {
    try {
      const res = await api.put(`/api/jobs/${job.id}`, { status: "TRASH" })
      onUpdate(res.data)
      toast("Moved to Trash", "success")
      onClose()
    } catch {
      toast("Failed to move to Trash", "error")
    }
  }

  const handleGenerateCL = async () => {
    setGeneratingCL(true)
    setClError(null)
    try {
      const res = await api.post(`/api/jobs/${job.id}/cover-letter`, {
        resume: selectedResume || null,
        generation_mode: localStorage.getItem("generation_mode") || "gemini"
      })
      onUpdate({...job, cover_letter: res.data.cover_letter})
    } catch (e: any) {
      setClError(e.response?.data?.detail || "Error generating cover letter. Make sure you uploaded a resume and configured a Gemini API key in Settings.")
    }
    setGeneratingCL(false)
  }

  const handleGenerateResume = async () => {
    setGeneratingResume(true)
    setResumeError(null)
    try {
      const res = await api.post(`/api/jobs/${job.id}/tailored-resume`, {
        resume: selectedResume || null,
        generation_mode: localStorage.getItem("generation_mode") || "gemini"
      })
      setTailoredResume(res.data.tailored_resume)
      onUpdate({...job, tailored_resume: res.data.tailored_resume})
    } catch (e: any) {
      setResumeError(e.response?.data?.detail || "Error generating tailored resume. Make sure you uploaded a resume and configured a Gemini API key in Settings.")
    }
    setGeneratingResume(false)
  }

  const handleCopyResume = () => {
    if (!tailoredResume) return
    navigator.clipboard.writeText(tailoredResume)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const slug = `${job.company}-${job.title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

  const downloadFile = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadTex = () => {
    if (!tailoredResume) return
    downloadFile(tailoredResume, `${slug}.tex`, "application/x-tex")
  }

  const handleDownloadPdf = async () => {
    if (!tailoredResume) return
    setDownloadingPdf(true)
    try {
      const res = await api.get(`/api/jobs/${job.id}/resume/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement("a")
      a.href = url
      a.download = `${slug}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast("PDF Downloaded", "success")
    } catch (e) {
      toast("Failed to compile PDF. Ensure LaTeX is working.", "error")
    }
    setDownloadingPdf(false)
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
                <span className="flex items-center gap-1">
                  {job.location.startsWith("Extension") ? (
                    <Globe className="w-3.5 h-3.5 text-blue-400" />
                  ) : (
                    <MapPin className="w-3.5 h-3.5" />
                  )}
                  {job.location}
                </span>
              )}
              <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{formatISTDate(job.created_at, true)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href={job.url} target="_blank" rel="noopener noreferrer" className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
              <ExternalLink className="w-5 h-5" />
            </a>
            {job.status === "TRASH" ? (
              <button
                onClick={() => setConfirmDeleteOpen(true)}
                className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors flex items-center gap-2"
                title="Permanently Delete"
              >
                <Trash2 className="w-4 h-4" />
                <span className="text-xs font-semibold">Delete Forever</span>
              </button>
            ) : (
              <button
                onClick={handleSoftDelete}
                className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                title="Move to Trash"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
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

          {/* JD Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Job Description</h3>
              <Button 
                onClick={handleFetchJD} 
                disabled={fetchingJD}
                className="bg-blue-600 hover:bg-blue-500 text-white h-8 text-xs shadow-lg shadow-blue-500/20"
              >
                {fetchingJD ? "Fetching..." : "Fetch JD"}
              </Button>
            </div>
            {matchScore !== null && (
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs font-bold text-zinc-400">Match Score</span>
                <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-1000 ${matchScore > 70 ? 'bg-green-500' : matchScore > 40 ? 'bg-amber-500' : 'bg-red-500'}`} 
                    style={{ width: `${matchScore}%` }} 
                  />
                </div>
                <span className="text-xs font-bold text-white">{matchScore}%</span>
              </div>
            )}
            <textarea 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleSaveDescription}
              placeholder="Paste the full job description here, or click Fetch..."
              className="w-full h-48 bg-black/40 border border-white/10 rounded-xl p-4 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50 resize-none custom-scrollbar text-sm font-sans"
            />
          </div>

          {/* Shared Resume Selector for AI generation */}
          <div className="flex items-center justify-between gap-3 bg-black/20 border border-white/5 rounded-xl px-4 py-3">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Source Resume</span>
            {resumes.length ? (
              <select
                value={selectedResume}
                onChange={(e) => setSelectedResume(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 max-w-[60%]"
              >
                {resumes.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            ) : (
              <span className="text-xs text-zinc-500">No resumes uploaded — add one in Settings.</span>
            )}
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
                {generatingCL ? "Generating..." : "Generate with AI"}
              </Button>
            </div>
            
            {clError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-300 flex items-start gap-2">
                <span className="font-semibold shrink-0">Error:</span>
                <span className="break-words">{clError}</span>
              </div>
            )}

            {job.cover_letter ? (
              <div className="bg-zinc-900/50 border border-purple-500/20 rounded-xl p-6 text-sm text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed">
                {job.cover_letter}
              </div>
            ) : (
              <div className="bg-black/20 border border-white/5 border-dashed rounded-xl p-8 text-center text-zinc-500 text-sm">
                No cover letter generated yet.
              </div>
            )}
          </div>

          {/* AI Tailored Resume Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" /> AI Tailored Resume
              </h3>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {tailoredResume && (
                  <>
                    <Button onClick={handleCopyResume} className="bg-zinc-800 hover:bg-zinc-700 text-white h-8 text-xs">
                      {copied ? "Copied!" : "Copy"}
                    </Button>
                    <Button onClick={handleDownloadTex} className="bg-zinc-800 hover:bg-zinc-700 text-white h-8 text-xs">
                      <Download className="w-3.5 h-3.5 mr-1" /> .tex
                    </Button>
                    <Button onClick={handleDownloadPdf} disabled={downloadingPdf} className="bg-zinc-800 hover:bg-zinc-700 text-white h-8 text-xs">
                      {downloadingPdf ? (
                        "Compiling PDF..."
                      ) : (
                        <><Download className="w-3.5 h-3.5 mr-1" /> .pdf</>
                      )}
                    </Button>
                  </>
                )}
                <Button
                  onClick={handleGenerateResume}
                  disabled={generatingResume}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-xs shadow-lg shadow-emerald-500/20"
                >
                  {generatingResume ? "Tailoring..." : "Tailor with AI"}
                </Button>
              </div>
            </div>

            {resumeError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-300 flex items-start gap-2">
                <span className="font-semibold shrink-0">Error:</span>
                <span className="break-words">{resumeError}</span>
              </div>
            )}

            {tailoredResume ? (
              <div className="bg-zinc-900/50 border border-emerald-500/20 rounded-xl p-6 text-sm text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed">
                {tailoredResume}
              </div>
            ) : (
              <div className="bg-black/20 border border-white/5 border-dashed rounded-xl p-8 text-center text-zinc-500 text-sm">
                Generate a version of your resume re-tailored for this role.
              </div>
            )}
          </div>

        </div>
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        danger
        title="Delete this job?"
        message={`"${job.title}" at ${job.company} will be permanently removed.`}
        confirmLabel="Delete"
        onConfirm={() => { setConfirmDeleteOpen(false); onDelete(job.id) }}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </div>
  )
}
