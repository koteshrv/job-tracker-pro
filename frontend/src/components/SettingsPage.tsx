import { useState, useEffect } from "react"
import axios from "axios"
import { Button } from "@/components/ui/button"

export function SettingsPage() {
  const [settings, setSettings] = useState<any>({
    telegram_chat_id: "",
    telegram_bot_token: "",
    cron_schedule: "0 */4 * * *",
    active_companies: ""
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    axios.get("http://localhost:8000/api/settings").then(res => {
      setSettings(res.data)
      setLoading(false)
    })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await axios.put("http://localhost:8000/api/settings", settings)
      alert("Settings saved successfully!")
    } catch (e) {
      alert("Error saving settings")
    }
    setSaving(false)
  }

  const handleResumeUpload = async () => {
    if (!resumeFile) return
    setUploading(true)
    const formData = new FormData()
    formData.append("file", resumeFile)
    try {
      await axios.post("http://localhost:8000/api/upload-resume", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      })
      alert("Resume uploaded successfully! AI Cover Letters are now enabled.")
      setResumeFile(null)
    } catch (e) {
      alert("Error uploading resume. Make sure it's a PDF.")
    }
    setUploading(false)
  }

  if (loading) return <div className="p-8 text-zinc-400">Loading settings...</div>

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      <div className="bg-[#12141a] rounded-2xl border border-white/5 p-6 shadow-xl">
        <h3 className="text-lg font-bold text-white mb-4">Resume & AI Configuration</h3>
        <p className="text-sm text-zinc-400 mb-4">Upload your PDF resume to allow Gemini to automatically generate highly tailored cover letters for your jobs.</p>
        <div className="flex items-center gap-4">
          <input 
            type="file" 
            accept=".pdf" 
            onChange={e => setResumeFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-500/10 file:text-blue-400 hover:file:bg-blue-500/20 cursor-pointer"
          />
          <Button 
            onClick={handleResumeUpload} 
            disabled={!resumeFile || uploading}
            className="bg-blue-600 hover:bg-blue-500 text-white"
          >
            {uploading ? "Uploading..." : "Upload PDF"}
          </Button>
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
        
        <div className="pt-4 flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-500 text-white">
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </div>

    </div>
  )
}
