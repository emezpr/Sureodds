
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

export interface AppState {
  predictions: Prediction[];
  sources: GroundingSource[];
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

// --- SERVICE ---
const fetchPredictions = async (excludeMatches: string[] = []): Promise<{ predictions: Prediction[], sources: GroundingSource[] }> => {
  const apiKey = process.env.API_KEY;
  
  if (!apiKey) {
    throw new Error("API_KEY is missing in Vercel settings.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const systemInstruction = "You are a world-class football data analyst and betting specialist. Your goal is to provide high-accuracy betting tips based on real-world data.";

  const prompt = `
    Analyze REAL football matches scheduled for today, ${today}. 
    Search for top fixtures in major leagues (English Premier League, La Liga, Serie A, Bundesliga, Ligue 1, etc.).
    
    Select exactly 5 "surest" match predictions. Use current team form, player injuries/suspensions, head-to-head records, and tactical stakes as criteria.
    ${excludeMatches.length > 0 ? `Try to find a different set of matches than these: ${excludeMatches.join(', ')}.` : ''}
    
    CRITICAL MARKET DIVERSITY: 
    Select the safest option for each match from: Double Chance (1X, X2), Over/Under Goals (O1.5, U3.5), Draw No Bet (DNB), Both Teams to Score (BTTS).

    Return ONLY a JSON array of 5 objects:
    [
      {
        "match": "Team A vs Team B",
        "league": "League Name",
        "kickoffTime": "HH:MM GMT",
        "analysis": {
          "form": "Detailed form info",
          "keyPlayers": "Injury/player news",
          "last5Games": "H2H data",
          "conditions": "Pitch/weather/stadium"
        },
        "betRecommendation": "Recommended Market",
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
        systemInstruction,
        tools: [{ googleSearch: {} }],
        temperature: 0.1,
      },
    });

    const text = response.text || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    let predictions: Prediction[] = [];
    
    if (jsonMatch) {
      try {
        predictions = JSON.parse(jsonMatch[0]);
      } catch (e) { 
        console.error("JSON Parsing failed", text);
        throw new Error("The AI returned invalid data. Please try again.");
      }
    } else {
      throw new Error("The AI could not find enough quality matches for today. Try refreshing.");
    }

    const sources: GroundingSource[] = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    chunks.forEach((chunk: any) => {
      if (chunk.web?.uri) {
        sources.push({ title: chunk.web.title || chunk.web.uri, uri: chunk.web.uri });
      }
    });

    const uniqueSources = Array.from(new Set(sources.map(s => s.uri)))
      .map(uri => sources.find(s => s.uri === uri) as GroundingSource);

    return { predictions: predictions.slice(0, 5), sources: uniqueSources };
  } catch (error: any) {
    console.error("Fetch Error:", error);
    if (error.message?.includes('429')) {
      throw new Error("Daily AI limits reached. Please try again in 1 hour.");
    }
    throw new Error(error.message || "An unexpected error occurred.");
  }
};

// --- COMPONENTS ---
const Header: React.FC = () => (
  <header className="sticky top-0 z-50 bg-[#020617]/80 backdrop-blur-md border-b border-white/5">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between items-center h-20">
        <div className="flex items-center space-x-2">
          <div className="bg-emerald-500 p-2 rounded-lg">
            <i className="fas fa-chart-line text-slate-950 text-xl"></i>
          </div>
          <span className="brand-font text-3xl tracking-wider text-white">SUREODDS AI</span>
        </div>
        <nav className="hidden md:flex space-x-8 text-sm font-medium">
          <a href="#" className="text-emerald-400">Daily Picks</a>
          <a href="#" className="text-slate-400 hover:text-white transition">Live Stats</a>
          <a href="#" className="text-slate-400 hover:text-white transition">Strategies</a>
        </nav>
        <div className="flex items-center">
           <button className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-xl text-sm font-bold transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)]">
              JOIN VIP
           </button>
        </div>
      </div>
    </div>
  </header>
);

const PredictionCard: React.FC<{ prediction: Prediction; index: number }> = ({ prediction, index }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const getMarketIcon = (rec: string) => {
    const low = rec.toLowerCase();
    if (low.includes('over') || low.includes('under') || low.includes('goal')) return 'fa-futbol';
    if (low.includes('double') || low.includes('1x') || low.includes('x2')) return 'fa-shield-alt';
    if (low.includes('btts') || low.includes('score')) return 'fa-exchange-alt';
    return 'fa-ticket-alt';
  };

  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-3xl overflow-hidden hover:border-emerald-500/40 transition-all duration-300 group backdrop-blur-sm animate-fadeIn mb-6">
      <div className="p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-2">
              <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest px-2 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20">
                {prediction.league}
              </span>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">#{index + 1} DAILY PICK</span>
            </div>
            <h3 className="text-2xl font-bold text-white group-hover:text-emerald-400 transition-colors leading-tight">{prediction.match}</h3>
            <p className="text-slate-500 text-sm mt-2 flex items-center font-medium">
              <i className="far fa-clock mr-2 text-emerald-500/50"></i> {prediction.kickoffTime}
            </p>
          </div>
          <div className="bg-slate-950/80 px-4 py-3 rounded-2xl border border-slate-800 text-center min-w-[100px]">
            <div className="text-2xl font-black text-emerald-400">{prediction.confidence}%</div>
            <div className="text-[9px] text-slate-500 uppercase font-black tracking-tighter">Confidence</div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="flex items-center space-x-4 p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
              <i className={`fas ${getMarketIcon(prediction.betRecommendation)} text-xl`}></i>
            </div>
            <div>
              <div className="text-[10px] text-emerald-500/60 uppercase font-black">Recommended Bet</div>
              <div className="text-lg font-bold text-white">{prediction.betRecommendation}</div>
            </div>
          </div>
          <div className="flex items-center justify-between p-4 bg-slate-950/40 rounded-2xl border border-slate-800">
             <div>
              <div className="text-[10px] text-slate-500 uppercase font-black">Market Option</div>
              <div className="text-lg font-mono font-bold text-slate-300 uppercase">{prediction.marketOption}</div>
            </div>
            <i className="fas fa-barcode text-slate-700"></i>
          </div>
        </div>
        <button onClick={() => setIsExpanded(!isExpanded)} className="w-full py-3 bg-slate-800/30 hover:bg-slate-800/50 rounded-xl text-slate-400 hover:text-white text-xs font-bold uppercase tracking-widest flex items-center justify-center transition-all">
          {isExpanded ? 'Collapse Analysis' : 'View Data-Driven Analysis'}
          <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'} ml-3`}></i>
        </button>
        {isExpanded && (
          <div className="mt-6 pt-6 border-t border-slate-800/50 space-y-6 animate-fadeIn">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-300">
              <div className="space-y-4">
                <div><h4 className="text-[10px] font-black text-emerald-500 uppercase mb-1">Form Guide</h4><p className="leading-relaxed">{prediction.analysis.form}</p></div>
                <div><h4 className="text-[10px] font-black text-emerald-500 uppercase mb-1">Team News</h4><p className="leading-relaxed">{prediction.analysis.keyPlayers}</p></div>
              </div>
              <div className="space-y-4">
                <div><h4 className="text-[10px] font-black text-emerald-500 uppercase mb-1">Last 5 / History</h4><p className="italic text-slate-400 leading-relaxed">{prediction.analysis.last5Games}</p></div>
                <div><h4 className="text-[10px] font-black text-emerald-500 uppercase mb-1">Conditions</h4><p className="leading-relaxed">{prediction.analysis.conditions}</p></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// --- APP ROOT ---
const App: React.FC = () => {
  const [state, setState] = useState<AppState>({ predictions: [], sources: [], loading: true, error: null, lastUpdated: null });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const loadData = useCallback(async (isRefresh: boolean = false) => {
    isRefresh ? setIsRefreshing(true) : setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const { predictions, sources } = await fetchPredictions(isRefresh ? state.predictions.map(p => p.match) : []);
      setState({
        predictions, sources, loading: false,
        error: predictions.length === 0 ? "No suitable matches found right now. Try refreshing in a moment." : null,
        lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    } catch (err: any) {
      setState(prev => ({ ...prev, loading: false, error: err.message }));
    } finally { setIsRefreshing(false); }
  }, [state.predictions]);

  useEffect(() => { loadData(); }, []);

  const copyBetsToClipboard = () => {
    const text = state.predictions.map((p, i) => `${i+1}. ${p.match} (${p.league}) - Pick: ${p.betRecommendation}`).join('\n');
    navigator.clipboard.writeText(`⚡️ SUREODDS AI - DAILY 5\n\n${text}\n\nSTRICTLY 18+ | GAMBLE RESPONSIBLY`).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200">
      <Header />
      
      <div className="bg-emerald-600/10 border-b border-emerald-500/20 py-2.5 overflow-hidden">
        <div className="flex animate-marquee whitespace-nowrap items-center text-[10px] font-black text-emerald-400 uppercase tracking-widest">
          {[...Array(6)].map((_, i) => (
            <span key={i} className="mx-8 flex items-center gap-2">
              <i className="fas fa-check-circle"></i> 90%+ HISTORICAL WIN RATE
              <i className="fas fa-bolt ml-4"></i> AI-POWERED ANALYTICS
              <i className="fas fa-search ml-4"></i> SEARCH GROUNDING ENABLED
            </span>
          ))}
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 py-16">
        <section className="text-center mb-16 space-y-8 relative">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-emerald-500/10 blur-[100px] rounded-full -z-10"></div>
          <div className="inline-block px-4 py-1.5 bg-slate-900/50 rounded-full border border-slate-800 text-[10px] font-black text-slate-400 uppercase tracking-widest">
            FLASH ENGINE v1.2
          </div>
          <h1 className="brand-font text-6xl md:text-8xl text-white tracking-tighter leading-none">
            THE <span className="text-emerald-500">DAILY FIVE</span>
          </h1>
          <p className="text-slate-400 max-w-xl mx-auto text-lg font-medium">
            Professional AI-native betting analyst. 5 safest value picks scanned from global leagues in real-time.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4 pt-4">
            <button 
              onClick={() => loadData(true)} 
              disabled={state.loading || isRefreshing} 
              className="bg-white text-slate-950 px-10 py-5 rounded-2xl font-black text-lg hover:bg-slate-200 transition-all flex items-center justify-center space-x-3 disabled:opacity-50"
            >
              <i className={`fas fa-sync-alt ${isRefreshing ? 'animate-spin' : ''}`}></i>
              <span>{isRefreshing ? 'RE-ANALYZING...' : 'REFRESH SLIP'}</span>
            </button>
            {!state.loading && state.predictions.length > 0 && (
              <button onClick={copyBetsToClipboard} className="bg-slate-900/50 text-white px-10 py-5 rounded-2xl font-black text-lg border border-white/10 transition-all flex items-center justify-center space-x-3">
                <i className={`fas ${copySuccess ? 'fa-check text-emerald-400' : 'fa-copy'}`}></i>
                <span>{copySuccess ? 'COPIED!' : 'COPY SLIP'}</span>
              </button>
            )}
          </div>
        </section>

        {state.loading && !isRefreshing ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="w-12 h-12 border-4 border-slate-800 border-t-emerald-500 rounded-full animate-spin"></div>
            <p className="text-slate-500 text-xs font-black uppercase tracking-widest">Searching Global Fixtures...</p>
          </div>
        ) : state.error ? (
          <div className="bg-red-500/5 border border-red-500/10 p-12 rounded-3xl text-center max-w-lg mx-auto">
            <h3 className="text-xl font-black text-white mb-2 uppercase">Service Notice</h3>
            <p className="text-slate-500 mb-8 font-medium">{state.error}</p>
            <button onClick={() => loadData()} className="bg-white text-black px-8 py-3 rounded-xl font-bold transition-transform hover:scale-105 active:scale-95">RETRY NOW</button>
          </div>
        ) : (
          <div className="space-y-2">
            {state.predictions.map((p, idx) => <PredictionCard key={idx} prediction={p} index={idx} />)}
            
            <div className="mt-20 p-8 bg-slate-900/20 rounded-3xl border border-white/5 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xs font-black text-white uppercase tracking-widest mb-1">Intelligence Sources</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Real-time data verified via Google Search</p>
                </div>
                <i className="fab fa-google text-slate-700 text-xl"></i>
              </div>
              <div className="flex flex-wrap gap-2">
                {state.sources.map((s, i) => (
                  <a key={i} href={s.uri} target="_blank" rel="noopener noreferrer" className="text-[10px] bg-slate-950 border border-white/5 px-4 py-2 rounded-xl text-slate-500 hover:text-emerald-400 transition-colors flex items-center gap-2">
                    <span className="w-1 h-1 bg-emerald-500/50 rounded-full"></span>
                    SOURCE #{i+1}
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="py-20 text-center border-t border-white/5 bg-[#01040f]">
        <div className="brand-font text-3xl mb-4 text-white">SUREODDS AI</div>
        <div className="max-w-md mx-auto px-4">
          <p className="text-slate-600 text-[10px] font-black tracking-widest uppercase mb-4">STRICTLY 18+ | GAMBLE RESPONSIBLY</p>
          <p className="text-slate-700 text-[9px] leading-relaxed italic">
            SureOdds AI uses mathematical analysis of publicly available sports data. Outcomes are never guaranteed. Always bet responsibly.
          </p>
        </div>
      </footer>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<React.StrictMode><App /></React.StrictMode>);
