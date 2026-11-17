/**
 * PantaRhei Shot History & Extraction Analytics Data Contracts
 *
 * Defines the schema for persistent shot history archives, multi-parameter
 * filtering, search indexing, and comparative shot curve inspection.
 */

import type { TelemetryPoint } from "../services/telemetrySimulator.ts";
import type { PantaBean } from "./bean.ts";
import { formatEquipmentSummary, type ActiveEquipmentSelection } from "./equipment.ts";

export interface ShotRecord {
  id: string;                         // UUID or timestamp slug (e.g. "shot-20261116-142201")
  timestamp: number;                  // Milliseconds timestamp
  dateFormatted: string;              // Human readable date string (e.g. "Nov 16, 2026 · 14:22")
  
  // Coffee & Terroir Snapshot
  beanId: string;
  beanName: string;
  roaster: string;
  countryOfOrigin?: string;
  process?: string;
  roastDate?: string;
  
  // Recipe & Machine Setpoints
  profileTitle: string;
  profileId?: string;
  targetDose: number;                 // g
  targetYield: number;                // g
  grindSetting: string;               // e.g. "4.2"
  basket?: string;                    // e.g. "CB", "NB", "IMS 18g"
  waterTemperature: number;           // °C

  // Equipment & Puck Preparation Metadata
  equipment?: ActiveEquipmentSelection;
  
  // Actual Measured Extraction Telemetry
  actualDose: number;                 // g (input dose)
  actualYield: number;                // g (final scale weight)
  ratio: number;                      // actualYield / actualDose (e.g. 2.05)
  durationSeconds: number;            // Extraction time in seconds
  peakPressure: number;               // Maximum bar reached
  avgPressure: number;                // Mean extraction pressure in bar
  avgFlow: number;                    // Mean water flow in ml/s
  avgWeightFlow?: number;             // Mean gravimetric flow in g/s
  tds?: number;                       // Total Dissolved Solids %
  ey?: number;                        // Extraction Yield %
  
  // Puck Integrity & Quality
  channelDetected: boolean;           // Suspected channeling flag
  channelCount: number;               // Number of detected channeling fissures
  
  // Sensory & Rating
  rating: number;                     // 0.0 to 10.0 scale (or 1 to 5 stars)
  tags: string[];                     // e.g. ["Sweet", "Balanced", "High Clarity", "Floral"]
  baristaNotes?: string;              // Tasting notes and puck prep feedback
  
  // Full Stream (Used for canvas rendering and overlay comparisons)
  telemetry: TelemetryPoint[];
}

export interface ShotFilterOptions {
  beanName?: string;
  roaster?: string;
  profileTitle?: string;
  minRating?: number;
  channelFilter?: "all" | "channeled" | "clean";
  dateRange?: "all" | "today" | "week" | "month";
  sortBy?: "newest" | "oldest" | "rating" | "time" | "yield";
}

export const SHOT_HISTORY_STORAGE_KEY = "pantarhei_shot_history";

/**
 * Pre-seeded realistic shot history ensuring rich immediate display
 */
