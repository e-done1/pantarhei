import React, { useEffect, useRef } from "react";
import type { TelemetryPoint, MachineSnapshot, ScaleSnapshot } from "../services/telemetrySimulator.ts";
import type { PantaBean } from "../types/bean.ts";
import { RaceGoButton } from "./RaceGoButton.tsx";
import { NeedleGauge } from "./NeedleGauge.tsx";
import type { GoButtonViewModel } from "../types/cockpitTabs.ts";
import { AlertTriangle, Coffee, Sparkles } from "lucide-react";

interface LiveExtractionDashboardProps {
  currentPoint: TelemetryPoint;
  history: TelemetryPoint[];
  machine: MachineSnapshot;
  scale: ScaleSnapshot;
  targetYield: number;
  shotStartTime: number;
  onStopShot: () => void;
  bean?: PantaBean;
  profileTitle?: string;
}

export const LiveExtractionDashboard: React.FC<LiveExtractionDashboardProps> = ({
  currentPoint,
  history,
  scale,
  targetYield,
  shotStartTime,
  onStopShot,
  bean,
  profileTitle,
}) => {
  const chartCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Defensive normalization of incoming telemetry
  const safeTime = typeof currentPoint?.timeSeconds === "number" && !isNaN(currentPoint.timeSeconds) ? currentPoint.timeSeconds : 0;
  const safePressure = typeof currentPoint?.pressure === "number" && !isNaN(currentPoint.pressure) ? currentPoint.pressure : 0;
  const safeTargetPressure = typeof currentPoint?.targetPressure === "number" && !isNaN(currentPoint.targetPressure) ? currentPoint.targetPressure : 0;
  const safeFlow = typeof currentPoint?.flow === "number" && !isNaN(currentPoint.flow) ? currentPoint.flow : 0;
  const safeTargetFlow = typeof currentPoint?.targetFlow === "number" && !isNaN(currentPoint.targetFlow) ? currentPoint.targetFlow : 0;
  const safeWeightFlow = typeof currentPoint?.weightFlow === "number" && !isNaN(currentPoint.weightFlow) ? currentPoint.weightFlow : (scale?.weightFlow ?? 0);
  const safeWeight = typeof scale?.weight === "number" && !isNaN(scale.weight) ? scale.weight : (currentPoint?.weight ?? 0);
  const safeResistance = typeof currentPoint?.puckResistance === "number" && !isNaN(currentPoint.puckResistance) ? currentPoint.puckResistance : 0;
  const safeTargetYield = typeof targetYield === "number" && !isNaN(targetYield) && targetYield > 0 ? targetYield : 36.0;
  const safePhase = currentPoint?.phase || "extraction";

  // Dynamic Glass fill percentage (0 to 100%)
  const fillPercentage = Math.min(100, Math.max(0, (safeWeight / safeTargetYield) * 100));

  // Stop button view model
  const stopButtonModel: GoButtonViewModel = {
    label: "STOP",
    actionType: "espresso",
    isReady: true,
    haloColor: "disabled-gray",
    targetEndpoint: "/api/v1/machine/state/idle",
    autoTareBeforeStart: false,
  };

  // High-performance 60fps telemetry graph rendering with full numeric indications
  useEffect(() => {
    const canvas = chartCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.clientWidth || canvas.parentElement?.clientWidth || 300;
    const height = canvas.clientHeight || canvas.parentElement?.clientHeight || 200;
    if (width <= 0 || height <= 0) return;

    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    ctx.clearRect(0, 0, width, height);

    // Padding for axes labels & numeric indicators (matches middle pane)
    const padLeft = 48;   // Left Y-axis (Pressure & Flow reference numbers)
    const padRight = 44;  // Right Y-axis (Weight reference numbers)
    const padTop = 18;
    const padBottom = 26; // Bottom X-axis (Time reference numbers)

    const plotW = Math.max(10, width - padLeft - padRight);
    const plotH = Math.max(10, height - padTop - padBottom);

    // Dark technical grid background
    ctx.fillStyle = "rgba(10, 13, 18, 0.90)";
    ctx.fillRect(padLeft, padTop, plotW, plotH);

    const lastHistTime =
      history.length > 0 && typeof history[history.length - 1]?.timeSeconds === "number"
        ? history[history.length - 1].timeSeconds
        : safeTime;
    const validHistTime = typeof lastHistTime === "number" && !isNaN(lastHistTime) ? lastHistTime : 0;
    const maxSeconds = Math.max(35, Math.ceil((validHistTime + 2) / 5) * 5);
    const maxWeight = Math.max(40, Math.ceil((safeTargetYield * 1.2) / 10) * 10);

    const getX = (t: number) => {
      const st = typeof t === "number" && !isNaN(t) ? t : 0;
      return padLeft + (st / maxSeconds) * plotW;
    };
    const getYPressure = (p: number) => {
      const sp = typeof p === "number" && !isNaN(p) ? p : 0;
      return padTop + plotH - (sp / 9) * plotH;
    };
    const getYFlow = (f: number) => {
      const sf = typeof f === "number" && !isNaN(f) ? f : 0;
      return padTop + plotH - (sf / 8) * plotH;
    };
    const getYWeight = (w: number) => {
      const sw = typeof w === "number" && !isNaN(w) ? w : 0;
      return padTop + plotH - (sw / maxWeight) * plotH;
    };

    // 1. Horizontal Grid Lines & Y-Axis Reference Numbers (0, 3, 6, 9 bar)
    ctx.lineWidth = 1;
    const ySteps = [0, 1.5, 3, 4.5, 6, 7.5, 9];
    ySteps.forEach((pVal) => {
      const y = getYPressure(pVal);
      const isMajor = pVal === 0 || pVal === 3 || pVal === 6 || pVal === 9;

      // Grid line
      ctx.strokeStyle = pVal === 0 ? "rgba(255, 255, 255, 0.25)" : isMajor ? "rgba(255, 255, 255, 0.10)" : "rgba(255, 255, 255, 0.04)";
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + plotW, y);
      ctx.stroke();

      if (isMajor) {
        // Left Y-axis numeric indication: Pressure (green)
        ctx.font = "bold 10px ui-monospace, monospace";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillStyle = pVal === 9 ? "#10b981" : "rgba(16, 185, 129, 0.85)";
        ctx.fillText(`${pVal}b`, padLeft - 6, y);

        // Right Y-axis numeric indication: Weight (purple)
        const weightVal = Math.round((pVal / 9) * maxWeight);
        ctx.textAlign = "left";
        ctx.fillStyle = "rgba(168, 85, 247, 0.85)";
        ctx.fillText(`${weightVal}g`, padLeft + plotW + 6, y);
      }
    });

    // 2. Vertical Grid Lines & X-Axis Numeric Indications (Time: every 5s)
    for (let sec = 0; sec <= maxSeconds; sec += 5) {
      const x = getX(sec);
      if (x > padLeft && x < padLeft + plotW) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
        ctx.beginPath();
        ctx.moveTo(x, padTop);
        ctx.lineTo(x, padTop + plotH);
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
      ctx.font = "9px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(`${sec}s`, x, padTop + plotH + 7);
    }

    // Border around plot area
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.strokeRect(padLeft, padTop, plotW, plotH);

    if (history.length < 2) return;

    // 3. Draw Target Pressure Curve (dashed)
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(253, 186, 116, 0.4)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    history.forEach((pt, idx) => {
      const x = getX(pt.timeSeconds);
      const y = getYPressure(pt.targetPressure);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();

    // 4. Draw Scale Weight Accumulation (purple #a855f7)
    ctx.strokeStyle = "#a855f7";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    history.forEach((pt, idx) => {
      const x = getX(pt.timeSeconds);
      const y = getYWeight(pt.weight);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 5. Draw Gravimetric Weight Flow Curve (dark espresso brown #78350f)
    ctx.strokeStyle = "#78350f";
    ctx.lineWidth = 3.0;
    ctx.beginPath();
    history.forEach((pt, idx) => {
      const x = getX(pt.timeSeconds);
      const y = getYFlow(pt.weightFlow);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 6. Draw Water Flow Curve (sky blue #38bdf8)
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    history.forEach((pt, idx) => {
      const x = getX(pt.timeSeconds);
      const y = getYFlow(pt.flow);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 7. Draw Live Pressure Curve (green #10b981)
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 3.4;
    ctx.shadowColor = "rgba(16, 185, 129, 0.5)";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    history.forEach((pt, idx) => {
      const x = getX(pt.timeSeconds);
      const y = getYPressure(pt.pressure);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 8. Moving live cursor line at current head
    const currentX = getX(safeTime);
    if (currentX >= padLeft && currentX <= padLeft + plotW) {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(currentX, padTop);
      ctx.lineTo(currentX, padTop + plotH);
      ctx.stroke();
      ctx.restore();
    }
  }, [history, currentPoint, targetYield, safeTime, safePressure, safeFlow, safeWeightFlow, safeWeight, safeTargetYield]);

  return (
    <div className="w-full h-full flex flex-col justify-between p-6 select-none bg-decent-dark/95">
      {/* 1. TOP GAUGE CLUSTER */}
      <div className="grid grid-cols-4 gap-6 items-center">
        {/* Left: Automotive Needle Flow Gauge (0 to 8 ml/s) */}
        <NeedleGauge
          value={safeFlow}
          max={8}
          step={2}
          unit="ml/s"
          title="FLOW RATE"
          color="#38bdf8"
          targetValue={safeTargetFlow}
          subValue={`Weight: ${safeWeightFlow.toFixed(1)} g/s`}
        />

        {/* Center: Dynamic Filling Glass */}
        <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-decent-surface/85 border border-decent-border/60 shadow-xl">
          <span className="text-[11px] font-bold tracking-widest uppercase text-amber-400 mb-0.5">
            YIELD PROGRESS
          </span>
          <div className="relative w-28 h-36 my-1 flex items-end justify-center">
            {/* Glass Outline Silhouette */}
            <div className="relative w-24 h-32 border-2 border-white/30 rounded-b-2xl overflow-hidden bg-black/40 shadow-inner flex flex-col justify-end p-0.5">
              {/* Animated Liquid Level */}
              <div
                className="w-full bg-gradient-to-t from-amber-700 via-amber-600 to-amber-500 rounded-b-xl transition-all duration-150 relative shadow-md"
                style={{ height: `${fillPercentage}%` }}
              >
                {/* Meniscus wave top */}
                <div className="absolute -top-1.5 left-0 right-0 h-3 bg-amber-400/90 rounded-full blur-[0.5px]" />
              </div>
            </div>
          </div>
          <div className="font-mono text-sm font-bold text-white mt-1">
            <span className="text-amber-400">{safeWeight.toFixed(1)}</span> / {safeTargetYield.toFixed(1)} g
          </div>
        </div>

        {/* Right: Automotive Needle Pressure Gauge (0 to 9 bar) */}
        <NeedleGauge
          value={safePressure}
          max={9}
          step={1}
          unit="bar"
          title="PRESSURE"
          color="#10b981"
          targetValue={safeTargetPressure}
          subValue={`Resistance: ${safeResistance.toFixed(2)}`}
        />

        {/* Far Right: Dedicated Stop Button (Armed after 2s delay) */}
        <div className="flex flex-col items-center justify-center">
          <RaceGoButton
            viewModel={stopButtonModel}
            isExtracting={true}
            shotStartTime={shotStartTime}
            onStart={() => {}}
            onStop={onStopShot}
          />
        </div>
      </div>

      {/* 2. REAL-TIME MOVING TELEMETRY GRAPH */}
      <div className="w-full flex-1 mt-5 rounded-2xl overflow-hidden border border-decent-border/60 shadow-2xl relative flex flex-col">
        {/* Top of Graph: Coffee & Profile Name + Numeric Readouts & Phase Tracker */}
        <div className="flex items-center justify-between px-4 py-2 bg-decent-surface/90 border-b border-decent-border/40 text-xs font-mono">
          {/* Coffee Name and Profile Name at the top of the graph */}
          <div className="flex items-center space-x-2 shrink-0">
            <Coffee className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-xs font-bold text-white truncate max-w-[170px]">
              {bean?.name || "Espresso"}
            </span>
            {bean?.roaster && (
              <span className="text-[11px] text-amber-400/90 font-medium truncate max-w-[120px]">
                ({bean.roaster})
              </span>
            )}
            <span className="text-decent-muted text-[10px]">·</span>
            <span className="text-xs font-semibold text-cyan-300 px-2 py-0.5 rounded-md bg-cyan-950/60 border border-cyan-500/40 font-mono flex items-center space-x-1 shadow-sm">
              <Sparkles className="w-2.5 h-2.5 text-cyan-400" />
              <span>{profileTitle || "Default Espresso"}</span>
            </span>
          </div>

          {/* Numeric Readouts Indicator */}
          <div className="flex items-center space-x-3.5">
            <div className="flex items-center space-x-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-[#10b981] shadow-[0_0_6px_#10b981]" />
              <span className="text-emerald-400 font-bold">{safePressure.toFixed(1)} bar</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-[#38bdf8] shadow-[0_0_6px_#38bdf8]" />
              <span className="text-sky-400 font-bold">{safeFlow.toFixed(1)} ml/s</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-[#78350f] shadow-[0_0_6px_#78350f]" />
              <span className="text-amber-500 font-bold">{safeWeightFlow.toFixed(1)} g/s</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-[#a855f7] shadow-[0_0_6px_#a855f7]" />
              <span className="text-purple-400 font-bold">{safeWeight.toFixed(1)} g</span>
            </div>
            <div className="flex items-center space-x-1.5 text-slate-300">
              <span className="text-decent-muted">R:</span>
              <span className="font-bold text-amber-300">{safeResistance.toFixed(2)}</span>
            </div>
          </div>

          {/* Phase & Channel Alert */}
          <div className="flex items-center space-x-3 shrink-0">
            {currentPoint?.channelDetected && (
              <span className="flex items-center space-x-1 text-red-400 bg-red-950/80 px-2 py-0.5 rounded border border-red-500 animate-pulse text-[11px] font-bold">
                <AlertTriangle className="w-3 h-3" />
                <span>Channel Alert</span>
              </span>
            )}
            <span className="px-2.5 py-0.5 rounded-full bg-decent-dark border border-decent-border text-amber-300 uppercase tracking-widest text-[10px] font-bold">
              {safePhase} ({safeTime.toFixed(1)}s)
            </span>
          </div>
        </div>

        {/* Canvas Render Area */}
        <div className="flex-1 w-full h-full relative">
          <canvas ref={chartCanvasRef} className="w-full h-full block" />
        </div>
      </div>
    </div>
  );
};
