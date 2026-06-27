import { Routes, Route, Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom"
import { KanbanBoard } from "./components/KanbanBoard"
import { SettingsPage } from "./components/SettingsPage"
import { HistoryPage } from "./components/HistoryPage"
import { AnalyticsPage } from "./components/AnalyticsPage"
import { Login } from "./components/Login"
import { LandingPage } from "./components/LandingPage"
import { getToken, clearToken, IS_DEMO } from "@/lib/api"
import { Sparkles, LayoutDashboard, Settings, History, LineChart, LogOut } from "lucide-react"
import type { ReactNode } from "react"

const NAV = [
  { to: "/app/pipeline", label: "Job Pipeline", title: "Pipeline Dashboard", icon: LayoutDashboard },
  { to: "/app/analytics", label: "Analytics", title: "Analytics", icon: LineChart },
  { to: "/app/history", label: "Run History", title: "Run History", icon: History },
  { to: "/app/settings", label: "Settings", title: "Settings", icon: Settings },
]

function RequireAuth({ children }: { children: ReactNode }) {
  // In demo mode (GitHub Pages), skip auth entirely so visitors see the app.
  if (IS_DEMO) return <>{children}</>
  return getToken() ? <>{children}</> : <Navigate to="/login" replace />
}

function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const current = NAV.find(n => location.pathname.startsWith(n.to))
  const title = current?.title || "Dashboard"

  const handleLogout = () => {
    clearToken()
    navigate("/login", { replace: true })
  }

  return (
    <div className="min-h-screen text-zinc-100 selection:bg-blue-500/30 font-sans flex flex-col overflow-hidden">

      {/* Demo mode banner */}
      {IS_DEMO && (
        <div className="w-full bg-gradient-to-r from-blue-600/90 via-indigo-600/90 to-purple-600/90 text-white text-xs font-medium px-4 py-1.5 flex items-center justify-center gap-3 z-50">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Live Demo — running with sample data
          </span>
          <span className="text-white/50">·</span>
          <a href="https://github.com/koteshrv/job-scraper" target="_blank" rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-white/80 transition-colors">
            ⭐ Star on GitHub
          </a>
          <span className="text-white/50">·</span>
          <span className="text-white/70">Self-host with your own backend for full functionality</span>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Navigation */}
        <aside className="w-64 border-r border-white/5 bg-black/40 hidden md:flex flex-col z-40">
          <div className="h-20 flex items-center px-6 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 flex items-center justify-center shadow-[0_0_20px_rgba(79,70,229,0.3)]">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
              <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400 tracking-tight">
                CareerAgent
              </h1>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Application Tracker</p>
            </div>
            </div>
          </div>

          <nav className="flex-1 px-4 py-8 space-y-2">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `px-3 py-2.5 rounded-lg flex items-center gap-3 font-medium cursor-pointer transition-colors ${
                    isActive
                      ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                      : "text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent"
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                {label}
              </NavLink>
            ))}
          </nav>

          {!IS_DEMO && (
            <div className="px-4 pb-6">
              <button
                onClick={handleLogout}
                className="w-full px-3 py-2.5 rounded-lg flex items-center gap-3 font-medium text-zinc-400 hover:text-red-400 hover:bg-red-500/10 border border-transparent transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          )}
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col h-screen relative">
          {/* Top Header */}
          <header className="h-20 border-b border-white/5 bg-black/20 flex items-center justify-between px-8 z-30 sticky top-0">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white">{title}</h2>
              <p className="text-sm text-zinc-400 mt-1">Track and manage your automated job matches.</p>
            </div>
          </header>

          {/* Routed Content */}
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/app" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Navigate to="/app/pipeline" replace />} />
        <Route path="pipeline" element={<div className="flex-1 overflow-x-auto overflow-y-hidden p-8 custom-scrollbar"><KanbanBoard /></div>} />
        <Route path="analytics" element={<div className="flex-1 overflow-y-auto custom-scrollbar"><AnalyticsPage /></div>} />
        <Route path="history" element={<div className="flex-1 overflow-y-auto custom-scrollbar"><HistoryPage /></div>} />
        <Route path="settings" element={<div className="flex-1 overflow-y-auto custom-scrollbar"><SettingsPage /></div>} />
        <Route path="*" element={<Navigate to="/app/pipeline" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
