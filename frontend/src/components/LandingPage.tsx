import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { ShieldAlert, Zap, Lock, Sparkles, Terminal, FileText, ArrowRight, Code2 } from "lucide-react"

export function LandingPage() {
  const navigate = useNavigate()

  const handleEnter = () => {
    navigate("/app/pipeline")
  }

  const features = [
    {
      icon: <ShieldAlert className="w-6 h-6 text-red-400" />,
      title: "ATS Bypass Engine",
      description: "Fight automated rejection with automated injection. AI dynamically injects exact keywords from the JD into your resume."
    },
    {
      icon: <FileText className="w-6 h-6 text-blue-400" />,
      title: "LaTeX Precision",
      description: "Generates mathematically perfect PDFs via LaTeX. 100% parseable by Taleo, Workday, and Greenhouse."
    },
    {
      icon: <Lock className="w-6 h-6 text-emerald-400" />,
      title: "100% Private (Local LLMs)",
      description: "Plug in Ollama and run Llama-3 locally. Your career data never touches Google or OpenAI servers if you don't want it to."
    },
    {
      icon: <Zap className="w-6 h-6 text-amber-400" />,
      title: "Multi-LLM Fallback",
      description: "Configure prioritized fallback chains (e.g. Gemini → Claude → OpenAI) to bypass free-tier rate limits dynamically."
    }
  ]

  return (
    <div className="min-h-screen bg-[#09090b] text-white overflow-x-hidden selection:bg-blue-500/30">
      
      {/* Navbar */}
      <nav className="w-full border-b border-white/5 bg-black/50 backdrop-blur-md fixed top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">CareerAgent</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="https://github.com/koteshrv/job-scraper" target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors flex items-center gap-2">
              <Code2 className="w-4 h-4" />
              GitHub
            </a>
            <button onClick={handleEnter} className="text-sm font-semibold bg-white text-black px-4 py-1.5 rounded-full hover:bg-zinc-200 transition-colors">
              Open App
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        {/* Background Glows */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-blue-600/20 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/4 -translate-y-1/3 w-[500px] h-[300px] bg-purple-600/20 blur-[100px] rounded-full pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center max-w-4xl mx-auto">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-xs font-semibold mb-8 uppercase tracking-widest"
            >
              <Terminal className="w-3.5 h-3.5" />
              Open-Source Project
            </motion.div>
            
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 leading-[1.1]"
            >
              Stop getting rejected by <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500">robots.</span><br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400">Fight back with AI.</span>
            </motion.h1>
            
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-lg md:text-xl text-zinc-400 mb-10 max-w-2xl mx-auto leading-relaxed"
            >
              CareerAgent is an open-source, multi-LLM engine that automatically finds jobs, injects JD keywords into your resume, and builds mathematically perfect LaTeX PDFs to completely bypass corporate ATS filters.
            </motion.p>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <button 
                onClick={handleEnter}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white px-8 py-3.5 rounded-full font-bold text-lg transition-all shadow-[0_0_40px_rgba(79,70,229,0.4)] hover:shadow-[0_0_60px_rgba(79,70,229,0.6)]"
              >
                Launch Demo <ArrowRight className="w-5 h-5" />
              </button>
              <a 
                href="https://github.com/koteshrv/job-scraper" 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white px-8 py-3.5 rounded-full font-bold text-lg transition-all"
              >
                <Code2 className="w-5 h-5" /> View on GitHub
              </a>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="border-t border-white/5 bg-black/20">
        <div className="max-w-7xl mx-auto px-6 py-24">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">Built for Engineers, by Engineers.</h2>
            <p className="text-zinc-400">Everything you need to automate your job search without sacrificing privacy.</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 hover:bg-white/[0.04] transition-colors"
              >
                <div className="w-12 h-12 rounded-xl bg-black/50 border border-white/10 flex items-center justify-center mb-6">
                  {f.icon}
                </div>
                <h3 className="text-lg font-bold mb-3">{f.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{f.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12 text-center text-sm text-zinc-500">
        <p>Built with React, FastAPI, and raw spite against Taleo.</p>
        <p className="mt-2">Open Source under the MIT License.</p>
      </footer>
    </div>
  )
}
