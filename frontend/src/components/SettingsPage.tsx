import { useState, useEffect, useRef } from "react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrapeConfig } from "./ScrapeConfig"
import { useToast } from "./Toast"
import { FileText, Trash2, X, Check, ShieldCheck, ShieldAlert, Lock } from "lucide-react"

// ── Model Priority Picker (drag-to-reorder) ────────────────────────────────────
type ModelSuggestion = { value: string; label: string; badge?: string }

function ModelPriorityPicker({ label, value, onChange, suggestions }: {
  label: string; value: string; onChange: (v: string) => void; suggestions: ModelSuggestion[]
}) {
  const parseSelected = (v: string) => v.split(",").map(s => s.trim()).filter(Boolean)
  const [selected, setSelected] = useState<string[]>(() => parseSelected(value))
  const [dragOver, setDragOver] = useState<number | null>(null)
  const dragIdx = useRef<number | null>(null)

  useEffect(() => { setSelected(parseSelected(value)) }, [value])

  const emit = (next: string[]) => { setSelected(next); onChange(next.join(", ")) }

  const toggle = (modelValue: string) => {
    if (selected.includes(modelValue)) emit(selected.filter(s => s !== modelValue))
    else emit([...selected, modelValue])
  }

  const moveUp   = (i: number) => { if (i === 0) return; const n=[...selected];[n[i-1],n[i]]=[n[i],n[i-1]]; emit(n) }
  const moveDown = (i: number) => { if (i===selected.length-1) return; const n=[...selected];[n[i],n[i+1]]=[n[i+1],n[i]]; emit(n) }

  // ── Drag handlers ──
  const onDragStart = (idx: number) => { dragIdx.current = idx }
  const onDragOver  = (e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOver(idx) }
  const onDrop      = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    if (dragIdx.current === null || dragIdx.current === idx) { setDragOver(null); return }
    const next = [...selected]
    const [item] = next.splice(dragIdx.current, 1)
    next.splice(idx, 0, item)
    dragIdx.current = null
    setDragOver(null)
    emit(next)
  }
  const onDragEnd = () => { dragIdx.current = null; setDragOver(null) }

  const allModels = [
    ...suggestions,
    ...selected
      .filter(s => !suggestions.some(sg => sg.value === s))
      .map(s => ({ value: s, label: s, badge: "custom" }))
  ]

  return (
    <div>
      <label className="block text-sm font-medium text-zinc-400 mb-2">{label}</label>

      {/* ── Priority list (draggable) ── */}
      {selected.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {selected.map((modelVal, idx) => {
            const suggestion = allModels.find(s => s.value === modelVal)
            const isOver = dragOver === idx
            return (
              <div
                key={modelVal}
                draggable
                onDragStart={() => onDragStart(idx)}
                onDragOver={e => onDragOver(e, idx)}
                onDrop={e => onDrop(e, idx)}
                onDragEnd={onDragEnd}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all select-none
                  ${isOver
                    ? "border-blue-400/60 bg-blue-500/20 scale-[1.01] shadow-lg shadow-blue-500/10"
                    : "border-blue-500/20 bg-blue-900/15"}`}
              >
                {/* Drag handle */}
                <span
                  className="text-zinc-600 hover:text-zinc-300 cursor-grab active:cursor-grabbing shrink-0 transition-colors"
                  title="Drag to reorder"
                >
                  <svg className="w-3.5 h-5" viewBox="0 0 10 16" fill="currentColor">
                    <circle cx="3" cy="2.5" r="1.2"/><circle cx="7" cy="2.5" r="1.2"/>
                    <circle cx="3" cy="6.5" r="1.2"/><circle cx="7" cy="6.5" r="1.2"/>
                    <circle cx="3" cy="10.5" r="1.2"/><circle cx="7" cy="10.5" r="1.2"/>
                    <circle cx="3" cy="14.5" r="1.2"/><circle cx="7" cy="14.5" r="1.2"/>
                  </svg>
                </span>

                {/* Position badge */}
                <span className="w-5 h-5 flex items-center justify-center rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold shrink-0">
                  {idx + 1}
                </span>
                <span className="flex-1 font-mono text-sm text-white truncate">{modelVal}</span>
                {suggestion?.badge && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-zinc-500 shrink-0">{suggestion.badge}</span>
                )}

                {/* ↑↓ nudge buttons */}
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button onClick={() => moveUp(idx)} disabled={idx === 0}
                    className="w-5 h-4 flex items-center justify-center rounded hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed text-zinc-400 hover:text-white transition-colors"
                    title="Move up">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7"/></svg>
                  </button>
                  <button onClick={() => moveDown(idx)} disabled={idx === selected.length - 1}
                    className="w-5 h-4 flex items-center justify-center rounded hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed text-zinc-400 hover:text-white transition-colors"
                    title="Move down">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"/></svg>
                  </button>
                </div>

                {/* Remove */}
                <button onClick={() => toggle(modelVal)}
                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-red-500/20 text-zinc-600 hover:text-red-400 transition-colors shrink-0"
                  title="Remove">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )
          })}
          <p className="text-[10px] text-zinc-600 pl-1">Drag ⠿ to reorder · #1 is tried first on failure</p>
        </div>
      )}

      {/* ── All models as checkboxes ── */}
      <div className="rounded-xl border border-white/8 bg-black/20 divide-y divide-white/5 overflow-hidden">
        {allModels.map(s => {
          const isChecked = selected.includes(s.value)
          return (
            <button key={s.value} onClick={() => toggle(s.value)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors
                ${isChecked ? "bg-blue-900/10 hover:bg-blue-900/20" : "hover:bg-white/[0.04]"}`}
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors
                ${isChecked ? "bg-blue-500 border-blue-500" : "border-white/20 bg-transparent"}`}>
                {isChecked && <Check className="w-2.5 h-2.5 text-white" />}
              </div>
              <span className={`flex-1 font-mono ${isChecked ? "text-white" : "text-zinc-400"}`}>{s.label}</span>
              {s.badge && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0
                  ${isChecked ? "bg-blue-500/15 text-blue-400" : "bg-white/5 text-zinc-600"}`}>
                  {s.badge}
                </span>
              )}
              {isChecked && (
                <span className="text-[10px] text-blue-500 font-semibold shrink-0">
                  #{selected.indexOf(s.value) + 1}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── TOS / Privacy Warning Banner ──────────────────────────────────────────────
type TosLevel = "warn" | "ok" | "private"
function TosWarning({ level, text }: { level: TosLevel; text: string }) {
  const cfg = {
    warn:    { icon: <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />, bg: "bg-yellow-500/10 border-yellow-500/20", txt: "text-yellow-400", prefix: "⚠ Data Privacy" },
    ok:      { icon: <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />, bg: "bg-emerald-500/10 border-emerald-500/20", txt: "text-emerald-400", prefix: "✓ Privacy Safe" },
    private: { icon: <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />, bg: "bg-blue-500/10 border-blue-500/20", txt: "text-blue-400", prefix: "🔒 Fully Private" },
  }[level]
  return (
    <div className={`p-2.5 border rounded-lg ${cfg.bg}`}>
      <div className={`flex items-start gap-2 text-xs ${cfg.txt}`}>
        {cfg.icon}
        <div>
          <span className="font-semibold">{cfg.prefix} — </span>
          <span className="text-zinc-400">{text}</span>
        </div>
      </div>
    </div>
  )
}


export function SettingsPage() {
  const { toast } = useToast()
  const [settings, setSettings] = useState<any>({
    telegram_chat_id: "",
    telegram_bot_token: "",
    gemini_api_key: "",
    gemini_model: "gemini-2.5-flash",
    cron_schedule: "0 */4 * * *",
    trash_retention_days: 30,
    active_companies: "",
    api_key_tag: ""
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [resumeName, setResumeName] = useState("")
  const [uploading, setUploading] = useState(false)
  const [resumes, setResumes] = useState<string[]>([])
  const [newSkill, setNewSkill] = useState("")

  const handleAddSkill = async () => {
    if (!newSkill.trim()) return
    let current = []
    try {
      if (settings.extracted_keywords) {
        current = JSON.parse(settings.extracted_keywords)
      }
    } catch (e) {}
    if (!Array.isArray(current)) current = []
    if (current.includes(newSkill.trim())) {
      toast("Skill already exists", "error")
      return
    }
    const updatedKws = [...current, newSkill.trim()]
    const updatedSettings = { ...settings, extracted_keywords: JSON.stringify(updatedKws) }
    setSettings(updatedSettings)
    setNewSkill("")
  }

  const handleDeleteSkill = async (skillToDelete: string) => {
    let current = []
    try {
      if (settings.extracted_keywords) {
        current = JSON.parse(settings.extracted_keywords)
      }
    } catch (e) {}
    if (!Array.isArray(current)) current = []
    const updatedKws = current.filter((k: string) => k !== skillToDelete)
    const updatedSettings = { ...settings, extracted_keywords: JSON.stringify(updatedKws) }
    setSettings(updatedSettings)
  }

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
      await api.put("/api/settings", settings)
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
    <div className="max-w-2xl mx-auto pb-16 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
      
      {/* Sticky Global Save Header */}
      <div className="sticky top-0 z-50 -mx-4 px-4 py-3 bg-[#0a0a0f]/90 backdrop-blur-xl border-b border-white/5 flex justify-between items-center shadow-2xl mb-8 rounded-b-2xl">
        <div>
          <h2 className="text-lg font-bold text-white">Application Settings</h2>
          <p className="text-xs text-zinc-400">Configure your scraper, AI models, and resumes.</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20">
          <Check className="w-4 h-4 mr-2" />
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </div>

      <ScrapeConfig settings={settings} onChange={setSettings} />

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

        <div className="mt-6 pt-6 border-t border-white/5 space-y-3">
          <h4 className="text-sm font-bold text-white uppercase tracking-wider">Baseline Match Skills</h4>
          <p className="text-xs text-zinc-500">These skills are matched against fetched Job Descriptions to calculate your Match Score. You can edit them manually below.</p>
          
          {(() => {
            try {
              const kws = settings?.extracted_keywords ? JSON.parse(settings.extracted_keywords) : []
              if (Array.isArray(kws) && kws.length > 0) {
                return (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {kws.map(k => (
                      <span key={k} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-medium">
                        {k}
                        <button 
                          onClick={() => handleDeleteSkill(k)}
                          className="hover:text-red-400 hover:bg-red-500/10 rounded-sm p-0.5 transition-colors"
                          title="Remove skill"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )
              }
            } catch (e) {}
            return <div className="text-xs text-zinc-600 italic mb-2">No baseline skills saved yet. Upload a resume or add some manually below.</div>
          })()}

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newSkill}
              onChange={e => setNewSkill(e.target.value)}
              placeholder="Add skill (e.g. Docker, APIM)"
              className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
              onKeyDown={e => { if (e.key === 'Enter') handleAddSkill() }}
            />
            <Button
              onClick={handleAddSkill}
              disabled={!newSkill.trim()}
              className="bg-blue-600 hover:bg-blue-500 text-white h-8 text-xs shrink-0"
            >
              Add Skill
            </Button>
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t border-white/5">
          {/* ── AI Generation Mode ── */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">AI Generation Mode</label>
            <div className="relative">
              <select
                value={localStorage.getItem("generation_mode") || "gemini"}
                onChange={e => {
                  localStorage.setItem("generation_mode", e.target.value)
                  setSettings({...settings, ai_mode: e.target.value})
                }}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 pr-10 text-white appearance-none focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="gemini" className="bg-[#12141a]">Google Gemini</option>
                <option value="openai" className="bg-[#12141a]">OpenAI</option>
                <option value="anthropic" className="bg-[#12141a]">Anthropic Claude</option>
                <option value="grok" className="bg-[#12141a]">xAI Grok</option>
                <option value="ollama" className="bg-[#12141a]">Local Ollama (Private)</option>
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-zinc-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/></svg>
              </div>
            </div>
          </div>

          {/* ── Google Gemini ── */}
          {(localStorage.getItem("generation_mode") || "gemini") === "gemini" && (
            <>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Gemini API Key</label>
                <div className="flex gap-3">
                  <input
                    type="password"
                    value={settings.gemini_api_key || ""}
                    onChange={e => setSettings({...settings, gemini_api_key: e.target.value})}
                    className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                    placeholder="AIza..."
                  />
                  <input
                    type="text"
                    value={settings.api_key_tag || ""}
                    onChange={e => setSettings({...settings, api_key_tag: e.target.value})}
                    className="w-1/3 bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 placeholder:text-zinc-600"
                    placeholder="Label (e.g. Work)"
                  />
                </div>
              </div>
              <ModelPriorityPicker
                label="Model Priority List (fallbacks in order)"
                value={settings.gemini_model || "gemini-3.1-flash-lite, gemini-3.5-flash, gemini-2.5-flash"}
                onChange={v => setSettings({...settings, gemini_model: v})}
                suggestions={[
                  { value: "gemini-3.1-flash-lite", label: "gemini-3.1-flash-lite", badge: "500 RPD · High Capacity" },
                  { value: "gemini-3.5-flash",      label: "gemini-3.5-flash",      badge: "20 RPD · Premium" },
                  { value: "gemini-3-flash",        label: "gemini-3-flash",        badge: "20 RPD" },
                  { value: "gemini-2.5-flash",      label: "gemini-2.5-flash",      badge: "20 RPD" },
                  { value: "gemma-4-31b",           label: "gemma-4-31b",           badge: "1500 RPD · Text Only" },
                ]}
              />
              {(() => {
                if (!settings?.model_telemetry) return null;
                // Accurate RPD limits per model as of June 2026 (v1beta free tier)
                const getLimit = (model: string): number => {
                  const m = (model || "").toLowerCase()
                  if (m.includes("gemma-4")) return 1500
                  if (m.includes("3.1-flash-lite")) return 500
                  if (m === "antigravity") return 100
                  if (m.includes("flash")) return 20 // 3.5, 3.0, 2.5 flash are strictly capped at 20
                  if (m.includes("pro")) return 0 // typically disabled on free tier
                  return 20 // default for unknown models

                }
                try {
                  const parsed = JSON.parse(settings.model_telemetry);
                  const primaryModel = settings.gemini_model?.split(",")[0]?.trim() || "gemini-1.5-flash"
                  const currentStats = parsed[primaryModel];
                  if (currentStats) {
                    const limit = getLimit(primaryModel)
                    const todayUsed = currentStats.today_requests || 0
                    const reqsLeft = limit === -1 ? null : Math.max(0, limit - todayUsed)
                    return (
                      <div className="p-3 bg-blue-900/10 border border-blue-500/20 rounded-lg flex items-center justify-between text-xs">
                        <div>
                          <span className="block font-semibold text-blue-400">Active Model Usage</span>
                          <span className="text-zinc-400">{(currentStats.prompt_tokens + currentStats.candidate_tokens).toLocaleString()} tokens · {currentStats.requests} requests</span>
                        </div>
                        <div className="text-right">
                          <span className="block font-semibold text-blue-400">Daily Quota</span>
                          <span className={reqsLeft !== null && reqsLeft < 5 ? "text-red-400 font-bold" : "text-zinc-300"}>
                            {todayUsed} used / {reqsLeft === null ? "? (alias)" : `${reqsLeft} left`}
                          </span>
                        </div>
                      </div>
                    );
                  }
                } catch (e) {}
                return null;
              })()}
              <TosWarning level="warn" text="Google Free Tier API may use your prompts and outputs for model training. Switch to a paid key or use Local Ollama for full privacy." />
            </>
          )}

          {/* ── OpenAI ── */}
          {(localStorage.getItem("generation_mode") || "gemini") === "openai" && (
            <>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">OpenAI API Key</label>
                <input
                  type="password"
                  value={settings.openai_api_key || ""}
                  onChange={e => setSettings({...settings, openai_api_key: e.target.value})}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  placeholder="sk-..."
                />
              </div>
              <ModelPriorityPicker
                label="Model Priority List (fallbacks in order)"
                value={settings.openai_model || "gpt-4o-mini, gpt-4o"}
                onChange={v => setSettings({...settings, openai_model: v})}
                suggestions={[
                  { value: "gpt-4o-mini", label: "gpt-4o-mini", badge: "fast · cheap" },
                  { value: "gpt-4o", label: "gpt-4o", badge: "flagship" },
                  { value: "o3-mini", label: "o3-mini", badge: "reasoning" },
                  { value: "o1-mini", label: "o1-mini", badge: "reasoning" },
                  { value: "gpt-4-turbo", label: "gpt-4-turbo", badge: "legacy" },
                ]}
              />
              <TosWarning level="ok" text="OpenAI does not use API data for model training. Your resume data is private and not retained beyond 30 days." />
            </>
          )}

          {/* ── Anthropic ── */}
          {(localStorage.getItem("generation_mode") || "gemini") === "anthropic" && (
            <>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Anthropic API Key</label>
                <input
                  type="password"
                  value={settings.anthropic_api_key || ""}
                  onChange={e => setSettings({...settings, anthropic_api_key: e.target.value})}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  placeholder="sk-ant-..."
                />
              </div>
              <ModelPriorityPicker
                label="Model Priority List (fallbacks in order)"
                value={settings.anthropic_model || "claude-3-5-haiku-latest, claude-3-7-sonnet-latest"}
                onChange={v => setSettings({...settings, anthropic_model: v})}
                suggestions={[
                  { value: "claude-3-5-haiku-latest", label: "claude-3-5-haiku-latest", badge: "fast · cheap" },
                  { value: "claude-3-7-sonnet-latest", label: "claude-3-7-sonnet-latest", badge: "flagship" },
                  { value: "claude-3-opus-latest", label: "claude-3-opus-latest", badge: "highest quality" },
                  { value: "claude-3-5-sonnet-latest", label: "claude-3-5-sonnet-latest", badge: "balanced" },
                ]}
              />
              <TosWarning level="ok" text="Anthropic does not use API data for model training. Your resume data is not used to improve their models." />
            </>
          )}

          {/* ── xAI Grok ── */}
          {(localStorage.getItem("generation_mode") || "gemini") === "grok" && (
            <>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">xAI API Key</label>
                <input
                  type="password"
                  value={settings.grok_api_key || ""}
                  onChange={e => setSettings({...settings, grok_api_key: e.target.value})}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  placeholder="xai-..."
                />
              </div>
              <ModelPriorityPicker
                label="Model Priority List (fallbacks in order)"
                value={settings.grok_model || "grok-3-mini, grok-2-latest"}
                onChange={v => setSettings({...settings, grok_model: v})}
                suggestions={[
                  { value: "grok-3-mini", label: "grok-3-mini", badge: "fast · free tier" },
                  { value: "grok-3-mini-fast", label: "grok-3-mini-fast", badge: "fastest" },
                  { value: "grok-2-latest", label: "grok-2-latest", badge: "stable" },
                  { value: "grok-3-latest", label: "grok-3-latest", badge: "flagship" },
                ]}
              />
              <TosWarning level="warn" text="xAI may use API inputs/outputs for service improvement per their ToS. Review x.ai/legal before using with sensitive data." />
            </>
          )}

          {/* ── Local Ollama ── */}
          {(localStorage.getItem("generation_mode") || "gemini") === "ollama" && (
            <>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Ollama Server URL</label>
                <input
                  type="text"
                  value={settings.ollama_url || "http://localhost:11434"}
                  onChange={e => setSettings({...settings, ollama_url: e.target.value})}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 font-mono"
                  placeholder="http://localhost:11434"
                />
              </div>
              <ModelPriorityPicker
                label="Model Priority List (fallbacks in order)"
                value={settings.ollama_model || "llama3.1, llama3.2"}
                onChange={v => setSettings({...settings, ollama_model: v})}
                suggestions={[
                  { value: "llama3.1", label: "llama3.1", badge: "recommended" },
                  { value: "llama3.2", label: "llama3.2", badge: "latest" },
                  { value: "llama3.1:8b", label: "llama3.1:8b", badge: "lighter" },
                  { value: "deepseek-coder-v2", label: "deepseek-coder-v2", badge: "coding" },
                  { value: "mistral", label: "mistral", badge: "fast" },
                  { value: "qwen2.5", label: "qwen2.5", badge: "multilingual" },
                ]}
              />
              <TosWarning level="private" text="100% local. Your data never leaves your machine. Pull models with: ollama pull llama3.1" />
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Custom AI Tailoring Guidelines</label>
            <textarea
              value={settings.custom_guidelines || ""}
              onChange={e => setSettings({...settings, custom_guidelines: e.target.value})}
              className="w-full h-24 bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 text-sm resize-none custom-scrollbar"
              placeholder="e.g. Keep resume job titles exactly as they are. Sound humble, focus on system design and scaling bullet points, avoid corporate jargon."
            />
            <p className="text-xs text-zinc-500 mt-1">These custom directives are safely appended to all resume and cover letter generation prompts.</p>
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
        
      </div>
    </div>
  )
}
