import React, { useEffect, useRef, useState } from "react";
import type { MachineSnapshot, TelemetryPoint } from "../services/telemetrySimulator.ts";
import type { PantaBean } from "../types/bean.ts";
import QRCode from "qrcode";
import {
  Thermometer,
  Gauge,
  Sparkles,
  ArrowUpRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Smartphone,
  Layers,
  AlertTriangle,
} from "lucide-react";

interface CenterStatusPaneProps {
  machine: MachineSnapshot;
  lastShotSummary?: {
    extractionTime: number;
    yieldGrams: number;
    peakPressure: number;
    eyPercentage?: number;
    dose?: number;
    avgFlow?: number;
  };
  lastShotBean?: PantaBean;
  lastShotProfileTitle?: string;
  lastShotHistory?: TelemetryPoint[];
  onOpenSummaryModal?: () => void;
  highContrastTelemetry?: boolean;
}

interface SeriesVisibility {
  pressure: boolean;
  waterFlow: boolean;
  weightFlow: boolean;
  weight: boolean;
  dRdt: boolean;
  channelFlags: boolean;
}

export interface ChannelingEvent {
  timeSeconds: number;
  pressure: number;
  flow: number;
  resistance: number;
  dRdt: number;
  flowAcc: number;
  severity: "minor" | "moderate" | "severe";
}

export type ChannelSensitivity = "sensitive" | "moderate" | "low";

export interface DerivativePoint {
  timeSeconds: number;
  dRdt: number;
  flowAcc: number;
  pressureDrop: number;
}

interface StepMarker {
  timeSeconds: number;
  name: string;
}

const drawRoundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) => {
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
  } else {
    const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }
};