export const INITIAL_SEEDED_SHOTS: ShotRecord[] = [
  {
    id: "shot-20261116-142200",
    timestamp: Date.now() - 1000 * 60 * 35, // 35 minutes ago
    dateFormatted: "Today · 14:22",
    beanId: "bean-ethiopia",
    beanName: "Worka Sakaro",
    roaster: "Sey Coffee",
    countryOfOrigin: "Ethiopia",
    process: "Washed",
    roastDate: "2026-11-01",
    profileTitle: "Sey What (Big Flat)",
    profileId: "sey-flow",
    targetDose: 18.0,
    targetYield: 36.0,
    grindSetting: "4.2",
    basket: "CB",
    waterTemperature: 93.0,
    actualDose: 18.0,
    actualYield: 36.4,
    ratio: 2.02,
    durationSeconds: 27.2,
    peakPressure: 8.9,
    avgPressure: 6.8,
    avgFlow: 1.85,
    avgWeightFlow: 1.62,
    tds: 9.6,
    ey: 19.41,
    channelDetected: false,
    channelCount: 0,
    rating: 9.2,
    tags: ["Bergamot", "Jasmine", "High Clarity", "Sweet"],
    baristaNotes: "Ultra-clean cup, bright peach finish. Grind 4.2 was spot on with the conical basket.",
    telemetry: Array.from({ length: 28 }, (_, i) => ({
      timestamp: Date.now() - 1000 * 60 * 35 + i * 1000,
      timeSeconds: i,
      pressure: i < 5 ? 2.5 : i < 18 ? 8.8 : Math.max(4.0, 8.8 - (i - 18) * 0.45),
      targetPressure: 9.0,
      flow: i < 5 ? 4.0 : 1.8,
      targetFlow: 2.0,
      weightFlow: i < 5 ? 0 : 1.6,
      weight: i < 5 ? 0 : Math.min(36.4, (i - 5) * 1.65),
      groupTemperature: 93.0,
      targetGroupTemp: 93.0,
      steamTemperature: 150.0,
      puckResistance: i < 5 ? 0.6 : 3.8,
      phase: i < 5 ? "preinfusion" : "extraction",
      channelDetected: false,
    })),
  },
  {
    id: "shot-20261116-101500",
    timestamp: Date.now() - 1000 * 60 * 60 * 4, // 4 hours ago
    dateFormatted: "Today · 10:15",
    beanId: "bean-kenya",
    beanName: "Gichathaini AB",
    roaster: "April Coffee",
    countryOfOrigin: "Kenya",
    process: "Washed",
    roastDate: "2026-10-25",
    profileTitle: "Strega Spring Lever",
    profileId: "strega-plus",
    targetDose: 18.5,
    targetYield: 45.0,
    grindSetting: "3.8",
    basket: "NB",
    waterTemperature: 92.5,
    actualDose: 18.5,
    actualYield: 44.8,
    ratio: 2.42,
    durationSeconds: 31.0,
    peakPressure: 9.4,
    avgPressure: 6.2,
    avgFlow: 1.72,
    avgWeightFlow: 1.55,
    tds: 9.1,
    ey: 22.03,
    channelDetected: false,
    channelCount: 0,
    rating: 8.8,
    tags: ["Blackcurrant", "Rhubarb", "Juicy", "Balanced"],
    baristaNotes: "Juicy blackcurrant acidity, spring lever pressure decay gave great mouthfeel.",
    telemetry: Array.from({ length: 31 }, (_, i) => ({
      timestamp: Date.now() - 1000 * 60 * 60 * 4 + i * 1000,
      timeSeconds: i,
      pressure: i < 6 ? 3.0 : Math.max(3.5, 9.4 - (i - 6) * 0.24),
      targetPressure: 9.0,
      flow: i < 6 ? 3.5 : 1.7,
      targetFlow: 2.0,
      weightFlow: i < 6 ? 0 : 1.55,
      weight: i < 6 ? 0 : Math.min(44.8, (i - 6) * 1.79),
      groupTemperature: 92.5,
      targetGroupTemp: 92.5,
      steamTemperature: 150.0,
      puckResistance: i < 6 ? 0.8 : 3.6,
      phase: i < 6 ? "preinfusion" : "extraction",
      channelDetected: false,
    })),
  },
  {
    id: "shot-20261115-164000",
    timestamp: Date.now() - 1000 * 60 * 60 * 24, // Yesterday
    dateFormatted: "Nov 15 · 16:40",
    beanId: "bean-ethiopia",
    beanName: "Worka Sakaro",
    roaster: "Sey Coffee",
    countryOfOrigin: "Ethiopia",
    process: "Washed",
    roastDate: "2026-11-01",
    profileTitle: "Sey What (Big Flat)",
    profileId: "sey-flow",
    targetDose: 18.0,
    targetYield: 36.0,
    grindSetting: "4.5", // Too coarse, caused early channel
    basket: "CB",
    waterTemperature: 93.0,
    actualDose: 18.0,
    actualYield: 37.1,
    ratio: 2.06,
    durationSeconds: 21.5,
    peakPressure: 7.4,
    avgPressure: 5.1,
    avgFlow: 2.65,
    avgWeightFlow: 2.15,
    tds: 8.7,
    ey: 17.93,
    channelDetected: true,
    channelCount: 1,
    rating: 6.5,
    tags: ["High Acidity", "Fast Flow", "Channeling"],
    baristaNotes: "Puck channeled at 13s due to slightly coarse 4.5 grind setting. Dialed finer to 4.2.",
    telemetry: Array.from({ length: 22 }, (_, i) => ({
      timestamp: Date.now() - 1000 * 60 * 60 * 24 + i * 1000,
      timeSeconds: i,
      pressure: i < 5 ? 2.5 : i === 13 ? 5.2 : Math.max(3.8, 7.4 - (i - 5) * 0.2),
      targetPressure: 9.0,
      flow: i < 5 ? 4.0 : i === 13 ? 3.4 : 2.5,
      targetFlow: 2.0,
      weightFlow: i < 5 ? 0 : 2.1,
      weight: i < 5 ? 0 : Math.min(37.1, (i - 5) * 2.2),
      groupTemperature: 93.0,
      targetGroupTemp: 93.0,
      steamTemperature: 150.0,
      puckResistance: i < 5 ? 0.6 : i === 13 ? 1.8 : 2.6,
      phase: i < 5 ? "preinfusion" : "extraction",
      channelDetected: i >= 13 && i <= 15,
    })),
  },
  {
    id: "shot-20261114-112000",
    timestamp: Date.now() - 1000 * 60 * 60 * 48, // 2 days ago
    dateFormatted: "Nov 14 · 11:20",
    beanId: "bean-colombia",
    beanName: "El Paraiso Lychee",
    roaster: "Manhattan Coffee",
    countryOfOrigin: "Colombia",
    process: "Thermal Shock",
    roastDate: "2026-10-28",
    profileTitle: "Blooming Allongé",
    profileId: "blooming-allonge",
    targetDose: 16.0,
    targetYield: 64.0,
    grindSetting: "5.0",
    basket: "CB",
    waterTemperature: 91.0,
    actualDose: 16.0,
    actualYield: 64.5,
    ratio: 4.03,
    durationSeconds: 34.0,
    peakPressure: 6.2,
    avgPressure: 4.1,
    avgFlow: 2.4,
    avgWeightFlow: 2.2,
    tds: 6.8,
    ey: 27.41,
    channelDetected: false,
    channelCount: 0,
    rating: 9.5,
    tags: ["Lychee", "Rose Water", "Floral", "Sweet"],
    baristaNotes: "Incredible anaerobic aromatics. The 30s bloom created maximum sweetness.",
    telemetry: Array.from({ length: 34 }, (_, i) => ({
      timestamp: Date.now() - 1000 * 60 * 60 * 48 + i * 1000,
      timeSeconds: i,
      pressure: i < 6 ? 3.0 : i < 15 ? 0.8 : 6.0,
      targetPressure: 6.0,
      flow: i < 6 ? 4.0 : i < 15 ? 0.0 : 2.5,
      targetFlow: 2.5,
      weightFlow: i < 15 ? 0 : 2.2,
      weight: i < 15 ? 0 : Math.min(64.5, (i - 15) * 3.39),
      groupTemperature: 91.0,
      targetGroupTemp: 91.0,
      steamTemperature: 150.0,
      puckResistance: 2.2,
      phase: i < 6 ? "preinfusion" : i < 15 ? "soak" : "extraction",
      channelDetected: false,
    })),
  },
];

