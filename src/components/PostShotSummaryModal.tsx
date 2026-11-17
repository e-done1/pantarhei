import React, { useState, useEffect, useRef } from "react";
import type { TelemetryPoint } from "../services/telemetrySimulator.ts";
import type { PantaBean } from "../types/bean.ts";
import { generateShotCardBlob } from "../services/shotCardGenerator.ts";
import QRCode from "qrcode";
import { Check, Star, Download, ArrowRight, Smartphone, Copy } from "lucide-react";

interface PostShotSummaryModalProps {
  history: TelemetryPoint[];
  bean: PantaBean;
  dose: number;
  onClose: () => void;
  onUpdateShot?: (updated: { tds: number; ey: number; rating: number; tags: string[] }) => void;
}

export const PostShotSummaryModal: React.FC<PostShotSummaryModalProps> = ({
  history,
  bean,
  dose,
  onClose,
  onUpdateShot,
}) => {
  const [tds, setTds] = useState(9.4);
  const [rating, setRating] = useState(8.5);
  const [selectedTags, setSelectedTags] = useState<string[]>(["Sweet", "Balanced"]);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const finalPoint = history.length > 0 ? history[history.length - 1] : null;
  const extractionTime = finalPoint ? finalPoint.timeSeconds : 0;
  const finalYield = finalPoint ? finalPoint.weight : 0;

  const peakPressure = history.reduce((max, pt) => Math.max(max, pt.pressure), 0);
  const avgFlow =
    history.length > 0
      ? history.reduce((sum, pt) => sum + pt.flow, 0) / history.length
      : 0;

  // Instant EY% Calculator: EY% = (Yield * TDS) / Dose
  const calculatedEy = dose > 0 ? ((finalYield * tds) / dose).toFixed(2) : "0.00";

  const handleClose = () => {
    if (onUpdateShot) {
      onUpdateShot({
        tds,
        ey: parseFloat(calculatedEy) || 0,
        rating,
        tags: selectedTags,
      });
    }
    onClose();
  };

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  // Render completed shot telemetry graph on canvas (max 9 bar)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || history.length < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    ctx.clearRect(0, 0, width, height);

    // Subtle dark grid
    ctx.fillStyle = "rgba(12, 14, 18, 0.85)";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = (height / 3) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const maxSeconds = Math.max(30, extractionTime + 1);
    const maxWeight = Math.max(45, finalYield * 1.15);

    const getX = (t: number) => (t / maxSeconds) * width;
    const getYPressure = (p: number) => height - (p / 9) * height; // 0-9 bar
    const getYFlow = (f: number) => height - (f / 8) * height;      // 0-8 ml/s
    const getYWeight = (w: number) => height - (w / maxWeight) * height;

    // Target Pressure (dashed)
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = "rgba(253, 186, 116, 0.4)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    history.forEach((pt, idx) => {
      const x = getX(pt.timeSeconds);
      const y = getYPressure(pt.targetPressure);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();

    // Pressure curve (emerald green)
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    history.forEach((pt, idx) => {
      const x = getX(pt.timeSeconds);
      const y = getYPressure(pt.pressure);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Flow curve (sky blue)
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    history.forEach((pt, idx) => {
      const x = getX(pt.timeSeconds);
      const y = getYFlow(pt.flow);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Weight Flow curve (dark espresso brown)
    ctx.strokeStyle = "#78350f";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    history.forEach((pt, idx) => {
      const x = getX(pt.timeSeconds);
      const y = getYFlow(pt.weightFlow);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Weight accumulation curve (purple)
    ctx.strokeStyle = "#a855f7";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    history.forEach((pt, idx) => {
      const x = getX(pt.timeSeconds);
      const y = getYWeight(pt.weight);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [history, extractionTime, finalYield]);

  // Generate the 1200x675 Card and Scannable QR Code pointing directly to latest_shot.png
  useEffect(() => {
    let isCancelled = false;

    async function initCardAndQr() {
      setIsGenerating(true);
      try {
        // 1. Resolve network host IP for Wi-Fi mobile scanning
        let hostIp = window.location.hostname;
        const port = window.location.port || "3000";

        try {
          const res = await fetch("/api/network-info");
          if (res.ok) {
            const data = await res.json();
            if (data.ip && data.ip !== "localhost") {
              hostIp = data.ip;
            }
          }
        } catch {
          // Keep window.location.hostname
        }

        const directPngUrl = `http://${hostIp}:${port}/latest_shot.png`;
        if (isCancelled) return;
        setDownloadUrl(directPngUrl);

        // 2. Render high-res shot card & upload to /api/shot/save
        await generateShotCardBlob({
          bean,
          history,
          dose,
          finalYield,
          extractionTime,
          peakPressure,
          avgFlow,
          tds,
          eyPercentage: calculatedEy,
          rating,
          tags: selectedTags,
        });

        // 3. Generate scannable QR Code PNG DataURL pointing directly to latest_shot.png
        const qrUrl = await QRCode.toDataURL(directPngUrl, {
          margin: 1,
          width: 150,
          color: {
            dark: "#000000",
            light: "#ffffff",
          },
        });

        if (!isCancelled) {
          setQrDataUrl(qrUrl);
        }
      } catch (err) {
        console.error("Could not generate QR card:", err);
      } finally {
        if (!isCancelled) {
          setIsGenerating(false);
        }
      }
    }

    initCardAndQr();

    return () => {
      isCancelled = true;
    };
  }, [bean, history, dose, finalYield, extractionTime, peakPressure, avgFlow, tds, calculatedEy, rating, selectedTags]);

  const handleDownloadDirectly = () => {
    const link = document.createElement("a");
    link.href = "/latest_shot.png";
    link.download = "latest_shot.png";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyLink = () => {
    if (downloadUrl) {
      navigator.clipboard.writeText(downloadUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 select-none">
      <div className="w-[820px] max-h-[94vh] overflow-y-auto rounded-3xl bg-decent-surface border border-decent-border shadow-2xl p-5 flex flex-col justify-between">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-decent-border/60 pb-3">
          <div>
            <span className="text-xs uppercase font-semibold text-emerald-400 tracking-wider">
              Extraction Complete
            </span>
            <h2 className="text-xl font-bold text-white mt-0.5">
              {bean.name} · <span className="text-decent-muted font-normal">{bean.roaster}</span>
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center space-x-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
          >
            <span>Done / Next Shot</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Core Metrics Grid */}
        <div className="grid grid-cols-4 gap-2.5 my-2.5">
          <div className="p-2.5 rounded-2xl bg-decent-dark border border-decent-border/60 flex flex-col items-center">
            <span className="text-[10px] text-decent-muted uppercase">Extraction Time</span>
            <span className="text-xl font-bold font-mono text-white mt-0.5">
              {extractionTime.toFixed(1)}<span className="text-xs font-normal text-decent-muted">s</span>
            </span>
          </div>

          <div className="p-2.5 rounded-2xl bg-decent-dark border border-decent-border/60 flex flex-col items-center">
            <span className="text-[10px] text-decent-muted uppercase">Final Yield</span>
            <span className="text-xl font-bold font-mono text-amber-400 mt-0.5">
              {finalYield.toFixed(1)}<span className="text-xs font-normal text-decent-muted">g</span>
            </span>
            <span className="text-[10px] text-decent-muted font-mono">
              1:{(finalYield / (dose || 18)).toFixed(1)} ratio
            </span>
          </div>

          <div className="p-2.5 rounded-2xl bg-decent-dark border border-decent-border/60 flex flex-col items-center">
            <span className="text-[10px] text-decent-muted uppercase">Peak Pressure</span>
            <span className="text-xl font-bold font-mono text-emerald-400 mt-0.5">
              {peakPressure.toFixed(1)}<span className="text-xs font-normal text-decent-muted">bar</span>
            </span>
          </div>

          <div className="p-2.5 rounded-2xl bg-decent-dark border border-decent-border/60 flex flex-col items-center">
            <span className="text-[10px] text-decent-muted uppercase">Avg Flow</span>
            <span className="text-xl font-bold font-mono text-sky-400 mt-0.5">
              {avgFlow.toFixed(1)}<span className="text-xs font-normal text-decent-muted">ml/s</span>
            </span>
          </div>
        </div>

        {/* Completed Shot Telemetry Curve Graph (0-9 bar) */}
        <div className="w-full my-1.5 rounded-2xl overflow-hidden border border-decent-border/60 bg-decent-dark/90 shadow-md">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-decent-border/40 text-[10px] font-mono">
            <div className="flex items-center space-x-3">
              <span className="text-emerald-400 font-semibold">● Pressure (0-9 bar)</span>
              <span className="text-sky-400 font-semibold">● Water Flow (ml/s)</span>
              <span className="text-amber-500 font-semibold">● Weight Flow (g/s)</span>
              <span className="text-purple-400 font-semibold">● Weight (g)</span>
            </div>
            <span className="text-decent-muted">Telemetry Curve</span>
          </div>
          <div className="w-full h-28 relative">
            <canvas ref={canvasRef} className="w-full h-full block" />
          </div>
        </div>

        {/* EY% Calculator & Dial-in Rating */}
        <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-decent-card border border-decent-border/60 my-2">
          {/* Instant EY% Calculator */}
          <div className="flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-cyan-400 uppercase">
                  Extraction Yield (EY%)
                </span>
                <span className="font-mono font-bold text-base text-white">{calculatedEy}%</span>
              </div>
              <p className="text-[10px] text-decent-muted mt-0.5">
                Calculated as (Yield × TDS%) / Dose ({dose}g)
              </p>
            </div>

            <div className="mt-2 flex items-center space-x-2">
              <span className="text-xs font-mono text-decent-muted">TDS:</span>
              <input
                type="range"
                min="7.0"
                max="13.0"
                step="0.1"
                value={tds}
                onChange={(e) => setTds(parseFloat(e.target.value))}
                className="flex-1 accent-cyan-400 h-1.5 rounded bg-decent-dark cursor-pointer"
              />
              <span className="text-xs font-mono font-bold text-white w-12 text-right">
                {tds.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Quick Rating & Sensory */}
          <div className="flex flex-col justify-between border-l border-decent-border/40 pl-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-400 uppercase">
                  Shot Rating
                </span>
                <div className="flex items-center space-x-1 text-amber-400">
                  <Star className="w-3.5 h-3.5 fill-amber-400" />
                  <span className="font-mono font-bold text-sm text-white">{rating.toFixed(1)}</span>
                </div>
              </div>
              <input
                type="range"
                min="0.0"
                max="10.0"
                step="0.5"
                value={rating}
                onChange={(e) => setRating(parseFloat(e.target.value))}
                className="w-full accent-amber-400 h-1.5 rounded bg-decent-dark mt-1.5 cursor-pointer"
              />
            </div>

            {/* Sensory Chips */}
            <div className="flex flex-wrap gap-1 mt-1.5">
              {["Sweet", "Bright", "Balanced", "Fruit", "Floral", "Chocolate", "Channeled"].map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`text-[9.5px] font-semibold px-2 py-0.5 rounded-full border transition-all cursor-pointer ${
                    selectedTags.includes(tag)
                      ? "bg-amber-500/30 text-amber-300 border-amber-400"
                      : "bg-decent-dark text-decent-muted border-decent-border"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Direct Mobile QR Scan & Download Card Section */}
        <div className="p-3.5 rounded-2xl bg-decent-dark/90 border border-decent-border/70 flex items-center justify-between mt-1">
          <div className="flex items-center space-x-3.5">
            {/* Scannable QR Code Image */}
            <div className="w-24 h-24 bg-white p-1 rounded-xl shadow-md flex items-center justify-center shrink-0">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Scan to download shot card" className="w-full h-full block" />
              ) : (
                <div className="text-[10px] text-gray-500 font-mono text-center">
                  {isGenerating ? "Generating..." : "QR Ready"}
                </div>
              )}
            </div>

            {/* Mobile Scan Instructions & Direct Link */}
            <div className="flex flex-col justify-between">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-white">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span>Scan with Phone Camera to Download</span>
              </div>
              <p className="text-[11px] text-decent-muted mt-0.5 max-w-[340px] leading-tight">
                Point your phone camera at this QR code on local Wi-Fi to immediately download the 1200×675 shot card PNG directly to your device.
              </p>
              <div className="flex items-center space-x-2 mt-2">
                <span className="font-mono text-[10px] text-sky-400 truncate max-w-[240px]">
                  {downloadUrl || "/latest_shot.png"}
                </span>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="p-1 rounded bg-decent-card border border-decent-border text-decent-muted hover:text-white text-[10px] flex items-center space-x-1 cursor-pointer"
                  title="Copy direct PNG link"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Desktop / Tablet Direct Download Button */}
          <div className="flex flex-col items-end space-y-1.5 pl-3 border-l border-decent-border/60">
            <button
              type="button"
              onClick={handleDownloadDirectly}
              className="px-3.5 py-2 rounded-xl bg-decent-card hover:bg-slate-800 border border-decent-border text-white font-semibold text-xs flex items-center space-x-2 transition-all shadow-sm active:scale-95 cursor-pointer"
            >
              <Download className="w-4 h-4 text-sky-400" />
              <span>Download PNG</span>
            </button>
            <span className="text-[9px] text-decent-muted font-mono">latest_shot.png (1200x675)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