export const CenterStatusPane: React.FC<CenterStatusPaneProps> = ({
  machine,
  lastShotSummary,
  lastShotBean,
  lastShotProfileTitle,
  lastShotHistory = [],
  onOpenSummaryModal,
}) => {
  const isWaterLow = machine.waterLevelMl < 250;
  const graphCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<TelemetryPoint | null>(null);

  // Non-numeric Channeling Sensitivity (Sensitive / Moderate / Low)
  const [channelSensitivity, setChannelSensitivity] = useState<ChannelSensitivity>(() => {
    try {
      return (localStorage.getItem("pantarhei_channel_sensitivity") as ChannelSensitivity) || "moderate";
    } catch {
      return "moderate";
    }
  });

  const handleSensitivityChange = (newSens: ChannelSensitivity) => {
    setChannelSensitivity(newSens);
    try {
      localStorage.setItem("pantarhei_channel_sensitivity", newSens);
    } catch {
      // Ignore storage errors
    }
  };

  // Toggleable series visibility
  const [visibility, setVisibility] = useState<SeriesVisibility>({
    pressure: true,
    waterFlow: true,
    weightFlow: true,
    weight: true,
    dRdt: true,
    channelFlags: true,
  });

  const toggleSeries = (key: keyof SeriesVisibility) => {
    setVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // First-order derivative of puck resistance (dR/dt) smoothed with central differences
  const dRdtSeries: DerivativePoint[] = React.useMemo(() => {
    if (lastShotHistory.length < 3) return [];
    const N = lastShotHistory.length;
    const result: DerivativePoint[] = [];

    for (let i = 0; i < N; i++) {
      const pt = lastShotHistory[i];

      // Zero out pre-infusion wetting before flow establishes
      if (pt.timeSeconds < 2.0 || pt.flow < 0.2) {
        result.push({
          timeSeconds: pt.timeSeconds,
          dRdt: 0,
          flowAcc: 0,
          pressureDrop: 0,
        });
        continue;
      }

      const iPrev = Math.max(0, i - 3);
      const dt = lastShotHistory[i].timeSeconds - lastShotHistory[iPrev].timeSeconds;

      if (dt > 0.05) {
        const rPrev = lastShotHistory[iPrev].puckResistance;
        const rCurr = lastShotHistory[i].puckResistance;
        const fPrev = lastShotHistory[iPrev].flow;
        const fCurr = lastShotHistory[i].flow;
        const pPrev = lastShotHistory[iPrev].pressure;
        const pCurr = lastShotHistory[i].pressure;

        const dRdt = (rCurr - rPrev) / dt;
        const flowAcc = (fCurr - fPrev) / dt;
        const pressureDrop = (pCurr - pPrev) / dt;

        result.push({
          timeSeconds: pt.timeSeconds,
          dRdt: Math.round(dRdt * 100) / 100,
          flowAcc: Math.round(flowAcc * 100) / 100,
          pressureDrop: Math.round(pressureDrop * 100) / 100,
        });
      } else {
        result.push({
          timeSeconds: pt.timeSeconds,
          dRdt: 0,
          flowAcc: 0,
          pressureDrop: 0,
        });
      }
    }

    return result;
  }, [lastShotHistory]);

  // Automated Channeling Suspects Detection with Non-Numeric Sensitivity Profiles
  const channelingEvents: ChannelingEvent[] = React.useMemo(() => {
    if (lastShotHistory.length < 5 || dRdtSeries.length === 0) return [];

    const thresholds = {
      sensitive: { dRdt: -0.42, flowAcc: 0.12, pressureDrop: 0.20 },
      moderate: { dRdt: -0.65, flowAcc: 0.20, pressureDrop: 0.15 },
      low: { dRdt: -1.05, flowAcc: 0.40, pressureDrop: 0.10 },
    }[channelSensitivity];

    const events: ChannelingEvent[] = [];
    let lastEventTime = -10; // Debounce window to capture distinct start points

    for (let i = 2; i < lastShotHistory.length - 2; i++) {
      const pt = lastShotHistory[i];
      const dPoint = dRdtSeries[i];
      if (!dPoint) continue;

      if (pt.timeSeconds < 3.2) continue; // Past initial infusion wetting
      if (pt.flow < 0.8) continue; // Must have active extraction flow

      // Debounce window (1.8s) so only the starting point of the channel is flagged
      if (pt.timeSeconds - lastEventTime < 1.8) continue;

      // Channeling signature based on active non-numeric sensitivity
      const isDynamicChannel =
        dPoint.dRdt <= thresholds.dRdt &&
        dPoint.flowAcc >= thresholds.flowAcc &&
        dPoint.pressureDrop <= thresholds.pressureDrop;

      const isExplicitChannel = Boolean(pt.channelDetected);

      if (isDynamicChannel || isExplicitChannel) {
        lastEventTime = pt.timeSeconds;

        const severity: ChannelingEvent["severity"] =
          dPoint.dRdt <= -1.4 || dPoint.flowAcc >= 0.8
            ? "severe"
            : dPoint.dRdt <= -0.95 || dPoint.flowAcc >= 0.45
            ? "moderate"
            : "minor";

        events.push({
          timeSeconds: pt.timeSeconds,
          pressure: pt.pressure,
          flow: pt.flow,
          resistance: pt.puckResistance,
          dRdt: dPoint.dRdt,
          flowAcc: dPoint.flowAcc,
          severity,
        });
      }
    }

    return events;
  }, [lastShotHistory, dRdtSeries, channelSensitivity]);

  // Generate QR Code on mount or shot update (points directly to latest_shot.png)
  useEffect(() => {
    let isCancelled = false;

    async function generateDirectQr() {
      try {
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
        const qrUrl = await QRCode.toDataURL(directPngUrl, {
          margin: 1,
          width: 90,
          color: {
            dark: "#000000",
            light: "#ffffff",
          },
        });

        if (!isCancelled) {
          setQrDataUrl(qrUrl);
        }
      } catch (err) {
        console.error("Could not generate inline QR code:", err);
      }
    }

    generateDirectQr();

    return () => {
      isCancelled = true;
    };
  }, [lastShotSummary, lastShotBean]);

  // Extract Step Transitions from Shot Telemetry
  const stepMarkers: StepMarker[] = React.useMemo(() => {
    if (lastShotHistory.length === 0) return [];
    const markers: StepMarker[] = [];
    let prevName = "";

    lastShotHistory.forEach((pt) => {
      const rawName = pt.stepName || pt.phase || "Extraction";
      const displayName =
        rawName === "preinfusion"
          ? "Pre-infusion"
          : rawName === "soak"
          ? "Soak"
          : rawName === "extraction"
          ? "Extraction"
          : rawName === "decline"
          ? "Decline"
          : rawName.charAt(0).toUpperCase() + rawName.slice(1);

      if (displayName !== prevName) {
        prevName = displayName;
        markers.push({
          timeSeconds: pt.timeSeconds,
          name: displayName,
        });
      }
    });

    return markers;
  }, [lastShotHistory]);

  // High-Resolution Large Telemetry Graph Rendering with Full Axis Reference Numbers & Step Transitions
  useEffect(() => {
    const canvas = graphCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;

    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    ctx.clearRect(0, 0, width, height);

    // Padding for axes labels & ticks
    const padLeft = 48; // Left Y-axis (Pressure & Flow)
    const padRight = 44; // Right Y-axis (Weight)
    const padTop = 24;  // Space for step transition pill badges
    const padBottom = 26; // Bottom X-axis (Time)

    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    // Dark grid background
    ctx.fillStyle = "rgba(10, 13, 18, 0.88)";
    ctx.fillRect(padLeft, padTop, plotW, plotH);

    // Time calculations
    const finalTime =
      lastShotHistory.length > 0
        ? lastShotHistory[lastShotHistory.length - 1].timeSeconds
        : lastShotSummary?.extractionTime || 28;
    const maxSeconds = Math.max(25, Math.ceil(finalTime / 5) * 5);
    const maxWeight = Math.max(40, Math.ceil(((lastShotSummary?.yieldGrams || 36) * 1.15) / 10) * 10);

    const getX = (t: number) => padLeft + (t / maxSeconds) * plotW;
    const getYPressure = (p: number) => padTop + plotH - (p / 9) * plotH; // 0-9 bar
    const getYFlow = (f: number) => padTop + plotH - (f / 8) * plotH;     // 0-8 ml/s
    const getYWeight = (w: number) => padTop + plotH - (w / maxWeight) * plotH; // 0-maxWeight g

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
        // Left Y-axis: Pressure (green)
        ctx.font = "bold 10px ui-monospace, monospace";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillStyle = pVal === 9 ? "#10b981" : "rgba(16, 185, 129, 0.85)";
        ctx.fillText(`${pVal}b`, padLeft - 6, y);

        // Left Y-axis: Flow equivalent in sky blue (0, 2.7, 5.3, 8.0 ml/s)
        const flowVal = Math.round(((pVal / 9) * 8) * 10) / 10;
        ctx.fillStyle = "rgba(56, 189, 248, 0.75)";
        ctx.fillText(`${flowVal}m`, padLeft - 24, y);

        // Right Y-axis: Weight in purple
        const weightVal = Math.round((pVal / 9) * maxWeight);
        ctx.textAlign = "left";
        ctx.fillStyle = "rgba(168, 85, 247, 0.85)";
        ctx.fillText(`${weightVal}g`, padLeft + plotW + 6, y);
      }
    });

    // 2. Vertical Grid Lines & X-Axis Time Reference Numbers (every 5 seconds)
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let t = 0; t <= maxSeconds; t += 5) {
      const x = getX(t);

      // Grid vertical line
      ctx.strokeStyle = t === 0 ? "rgba(255, 255, 255, 0.25)" : "rgba(255, 255, 255, 0.07)";
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, padTop + plotH);
      ctx.stroke();

      // Time label on X-axis
      ctx.fillStyle = "rgba(203, 213, 225, 0.85)";
      ctx.font = "bold 10px ui-monospace, monospace";
      ctx.fillText(`${t}s`, x, padTop + plotH + 7);
    }

    // 3. Profile Step Indications (First Step name between left axis and first step, plus staggered vertical lines with glued text)
    const badgeH = 17;
    const tierStepH = 22;
    let transitionItems: Array<{
      index: number;
      name: string;
      timeSeconds: number;
      lineX: number;
      badgeX: number;
      label: string;
      width: number;
      tier: number;
    }> = [];
    let firstStepData: {
      name: string;
      endTime: number;
      endX: number;
      label: string;
      badgeW: number;
      badgeX: number;
      tier: number;
    } | null = null;

    if (stepMarkers.length > 0) {
      ctx.font = "bold 9px ui-monospace, monospace";

      // A. First step details (between start point on left of graph and first transition line)
      const firstStepName = stepMarkers[0].name;
      const firstStepEndTime = stepMarkers.length > 1 ? stepMarkers[1].timeSeconds : finalTime;
      const firstStepEndX = getX(firstStepEndTime);
      const firstStepWidthAvail = firstStepEndX - padLeft;
      const firstStepLabel =
        firstStepWidthAvail > 90
          ? `${firstStepName} (0-${firstStepEndTime.toFixed(1)}s)`
          : firstStepName;
      const firstBadgeW = Math.max(54, ctx.measureText(firstStepLabel).width + 14);
      const firstBadgeX = (padLeft + firstStepEndX) / 2;

      firstStepData = {
        name: firstStepName,
        endTime: firstStepEndTime,
        endX: firstStepEndX,
        label: firstStepLabel,
        badgeW: firstBadgeW,
        badgeX: firstBadgeX,
        tier: 0,
      };

      // B. Transition items (step 1..N-1)
      transitionItems = stepMarkers.slice(1).map((marker, idx) => {
        const lineX = getX(marker.timeSeconds);
        const label = `${marker.name} (${marker.timeSeconds.toFixed(1)}s)`;
        const width = Math.max(60, ctx.measureText(label).width + 14);
        const badgeX = Math.max(padLeft + width / 2 + 2, Math.min(padLeft + plotW - width / 2 - 2, lineX));
        return {
          index: idx + 1,
          name: marker.name,
          timeSeconds: marker.timeSeconds,
          lineX,
          badgeX,
          label,
          width,
          tier: 0,
        };
      }).filter((item) => item.lineX > padLeft && item.lineX < padLeft + plotW - 6);

      // C. Collision detection & Tier allocation
      const allLayoutItems = [
        { isFirstStep: true, badgeX: firstBadgeX, width: firstBadgeW, tier: 0 },
        ...transitionItems.map((t) => ({ isFirstStep: false, badgeX: t.badgeX, width: t.width, tier: 0, original: t }))
      ];

      allLayoutItems.forEach((item, i) => {
        if (i === 0) {
          item.tier = 0;
          return;
        }
        const conflictingTiers = new Set<number>();
        for (let j = 0; j < i; j++) {
          const prev = allLayoutItems[j];
          const dist = Math.abs(item.badgeX - prev.badgeX);
          const minClearance = (item.width + prev.width) / 2 + 8;
          if (dist < minClearance) {
            conflictingTiers.add(prev.tier);
          }
        }
        let tier = 0;
        while (conflictingTiers.has(tier)) {
          tier++;
        }
        item.tier = tier;
        if (!item.isFirstStep) {
          (item as any).original.tier = tier;
        }
      });

      // D. Draw vertical dashed step lines from staggered heights down to bottom of plot
      transitionItems.forEach((item) => {
        const badgeY = padTop + 4 + item.tier * tierStepH;
        const lineStartY = badgeY + badgeH;
        const lineEndY = padTop + plotH;

        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.32)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(item.lineX, lineStartY);
        ctx.lineTo(item.lineX, lineEndY);
        ctx.stroke();
        ctx.restore();
      });
    }

    // Border around plot area
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.strokeRect(padLeft, padTop, plotW, plotH);

    if (lastShotHistory.length < 2) return;

    // 4. Draw Curves (respecting visibility toggles)

    // A. Weight Accumulation Curve (Purple #a855f7)
    if (visibility.weight) {
      ctx.strokeStyle = "#a855f7";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      lastShotHistory.forEach((pt, i) => {
        const x = getX(pt.timeSeconds);
        const y = getYWeight(pt.weight);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // B. Weight Flow Curve - Dark Espresso Brown (#78350f)
    if (visibility.weightFlow) {
      ctx.strokeStyle = "#78350f";
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      lastShotHistory.forEach((pt, i) => {
        const x = getX(pt.timeSeconds);
        const y = getYFlow(pt.weightFlow);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // C. Water Flow Curve - Sky Blue (#38bdf8)
    if (visibility.waterFlow) {
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      lastShotHistory.forEach((pt, i) => {
        const x = getX(pt.timeSeconds);
        const y = getYFlow(pt.flow);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // D. Pressure Curve - Emerald Green (#10b981)
    if (visibility.pressure) {
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 3.6;
      ctx.shadowColor = "rgba(16, 185, 129, 0.4)";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      lastShotHistory.forEach((pt, i) => {
        const x = getX(pt.timeSeconds);
        const y = getYPressure(pt.pressure);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // E. Derivative of Resistance (dR/dt) Curve (Rose / Hot Coral #f43f5e)
    const getYDerivative = (v: number) => {
      const clamped = Math.max(-3.0, Math.min(2.0, v));
      return padTop + plotH - ((clamped - (-3.0)) / 5.0) * plotH;
    };

    if (visibility.dRdt && dRdtSeries.length > 1) {
      // Zero baseline for dR/dt
      const zeroY = getYDerivative(0);
      ctx.save();
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = "rgba(244, 63, 94, 0.28)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padLeft, zeroY);
      ctx.lineTo(padLeft + plotW, zeroY);
      ctx.stroke();

      // Axis label for 0 dR/dt
      ctx.fillStyle = "rgba(244, 63, 94, 0.85)";
      ctx.font = "bold 9px ui-monospace, monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText("0 dR", padLeft - 6, zeroY);
      ctx.restore();

      // dR/dt Curve
      ctx.strokeStyle = "#f43f5e";
      ctx.lineWidth = 2.4;
      ctx.shadowColor = "rgba(244, 63, 94, 0.35)";
      ctx.shadowBlur = 5;
      ctx.beginPath();
      dRdtSeries.forEach((pt, i) => {
        const x = getX(pt.timeSeconds);
        const y = getYDerivative(pt.dRdt);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // 4.5 Glued Step Badges and First Step Label (Rendered on top of curves for maximum clarity)
    if (firstStepData) {
      const firstTier = firstStepData.tier;
      const firstBadgeY = padTop + 4 + firstTier * tierStepH;
      const firstBoxX = firstStepData.badgeX - firstStepData.badgeW / 2;
      const firstBoxY = firstBadgeY;

      // Subtle horizontal guide line spanning between left axis (padLeft) and first transition line
      if (firstStepData.endX > padLeft) {
        const x0 = padLeft;
        const x1 = firstStepData.endX;
        const midY = firstBoxY + badgeH / 2;

        ctx.save();
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = "rgba(251, 191, 36, 0.4)";
        ctx.lineWidth = 1;

        if (firstBoxX - (x0 + 4) > 6) {
          ctx.beginPath();
          ctx.moveTo(x0 + 2, midY);
          ctx.lineTo(firstBoxX - 4, midY);
          ctx.stroke();
        }
        if ((x1 - 4) - (firstBoxX + firstStepData.badgeW) > 6) {
          ctx.beginPath();
          ctx.moveTo(firstBoxX + firstStepData.badgeW + 4, midY);
          ctx.lineTo(x1 - 4, midY);
          ctx.stroke();
        }
        ctx.restore();
      }

      // First step badge glued nicely in the interval
      ctx.fillStyle = "rgba(15, 20, 28, 0.94)";
      ctx.strokeStyle = "rgba(251, 191, 36, 0.55)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      drawRoundRect(ctx, firstBoxX, firstBoxY, firstStepData.badgeW, badgeH, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#fde68a";
      ctx.font = "bold 9px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(firstStepData.label, firstStepData.badgeX, firstBoxY + badgeH / 2);
    }

    // Subsequent transition step badges glued directly on top of their vertical indication lines
    transitionItems.forEach((item) => {
      const badgeY = padTop + 4 + item.tier * tierStepH;
      const lineStartY = badgeY + badgeH;
      const boxX = item.badgeX - item.width / 2;
      const boxY = badgeY;

      // Metallic anchor dot connecting line to badge
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(item.lineX, lineStartY, 2, 0, Math.PI * 2);
      ctx.fill();

      // If line is offset due to plot-edge clamping, draw connecting bridge
      if (Math.abs(item.lineX - item.badgeX) > 1) {
        ctx.save();
        ctx.strokeStyle = "rgba(251, 191, 36, 0.5)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(item.lineX, lineStartY);
        ctx.lineTo(item.badgeX, badgeY + badgeH);
        ctx.stroke();
        ctx.restore();
      }

      // Pill badge glued right on top of the vertical line
      ctx.fillStyle = "rgba(15, 20, 28, 0.94)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.30)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      drawRoundRect(ctx, boxX, boxY, item.width, badgeH, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#fbbf24";
      ctx.font = "bold 9px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(item.label, item.badgeX, boxY + badgeH / 2);
    });

    // 4.6 Channeling Suspect Flags & Starting Point Warning Signs (Crimson Red #ef4444)
    if (visibility.channelFlags && channelingEvents.length > 0) {
      channelingEvents.forEach((event) => {
        const ex = getX(event.timeSeconds);
        if (ex < padLeft || ex > padLeft + plotW) return;

        const warnY = padTop + 20;

        // A. Subtle crimson vertical indicator line
        ctx.save();
        ctx.setLineDash([3, 2]);
        ctx.strokeStyle = "rgba(239, 68, 68, 0.55)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(ex, warnY + 14);
        ctx.lineTo(ex, padTop + plotH);
        ctx.stroke();
        ctx.restore();

        // B. Pulsing red beacon dot on the pressure curve at the fracture point
        ctx.save();
        ctx.fillStyle = "#ef4444";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.8;
        ctx.shadowColor = "rgba(239, 68, 68, 0.85)";
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(ex, getYPressure(event.pressure), 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // C. Actual small red warning sign (Triangle with '!')
        ctx.save();
        ctx.shadowColor = "rgba(239, 68, 68, 0.9)";
        ctx.shadowBlur = 8;
        ctx.fillStyle = "#dc2626"; // Crimson
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.2;

        // Equilateral triangle centered at ex, warnY
        ctx.beginPath();
        ctx.moveTo(ex, warnY - 8);
        ctx.lineTo(ex + 8, warnY + 6);
        ctx.lineTo(ex - 8, warnY + 6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // White exclamation mark
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 9px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("!", ex, warnY + 1);

        // Timestamp tag beneath warning sign
        ctx.fillStyle = "#fca5a5";
        ctx.font = "bold 8px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(`${event.timeSeconds.toFixed(1)}s`, ex, warnY + 8);
      });
    }

    // 5. Active Hover / Touch Scrubbing Indicator
    if (hoveredPoint) {
      const hx = getX(hoveredPoint.timeSeconds);
      if (hx >= padLeft && hx <= padLeft + plotW) {
        // Vertical scrub cursor line
        ctx.save();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(hx, padTop);
        ctx.lineTo(hx, padTop + plotH);
        ctx.stroke();
        ctx.restore();

        // Intersection dots on visible curves
        if (visibility.pressure) {
          const py = getYPressure(hoveredPoint.pressure);
          ctx.fillStyle = "#10b981";
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(hx, py, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }

        if (visibility.waterFlow) {
          const fy = getYFlow(hoveredPoint.flow);
          ctx.fillStyle = "#38bdf8";
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(hx, fy, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }

        if (visibility.weightFlow) {
          const wfy = getYFlow(hoveredPoint.weightFlow);
          ctx.fillStyle = "#78350f";
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(hx, wfy, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }

        if (visibility.weight) {
          const wy = getYWeight(hoveredPoint.weight);
          ctx.fillStyle = "#a855f7";
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(hx, wy, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }

        if (visibility.dRdt) {
          const match = dRdtSeries.find((d) => Math.abs(d.timeSeconds - hoveredPoint.timeSeconds) < 0.15);
          if (match) {
            const dy = getYDerivative(match.dRdt);
            ctx.fillStyle = "#f43f5e";
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(hx, dy, 4.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
        }
      }
    }

    // Standby watermark when no shot has been completed yet
    if (lastShotHistory.length === 0) {
      ctx.fillStyle = "rgba(148, 163, 184, 0.3)";
      ctx.font = "bold 13px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Cockpit Standby · Telemetry live · Ready to brew", padLeft + plotW / 2, padTop + plotH / 2);
    }
  }, [lastShotHistory, lastShotSummary, visibility, stepMarkers, hoveredPoint, dRdtSeries, channelingEvents]);

  // Pointer & Touch Handlers for Non-Obscured Continuous Graph Scrubbing
  const handlePointerInteraction = (clientX: number) => {
    const canvas = graphCanvasRef.current;
    if (!canvas || lastShotHistory.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;

    const padLeft = 48;
    const padRight = 44;
    const plotW = canvas.clientWidth - padLeft - padRight;

    const finalTime =
      lastShotHistory[lastShotHistory.length - 1]?.timeSeconds ||
      lastShotSummary?.extractionTime || 28;
    const maxSeconds = Math.max(25, Math.ceil(finalTime / 5) * 5);

    // Compute continuous target time clamped to actual shot duration
    const t = Math.max(0, Math.min(finalTime, ((x - padLeft) / plotW) * maxSeconds));

    // Continuous linear interpolation between surrounding points
    let pLeft = lastShotHistory[0];
    let pRight = lastShotHistory[lastShotHistory.length - 1];

    if (t <= pLeft.timeSeconds) {
      setHoveredPoint(pLeft);
      return;
    }
    if (t >= pRight.timeSeconds) {
      setHoveredPoint(pRight);
      return;
    }

    // Binary search to find bounding segment
    let low = 0;
    let high = lastShotHistory.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (lastShotHistory[mid].timeSeconds <= t) {
        pLeft = lastShotHistory[mid];
        low = mid + 1;
      } else {
        pRight = lastShotHistory[mid];
        high = mid - 1;
      }
    }

    const dt = pRight.timeSeconds - pLeft.timeSeconds;
    if (dt <= 0.001) {
      setHoveredPoint(pLeft);
      return;
    }

    const alpha = Math.max(0, Math.min(1, (t - pLeft.timeSeconds) / dt));
    const continuousTime = Math.round(t * 10) / 10; // Continuous 0.1s resolution

    const interpolated: TelemetryPoint = {
      ...pLeft,
      timeSeconds: continuousTime,
      pressure: +(pLeft.pressure + alpha * (pRight.pressure - pLeft.pressure)).toFixed(2),
      targetPressure: +(pLeft.targetPressure + alpha * (pRight.targetPressure - pLeft.targetPressure)).toFixed(2),
      flow: +(pLeft.flow + alpha * (pRight.flow - pLeft.flow)).toFixed(2),
      targetFlow: +(pLeft.targetFlow + alpha * (pRight.targetFlow - pLeft.targetFlow)).toFixed(2),
      weightFlow: +(pLeft.weightFlow + alpha * (pRight.weightFlow - pLeft.weightFlow)).toFixed(2),
      weight: +(pLeft.weight + alpha * (pRight.weight - pLeft.weight)).toFixed(1),
      groupTemperature: +(pLeft.groupTemperature + alpha * (pRight.groupTemperature - pLeft.groupTemperature)).toFixed(1),
      puckResistance: +(pLeft.puckResistance + alpha * (pRight.puckResistance - pLeft.puckResistance)).toFixed(2),
      channelDetected: alpha < 0.5 ? pLeft.channelDetected : pRight.channelDetected,
      stepName: alpha < 0.5 ? pLeft.stepName : pRight.stepName,
      phase: alpha < 0.5 ? pLeft.phase : pRight.phase,
    };

    setHoveredPoint(interpolated);
  };

  const hoveredDRdt = React.useMemo(() => {
    if (!hoveredPoint || dRdtSeries.length === 0) return 0;
    const match = dRdtSeries.find((d) => Math.abs(d.timeSeconds - hoveredPoint.timeSeconds) < 0.25);
    return match?.dRdt ?? 0;
  }, [hoveredPoint, dRdtSeries]);

  const hoveredChannelEvent = React.useMemo(() => {
    if (!hoveredPoint || channelingEvents.length === 0) return null;
    return channelingEvents.find((e) => Math.abs(e.timeSeconds - hoveredPoint.timeSeconds) <= 1.0) ?? null;
  }, [hoveredPoint, channelingEvents]);

  return (
    <div className="flex-1 min-w-0 h-full min-h-0 flex flex-col justify-between items-center py-1 sm:py-2 px-1.5 sm:px-3 select-none z-10 bg-transparent overflow-hidden">
      {/* 1. Top Unified Line: Boilers, PantaRhei Emblem, and Water Level */}
      <div className="w-full flex items-center justify-between pb-1 shrink-0 gap-1 overflow-x-hidden">
        {/* Left: Boiler Temperatures */}
        <div className="flex items-center space-x-1 sm:space-x-1.5 lg:space-x-2">
          <div className="flex items-center space-x-1 lg:space-x-1.5 px-2 py-0.5 lg:py-1 rounded-full bg-slate-900 border border-slate-700/80 shadow-sm">
            <Thermometer className="w-2.5 h-2.5 lg:w-3.5 lg:h-3.5 text-rose-400" />
            <span className="text-[9px] sm:text-[10px] lg:text-[11px] font-semibold text-slate-300">Group:</span>
            <span className="text-[9px] sm:text-[10px] lg:text-[11px] font-bold font-mono text-white">
              {machine.groupTemperature.toFixed(1)}°C
            </span>
            {machine.groupTemperature < (machine.targetGroupTemp - 1.5) && (
              <span className="text-[8.5px] lg:text-[9.5px] font-mono text-amber-400 font-medium">
                → {machine.targetGroupTemp.toFixed(1)}°C
              </span>
            )}
          </div>

          <div className="flex items-center space-x-1 lg:space-x-1.5 px-2 py-0.5 lg:py-1 rounded-full bg-slate-900 border border-slate-700/80 shadow-sm">
            <Gauge className="w-2.5 h-2.5 lg:w-3.5 lg:h-3.5 text-amber-400" />
            <span className="text-[9px] sm:text-[10px] lg:text-[11px] font-semibold text-slate-300">Steam:</span>
            <span className="text-[9px] sm:text-[10px] lg:text-[11px] font-bold font-mono text-white">
              {machine.targetSteamTemp === 0 ? "Off" : `${machine.steamTemperature.toFixed(0)}°C`}
            </span>
            {machine.targetSteamTemp > 0 && machine.steamTemperature < (machine.targetSteamTemp - 3.0) && (
              <span className="text-[8.5px] lg:text-[9.5px] font-mono text-amber-400 font-medium">
                → {machine.targetSteamTemp.toFixed(0)}°C
              </span>
            )}
          </div>
        </div>

        {/* Center: PantaRhei Emblem */}
        <div className="flex items-center space-x-1 sm:space-x-1.5 lg:space-x-2 px-2.5 py-0.5 lg:py-1 rounded-full bg-slate-900 border border-slate-700/80 shadow-inner shrink-0">
          <Sparkles className="w-2.5 h-2.5 lg:w-3.5 lg:h-3.5 text-amber-400" />
          <span className="text-[10px] sm:text-[11px] lg:text-xs font-bold tracking-wider text-white">PantaRhei</span>
          <span className="hidden xl:inline text-decent-muted text-[10px]">·</span>
          <span className="hidden xl:inline text-[9.5px] lg:text-[10px] text-amber-300 tracking-widest uppercase font-semibold">
            Everything Flows
          </span>
        </div>

        {/* Right: Water Level in Milliliters */}
        <div
          className={`flex items-center space-x-1 lg:space-x-1.5 px-2 py-0.5 lg:py-1 rounded-full border transition-all shrink-0 ${
            isWaterLow
              ? "bg-red-950/80 border-red-500/80 text-red-300 animate-pulse"
              : "bg-slate-900 border-slate-700/80 text-sky-400 shadow-sm"
          }`}
        >
          <div className={`w-1.5 h-1.5 lg:w-2 lg:h-2 rounded-full ${isWaterLow ? "bg-red-500" : "bg-sky-400"}`} />
          <span className="text-[9px] sm:text-[10px] lg:text-[11px] font-semibold uppercase tracking-wider text-slate-300">
            Water:
          </span>
          <span className="text-[9px] sm:text-[10px] lg:text-[11px] font-bold font-mono text-white">
            {Math.round(machine.waterLevelMl)} ml
          </span>
        </div>
      </div>

      {/* 2. Main Full-Height Previous Shot & Large Telemetry Graph Card */}
      <div className="flex-1 w-full min-w-0 min-h-0 flex flex-col justify-between rounded-2xl bg-slate-900/95 border border-slate-700/80 shadow-2xl p-2 lg:p-3 my-0.5 overflow-hidden relative">
        {/* Top Section of Card: Previous Shot or Standby State */}
        {lastShotSummary && lastShotHistory.length > 0 ? (
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-700/60 shrink-0 min-w-0">
            <div className="flex items-center space-x-2.5 min-w-0">
              {/* QR Code */}
              <div className="flex flex-col items-center shrink-0">
                <div
                  className="w-11 h-11 lg:w-14 lg:h-14 bg-white p-0.5 rounded-xl shadow-md flex items-center justify-center shrink-0 border border-white/20 transition-transform hover:scale-105 cursor-pointer"
                  onClick={onOpenSummaryModal}
                  title="Scan with phone camera to download shot card directly, or click to inspect"
                >
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt="Scan to download shot card" className="w-full h-full block" />
                  ) : (
                    <div className="text-[8px] text-gray-500 font-mono text-center">QR Ready</div>
                  )}
                </div>
                <span className="text-[8px] font-mono text-emerald-400 mt-0.5 flex items-center space-x-0.5 font-bold">
                  <Smartphone className="w-2.5 h-2.5" />
                  <span>Scan PNG</span>
                </span>
              </div>

              {/* Bean Data & Profile */}
              <div className="min-w-0">
                <div className="flex items-center space-x-1.5 flex-wrap">
                  <span className="text-[9.5px] lg:text-[10px] uppercase font-bold text-emerald-400 tracking-wider flex items-center space-x-1 shrink-0">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Previous Shot</span>
                  </span>
                  {lastShotBean && (
                    <>
                      <span className="text-decent-muted text-[10px]">·</span>
                      <span className="text-xs font-semibold text-white truncate max-w-[130px]">
                        {lastShotBean.name}
                      </span>
                      <span className="text-decent-muted text-xs truncate max-w-[100px]">({lastShotBean.roaster})</span>
                    </>
                  )}
                  {lastShotProfileTitle && (
                    <>
                      <span className="text-decent-muted text-[10px]">·</span>
                      <span className="text-[10.5px] font-semibold text-cyan-300 px-1.5 py-0.2 rounded-md bg-cyan-950/50 border border-cyan-500/40 font-mono truncate max-w-[150px]">
                        {lastShotProfileTitle}
                      </span>
                    </>
                  )}
                </div>
                <div className="text-[10.5px] text-decent-muted flex items-center space-x-2 mt-0.5 truncate">
                  {lastShotBean && (
                    <>
                      <span className="text-amber-400 font-medium truncate">
                        {lastShotBean.countryOfOrigin}{lastShotBean.process ? ` · ${lastShotBean.process}` : ""}
                      </span>
                      <span>·</span>
                    </>
                  )}
                  <span className="font-mono text-white shrink-0">
                    Yield: {lastShotSummary.yieldGrams.toFixed(1)}g
                  </span>
                </div>
              </div>
            </div>

            {/* Core Extraction Metrics & Inspect Action */}
            <div className="flex items-center space-x-1.5 shrink-0 ml-1.5">
              <div className="flex items-center space-x-1 font-mono text-[10px] lg:text-xs">
                <span className="px-1.5 py-0.5 rounded-lg bg-decent-dark border border-decent-border text-white font-bold">
                  {lastShotSummary.extractionTime.toFixed(1)}s
                </span>
                <span className="px-1.5 py-0.5 rounded-lg bg-decent-dark border border-decent-border text-amber-400 font-bold">
                  {lastShotSummary.yieldGrams.toFixed(1)}g
                </span>
                <span className="px-1.5 py-0.5 rounded-lg bg-decent-dark border border-decent-border text-emerald-400 font-bold">
                  {lastShotSummary.peakPressure.toFixed(1)}b
                </span>
                {lastShotSummary.eyPercentage && (
                  <span className="px-1.5 py-0.5 rounded-lg bg-decent-dark border border-decent-border text-cyan-400 font-bold hidden sm:inline-block">
                    EY {lastShotSummary.eyPercentage.toFixed(1)}%
                  </span>
                )}
              </div>

              {onOpenSummaryModal && (
                <button
                  type="button"
                  onClick={onOpenSummaryModal}
                  className="p-1 rounded-xl bg-decent-card hover:bg-slate-800 border border-decent-border text-decent-muted hover:text-white transition-all cursor-pointer shadow-sm active:scale-95"
                  title="Open detailed view & rating modal"
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between pb-2 border-b border-decent-border/50 shrink-0 w-full min-w-0">
            <div className="flex items-center space-x-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white flex items-center space-x-1.5">
                  <span>Cockpit Standby</span>
                  <span className="text-decent-muted text-[10px]">·</span>
                  <span className="text-[9.5px] px-1.5 py-0.2 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono font-semibold">
                    Ready
                  </span>
                </div>
                <div className="text-[10px] text-decent-muted truncate">
                  Telemetry stream active · Ready for first extraction
                </div>
              </div>
            </div>
            <div className="text-[10.5px] font-mono text-decent-muted shrink-0 ml-1">
              Profile: <span className="text-amber-300 font-semibold">{lastShotProfileTitle || "Default Espresso"}</span>
            </div>
          </div>
        )}

        {/* Interactive Legend Bar with Click-to-Toggle Visibility */}
        <div className="flex items-center justify-between py-1 px-1.5 lg:py-1.5 lg:px-2 bg-decent-dark/70 rounded-xl border border-decent-border/40 my-1 shrink-0 overflow-x-auto">
          <div className="flex items-center space-x-1 sm:space-x-1.5 text-[9px] sm:text-[10px] lg:text-[10.5px] font-mono">
            {/* 1. Pressure Toggle (Green #10b981) */}
            <button
              type="button"
              onClick={() => toggleSeries("pressure")}
              className={`flex items-center space-x-1 px-1.5 sm:px-2 py-0.5 rounded-md border transition-all cursor-pointer shrink-0 ${
                visibility.pressure
                  ? "bg-emerald-500/20 border-emerald-500/60 text-emerald-400 font-bold shadow-sm"
                  : "bg-decent-surface border-decent-border/40 text-decent-muted opacity-45 line-through"
              }`}
            >
              <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${visibility.pressure ? "bg-emerald-500 shadow-[0_0_6px_#10b981]" : "bg-gray-500"}`} />
              <span>Pressure (0-9b)</span>
              {visibility.pressure ? <Eye className="w-2.5 h-2.5 sm:w-3 sm:h-3 ml-0.5 opacity-75" /> : <EyeOff className="w-2.5 h-2.5 sm:w-3 sm:h-3 ml-0.5" />}
            </button>

            {/* 2. Water Flow Toggle */}
            <button
              type="button"
              onClick={() => toggleSeries("waterFlow")}
              className={`flex items-center space-x-1 px-1.5 sm:px-2 py-0.5 rounded-md border transition-all cursor-pointer shrink-0 ${
                visibility.waterFlow
                  ? "bg-sky-500/20 border-sky-500/60 text-sky-400 font-bold shadow-sm"
                  : "bg-decent-surface border-decent-border/40 text-decent-muted opacity-45 line-through"
              }`}
            >
              <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${visibility.waterFlow ? "bg-sky-400 shadow-[0_0_6px_#38bdf8]" : "bg-gray-500"}`} />
              <span>Flow (ml/s)</span>
              {visibility.waterFlow ? <Eye className="w-2.5 h-2.5 sm:w-3 sm:h-3 ml-0.5 opacity-75" /> : <EyeOff className="w-2.5 h-2.5 sm:w-3 sm:h-3 ml-0.5" />}
            </button>

            {/* 3. Weight Flow Toggle (Dark Espresso Brown #78350f) */}
            <button
              type="button"
              onClick={() => toggleSeries("weightFlow")}
              className={`flex items-center space-x-1 px-1.5 sm:px-2 py-0.5 rounded-md border transition-all cursor-pointer shrink-0 ${
                visibility.weightFlow
                  ? "bg-amber-950/40 border-amber-800/80 text-amber-500 font-bold shadow-sm"
                  : "bg-decent-surface border-decent-border/40 text-decent-muted opacity-45 line-through"
              }`}
            >
              <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${visibility.weightFlow ? "bg-[#78350f] shadow-[0_0_6px_#78350f]" : "bg-gray-500"}`} />
              <span>Wt Flow (g/s)</span>
              {visibility.weightFlow ? <Eye className="w-2.5 h-2.5 sm:w-3 sm:h-3 ml-0.5 opacity-75" /> : <EyeOff className="w-2.5 h-2.5 sm:w-3 sm:h-3 ml-0.5" />}
            </button>

            {/* 4. Weight Toggle (Purple) */}
            <button
              type="button"
              onClick={() => toggleSeries("weight")}
              className={`flex items-center space-x-1 px-1.5 sm:px-2 py-0.5 rounded-md border transition-all cursor-pointer shrink-0 ${
                visibility.weight
                  ? "bg-purple-500/20 border-purple-500/60 text-purple-400 font-bold shadow-sm"
                  : "bg-decent-surface border-decent-border/40 text-decent-muted opacity-45 line-through"
              }`}
            >
              <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${visibility.weight ? "bg-purple-500 shadow-[0_0_6px_#a855f7]" : "bg-gray-500"}`} />
              <span>Weight (g)</span>
              {visibility.weight ? <Eye className="w-2.5 h-2.5 sm:w-3 sm:h-3 ml-0.5 opacity-75" /> : <EyeOff className="w-2.5 h-2.5 sm:w-3 sm:h-3 ml-0.5" />}
            </button>

            {/* 5. dR/dt (Derivative of Resistance) Toggle */}
            <button
              type="button"
              onClick={() => toggleSeries("dRdt")}
              className={`flex items-center space-x-1 px-1.5 sm:px-2 py-0.5 rounded-md border transition-all cursor-pointer shrink-0 ${
                visibility.dRdt
                  ? "bg-rose-500/20 border-rose-500/60 text-rose-400 font-bold shadow-sm"
                  : "bg-decent-surface border-decent-border/40 text-decent-muted opacity-45 line-through"
              }`}
              title="Toggle First-order rate of change of puck resistance (dR/dt)"
            >
              <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${visibility.dRdt ? "bg-rose-500 shadow-[0_0_6px_#f43f5e]" : "bg-gray-500"}`} />
              <span>dR/dt</span>
              {visibility.dRdt ? <Eye className="w-2.5 h-2.5 sm:w-3 sm:h-3 ml-0.5 opacity-75" /> : <EyeOff className="w-2.5 h-2.5 sm:w-3 sm:h-3 ml-0.5" />}
            </button>

            {/* 6. Channel Flags Toggle */}
            <button
              type="button"
              onClick={() => toggleSeries("channelFlags")}
              className={`flex items-center space-x-1 px-1.5 sm:px-2 py-0.5 rounded-md border transition-all cursor-pointer shrink-0 ${
                visibility.channelFlags
                  ? "bg-red-500/25 border-red-500/70 text-red-400 font-bold shadow-sm"
                  : "bg-decent-surface border-decent-border/40 text-decent-muted opacity-45 line-through"
              }`}
              title="Toggle Channeling suspect warning signs"
            >
              <AlertTriangle className={`w-2.5 h-2.5 sm:w-3 sm:h-3 ${visibility.channelFlags ? "text-red-400 drop-shadow-[0_0_4px_#ef4444]" : "text-gray-500"}`} />
              <span>
                Flags{visibility.channelFlags ? ` (${channelSensitivity === "sensitive" ? "High" : channelSensitivity === "moderate" ? "Med" : "Low"})` : ""}
              </span>
              {visibility.channelFlags ? <Eye className="w-2.5 h-2.5 sm:w-3 sm:h-3 ml-0.5 opacity-75" /> : <EyeOff className="w-2.5 h-2.5 sm:w-3 sm:h-3 ml-0.5" />}
            </button>
          </div>

          <span className="text-[10px] text-decent-muted font-mono hidden md:inline">
            {hoveredPoint ? "Scrubbing Active" : "Touch / hover to inspect"}
          </span>
        </div>

        {/* 3. Expanded Full-Size Telemetry Graph Canvas (Dominates the Middle Pane, Adapts Dynamically) */}
        <div className="flex-1 w-full min-h-0 relative rounded-xl overflow-hidden shadow-inner mt-0.5 touch-none">
          <canvas
            ref={graphCanvasRef}
            className="w-full h-full block cursor-crosshair"
            onPointerDown={(e) => handlePointerInteraction(e.clientX)}
            onPointerMove={(e) => {
              if (e.buttons > 0 || e.pointerType === "mouse") {
                handlePointerInteraction(e.clientX);
              }
            }}
            onPointerUp={() => setHoveredPoint(null)}
            onPointerLeave={() => setHoveredPoint(null)}
          />

          {/* Vertical Non-Numeric Sensitivity Slider (Appears when Flags toggle is ON) */}
          {visibility.channelFlags && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center bg-slate-950 border border-slate-700 rounded-xl p-1 shadow-2xl transition-all duration-300 select-none">
              {/* Header with mini warning icon */}
              <div className="flex flex-col items-center mb-0.5 pb-0.5 border-b border-white/10" title="Channeling Sensitivity">
                <AlertTriangle className="w-3 h-3 text-red-400" />
                <span className="text-[7.5px] uppercase font-bold text-slate-300 tracking-tighter mt-0.5">
                  Sens
                </span>
              </div>

              {/* 3-Step Vertical Non-Numeric Track */}
              <div className="flex flex-col space-y-0.5 my-0.5">
                {/* 1. Sensitive (High) */}
                <button
                  type="button"
                  onClick={() => handleSensitivityChange("sensitive")}
                  className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex flex-col items-center justify-center transition-all cursor-pointer ${
                    channelSensitivity === "sensitive"
                      ? "bg-amber-400 text-slate-950 font-black shadow-md border border-amber-300 scale-105"
                      : "hover:bg-slate-800 text-slate-300 hover:text-white border border-transparent"
                  }`}
                  title="Sensitive: Flags subtle micro-fissures and minor flow surges"
                >
                  <span className="text-[8px] sm:text-[9px] font-bold font-mono">HIGH</span>
                </button>

                {/* Vertical track line */}
                <div className="w-0.5 h-1 bg-white/20 self-center rounded-full" />

                {/* 2. Moderate (Med - Default) */}
                <button
                  type="button"
                  onClick={() => handleSensitivityChange("moderate")}
                  className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex flex-col items-center justify-center transition-all cursor-pointer ${
                    channelSensitivity === "moderate"
                      ? "bg-sky-400 text-slate-950 font-black shadow-md border border-sky-300 scale-105"
                      : "hover:bg-slate-800 text-slate-300 hover:text-white border border-transparent"
                  }`}
                  title="Moderate: Flags standard structural fissures and notable surges"
                >
                  <span className="text-[8px] sm:text-[9px] font-bold font-mono">MED</span>
                </button>

                {/* Vertical track line */}
                <div className="w-0.5 h-1 bg-white/20 self-center rounded-full" />

                {/* 3. Low (Macro / Blowouts only) */}
                <button
                  type="button"
                  onClick={() => handleSensitivityChange("low")}
                  className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex flex-col items-center justify-center transition-all cursor-pointer ${
                    channelSensitivity === "low"
                      ? "bg-purple-400 text-slate-950 font-black shadow-md border border-purple-300 scale-105"
                      : "hover:bg-slate-800 text-slate-300 hover:text-white border border-transparent"
                  }`}
                  title="Low: Flags only major crater blowouts and puck collapse"
                >
                  <span className="text-[8px] sm:text-[9px] font-bold font-mono">LOW</span>
                </button>
              </div>

              {/* Active mode indicator */}
              <div className="mt-0.5 pt-0.5 border-t border-white/10 text-[7px] font-mono text-center uppercase tracking-tighter text-amber-400 font-bold">
                {channelSensitivity === "sensitive" ? "Sens." : channelSensitivity === "moderate" ? "Mod." : "Low"}
              </div>
            </div>
          )}

          {/* Dynamic Floating Readout Bubble in a Fixed, Non-Obscured Position (Top-Right) */}
          {hoveredPoint && (
            <div className="absolute top-3 right-14 z-20 pointer-events-none p-3 rounded-2xl bg-slate-950/90 border border-slate-700/80 backdrop-blur-md shadow-2xl flex flex-col space-y-1.5 min-w-[220px] animate-in fade-in zoom-in-95 duration-100">
              {/* Channeling Warning Alert Banner (if near suspect event) */}
              {hoveredChannelEvent && visibility.channelFlags && (
                <div className="px-2.5 py-1 rounded-xl bg-red-950/90 border border-red-500/80 text-red-200 flex items-center space-x-1.5 text-[10px] font-bold shadow-sm animate-pulse">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <span>
                    Suspected Channel ({hoveredChannelEvent.timeSeconds.toFixed(1)}s): dR/dt {hoveredChannelEvent.dRdt.toFixed(2)}
                  </span>
                </div>
              )}

              {/* Top Line: Time & Step Name */}
              <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                <span className="text-xs font-mono font-bold text-white">
                  T: {hoveredPoint.timeSeconds.toFixed(1)}s
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold border border-amber-400/40 font-mono">
                  {hoveredPoint.stepName || hoveredPoint.phase}
                </span>
              </div>

              {/* Dynamic Readouts Grid */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-mono">
                <div className="flex items-center space-x-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-decent-muted">Pressure:</span>
                  <span className="font-bold text-emerald-400">{hoveredPoint.pressure.toFixed(1)}b</span>
                </div>

                <div className="flex items-center space-x-1.5">
                  <div className="w-2 h-2 rounded-full bg-sky-400" />
                  <span className="text-decent-muted">Water:</span>
                  <span className="font-bold text-sky-400">{hoveredPoint.flow.toFixed(1)}m</span>
                </div>

                <div className="flex items-center space-x-1.5">
                  <div className="w-2 h-2 rounded-full bg-[#78350f]" />
                  <span className="text-decent-muted">Wt Flow:</span>
                  <span className="font-bold text-amber-500">{hoveredPoint.weightFlow.toFixed(1)}g/s</span>
                </div>

                <div className="flex items-center space-x-1.5">
                  <div className="w-2 h-2 rounded-full bg-purple-500" />
                  <span className="text-decent-muted">Weight:</span>
                  <span className="font-bold text-purple-400">{hoveredPoint.weight.toFixed(1)}g</span>
                </div>

                {visibility.dRdt && (
                  <div className="flex items-center space-x-1.5 col-span-2 pt-1 border-t border-white/5">
                    <div className="w-2 h-2 rounded-full bg-[#f43f5e]" />
                    <span className="text-decent-muted">dR/dt:</span>
                    <span className="font-bold text-rose-400">
                      {hoveredDRdt > 0 ? `+${hoveredDRdt.toFixed(2)}` : hoveredDRdt.toFixed(2)}{" "}
                      <span className="text-[9px] font-normal text-decent-muted">bar/(ml/s)/s</span>
                    </span>
                  </div>
                )}
              </div>

              {hoveredPoint.puckResistance > 0 && (
                <div className="pt-1 border-t border-white/10 flex items-center justify-between text-[10px] font-mono text-decent-muted">
                  <span>Puck Resistance:</span>
                  <span className="font-bold text-cyan-400">{hoveredPoint.puckResistance.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 4. Subtle Bottom System Readiness */}
      <div className="w-full flex items-center justify-between text-[11px] text-decent-muted px-2 pt-0.5 shrink-0">
        <span className="flex items-center space-x-1.5">
          <Layers className="w-3.5 h-3.5 text-amber-400" />
          <span>Profile Steps: {stepMarkers.map((m) => m.name).join(" → ")}</span>
        </span>
        <span>Decaid WebUI v1 · 10Hz Telemetry Buffer</span>
      </div>
    </div>
  );
};