/**
 * Loads shot records from local storage with pre-seeded fallback
 */
export function loadShotHistoryFromStorage(): ShotRecord[] {
  try {
    if (typeof window === "undefined") return INITIAL_SEEDED_SHOTS;
    const raw = localStorage.getItem(SHOT_HISTORY_STORAGE_KEY);
    if (!raw) {
      saveShotHistoryToStorage(INITIAL_SEEDED_SHOTS);
      return INITIAL_SEEDED_SHOTS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_SEEDED_SHOTS;
  } catch (err) {
    console.warn("[PantaRhei] Failed to load shot history from storage:", err);
    return INITIAL_SEEDED_SHOTS;
  }
}

/**
 * Saves shot history to local storage
 */
export function saveShotHistoryToStorage(shots: ShotRecord[]): void {
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(SHOT_HISTORY_STORAGE_KEY, JSON.stringify(shots));
    }
  } catch (err) {
    console.error("[PantaRhei] Failed to save shot history to storage:", err);
  }
}

/**
 * Filter and search shot history with multi-token intersection and field filters
 */
export function searchShotHistory(
  shots: ShotRecord[],
  query: string,
  filters: ShotFilterOptions = {}
): ShotRecord[] {
  let result = [...shots];

  // 1. Free-Text Multi-Token Search
  if (query.trim()) {
    const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    result = result.filter((shot) => {
      const searchTarget = [
        shot.beanName,
        shot.roaster,
        shot.countryOfOrigin || "",
        shot.process || "",
        shot.profileTitle,
        shot.grindSetting,
        shot.basket || "",
        shot.baristaNotes || "",
        ...(shot.tags || []),
      ]
        .join(" ")
        .toLowerCase();

      return tokens.every((token) => searchTarget.includes(token));
    });
  }

  // 2. Field Filters
  if (filters.beanName) {
    result = result.filter(
      (s) => s.beanName.toLowerCase() === filters.beanName!.toLowerCase()
    );
  }

  if (filters.roaster) {
    result = result.filter(
      (s) => s.roaster.toLowerCase() === filters.roaster!.toLowerCase()
    );
  }

  if (filters.profileTitle) {
    result = result.filter(
      (s) => s.profileTitle.toLowerCase() === filters.profileTitle!.toLowerCase()
    );
  }

  if (filters.minRating && filters.minRating > 0) {
    result = result.filter((s) => s.rating >= filters.minRating!);
  }

  if (filters.channelFilter === "channeled") {
    result = result.filter((s) => s.channelDetected || s.channelCount > 0);
  } else if (filters.channelFilter === "clean") {
    result = result.filter((s) => !s.channelDetected && s.channelCount === 0);
  }

  // 3. Date Range Filter
  if (filters.dateRange && filters.dateRange !== "all") {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    if (filters.dateRange === "today") {
      result = result.filter((s) => now - s.timestamp <= dayMs);
    } else if (filters.dateRange === "week") {
      result = result.filter((s) => now - s.timestamp <= 7 * dayMs);
    } else if (filters.dateRange === "month") {
      result = result.filter((s) => now - s.timestamp <= 30 * dayMs);
    }
  }

  // 4. Sorting
  const sortBy = filters.sortBy || "newest";
  result.sort((a, b) => {
    switch (sortBy) {
      case "newest":
        return b.timestamp - a.timestamp;
      case "oldest":
        return a.timestamp - b.timestamp;
      case "rating":
        return b.rating - a.rating;
      case "time":
        return b.durationSeconds - a.durationSeconds;
      case "yield":
        return b.actualYield - a.actualYield;
      default:
        return b.timestamp - a.timestamp;
    }
  });

  return result;
}

