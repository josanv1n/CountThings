import React, { useState, useRef, useCallback } from 'react';
import Webcam from 'react-webcam';
import { Camera, Upload, RefreshCw, CheckCircle2, AlertCircle, Package, Image as ImageIcon, RotateCcw, SwitchCamera, Zap, Cpu } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { countObjectsInImage, CountResult } from './services/gemini';

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [isCounting, setIsCounting] = useState(false);
  const [result, setResult] = useState<CountResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'camera' | 'upload'>('camera');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  
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
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
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
      const countResult = await countObjectsInImage(imgData);
      setResult(countResult);
      confetti({
        particleCount: 150,
        spread: 100,
        colors: ['#00ff66', '#00f2ff', '#ff00e5'],
        origin: { y: 0.6 }
      });
    } catch (err) {
      setError('Waduh, gagal scan nih. Coba lagi gih!');
      console.error(err);
    } finally {
      setIsCounting(false);
    }
  };

  const reset = () => {
    setImage(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white font-sans selection:bg-neon-cyan selection:text-black">
      {/* Android Style Header */}
      <header className="bg-[#0a0a0f]/80 backdrop-blur-md border-b border-white/10 py-4 px-6 sticky top-0 z-50 flex items-center justify-between">
        <motion.div 
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className="flex items-center gap-3"
        >
          <div className="bg-neon-green p-2 rounded-xl neon-glow-green">
            <Cpu className="text-black w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tighter glitch-text uppercase">CountThings</h1>
            <p className="text-[10px] text-neon-green font-mono uppercase tracking-widest">Techno Vision v2.0</p>
          </div>
        </motion.div>
        
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
      </header>

      <main className="max-w-md mx-auto p-4 pb-24">
        <div className="space-y-6">
          
          {/* Scanner Viewport */}
          <motion.section 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative"
          >
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
                      <button 
                        onClick={toggleCamera}
                        className="absolute top-4 right-4 bg-black/50 backdrop-blur-md p-3 rounded-full border border-white/20 text-white active:scale-90 transition-transform pointer-events-auto"
                      >
                        <SwitchCamera className="w-6 h-6" />
                      </button>
                    </div>
                  ) : (
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full h-full flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-colors techno-grid"
                    >
                      <motion.div 
                        animate={{ y: [0, -10, 0] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="bg-neon-cyan/20 p-6 rounded-full mb-4 border border-neon-cyan/40"
                      >
                        <Upload className="w-10 h-10 text-neon-cyan" />
                      </motion.div>
                      <p className="font-black uppercase tracking-widest text-neon-cyan">Upload Berkas</p>
                      <p className="text-[10px] text-white/40 mt-2 font-mono">SUPPORT: JPG, PNG, WEBP</p>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        className="hidden" 
                        accept="image/*"
                      />
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
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className="mb-6"
                  >
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
                <motion.button 
                  whileTap={{ scale: 0.95 }}
                  onClick={capture}
                  className="w-full bg-neon-green text-black py-5 rounded-2xl font-black text-lg uppercase tracking-widest flex items-center justify-center gap-3 shadow-[0_10px_30px_rgba(0,255,102,0.3)] active:shadow-none transition-all"
                >
                  <Zap className="w-6 h-6 fill-black" />
                  Gaskeun Hitung!
                </motion.button>
              )
            ) : (
              <motion.button 
                whileTap={{ scale: 0.95 }}
                onClick={reset}
                disabled={isCounting}
                className="w-full bg-white/10 hover:bg-white/20 text-white py-5 rounded-2xl font-black text-lg uppercase tracking-widest flex items-center justify-center gap-3 border border-white/10 transition-all disabled:opacity-50"
              >
                <RotateCcw className="w-6 h-6" />
                Scan Ulang
              </motion.button>
            )}
          </div>

          {/* Results Area */}
          <AnimatePresence mode="wait">
            {result ? (
              <motion.div 
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -30 }}
                className="bg-white/5 rounded-3xl border border-white/10 p-6 space-y-6 backdrop-blur-sm"
              >
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
                  <motion.p 
                    initial={{ scale: 0.5 }}
                    animate={{ scale: 1 }}
                    className="text-7xl font-black text-white relative z-10 drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]"
                  >
                    {result.totalCount}
                  </motion.p>
                </div>

                <div className="space-y-4">
                  <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Breakdown:</p>
                  <div className="grid grid-cols-1 gap-2">
                    {result.items.map((item, idx) => (
                      <motion.div 
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: idx * 0.1 }}
                        key={idx} 
                        className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 hover:border-neon-cyan/30 transition-colors group"
                      >
                        <span className="font-bold text-white/80 uppercase text-xs tracking-wider group-hover:text-neon-cyan transition-colors">{item.name}</span>
                        <span className="bg-neon-cyan text-black px-3 py-1 rounded-md font-black text-sm shadow-[0_0_10px_rgba(0,242,255,0.3)]">
                          {item.count}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-white/10">
                  <p className="text-xs text-white/60 font-medium leading-relaxed">
                    <span className="text-neon-pink font-black uppercase mr-2">AI Note:</span>
                    {result.description}
                  </p>
                </div>
              </motion.div>
            ) : error ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 flex items-start gap-4 text-red-400"
              >
                <AlertCircle className="w-6 h-6 shrink-0" />
                <div>
                  <p className="font-black uppercase tracking-wider">System Error!</p>
                  <p className="text-xs mt-1 opacity-80">{error}</p>
                </div>
              </motion.div>
            ) : !image ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-10 text-center space-y-4"
              >
                <div className="inline-block p-4 rounded-full bg-white/5 border border-white/10">
                  <Zap className="w-8 h-8 text-white/20" />
                </div>
                <p className="text-xs text-white/30 uppercase tracking-[0.2em] font-bold px-10">
                  Siap Scan Apapun. <br/> Gaskeun Bro!
                </p>
              </motion.div>
            ) : null}
          </AnimatePresence>

        </div>
      </main>

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
    </div>
  );
}


