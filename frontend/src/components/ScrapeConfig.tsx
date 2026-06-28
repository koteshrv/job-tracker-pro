import { useState, useEffect } from "react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { useToast } from "./Toast"
import { X, Check } from "lucide-react"

export function ScrapeConfig() {
  const { toast } = useToast()
  const [keywords, setKeywords] = useState<string[]>([])
  const [companies, setCompanies] = useState<string[]>([])
  const [activeCompanies, setActiveCompanies] = useState<string[]>([])
  const [keywordInput, setKeywordInput] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get("/api/companies").then(res => setCompanies(res.data.companies || []))
    api.get("/api/settings").then(res => {
      setKeywords(parseList(res.data.search_keywords))
      setActiveCompanies(parseList(res.data.active_companies))
    })
  }, [])

  const parseList = (raw: string | null | undefined): string[] => {
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  const addKeyword = () => {
    const v = keywordInput.trim().toLowerCase()
    if (v && !keywords.includes(v)) setKeywords([...keywords, v])
    setKeywordInput("")
  }

  const handleKeywordKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      addKeyword()
    } else if (e.key === "Backspace" && !keywordInput && keywords.length) {
      setKeywords(keywords.slice(0, -1))
    }
  }

  const removeKeyword = (kw: string) => setKeywords(keywords.filter(k => k !== kw))

  const toggleCompany = (c: string) =>
    setActiveCompanies(activeCompanies.includes(c) ? activeCompanies.filter(x => x !== c) : [...activeCompanies, c])

  const allCompanies = activeCompanies.length === 0

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put("/api/settings", {
        search_keywords: JSON.stringify(keywords),
        active_companies: JSON.stringify(activeCompanies),
      })
      toast("Scrape configuration saved", "success")
    } catch {
      toast("Error saving scrape configuration", "error")
    }
    setSaving(false)
  }

  return (
    <div className="bg-[#12141a] rounded-2xl border border-white/5 p-6 shadow-xl space-y-6">
      <div>
        <h3 className="text-lg font-bold text-white">Scrape Configuration</h3>
        <p className="text-sm text-zinc-400 mt-1">Keywords and companies the scraper targets. Runs automatically on your cron schedule.</p>
      </div>

      {/* Keywords */}
      <div>
        <label className="block text-sm font-medium text-zinc-400 mb-2">Search Keywords</label>
        <div className="flex flex-wrap gap-2 bg-black/40 border border-white/10 rounded-lg p-3 focus-within:border-blue-500/50 transition-colors">
          {keywords.map(kw => (
            <span key={kw} className="flex items-center gap-1.5 bg-blue-500/10 text-blue-300 border border-blue-500/20 rounded-full pl-3 pr-1.5 py-1 text-xs font-medium">
              {kw}
              <button onClick={() => removeKeyword(kw)} className="hover:bg-white/10 rounded-full p-0.5 transition-colors">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={keywordInput}
            onChange={e => setKeywordInput(e.target.value)}
            onKeyDown={handleKeywordKey}
            onBlur={addKeyword}
            placeholder={keywords.length ? "Add keyword..." : "e.g. python, backend, data engineer"}
            className="flex-1 min-w-[140px] bg-transparent text-sm text-white placeholder:text-zinc-600 focus:outline-none"
          />
        </div>
        <p className="text-xs text-zinc-500 mt-1">Press Enter or comma to add. A job matches if its title contains any keyword.</p>
      </div>

      {/* Companies */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-zinc-400">Target Companies</label>
          <span className="text-xs text-zinc-500">{allCompanies ? "All companies" : `${activeCompanies.length} selected`}</span>
        </div>
        <div className="bg-black/40 border border-white/10 rounded-lg p-3 max-h-56 overflow-y-auto custom-scrollbar">
          <button
            onClick={() => setActiveCompanies([])}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs font-medium mb-1 transition-colors ${allCompanies ? "text-blue-400 bg-blue-500/10" : "text-zinc-400 hover:bg-white/5"}`}
          >
            <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center ${allCompanies ? "bg-blue-500 border-blue-500" : "border-white/20"}`}>
              {allCompanies && <Check className="w-2.5 h-2.5 text-white" />}
            </span>
            All (scrape everything)
          </button>
          <div className="grid grid-cols-2 gap-0.5">
            {companies.map(c => {
              const checked = activeCompanies.includes(c)
              return (
                <button
                  key={c}
                  onClick={() => toggleCompany(c)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-xs font-medium text-zinc-300 hover:bg-white/5 transition-colors"
                >
                  <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 ${checked ? "bg-blue-500 border-blue-500" : "border-white/20"}`}>
                    {checked && <Check className="w-2.5 h-2.5 text-white" />}
                  </span>
                  <span className="truncate text-left">{c}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-500 text-white">
          {saving ? "Saving..." : "Save Scrape Config"}
        </Button>
      </div>
    </div>
  )
}