/**
 * Creates a brand new ShotRecord from finished live extraction telemetry
 */
export function createShotRecord(params: {
  telemetry: TelemetryPoint[];
  bean: PantaBean;
  profileTitle: string;
  profileId?: string;
  targetDose: number;
  targetYield: number;
  grindSetting?: string;
  basket?: string;
  rating?: number;
  tags?: string[];
  notes?: string;
  tds?: number;
  equipment?: ActiveEquipmentSelection;
}): ShotRecord {
  const now = Date.now();
  const dateObj = new Date(now);
  const dateFormatted = `${dateObj.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} · ${dateObj.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })}`;

  const pts = params.telemetry;
  const finalPt = pts.length > 0 ? pts[pts.length - 1] : null;
  const actualYield = finalPt ? Math.round(finalPt.weight * 10) / 10 : params.targetYield;
  const durationSeconds = finalPt ? Math.round(finalPt.timeSeconds * 10) / 10 : 0;
  const dose = params.targetDose || 18.0;
  const ratio = dose > 0 ? Math.round((actualYield / dose) * 100) / 100 : 2.0;

  const peakPressure = pts.reduce((max, pt) => Math.max(max, pt.pressure), 0);
  const avgPressure =
    pts.length > 0
      ? Math.round((pts.reduce((sum, pt) => sum + pt.pressure, 0) / pts.length) * 10) / 10
      : 0;
  const avgFlow =
    pts.length > 0
      ? Math.round((pts.reduce((sum, pt) => sum + pt.flow, 0) / pts.length) * 10) / 10
      : 0;

  const channeledCount = pts.filter((p) => p.channelDetected).length;
  const channelDetected = channeledCount > 0;

  const tds = params.tds ?? 9.4;
  const ey = dose > 0 ? Math.round(((actualYield * tds) / dose) * 100) / 100 : 0;

  return {
    id: `shot-${now}`,
    timestamp: now,
    dateFormatted,
    beanId: params.bean.id,
    beanName: params.bean.name,
    roaster: params.bean.roaster,
    countryOfOrigin: params.bean.countryOfOrigin,
    process: params.bean.process,
    roastDate: params.bean.roastDate,
    profileTitle: params.profileTitle,
    profileId: params.profileId,
    targetDose: dose,
    targetYield: params.targetYield,
    grindSetting: params.grindSetting || params.bean.targetGrind || "4.0",
    basket: params.basket || params.bean.preferredBasket || "CB",
    waterTemperature: finalPt?.groupTemperature || 93.0,
    equipment: params.equipment,
    actualDose: dose,
    actualYield,
    ratio,
    durationSeconds,
    peakPressure: Math.round(peakPressure * 10) / 10,
    avgPressure,
    avgFlow,
    tds,
    ey,
    channelDetected,
    channelCount: channeledCount,
    rating: params.rating ?? 8.5,
    tags: params.tags || ["Sweet", "Balanced"],
    baristaNotes: params.notes || "",
    telemetry: [...pts],
  };
}

