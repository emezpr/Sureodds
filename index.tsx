
import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";

// --- TYPES ---
export interface Prediction {
  match: string;
  league: string;
  kickoffTime: string;
  analysis: {
    form: string;
    keyPlayers: string;
    last5Games: string;
    conditions: string;
  };
  betRecommendation: string;
  confidence: number;
  marketOption: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface CacheData {
  predictions: Prediction[];
  sources: GroundingSource[];
  timestamp: number;
}

export interface AppState {
  predictions: Prediction[];
  sources: GroundingSource[];
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
  isFromCache: boolean;
}

const CACHE_KEY = 'rollover_daily_cache';
const CACHE_EXPIRY = 4 * 60 * 60 * 1000; // 4 Hours

// --- SERVICE ---
const fetchPredictions = async (forceRefresh: boolean = false): Promise<{ predictions: Prediction[], sources: GroundingSource[], cached: boolean }> => {
  // 1. Check Cache
  if (!forceRefresh) {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const parsed: CacheData = JSON.parse(cached);
        const isExpired = Date.now() - parsed.timestamp > CACHE_EXPIRY;
        if (!isExpired) {
          return { ...parsed, cached: true };
        }
      } catch (e) {
        localStorage.removeItem(CACHE_KEY);
      }
    }
  }

  // 2. Call API
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API_KEY is missing. Check your environment settings.");

  const ai = new GoogleGenAI({ apiKey });
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const prompt = `
    Analyze REAL football matches scheduled for today, ${today}. 
    Select exactly 5 high-probability "sure" match predictions suitable for a "rollover" strategy (safe, high probability).
    Market Diversity: Double Chance, Over/Under 1.5/2.5, DNB, BTTS.
    
    Return ONLY a JSON array of 5 objects:
    [
      {
        "match": "Team A vs Team B",
        "league": "League",
        "kickoffTime": "HH:MM GMT",
        "analysis": { "form": "...", "keyPlayers": "...", "last5Games": "...", "conditions": "..." },
        "betRecommendation": "Bet type",
        "confidence": 95,
        "marketOption": "CODE"
      }
    ]
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: "Expert football data analyst specializing in low-risk rollover strategies. Focus on safety and data verification.",
        tools: [{ googleSearch: {} }],
        temperature: 0.1,
      },
    });

    const text = response.text || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("AI failed to generate valid data. Please retry.");
    
    const predictions: Prediction[] = JSON.parse(jsonMatch[0]).slice(0, 5);
    const sources: GroundingSource[] = (response.candidates?.[0]?.groundingMetadata?.groundingChunks || [])
      .filter((c: any) => c.web?.uri)
      .map((c: any) => ({ title: c.web.title || c.web.uri, uri: c.web.uri }));

    // Update Cache
    const cacheData: CacheData = { predictions, sources, timestamp: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));

    return { predictions, sources, cached: false };
  } catch (error: any) {
    if (error.message?.includes('429')) {
      throw new Error("Quota exceeded. Free tier limit reached. Please wait 15-30 minutes.");
    }
    throw error;
  }
};

// --- COMPONENTS ---
const Header: React.FC = () => (
  <header className="sticky top-0 z-50 bg-[#020617]/80 backdrop-blur-md border-b border-white/5">
    <div className="max-w-7xl mx-auto px-4 h-20 flex justify-between items-center">
      <div className="flex items-center space-x-2">
        <div className="bg-emerald-500 p-2 rounded-lg shadow-[0_0_15px_rgba(16,185,129,0.4)]">
          <i className="fas fa-redo-alt text-slate-950 text-xl"></i>
        </div>
        <span className="brand-font text-3xl tracking-wider text-white">ROLLOVER</span>
      </div>
      <button className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-xl text-xs font-black transition-all shadow-lg">UPGRADE VIP</button>
    </div>
  </header>
);

const PredictionCard: React.FC<{ prediction: Prediction; index: number }> = ({ prediction, index }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-3xl overflow-hidden hover:border-emerald-500/40 transition-all mb-6 animate-fadeIn group">
      <div className="p-6">
        <div className="flex justify-between items-start mb-6">
          <div className="flex-1">
            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest px-2 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20 mr-2">{prediction.league}</span>
            <h3 className="text-xl font-bold text-white mt-3 group-hover:text-emerald-400 transition-colors">{prediction.match}</h3>
            <p className="text-slate-500 text-xs mt-1 font-medium"><i className="far fa-clock mr-1"></i> {prediction.kickoffTime}</p>
          </div>
          <div className="bg-slate-950 border border-slate-800 p-3 rounded-2xl text-center min-w-[70px]">
            <div className="text-xl font-black text-emerald-400">{prediction.confidence}%</div>
            <div className="text-[8px] text-slate-500 uppercase font-black tracking-tighter">Certainty</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-emerald-500/5 p-3 rounded-xl border border-emerald-500/10">
            <div className="text-[9px] text-emerald-500 uppercase font-bold mb-1">Rollover Pick</div>
            <div className="text-sm font-bold text-white">{prediction.betRecommendation}</div>
          </div>
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <div className="text-[9px] text-slate-500 uppercase font-bold mb-1">Market Code</div>
            <div className="text-sm font-mono font-bold text-slate-400 uppercase">{prediction.marketOption}</div>
          </div>
        </div>
        <button onClick={() => setIsExpanded(!isExpanded)} className="w-full py-2.5 bg-slate-800/20 hover:bg-slate-800/40 rounded-xl text-slate-400 text-[10px] font-bold uppercase tracking-widest transition-all">
          {isExpanded ? 'Hide Analysis' : 'Show Evidence'}
        </button>
        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-slate-800/50 grid grid-cols-1 md:grid-cols-2 gap-4 text-[13px] text-slate-300 animate-fadeIn">
            <div className="space-y-3">
              <div><h4 className="text-[10px] font-black text-emerald-500 uppercase mb-1">Current Form</h4><p>{prediction.analysis.form}</p></div>
              <div><h4 className="text-[10px] font-black text-emerald-500 uppercase mb-1">Team News</h4><p>{prediction.analysis.keyPlayers}</p></div>
            </div>
            <div className="space-y-3">
              <div><h4 className="text-[10px] font-black text-emerald-500 uppercase mb-1">History</h4><p>{prediction.analysis.last5Games}</p></div>
              <div><h4 className="text-[10px] font-black text-emerald-500 uppercase mb-1">Conditions</h4><p>{prediction.analysis.conditions}</p></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// --- APP ROOT ---
const App: React.FC = () => {
  const [state, setState] = useState<AppState>({ predictions: [], sources: [], loading: true, error: null, lastUpdated: null, isFromCache: false });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async (force: boolean = false) => {
    force ? setIsRefreshing(true) : setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const { predictions, sources, cached } = await fetchPredictions(force);
      setState({
        predictions, sources, loading: false, error: null, isFromCache: cached,
        lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    } catch (err: any) {
      setState(prev => ({ ...prev, loading: false, error: err.message }));
    } finally { setIsRefreshing(false); }
  }, []);

  useEffect(() => { loadData(); }, []);

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 pb-20">
      <Header />
      
      <main className="max-w-3xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <div className="inline-flex items-center space-x-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full mb-6">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Rollover Prediction Engine</span>
          </div>
          <h1 className="brand-font text-6xl md:text-7xl text-white mb-4">DAILY FIVE</h1>
          <p className="text-slate-400 font-medium max-w-md mx-auto">Statistically verified low-risk picks designed for compounding bankroll growth.</p>
          
          <div className="mt-8 flex items-center justify-center space-x-4">
            <button 
              onClick={() => loadData(true)} 
              disabled={state.loading || isRefreshing}
              className="bg-white text-slate-950 px-8 py-3 rounded-2xl font-black hover:bg-slate-200 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              <i className={`fas fa-sync-alt ${isRefreshing ? 'animate-spin' : ''}`}></i>
              {isRefreshing ? 'SCANNING...' : 'SCAN NEW PICKS'}
            </button>
          </div>
          {state.lastUpdated && (
            <div className="mt-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Last Sync: {state.lastUpdated} {state.isFromCache && <span className="text-emerald-500/50">(Local Cache)</span>}
            </div>
          )}
        </div>

        {state.loading && !isRefreshing ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-4">
            <div className="w-10 h-10 border-4 border-slate-800 border-t-emerald-500 rounded-full animate-spin"></div>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Compiling Data Streams...</p>
          </div>
        ) : state.error ? (
          <div className="bg-red-500/5 border border-red-500/10 p-10 rounded-3xl text-center max-w-md mx-auto">
            <i className="fas fa-exclamation-triangle text-red-500 mb-4 text-3xl"></i>
            <h3 className="text-white font-black mb-2 uppercase">Service Limit</h3>
            <p className="text-slate-500 text-sm mb-6 font-medium">{state.error}</p>
            <button onClick={() => loadData(true)} className="bg-white text-black px-8 py-3 rounded-xl text-xs font-black hover:scale-105 transition-transform">RETRY CONNECTION</button>
          </div>
        ) : (
          <div className="space-y-2">
            {state.predictions.map((p, idx) => <PredictionCard key={idx} prediction={p} index={idx} />)}
            
            {state.sources.length > 0 && (
              <div className="mt-12 p-8 bg-slate-900/30 rounded-3xl border border-white/5">
                <div className="flex items-center gap-3 mb-6">
                  <i className="fab fa-google text-slate-700"></i>
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Verified Grounding Sources</h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  {state.sources.map((s, i) => (
                    <a key={i} href={s.uri} target="_blank" rel="noopener noreferrer" className="text-[9px] bg-slate-950 px-4 py-2 rounded-xl text-slate-500 hover:text-emerald-400 border border-white/5 transition-colors">
                      VERIFIED DATA {i+1}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="text-center text-slate-700 py-10">
        <div className="brand-font text-2xl text-slate-600 mb-2">ROLLOVER AI</div>
        <p className="text-[9px] font-black uppercase tracking-widest mb-2">18+ | GAMBLE RESPONSIBLY</p>
        <p className="text-[8px] italic px-10 max-w-sm mx-auto opacity-50">Rollover AI provides probabilistic outcomes. Sports results are inherently unpredictable. Bet only what you can afford to lose.</p>
      </footer>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<React.StrictMode><App /></React.StrictMode>);
