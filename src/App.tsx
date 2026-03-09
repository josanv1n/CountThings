import React, { useState, useRef, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import {
  Camera,
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Package,
  Image as ImageIcon,
  RotateCcw,
  SwitchCamera,
  Zap,
  Cpu,
  Settings,
  X,
  Cloud,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { countObjectsInImage, CountResult } from './services/gemini';
import { saveToGoogleSheets, fetchHistory, scanPhotoViaProxy } from './services/storage';

const DEFAULT_WEB_APP_URL = import.meta.env.VITE_WEB_APP_URL || '';

interface HistoryItem {
  ID: string;
  Timestamp: string;
  photoBase64: string;
  ResultScan: string;
  Notes: string;
  [k: string]: any;
}

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [isCounting, setIsCounting] = useState(false);
  const [result, setResult] = useState<CountResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'camera' | 'upload'>('camera');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [webAppUrl, setWebAppUrl] = useState(DEFAULT_WEB_APP_URL);
  const [showSettings, setShowSettings] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<HistoryItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadHistory = useCallback(async (url: string) => {
    if (!url) return;
    setIsLoadingHistory(true);
    try {
      const data = await fetchHistory(url);
      setHistory(data || []);
    } catch (err: any) {
      console.error("Failed to load history:", err);
      // jangan set global error agar UI utama tidak terblokir
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    const savedUrl = localStorage.getItem('webAppUrl');
    const urlToUse = savedUrl || DEFAULT_WEB_APP_URL;
    if (urlToUse) {
      setWebAppUrl(urlToUse);
      loadHistory(urlToUse);
    }
  }, [loadHistory]);

  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const capture = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      setImage(imageSrc);
      handleCount(imageSrc);
    }
  }, [webcamRef]);

  const toggleCamera = () => {
    setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setImage(base64String);
        handleCount(base64String);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCount = async (imgData: string) => {
    setIsCounting(true);
    setError(null);
    setResult(null);
    try {
      let countResult: CountResult;
      // Jika ada Web App URL, gunakan Apps Script sebagai Proxy
      if (webAppUrl) {
        const json = await scanPhotoViaProxy(webAppUrl, imgData);
        if (json.status === 'success') {
          // Apps Script mengembalikan data, kita coba parse jika itu string JSON
          if (typeof json.data === 'string') {
            try {
              countResult = JSON.parse(json.data);
            } catch (e) {
              countResult = { totalCount: 0, items: [], description: json.data } as CountResult;
            }
          } else {
            countResult = json.data as CountResult;
          }
        } else {
          throw new Error(json.message || 'Gagal scan lewat Apps Script');
        }
      } else {
        // Jika tidak ada URL, langsung panggil Gemini API (butuh API Key di env)
        countResult = await countObjectsInImage(imgData);
      }

      setResult(countResult);

      confetti({
        particleCount: 150,
        spread: 100,
        colors: ['#00ff66', '#00f2ff', '#ff00e5'],
        origin: { y: 0.6 }
      });
    } catch (err: any) {
      const errorMessage = err?.message || 'Gagal scan. Coba lagi gih!';
      if (errorMessage.includes('GEMINI_API_KEY')) {
        setError('Error: GEMINI_API_KEY belum disetting di Script Properties Google Apps Script!');
      } else if (errorMessage.includes('404')) {
        setError('Error 404: Model Gemini tidak ditemukan. Pastikan kode Apps Script sudah diupdate ke versi terbaru.');
      } else {
        setError(`Waduh, gagal scan nih: ${errorMessage}`);
      }
      console.error(err);
    } finally {
      setIsCounting(false);
    }
  };

  const handleSave = async () => {
    if (!result || !image || !webAppUrl) {
      if (!webAppUrl) setShowSettings(true);
      return;
    }
    setIsSaving(true);
    setSaveStatus('loading');
    try {
      const rincian = result.items.map(i => `${i.name}: ${i.count}`).join(', ');
      const saveResponse = await saveToGoogleSheets(webAppUrl, {
        action: 'SAVE_DATA',
        ID: Math.random().toString(36).substr(2, 9).toUpperCase(),
        photoBase64: image,
        ResultScan: `Total: ${result.totalCount} (${rincian})`,
        Notes: result.description
      });

      if (saveResponse.status === 'success') {
        setSaveStatus('success');
        loadHistory(webAppUrl);
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        throw new Error(saveResponse.message || 'Gagal simpan');
      }
    } catch (err: any) {
      setSaveStatus('error');
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteHistory = async (id: string) => {
    if (!webAppUrl) {
      setShowSettings(true);
      return;
    }
    const ok = window.confirm('Hapus riwayat ini dari spreadsheet? (Foto di Drive TIDAK akan dihapus)');
    if (!ok) return;
    setDeletingId(id);
    setError(null);
    try {
      const resp = await fetch(webAppUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'DELETE_DATA', ID: id })
      });
      const json = await resp.json();
      if (json.status === 'success') {
        // reload history
        await loadHistory(webAppUrl);
      } else {
        throw new Error(json.message || 'Gagal hapus data');
      }
    } catch (err: any) {
      console.error(err);
      setError(`Gagal hapus: ${err?.message || err}`);
    } finally {
      setDeletingId(null);
    }
  };

  const saveSettings = (url: string) => {
    localStorage.setItem('webAppUrl', url);
    setWebAppUrl(url);
    setShowSettings(false);
    loadHistory(url);
  };

  const reset = () => {
    setImage(null);
    setResult(null);
    setError(null);
    setSaveStatus('idle');
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white font-sans selection:bg-neon-cyan selection:text-black">
      {/* Android Style Header */}
      <header className="bg-[#0a0a0f]/80 backdrop-blur-md border-b border-white/10 py-4 px-6 sticky top-0 z-50 flex items-center justify-between">
        <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="flex items-center gap-3" >
          <div className="bg-neon-green p-2 rounded-xl neon-glow-green">
            <Cpu className="text-black w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tighter glitch-text uppercase">CountThings</h1>
            <p className="text-[10px] text-neon-green font-mono uppercase tracking-widest">Techno Vision v2.0</p>
          </div>
        </motion.div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSettings(true)} className="p-2 text-white/40 hover:text-neon-cyan transition-colors" >
            <Settings className="w-5 h-5" />
          </button>
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
            <button
              onClick={() => setMode('camera')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all uppercase tracking-wider ${mode === 'camera' ? 'bg-neon-green text-black shadow-[0_0_10px_rgba(0,255,102,0.5)]' : 'text-white/40 hover:text-white'}`}
            >
              Cam
            </button>
            <button
              onClick={() => setMode('upload')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all uppercase tracking-wider ${mode === 'upload' ? 'bg-neon-cyan text-black shadow-[0_0_10px_rgba(0,242,255,0.5)]' : 'text-white/40 hover:text-white'}`}
            >
              File
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 pb-24">
        <div className="space-y-6">
          {/* Scanner Viewport */}
          <motion.section initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative" >
            <div className="bg-black rounded-3xl shadow-2xl border-2 border-white/10 overflow-hidden aspect-[3/4] relative neon-border-green">
              {!image ? (
                <>
                  {mode === 'camera' ? (
                    <div className="w-full h-full relative">
                      <Webcam
                        audio={false}
                        ref={webcamRef}
                        screenshotFormat="image/jpeg"
                        className="w-full h-full object-cover"
                        videoConstraints={{ facingMode }}
                        mirrored={facingMode === 'user'}
                        imageSmoothing={true}
                        disablePictureInPicture={true}
                        forceScreenshotSourceSize={false}
                        onUserMedia={() => {}}
                        onUserMediaError={() => {}}
                        screenshotQuality={0.92}
                      />
                      <div className="scanline"></div>
                      {/* HUD Elements */}
                      <div className="absolute inset-0 flex flex-col justify-between p-6 pointer-events-none">
                        <div className="flex justify-between items-start">
                          <div className="w-8 h-8 border-t-2 border-l-2 border-neon-green"></div>
                          <div className="w-8 h-8 border-t-2 border-r-2 border-neon-green"></div>
                        </div>
                        <div className="self-center">
                          <div className="w-16 h-16 border border-white/20 rounded-full flex items-center justify-center">
                            <div className="w-12 h-12 border border-neon-cyan/30 rounded-full animate-ping"></div>
                          </div>
                        </div>
                        <div className="flex justify-between items-end">
                          <div className="w-8 h-8 border-b-2 border-l-2 border-neon-green"></div>
                          <div className="w-8 h-8 border-b-2 border-r-2 border-neon-green"></div>
                        </div>
                      </div>

                      {/* Camera Toggle Button */}
                      <button onClick={toggleCamera} className="absolute top-4 right-4 bg-black/50 backdrop-blur-md p-3 rounded-full border border-white/20 text-white active:scale-90 transition-transform pointer-events-auto" >
                        <SwitchCamera className="w-6 h-6" />
                      </button>
                    </div>
                  ) : (
                    <div onClick={() => fileInputRef.current?.click()} className="w-full h-full flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-colors techno-grid" >
                      <motion.div animate={{ y: [0, -10, 0] }} transition={{ repeat: Infinity, duration: 2 }} className="bg-neon-cyan/20 p-6 rounded-full mb-4 border border-neon-cyan/40" >
                        <Upload className="w-10 h-10 text-neon-cyan" />
                      </motion.div>
                      <p className="font-black uppercase tracking-widest text-neon-cyan">Upload Berkas</p>
                      <p className="text-[10px] text-white/40 mt-2 font-mono">SUPPORT: JPG, PNG, WEBP</p>
                      <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />
                    </div>
                  )}
                </>
              ) : (
                <div className="w-full h-full relative">
                  <img src={image} alt="Captured" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                </div>
              )}

              {isCounting && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center z-50">
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="mb-6" >
                    <RefreshCw className="w-16 h-16 text-neon-green" />
                  </motion.div>
                  <p className="font-black text-neon-green uppercase tracking-[0.3em] animate-pulse">Lagi Scan...</p>
                  <p className="text-[10px] text-white/40 mt-2 font-mono">AI ENGINE INITIALIZING</p>
                </div>
              )}
            </div>
          </motion.section>

          {/* Action Area */}
          <div className="px-2">
            {!image ? (
              mode === 'camera' && (
                <motion.button whileTap={{ scale: 0.95 }} onClick={capture} className="w-full bg-neon-green text-black py-5 rounded-2xl font-black text-lg uppercase tracking-widest flex items-center justify-center gap-3 shadow-[0_10px_30px_rgba(0,255,102,0.3)] active:shadow-none transition-all" >
                  <Zap className="w-6 h-6 fill-black" /> Gaskeun Hitung!
                </motion.button>
              )
            ) : (
              <motion.button whileTap={{ scale: 0.95 }} onClick={reset} disabled={isCounting} className="w-full bg-white/10 hover:bg-white/20 text-white py-5 rounded-2xl font-black text-lg uppercase tracking-widest flex items-center justify-center gap-3 border border-white/10 transition-all disabled:opacity-50" >
                <RotateCcw className="w-6 h-6" /> Scan Ulang
              </motion.button>
            )}
          </div>

          {/* Results Area */}
          <AnimatePresence mode="wait">
            {result ? (
              <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }} className="bg-white/5 rounded-3xl border border-white/10 p-6 space-y-6 backdrop-blur-sm" >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-neon-green">
                    <CheckCircle2 className="w-6 h-6" />
                    <h2 className="text-sm font-black uppercase tracking-widest">Data Ditemukan!</h2>
                  </div>
                  <span className="text-[10px] font-mono text-white/30">ID: {Math.random().toString(36).substr(2, 9).toUpperCase()}</span>
                </div>

                <div className="bg-gradient-to-br from-neon-green/20 to-transparent rounded-2xl p-8 text-center border border-neon-green/20 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-full techno-grid opacity-20"></div>
                  <p className="text-neon-green text-[10px] font-black uppercase tracking-[0.4em] mb-2 relative z-10">Total Barang</p>
                  <motion.p initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="text-7xl font-black text-white relative z-10 drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]" >
                    {result.totalCount}
                  </motion.p>
                </div>

                <div className="space-y-4">
                  <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Breakdown:</p>
                  <div className="grid grid-cols-1 gap-2">
                    {result.items.map((item, idx) => (
                      <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: idx * 0.1 }} key={idx} className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 hover:border-neon-cyan/30 transition-colors group" >
                        <span className="font-bold text-white/80 uppercase text-xs tracking-wider group-hover:text-neon-cyan transition-colors">{item.name}</span>
                        <span className="bg-neon-cyan text-black px-3 py-1 rounded-md font-black text-sm shadow-[0_0_10px_rgba(0,242,255,0.3)]">
                          {item.count}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-white/10 flex flex-col gap-3">
                  <p className="text-xs text-white/60 font-medium leading-relaxed">
                    <span className="text-neon-pink font-black uppercase mr-2">AI Note:</span> {result.description}
                  </p>

                  <motion.button whileTap={{ scale: 0.95 }} onClick={handleSave} disabled={isSaving || saveStatus === 'success'} className={`w-full py-3 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${ saveStatus === 'success' ? 'bg-emerald-500 text-black' : saveStatus === 'error' ? 'bg-red-500 text-white' : 'bg-neon-cyan text-black shadow-[0_5px_15px_rgba(0,242,255,0.2)]' }`} >
                    {saveStatus === 'loading' ? <RefreshCw className="w-4 h-4 animate-spin" /> : saveStatus === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <Cloud className="w-4 h-4" />}
                    {saveStatus === 'loading' ? 'Menyimpan...' : saveStatus === 'success' ? 'Berhasil Disimpan!' : saveStatus === 'error' ? 'Gagal Simpan' : 'Simpan ke Spreadsheet'}
                  </motion.button>
                </div>
              </motion.div>
            ) : error ? (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 flex items-start gap-4 text-red-400" >
                <AlertCircle className="w-6 h-6 shrink-0" />
                <div>
                  <p className="font-black uppercase tracking-wider">System Error!</p>
                  <p className="text-xs mt-1 opacity-80">{error}</p>
                </div>
              </motion.div>
            ) : !image ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-10 text-center space-y-4" >
                <div className="inline-block p-4 rounded-full bg-white/5 border border-white/10">
                  <Zap className="w-8 h-8 text-white/20" />
                </div>
                <p className="text-xs text-white/30 uppercase tracking-[0.2em] font-bold px-10"> Siap Scan Apapun. <br/> Gaskeun Bro! </p>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* History Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-sm font-black uppercase tracking-widest text-white/60 flex items-center gap-2">
                <RotateCcw className="w-4 h-4" /> Riwayat Foto
              </h2>
              <button onClick={() => loadHistory(webAppUrl)} className="text-[10px] font-bold text-neon-cyan uppercase tracking-wider hover:underline" >
                Refresh
              </button>
            </div>

            {isLoadingHistory ? (
              <div className="flex justify-center py-10">
                <RefreshCw className="w-8 h-8 text-white/20 animate-spin" />
              </div>
            ) : history.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {history.map((item, idx) => (
                  <motion.div
                    key={item.ID}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    onClick={() => setSelectedHistoryItem(item)}
                    className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden cursor-pointer hover:border-neon-cyan/50 transition-all group relative"
                  >
                    <div className="aspect-square relative">
                      <img src={item.photoBase64} alt="History" className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>

                      {/* Delete button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteHistory(item.ID); }}
                        className="absolute top-2 right-2 bg-black/60 backdrop-blur-md p-2 rounded-md text-white/80 hover:text-white hover:bg-red-600 transition-colors z-20"
                        disabled={deletingId === item.ID}
                        title="Hapus riwayat"
                      >
                        {deletingId === item.ID ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>

                      <div className="absolute bottom-2 left-2 right-2">
                        <p className="text-[10px] font-black text-white truncate">{item.ResultScan}</p>
                        <p className="text-[8px] font-mono text-white/40">{new Date(item.Timestamp).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="py-10 text-center bg-white/5 rounded-3xl border border-white/5">
                <p className="text-[10px] text-white/20 uppercase font-black tracking-widest">Belum ada riwayat</p>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* History Detail Modal */}
      <AnimatePresence>
        {selectedHistoryItem && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4" >
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="bg-[#151520] border border-white/10 rounded-3xl overflow-hidden w-full max-w-md relative flex flex-col max-h-[90vh]" >
              <button onClick={() => setSelectedHistoryItem(null)} className="absolute top-4 right-4 z-10 bg-black/50 p-2 rounded-full text-white/70 hover:text-white backdrop-blur-md" >
                <X className="w-6 h-6" />
              </button>

              <div className="aspect-square w-full relative shrink-0">
                <img src={selectedHistoryItem.photoBase64} alt="Detail" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#151520] via-transparent to-transparent"></div>
              </div>

              <div className="p-6 space-y-4 overflow-y-auto">
                <div>
                  <p className="text-[10px] font-black text-neon-cyan uppercase tracking-[0.3em] mb-1">Hasil Scan</p>
                  <h3 className="text-2xl font-black text-white">{selectedHistoryItem.ResultScan}</h3>
                  <p className="text-xs text-white/40 font-mono mt-1">{new Date(selectedHistoryItem.Timestamp).toLocaleString()}</p>
                </div>

                <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                  <p className="text-[10px] font-black text-neon-pink uppercase tracking-widest mb-2">AI Note</p>
                  <p className="text-sm text-white/70 leading-relaxed">{selectedHistoryItem.Notes}</p>
                </div>

                <div className="flex items-center gap-2 text-[10px] text-white/20 font-mono uppercase">
                  <Package className="w-3 h-3" /> ID: {selectedHistoryItem.ID}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Android Style Bottom Nav / Info */}
      <footer className="fixed bottom-0 left-0 w-full bg-[#0a0a0f]/90 backdrop-blur-xl border-t border-white/10 p-4 z-50">
        <div className="max-w-md mx-auto flex items-center justify-between px-4">
          <div className="flex flex-col">
            <span className="text-[8px] font-black text-white/30 uppercase tracking-widest">Status</span>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-neon-green animate-pulse shadow-[0_0_5px_#00ff66]"></div>
              <span className="text-[10px] font-bold text-neon-green uppercase tracking-wider">Ready to Scan</span>
            </div>
          </div>
          <p className="text-[10px] text-white/20 font-mono">COUNTTHINGS // TECHNO_VIEW_V2</p>
        </div>
      </footer>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6" >
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="bg-[#151520] border border-white/10 rounded-3xl p-8 w-full max-w-sm space-y-6 relative" >
              <button onClick={() => setShowSettings(false)} className="absolute top-4 right-4 text-white/40 hover:text-white" >
                <X className="w-6 h-6" />
              </button>

              <div className="text-center">
                <div className="bg-neon-cyan/20 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-neon-cyan/30">
                  <Settings className="text-neon-cyan w-8 h-8" />
                </div>
                <h2 className="text-xl font-black uppercase tracking-tighter">Cloud Settings</h2>
                <p className="text-[10px] text-white/40 mt-1 font-mono uppercase tracking-widest">Google Sheets Integration</p>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-neon-cyan uppercase tracking-widest ml-1">Web App URL</label>
                <input type="text" defaultValue={webAppUrl} placeholder="https://script.google.com/macros/s/..." id="webAppUrlInput" className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-xs font-mono focus:border-neon-cyan outline-none transition-colors" />
                <p className="text-[9px] text-white/30 italic px-1"> *Masukkan URL dari Deployment Google Apps Script kamu. </p>

                <div className="bg-white/5 p-3 rounded-xl border border-white/10 mt-2">
                  <p className="text-[9px] font-bold text-neon-pink uppercase mb-1">Tips Error:</p>
                  <ul className="text-[8px] text-white/50 space-y-1 list-disc ml-3">
                    <li>Pastikan Deploy sebagai <b>"Anyone"</b>.</li>
                    <li>Tambahkan <b>GEMINI_API_KEY</b> di Script Properties Apps Script.</li>
                    <li>Klik <b>"Run"</b> di Apps Script editor untuk <b>Otorisasi</b> Drive/Sheets.</li>
                    <li>Gunakan URL <b>/exec</b>, bukan URL editor.</li>
                  </ul>
                </div>
              </div>

              <button onClick={() => {
                const input = document.getElementById('webAppUrlInput') as HTMLInputElement;
                saveSettings(input.value);
              }} className="w-full bg-neon-cyan text-black py-4 rounded-xl font-black uppercase tracking-widest shadow-[0_10px_20px_rgba(0,242,255,0.2)]" >
                Simpan Config
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
