/**
 * PantaRhei High-Resolution Shot Card Infographic Generator (1200x675)
 * Renders an offscreen canvas containing complete extraction telemetry curves,
 * bean metadata, sensory tags, and dial-in metrics.
 * Uploads the image to /api/shot/save so mobile devices on LAN can download /latest_shot.png.
 */

import type { TelemetryPoint } from "./telemetrySimulator.ts";
import type { PantaBean } from "../types/bean.ts";

export interface ShotCardOptions {
  bean?: PantaBean;
  history: TelemetryPoint[];
  dose: number;
  finalYield: number;
  extractionTime: number;
  peakPressure: number;
  avgFlow: number;
  tds: number;
  eyPercentage: string;
  rating: number;
  tags: string[];
}

export async function generateShotCardBlob(
  options: ShotCardOptions
): Promise<{ dataUrl: string; blob: Blob }> {
  const width = 1200;
  const height = 675;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not get 2D canvas context");
  }

  // 1. Background with rich dark coffee gradient
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, "#0b0d12");
  bgGrad.addColorStop(0.5, "#121620");
  bgGrad.addColorStop(1, "#0a0c10");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Decorative border
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 2;
  ctx.strokeRect(16, 16, width - 32, height - 32);

  // Top header glow accent
  const glowGrad = ctx.createLinearGradient(40, 40, width - 40, 40);
  glowGrad.addColorStop(0, "rgba(245, 158, 11, 0.4)");
  glowGrad.addColorStop(0.5, "rgba(6, 182, 212, 0.4)");
  glowGrad.addColorStop(1, "rgba(244, 63, 94, 0.4)");
  ctx.fillStyle = glowGrad;
  ctx.fillRect(40, 36, width - 80, 2);

  // 2. Header text
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 26px system-ui, -apple-system, sans-serif";
  ctx.fillText("PantaRhei", 44, 76);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "14px ui-monospace, monospace";
  ctx.fillText("DECENT DE1 ESPRESSO TELEMETRY", 185, 74);

  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  ctx.fillStyle = "#64748b";
  ctx.font = "14px ui-monospace, monospace";
  ctx.textAlign = "right";
  ctx.fillText(dateStr, width - 44, 74);
  ctx.textAlign = "left";

  // 3. Coffee Information Box
  ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
  ctx.fillRect(40, 96, 420, 150);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.strokeRect(40, 96, 420, 150);

  ctx.fillStyle = "#f59e0b";
  ctx.font = "bold 11px ui-monospace, monospace";
  ctx.fillText("COFFEE INVENTORY", 56, 120);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 24px system-ui, sans-serif";
  ctx.fillText(options.bean?.name || "Espresso Lot", 56, 154);

  ctx.fillStyle = "#cbd5e1";
  ctx.font = "16px system-ui, sans-serif";
  const roasterStr = options.bean ? `${options.bean.roaster} · ${options.bean.countryOfOrigin}` : "Fresh Roast · Standby";
  ctx.fillText(roasterStr, 56, 182);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "13px ui-monospace, monospace";
  const varietals = options.bean
    ? (Array.isArray(options.bean.varietal)
        ? options.bean.varietal.join(", ")
        : options.bean.varietal || "Heirloom")
    : "Arabica Blend";
  const processStr = options.bean?.process || "Washed";
  ctx.fillText(`${processStr} · ${varietals}`, 56, 210);

  // 4. Metrics Cards Grid (Right of Coffee Box)
  const metrics = [
    { label: "TIME", val: `${options.extractionTime.toFixed(1)}s`, color: "#ffffff" },
    {
      label: "YIELD",
      val: `${options.finalYield.toFixed(1)}g`,
      sub: `1:${(options.finalYield / (options.dose || 18)).toFixed(1)}`,
      color: "#fbbf24",
    },
    { label: "PEAK PRESSURE", val: `${options.peakPressure.toFixed(1)} bar`, color: "#10b981" },
    { label: "AVG FLOW", val: `${options.avgFlow.toFixed(1)} ml/s`, color: "#38bdf8" },
    {
      label: "EXTR. YIELD (EY%)",
      val: `${options.eyPercentage}%`,
      sub: `TDS: ${options.tds.toFixed(1)}%`,
      color: "#06b6d4",
    },
    { label: "RATING", val: `★ ${options.rating.toFixed(1)} / 10`, color: "#f43f5e" },
  ];

  const mStartX = 480;
  const mStartY = 96;
  const mCardW = 215;
  const mCardH = 68;
  const mGapX = 16;
  const mGapY = 14;

  metrics.forEach((m, idx) => {
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const x = mStartX + col * (mCardW + mGapX);
    const y = mStartY + row * (mCardH + mGapY);

    ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
    ctx.fillRect(x, y, mCardW, mCardH);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.strokeRect(x, y, mCardW, mCardH);

    ctx.fillStyle = "#64748b";
    ctx.font = "bold 10px ui-monospace, monospace";
    ctx.fillText(m.label, x + 14, y + 20);

    ctx.fillStyle = m.color;
    ctx.font = "bold 20px ui-monospace, monospace";
    ctx.fillText(m.val, x + 14, y + 46);

    if (m.sub) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "11px ui-monospace, monospace";
      ctx.fillText(m.sub, x + 120, y + 46);
    }
  });

  // 5. Telemetry Curves Graph Section
  const graphX = 40;
  const graphY = 270;
  const graphW = width - 80;
  const graphH = 310;

  ctx.fillStyle = "rgba(10, 12, 16, 0.75)";
  ctx.fillRect(graphX, graphY, graphW, graphH);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.strokeRect(graphX, graphY, graphW, graphH);

  // Grid lines
  ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 6; i++) {
    const gy = graphY + (graphH / 6) * i;
    ctx.beginPath();
    ctx.moveTo(graphX, gy);
    ctx.lineTo(graphX + graphW, gy);
    ctx.stroke();

    // Bar scale label
    const barLabel = (9 - (i * 9) / 6).toFixed(1);
    ctx.fillStyle = "#475569";
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText(`${barLabel}b`, graphX + 8, gy - 4);
  }

  // Draw telemetry curves
  if (options.history.length >= 2) {
    const maxT = Math.max(30, options.extractionTime + 1);
    const maxW = Math.max(45, options.finalYield * 1.15);

    const getX = (t: number) => graphX + (t / maxT) * graphW;
    const getYPressure = (p: number) => graphY + graphH - (p / 9) * graphH; // 0-9 bar
    const getYFlow = (f: number) => graphY + graphH - (f / 8) * graphH;     // 0-8 ml/s
    const getYWeight = (w: number) => graphY + graphH - (w / maxW) * graphH;

    // Weight Curve (Purple)
    ctx.strokeStyle = "#a855f7";
    ctx.lineWidth = 2;
    ctx.beginPath();
    options.history.forEach((pt, i) => {
      const x = getX(pt.timeSeconds);
      const y = getYWeight(pt.weight);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Weight Flow Curve (Dark Espresso Brown)
    ctx.strokeStyle = "#78350f";
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    options.history.forEach((pt, i) => {
      const x = getX(pt.timeSeconds);
      const y = getYFlow(pt.weightFlow);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Water Flow Curve (Sky blue)
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    options.history.forEach((pt, i) => {
      const x = getX(pt.timeSeconds);
      const y = getYFlow(pt.flow);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Pressure Curve (Green)
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    options.history.forEach((pt, i) => {
      const x = getX(pt.timeSeconds);
      const y = getYPressure(pt.pressure);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  // 6. Legend Bar
  const legY = graphY + 22;
  const legends = [
    { label: "Pressure (bar, max 9)", color: "#10b981" },
    { label: "Water Flow (ml/s)", color: "#38bdf8" },
    { label: "Weight Flow (g/s)", color: "#78350f" },
    { label: "Detected Weight (g)", color: "#a855f7" },
  ];
  let curLegX = graphX + 80;
  legends.forEach((leg) => {
    ctx.fillStyle = leg.color;
    ctx.fillRect(curLegX, legY - 8, 14, 4);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText(leg.label, curLegX + 20, legY);
    curLegX += ctx.measureText(leg.label).width + 50;
  });

  // 7. Footer: Sensory chips & Export notice
  ctx.fillStyle = "#64748b";
  ctx.font = "12px ui-monospace, monospace";
  ctx.fillText("Sensory Notes:", 44, 620);

  let tagX = 145;
  options.tags.forEach((tag) => {
    ctx.fillStyle = "rgba(245, 158, 11, 0.15)";
    const tw = ctx.measureText(tag).width + 16;
    ctx.fillRect(tagX, 606, tw, 20);
    ctx.strokeStyle = "rgba(245, 158, 11, 0.4)";
    ctx.strokeRect(tagX, 606, tw, 20);
    ctx.fillStyle = "#fbbf24";
    ctx.fillText(tag, tagX + 8, 620);
    tagX += tw + 8;
  });

  ctx.fillStyle = "#64748b";
  ctx.textAlign = "right";
  ctx.fillText("PantaRhei · Decaid Skin · Instant Mobile Download", width - 44, 620);

  const dataUrl = canvas.toDataURL("image/png");
  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b || new Blob()), "image/png");
  });

  // Post image to backend server so it's live on /latest_shot.png
  try {
    await fetch("/api/shot/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: dataUrl }),
    });
  } catch (e) {
    console.warn("Could not save shot card to server endpoint:", e);
  }

  return { dataUrl, blob };
}
