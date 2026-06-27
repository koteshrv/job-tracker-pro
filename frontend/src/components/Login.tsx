import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { api, setToken } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Zap, Lock } from "lucide-react"

export function Login() {
  const navigate = useNavigate()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await api.post("/api/login", { username, password })
      setToken(res.data.token)
      navigate("/app/applications", { replace: true })
    } catch (err: any) {
      setError(err.response?.data?.detail || "Login failed. Check your credentials.")
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 text-zinc-100">
      <div className="w-full max-w-sm bg-[#12141a] border border-white/10 rounded-2xl shadow-2xl p-8 animate-in fade-in zoom-in-95 duration-300">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 flex items-center justify-center shadow-[0_0_20px_rgba(79,70,229,0.3)] mb-3">
            <Zap className="w-6 h-6 text-white animate-pulse" />
          </div>
          <h1 className="text-xl font-bold text-white">CareerAgent</h1>
          <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">AI Career Platform</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
              className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white"
          >
            <Lock className="w-4 h-4 mr-2" />
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </form>
      </div>
    </div>
  )
}