/**
 * Serializes a ShotRecord into the official Decent de1app legacy TCL format (.shot file)
 * for seamless interoperability with the original de1app and other Decaid skins.
 */
export function serializeShotToTcl(shot: ShotRecord): string {
  const escapeTcl = (val: string | number | undefined): string => {
    if (val === undefined || val === null) return "{}";
    const str = String(val);
    if (str.includes(" ") || str.includes("{") || str.includes("}") || str === "") {
      return `{${str.replace(/[{}]/g, "")}}`;
    }
    return str;
  };

  const pts = shot.telemetry || [];
  const elapsed = pts.map((p) => p.timeSeconds.toFixed(1)).join(" ");
  const pressure = pts.map((p) => p.pressure.toFixed(1)).join(" ");
  const flow = pts.map((p) => p.flow.toFixed(1)).join(" ");
  const flowWeight = pts.map((p) => (p.weightFlow || 0).toFixed(1)).join(" ");
  const weight = pts.map((p) => p.weight.toFixed(1)).join(" ");
  const temp = pts.map((p) => p.groupTemperature.toFixed(1)).join(" ");

  const clockSeconds = Math.round(shot.timestamp / 1000);

  const lines = [
    `clock ${clockSeconds}`,
    `profile_title ${escapeTcl(shot.profileTitle || "Espresso")}`,
    `bean_brand ${escapeTcl(shot.roaster || "Unknown")}`,
    `bean_type ${escapeTcl(shot.beanName || "Espresso")}`,
    `grinder_dose_weight ${shot.actualDose || shot.targetDose || 18.0}`,
    `grinder_setting ${escapeTcl(shot.grindSetting || "4.0")}`,
    `grinder_model ${escapeTcl(shot.equipment?.grinder || "")}`,
    `burrs ${escapeTcl(shot.equipment?.burrs || "")}`,
    `basket ${escapeTcl(shot.basket || shot.equipment?.basket || "CB")}`,
    `scale_model ${escapeTcl(shot.equipment?.scale || "")}`,
    `equipment_tampers ${escapeTcl(shot.equipment?.tampers ? shot.equipment.tampers.join(", ") : "")}`,
    `equipment_distributors ${escapeTcl(shot.equipment?.distributors ? shot.equipment.distributors.join(", ") : "")}`,
    `equipment_wdt ${escapeTcl(shot.equipment?.wdt ? shot.equipment.wdt.join(", ") : "")}`,
    `equipment_rdt ${escapeTcl(shot.equipment?.rdt ? shot.equipment.rdt.join(", ") : "")}`,
    `espresso_puck_prep ${escapeTcl(shot.equipment ? formatEquipmentSummary(shot.equipment) : "")}`,
    `espresso_notes ${escapeTcl(shot.baristaNotes || "")}`,
    `espresso_elapsed {${elapsed}}`,
    `espresso_pressure {${pressure}}`,
    `espresso_flow {${flow}}`,
    `espresso_flow_weight {${flowWeight}}`,
    `espresso_weight {${weight}}`,
    `espresso_temperature_basket {${temp}}`,
    `espresso_rating ${shot.rating || 0}`,
    `espresso_enjoyment ${shot.rating ? Math.round(shot.rating * 10) : 0}`,
    `drink_tds ${shot.tds || 0}`,
    `drink_ey ${shot.ey || 0}`,
  ];

  return lines.join("\n") + "\n";
}

