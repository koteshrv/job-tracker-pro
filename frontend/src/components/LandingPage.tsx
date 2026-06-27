import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { ShieldAlert, Zap, Lock, Sparkles, FileText, ArrowRight, Code2 } from "lucide-react"
import { useState, useEffect } from "react"

export function LandingPage() {
  const navigate = useNavigate()
  const [terminalText, setTerminalText] = useState("")

  const handleEnter = () => {
    navigate("/app/applications")
  }

  useEffect(() => {
    const logs = [
      "Initializing CareerAgent Platform...",
      "Loading local Ollama Llama-3 model... [OK]",
      "Analyzing Job Description for \"Backend Engineer\"...",
      "Extracting required competencies... [PostgreSQL, System Design, gRPC]",
      "Aligning candidate qualifications...",
      "Compiling pristine LaTeX resume...",
      "PDF Generated successfully. ATS Compatibility: 98%"
    ]
    
    let currentLog = 0
    let currentChar = 0
    let text = ""
    let timeout: ReturnType<typeof setTimeout>

    const typeWriter = () => {
      if (currentLog < logs.length) {
        if (currentChar < logs[currentLog].length) {
          text += logs[currentLog].charAt(currentChar)
          setTerminalText(text)
          currentChar++
          timeout = setTimeout(typeWriter, Math.random() * 30 + 10)
        } else {
          text += "\n"
          setTerminalText(text)
          currentChar = 0
          currentLog++
          timeout = setTimeout(typeWriter, 800)
        }
      } else {
        // Loop it
        timeout = setTimeout(() => {
          text = ""
          setTerminalText(text)
          currentLog = 0
          currentChar = 0
          typeWriter()
        }, 5000)
      }
    }

    timeout = setTimeout(typeWriter, 1000)
    return () => clearTimeout(timeout)
  }, [])

  const features = [
    {
      icon: <ShieldAlert className="w-6 h-6 text-red-400" />,
      title: "Intelligent ATS Alignment",
      description: "Ensure your true qualifications are recognized. CareerAgent dynamically aligns your resume with job requirements for accurate parsing by enterprise ATS platforms."
    },
    {
      icon: <FileText className="w-6 h-6 text-blue-400" />,
      title: "LaTeX Precision",
      description: "Generates mathematically perfect PDFs via LaTeX. Ensuring 100% data fidelity when parsed by Taleo, Workday, and Greenhouse."
    },
    {
      icon: <Lock className="w-6 h-6 text-emerald-400" />,
      title: "100% Private (Local LLMs)",
      description: "Plug in Ollama and run Llama-3 locally. Your career data never touches Google or OpenAI servers if you require strict privacy."
    },
    {
      icon: <Zap className="w-6 h-6 text-amber-400" />,
      title: "Multi-LLM Routing",
      description: "Configure prioritized fallback chains (e.g. Gemini → Claude → OpenAI) for maximum reliability and rate-limit management."
    }
  ]

  return (
    <div className="min-h-screen bg-[#09090b] text-white overflow-x-hidden selection:bg-blue-500/30 font-sans">
      
      {/* Navbar */}
      <nav className="w-full border-b border-white/5 bg-black/50 backdrop-blur-md fixed top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white animate-pulse" />
            </div>
            <span className="font-bold text-lg tracking-tight">CareerAgent</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="https://github.com/koteshrv/career-agent" target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors flex items-center gap-2">
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
      <div className="relative pt-32 pb-20 lg:pt-40 lg:pb-32 overflow-hidden">
        {/* Background Glows (Animated) */}
        <motion.div 
          animate={{ scale: [1, 1.1, 1], opacity: [0.2, 0.3, 0.2] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/2 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-blue-600/30 blur-[120px] rounded-full pointer-events-none" 
        />
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute top-1/2 right-1/4 translate-x-1/4 -translate-y-1/3 w-[500px] h-[300px] bg-purple-600/30 blur-[100px] rounded-full pointer-events-none" 
        />
        
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left side text */}
            <div className="text-left">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-xs font-semibold mb-6 uppercase tracking-widest"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Enterprise-Grade AI
              </motion.div>
              
              <motion.h1 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6 leading-[1.1]"
              >
                Optimize your career trajectory.<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400">Powered by AI.</span>
              </motion.h1>
              
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="text-lg text-zinc-400 mb-8 leading-relaxed max-w-xl"
              >
                CareerAgent is an open-source, multi-LLM platform that automates job discovery, perfectly aligns your resume with job requirements, and generates pristine LaTeX PDFs designed for flawless parsing by modern ATS systems.
              </motion.p>
              
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="flex flex-col sm:flex-row items-center gap-4"
              >
                <button 
                  onClick={handleEnter}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white px-8 py-3.5 rounded-full font-bold text-lg transition-all shadow-[0_0_40px_rgba(79,70,229,0.4)] hover:shadow-[0_0_60px_rgba(79,70,229,0.6)]"
                >
                  Launch Demo <ArrowRight className="w-5 h-5" />
                </button>
                <a 
                  href="https://github.com/koteshrv/career-agent" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white px-8 py-3.5 rounded-full font-bold text-lg transition-all"
                >
                  <Code2 className="w-5 h-5" /> View on GitHub
                </a>
              </motion.div>
            </div>

            {/* Right side animated Agent Feed */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.4 }}
              className="hidden lg:block relative"
            >
              {/* Agent Activity Window */}
              <div className="bg-[#0c0d12]/90 border border-white/10 rounded-xl shadow-2xl overflow-hidden relative backdrop-blur-md">
                <div className="h-12 bg-white/[0.02] border-b border-white/5 flex items-center px-4 justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-blue-500/20 flex items-center justify-center">
                      <Sparkles className="w-2.5 h-2.5 text-blue-400" />
                    </div>
                    <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Live Agent Activity</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-[10px] font-medium text-green-400">Processing</span>
                  </div>
                </div>
                <div className="p-6 font-mono text-sm leading-relaxed min-h-[320px] text-zinc-300">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 shrink-0">
                        <Zap className="w-4 h-4 text-amber-400" />
                      </div>
                      <div className="flex-1 whitespace-pre-wrap">
                        {terminalText}
                        <motion.span 
                          animate={{ opacity: [1, 0] }} 
                          transition={{ repeat: Infinity, duration: 0.8 }}
                          className="inline-block w-1.5 h-3.5 bg-blue-400 align-middle ml-1 rounded-sm"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="border-t border-white/5 bg-black/20 relative">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        <div className="max-w-7xl mx-auto px-6 py-24 relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">Engineered for Success.</h2>
            <p className="text-zinc-400 max-w-2xl mx-auto">A comprehensive suite of tools to automate your job search while maintaining the highest standards of data privacy and professional formatting.</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:bg-white/[0.04] hover:-translate-y-1 transition-all duration-300 shadow-xl"
              >
                <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-6">
                  {f.icon}
                </div>
                <h3 className="text-lg font-bold mb-3 text-white">{f.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{f.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12 text-center text-sm text-zinc-500 bg-black">
        <p>Built with React, FastAPI, and rigorous software engineering.</p>
        <p className="mt-2">Open Source under the MIT License.</p>
      </footer>
    </div>
  )
}
