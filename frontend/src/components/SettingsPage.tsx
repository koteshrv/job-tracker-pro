import { useState, useEffect } from "react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrapeConfig } from "./ScrapeConfig"
import { useToast } from "./Toast"
import { FileText, Trash2 } from "lucide-react"

export function SettingsPage() {
  const { toast } = useToast()
  const [settings, setSettings] = useState<any>({
    telegram_chat_id: "",
    telegram_bot_token: "",
    gemini_api_key: "",
    gemini_model: "gemini-2.5-flash",
    cron_schedule: "0 */4 * * *",
    trash_retention_days: 30,
    active_companies: ""
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [resumeName, setResumeName] = useState("")
  const [uploading, setUploading] = useState(false)
  const [resumes, setResumes] = useState<string[]>([])

  useEffect(() => {
    api.get("/api/settings").then(res => {
      setSettings(res.data)
      setLoading(false)
    })
    refreshResumes()
  }, [])

  const refreshResumes = () => {
    api.get("/api/resumes").then(res => setResumes(res.data.resumes || []))
  }

  const [cleaningTrash, setCleaningTrash] = useState(false)
  
  const handleCleanTrash = async () => {
    if (!confirm("Are you sure you want to permanently delete all items in the trash?")) return
    setCleaningTrash(true)
    try {
      const res = await api.delete("/api/jobs/trash/empty")
      toast(`Deleted ${res.data.deleted} items from trash`, "success")
    } catch {
      toast("Error emptying trash", "error")
    }
    setCleaningTrash(false)
  }

  const handleDeleteResume = async (name: string) => {
    try {
      const res = await api.delete(`/api/resumes/${encodeURIComponent(name)}`)
      setResumes(res.data.resumes || [])
      toast(`Deleted ${name}`, "success")
    } catch {
      toast("Failed to delete resume", "error")
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Only send the fields this card owns, so it doesn't clobber the
      // keywords/companies managed by the Scrape Configuration card.
      await api.put("/api/settings", {
        telegram_chat_id: settings.telegram_chat_id,
        telegram_bot_token: settings.telegram_bot_token,
        gemini_api_key: settings.gemini_api_key,
        gemini_model: settings.gemini_model,
        cron_schedule: settings.cron_schedule,
        trash_retention_days: Number(settings.trash_retention_days),
      })
      toast("Settings saved successfully!", "success")
    } catch (e) {
      toast("Error saving settings", "error")
    }
    setSaving(false)
  }

  const handleResumeUpload = async () => {
    if (!resumeFile) return
    setUploading(true)
    const formData = new FormData()
    formData.append("file", resumeFile)
    if (resumeName.trim()) formData.append("name", resumeName.trim())
    try {
      await api.post("/api/upload-resume", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      })
      toast("Resume uploaded! AI cover letters & tailored resumes are now enabled.", "success")
      setResumeFile(null)
      setResumeName("")
      refreshResumes()
    } catch (e) {
      toast("Error uploading resume. Use a .pdf or .tex file.", "error")
    }
    setUploading(false)
  }

  if (loading) return (
    <div className="max-w-2xl mx-auto p-8 space-y-8">
      <Skeleton className="h-48 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      <ScrapeConfig />

      <div className="bg-[#12141a] rounded-2xl border border-white/5 p-6 shadow-xl">
        <h3 className="text-lg font-bold text-white mb-4">Resume & AI Configuration</h3>
        <p className="text-sm text-zinc-400 mb-4">Upload one or more resumes (.pdf or .tex). You can pick which one to use when generating a tailored resume or cover letter for a job.</p>

        {resumes.length > 0 && (
          <div className="mb-4 space-y-2">
            {resumes.map(name => (
              <div key={name} className="flex items-center justify-between bg-black/30 border border-white/5 rounded-lg px-3 py-2">
                <span className="flex items-center gap-2 text-sm text-zinc-300 truncate">
                  <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                  <span className="truncate">{name}</span>
                </span>
                <button
                  onClick={() => handleDeleteResume(name)}
                  className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors shrink-0"
                  title="Delete resume"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3 mb-6">
          <input
            type="file"
            accept=".pdf,.tex"
            onChange={e => setResumeFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-500/10 file:text-blue-400 hover:file:bg-blue-500/20 cursor-pointer"
          />
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={resumeName}
              onChange={e => setResumeName(e.target.value)}
              placeholder="Optional custom name (e.g. backend-resume)"
              className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
            />
            <Button
              onClick={handleResumeUpload}
              disabled={!resumeFile || uploading}
              className="bg-blue-600 hover:bg-blue-500 text-white shrink-0"
            >
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </div>
          <p className="text-xs text-zinc-500">Leave the name blank to keep the original filename. The extension is added automatically.</p>
        </div>

        <div className="space-y-4 pt-4 border-t border-white/5">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Gemini API Key (Stored Encrypted)</label>
            <input
              type="password"
              value={settings.gemini_api_key || ""}
              onChange={e => setSettings({...settings, gemini_api_key: e.target.value})}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
              placeholder="e.g. AIza..."
            />
            <p className="text-xs text-zinc-500 mt-1">Get a key from Google AI Studio. Falls back to the backend's GEMINI_API_KEY env var if left blank.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Gemini Model</label>
            <input
              type="text"
              list="gemini-models"
              value={settings.gemini_model || ""}
              onChange={e => setSettings({...settings, gemini_model: e.target.value})}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 font-mono"
              placeholder="gemini-2.5-flash"
            />
            <datalist id="gemini-models">
              <option value="gemini-2.5-flash" />
              <option value="gemini-flash-latest" />
              <option value="gemini-2.5-flash-lite" />
              <option value="gemini-2.0-flash" />
            </datalist>
            <p className="text-xs text-zinc-500 mt-1">Pick a suggestion or type any Gemini model name your key has access to.</p>
          </div>
        </div>
      </div>

      <div className="bg-[#12141a] rounded-2xl border border-white/5 p-6 shadow-xl space-y-4">
        <h3 className="text-lg font-bold text-white mb-2">System Settings</h3>
        
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Telegram Chat ID</label>
          <input 
            type="text" 
            value={settings.telegram_chat_id || ""} 
            onChange={e => setSettings({...settings, telegram_chat_id: e.target.value})}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
            placeholder="e.g. 123456789"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Telegram Bot Token (Stored Encrypted)</label>
          <input 
            type="password" 
            value={settings.telegram_bot_token || ""} 
            onChange={e => setSettings({...settings, telegram_bot_token: e.target.value})}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
            placeholder="e.g. 1234:ABCDEF..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Cron Schedule</label>
          <input 
            type="text" 
            value={settings.cron_schedule || ""} 
            onChange={e => setSettings({...settings, cron_schedule: e.target.value})}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 font-mono"
            placeholder="0 */4 * * *"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Trash Retention (Days)</label>
          <div className="flex items-center gap-3">
            <input 
              type="number" 
              value={settings.trash_retention_days ?? 30} 
              onChange={e => setSettings({...settings, trash_retention_days: e.target.value})}
              className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 font-mono"
              placeholder="30"
              min="0"
            />
            <Button onClick={handleCleanTrash} disabled={cleaningTrash} className="bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-500/30 shrink-0">
              <Trash2 className="w-4 h-4 mr-2" />
              {cleaningTrash ? "Cleaning..." : "Clean Trash Now"}
            </Button>
          </div>
          <p className="text-xs text-zinc-500 mt-1">Jobs in the Trash state older than this will be permanently deleted during cron scrapes. Set to 0 to disable auto-cleanup.</p>
        </div>
        
        <div className="pt-4 flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-500 text-white">
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </div>

    </div>
  )
}