/**
 * Serializes a ShotRecord into standard Decaid REST JSON format
 */
export function serializeShotToDecaidJson(shot: ShotRecord): Record<string, any> {
  return {
    id: shot.id,
    timestamp: shot.timestamp,
    dateFormatted: shot.dateFormatted,
    beanId: shot.beanId,
    beanName: shot.beanName,
    roaster: shot.roaster,
    countryOfOrigin: shot.countryOfOrigin,
    process: shot.process,
    roastDate: shot.roastDate,
    profileTitle: shot.profileTitle,
    profileId: shot.profileId,
    targetDose: shot.targetDose,
    targetYield: shot.targetYield,
    grindSetting: shot.grindSetting,
    basket: shot.basket,
    waterTemperature: shot.waterTemperature,
    equipment: shot.equipment,
    puckPrepSummary: shot.equipment ? formatEquipmentSummary(shot.equipment) : undefined,
    actualDose: shot.actualDose,
    actualYield: shot.actualYield,
    ratio: shot.ratio,
    durationSeconds: shot.durationSeconds,
    peakPressure: shot.peakPressure,
    avgPressure: shot.avgPressure,
    avgFlow: shot.avgFlow,
    tds: shot.tds,
    ey: shot.ey,
    channelDetected: shot.channelDetected,
    channelCount: shot.channelCount,
    rating: shot.rating,
    tags: shot.tags,
    baristaNotes: shot.baristaNotes,
    telemetry: shot.telemetry,
  };
}
