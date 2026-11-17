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
 * Initial empty shot history (ensures no mock/demo shots are created)
 */
export const INITIAL_SEEDED_SHOTS: ShotRecord[] = [];

/**
 * Loads shot records from local storage, filtering out legacy demo shots
 */
export function loadShotHistoryFromStorage(): ShotRecord[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = localStorage.getItem(SHOT_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (s: ShotRecord) =>
          !s.id.startsWith("shot-20261116-") &&
          !s.id.startsWith("shot-20261115-") &&
          s.beanName !== "Worka Sakaro"
      );
    }
    return [];
  } catch (err) {
    console.warn("[PantaRhei] Failed to load shot history from storage:", err);
    return [];
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
  bean?: PantaBean;
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
    beanId: params.bean?.id || "bean_unspecified",
    beanName: params.bean?.name || "Espresso",
    roaster: params.bean?.roaster || "Unknown Roaster",
    countryOfOrigin: params.bean?.countryOfOrigin || "Various",
    process: params.bean?.process || "Washed",
    roastDate: params.bean?.roastDate || new Date().toISOString().split("T")[0],
    profileTitle: params.profileTitle,
    profileId: params.profileId,
    targetDose: dose,
    targetYield: params.targetYield,
    grindSetting: params.grindSetting || params.bean?.targetGrind || "4.0",
    basket: params.basket || params.bean?.preferredBasket || "CB",
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
