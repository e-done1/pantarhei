/**
 * PantaRhei Legacy Migration & Folder Sync Service
 *
 * Imports past shot history and extraction profiles from:
 * 1. Decaid Gateway REST API (/api/v1/profiles, /api/v1/shots)
 * 2. Original de1app folders ('history/' containing .shot files, 'profiles/' & 'profiles2/' containing .tcl files)
 * 3. Exported Decaid v2 JSON profiles and shot archives
 *
 * Strict Deduplication Guarantee:
 * Profiles from 'profiles2/' take priority over 'profiles/' to prevent duplicate
 * profile tiles in the Profile Drawer (PL presentation).
 */

import type { ProfileItem, ProfileStep } from "../types/profile.ts";
import type { ShotRecord } from "../types/shot.ts";
import type { ActiveEquipmentSelection } from "../types/equipment.ts";
import type { TelemetryPoint } from "./telemetrySimulator.ts";
import { normalizeShotKey } from "../types/backup.ts";

export interface ProfileDeduplicationResult {
  uniqueProfiles: ProfileItem[];
  duplicateCount: number;
  profiles2OverridesCount: number;
  skippedExistingCount: number;
}

export interface ShotDeduplicationResult {
  uniqueShots: ShotRecord[];
  duplicateCount: number;
  skippedExistingCount: number;
}

export interface MigrationBatchResult {
  importedProfiles: ProfileItem[];
  importedShots: ShotRecord[];
  profileStats: {
    totalParsed: number;
    uniqueAdded: number;
    duplicateCount: number;
    profiles2OverridesCount: number;
  };
  shotStats: {
    totalParsed: number;
    uniqueAdded: number;
    duplicateCount: number;
  };
}

// -------------------------------------------------------------
// Title & Key Normalization
// -------------------------------------------------------------

export function normalizeProfileTitle(title: string): string {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Extracts balanced brace { ... } block for a given keyword
 */
export function extractBracedBlock(text: string, keyword: string): string | null {
  const idx = text.indexOf(keyword);
  if (idx === -1) return null;
  const startBrace = text.indexOf("{", idx + keyword.length);
  if (startBrace === -1) return null;

  let depth = 1;
  let i = startBrace + 1;
  while (i < text.length && depth > 0) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") depth--;
    i++;
  }
  if (depth === 0) {
    return text.substring(startBrace + 1, i - 1);
  }
  return null;
}

/**
 * Extracts top-level braced { ... } items from a block
 */
export function extractTopLevelBracedItems(block: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < block.length; i++) {
    if (block[i] === "{") {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (block[i] === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        items.push(block.substring(start, i));
        start = -1;
      }
    }
  }
  return items;
}

// -------------------------------------------------------------
// TCL / JSON Profile Parser
// -------------------------------------------------------------

/**
 * Parses a profile from a .tcl or .json string
 */
export function parseTclProfile(
  content: string,
  filename?: string,
  sourceFolder?: "profiles" | "profiles2" | string
): ProfileItem | null {
  if (!content || !content.trim()) return null;
  const trimmed = content.trim();

  // 1. Try parsing as Decaid v2 JSON profile first
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && (parsed.title || parsed.profile_title || parsed.steps)) {
        const title = parsed.title || parsed.profile_title || filename?.replace(/\.(json|tcl)$/i, "") || "Imported Profile";
        return {
          id: parsed.id || `profile-${normalizeProfileTitle(title)}-${Date.now()}`,
          title: String(title).trim(),
          author: String(parsed.author || "Imported").trim(),
          category: parsed.category || "custom",
          beverage_type: parsed.beverage_type || "espresso",
          notes: parsed.notes || parsed.profile_notes || "",
          target_temperature: parsed.tank_temperature || parsed.target_temperature || 93.0,
          target_weight: parsed.target_weight || parsed.final_desired_shot_weight || 36.0,
          target_volume: parsed.target_volume || parsed.final_desired_shot_volume || 0,
          steps: Array.isArray(parsed.steps) ? parsed.steps : [],
          isCustom: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }
    } catch {}
  }

  // 2. Parse as Legacy de1app TCL format
  try {
    const extractField = (key: string): string => {
      // Matches: key {value} OR key "value" OR key value
      const regex = new RegExp(`(?:^|\\n)\\s*${key}\\s+(?:\\{([\\s\\S]*?)\\}|"([^"]*)"|(\\S+))`, "m");
      const match = trimmed.match(regex);
      if (!match) return "";
      return (match[1] ?? match[2] ?? match[3] ?? "").trim();
    };

    const titleField = extractField("profile_title") || extractField("title");
    const fallbackTitle = filename ? filename.replace(/\.(tcl|json)$/i, "").replace(/_/g, " ") : "Imported Profile";
    const title = titleField || fallbackTitle;

    const author = extractField("author") || "Decent Barista";
    const notes = extractField("profile_notes") || extractField("notes") || "";
    const beverageType = extractField("beverage_type") || "espresso";
    const targetTempStr = extractField("espresso_temperature") || extractField("tank_temperature");
    const targetWeightStr = extractField("final_desired_shot_weight") || extractField("target_weight");
    const targetVolumeStr = extractField("final_desired_shot_volume") || extractField("target_volume");

    // Extract steps from advanced_shot using balanced brace parser
    const steps: ProfileStep[] = [];
    const advBlock = extractBracedBlock(trimmed, "advanced_shot");

    if (advBlock) {
      const stepBlocks = extractTopLevelBracedItems(advBlock);

      for (const stepStr of stepBlocks) {
        const stepField = (k: string, def = "0"): string => {
          const r = new RegExp(`(?:^|\\s)${k}\\s+(?:\\{([\\s\\S]*?)\\}|"([^"]*)"|(\\S+))`);
          const m = stepStr.match(r);
          if (!m) return def;
          return (m[1] ?? m[2] ?? m[3] ?? def).trim();
        };

        const stepName = stepField("name", "Extraction Step").replace(/[{}]/g, "");
        const pump = stepField("pump", "pressure") === "flow" ? "flow" : "pressure";
        const transition = stepField("transition", "smooth") === "fast" ? "fast" : "smooth";
        const sensor = stepField("sensor", "coffee") === "water" ? "water" : "coffee";
        const pressure = stepField("pressure", "0");
        const flow = stepField("flow", "0");
        const temperature = stepField("temperature", targetTempStr || "93.0");
        const seconds = stepField("seconds", "10");
        const volume = stepField("volume", "0");
        const weight = stepField("weight", "0");

        steps.push({
          name: stepName,
          pump,
          transition,
          sensor,
          pressure,
          flow,
          temperature,
          seconds,
          volume,
          weight,
        });
      }
    }

    const id = `tcl-${normalizeProfileTitle(title)}-${sourceFolder ? sourceFolder + "-" : ""}${Date.now()}`;

    return {
      id,
      title: title.trim(),
      author: author.trim(),
      category: beverageType === "filter" ? "filter" : "custom",
      beverage_type: beverageType,
      notes: notes.trim(),
      target_temperature: targetTempStr ? parseFloat(targetTempStr) : 93.0,
      target_weight: targetWeightStr ? parseFloat(targetWeightStr) : 36.0,
      target_volume: targetVolumeStr ? parseFloat(targetVolumeStr) : 0,
      steps: steps.length > 0 ? steps : undefined,
      isCustom: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn(`[PantaRhei] Error parsing TCL profile (${filename}):`, err);
    return null;
  }
}

// -------------------------------------------------------------
// TCL / JSON Shot History Parser
// -------------------------------------------------------------

/**
 * Parses a shot history record from a .shot (TCL) or .json file
 */
export function parseShotFile(content: string, filename?: string): ShotRecord | null {
  if (!content || !content.trim()) return null;
  const trimmed = content.trim();

  // 1. Try parsing as Decaid JSON Shot first
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && (parsed.id || parsed.timestamp || parsed.telemetry)) {
        return {
          id: parsed.id || `shot-${parsed.timestamp || Date.now()}`,
          timestamp: parsed.timestamp || Date.now(),
          dateFormatted: parsed.dateFormatted || new Date(parsed.timestamp || Date.now()).toLocaleDateString(),
          beanId: parsed.beanId || "bean-imported",
          beanName: parsed.beanName || "Imported Coffee",
          roaster: parsed.roaster || "Unknown Roaster",
          countryOfOrigin: parsed.countryOfOrigin,
          process: parsed.process,
          roastDate: parsed.roastDate,
          profileTitle: parsed.profileTitle || "Imported Profile",
          profileId: parsed.profileId,
          targetDose: parsed.targetDose || parsed.actualDose || 18.0,
          targetYield: parsed.targetYield || parsed.actualYield || 36.0,
          grindSetting: String(parsed.grindSetting || "4.0"),
          basket: parsed.basket || "CB",
          waterTemperature: parsed.waterTemperature || 93.0,
          equipment: parsed.equipment,
          actualDose: parsed.actualDose || 18.0,
          actualYield: parsed.actualYield || 36.0,
          ratio: parsed.ratio || (parsed.actualYield && parsed.actualDose ? Math.round((parsed.actualYield / parsed.actualDose) * 100) / 100 : 2.0),
          durationSeconds: parsed.durationSeconds || 28.0,
          peakPressure: parsed.peakPressure || 9.0,
          avgPressure: parsed.avgPressure || 6.5,
          avgFlow: parsed.avgFlow || 2.0,
          tds: parsed.tds,
          ey: parsed.ey,
          channelDetected: Boolean(parsed.channelDetected),
          channelCount: parsed.channelCount || 0,
          rating: parsed.rating || 8.0,
          tags: Array.isArray(parsed.tags) ? parsed.tags : ["Imported"],
          baristaNotes: parsed.baristaNotes || "",
          telemetry: Array.isArray(parsed.telemetry) ? parsed.telemetry : [],
        };
      }
    } catch {}
  }

  // 2. Parse as Legacy de1app TCL .shot format
  try {
    const extractField = (key: string): string => {
      const regex = new RegExp(`(?:^|\\n)\\s*${key}\\s+(?:\\{([\\s\\S]*?)\\}|"([^"]*)"|(\\S+))`, "m");
      const match = trimmed.match(regex);
      if (!match) return "";
      return (match[1] ?? match[2] ?? match[3] ?? "").trim();
    };

    const extractArray = (key: string): number[] => {
      const regex = new RegExp(`(?:^|\\n)\\s*${key}\\s*\\{([\\s\\S]*?)\\}`, "m");
      const match = trimmed.match(regex);
      if (!match || !match[1]) return [];
      return match[1]
        .trim()
        .split(/\s+/)
        .map((v) => parseFloat(v))
        .filter((v) => !isNaN(v));
    };

    const clockStr = extractField("clock");
    const timestamp = clockStr ? parseInt(clockStr, 10) * 1000 : Date.now();
    const dateFormatted = new Date(timestamp).toLocaleDateString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const beanName = extractField("bean_type") || extractField("coffee_name") || "Imported Coffee";
    const roaster = extractField("bean_brand") || extractField("roaster") || "Unknown Roaster";
    const profileTitle = extractField("profile_title") || "Decent Shot";
    const grindSetting = extractField("grinder_setting") || "4.0";
    const notes = extractField("espresso_notes") || "";
    const doseStr = extractField("grinder_dose_weight") || extractField("dose");
    const dose = doseStr ? parseFloat(doseStr) : 18.0;

    const grinderModel = extractField("grinder_model");
    const burrs = extractField("burrs");
    const basket = extractField("basket") || extractField("espresso_basket") || "CB";
    const scaleModel = extractField("scale_model");
    const puckPrep = extractField("espresso_puck_prep");
    const tampersStr = extractField("equipment_tampers");
    const distributorsStr = extractField("equipment_distributors");
    const wdtStr = extractField("equipment_wdt");
    const rdtStr = extractField("equipment_rdt");

    // Extract telemetry series
    const elapsed = extractArray("espresso_elapsed");
    const pressures = extractArray("espresso_pressure");
    const flows = extractArray("espresso_flow");
    const weightFlows = extractArray("espresso_flow_weight");
    const weights = extractArray("espresso_weight");
    const temps = extractArray("espresso_temperature_basket");

    const sampleCount = Math.max(elapsed.length, pressures.length, flows.length);
    const telemetry: TelemetryPoint[] = [];

    let peakP = 0;
    let sumP = 0;
    let sumF = 0;
    let maxWeight = 0;
    let maxTime = 0;

    for (let i = 0; i < sampleCount; i++) {
      const t = elapsed[i] !== undefined ? elapsed[i] : i * 0.1;
      const p = pressures[i] || 0;
      const f = flows[i] || 0;
      const wf = weightFlows[i] || 0;
      const w = weights[i] || 0;
      const temp = temps[i] || 93.0;

      if (p > peakP) peakP = p;
      sumP += p;
      sumF += f;
      if (w > maxWeight) maxWeight = w;
      if (t > maxTime) maxTime = t;

      telemetry.push({
        timestamp: timestamp + Math.round(t * 1000),
        timeSeconds: Math.round(t * 10) / 10,
        pressure: Math.round(p * 10) / 10,
        targetPressure: 0,
        flow: Math.round(f * 10) / 10,
        targetFlow: 0,
        weightFlow: Math.round(wf * 10) / 10,
        weight: Math.round(w * 10) / 10,
        groupTemperature: Math.round(temp * 10) / 10,
        targetGroupTemp: 93.0,
        steamTemperature: 150.0,
        puckResistance: f > 0.1 ? Math.round((p / (f * f)) * 100) / 100 : 0,
        phase: t < 6 ? "preinfusion" : "extraction",
        channelDetected: false,
      });
    }

    const durationSeconds = maxTime > 0 ? Math.round(maxTime * 10) / 10 : 28.0;
    const actualYield = maxWeight > 0 ? Math.round(maxWeight * 10) / 10 : 36.0;
    const avgPressure = sampleCount > 0 ? Math.round((sumP / sampleCount) * 10) / 10 : 6.0;
    const avgFlow = sampleCount > 0 ? Math.round((sumF / sampleCount) * 10) / 10 : 2.0;
    const ratio = dose > 0 ? Math.round((actualYield / dose) * 100) / 100 : 2.0;

    const shotId = `shot-legacy-${timestamp}-${Math.floor(Math.random() * 1000)}`;

    const equipment: ActiveEquipmentSelection | undefined =
      grinderModel || burrs || (basket && basket !== "CB") || scaleModel || puckPrep || tampersStr || distributorsStr || wdtStr || rdtStr
        ? {
            grinder: grinderModel || undefined,
            burrs: burrs || undefined,
            basket: basket || undefined,
            scale: scaleModel || undefined,
            tampers: tampersStr ? tampersStr.split(",").map((s) => s.trim()).filter(Boolean) : [],
            distributors: distributorsStr ? distributorsStr.split(",").map((s) => s.trim()).filter(Boolean) : [],
            wdt: wdtStr ? wdtStr.split(",").map((s) => s.trim()).filter(Boolean) : [],
            rdt: rdtStr ? rdtStr.split(",").map((s) => s.trim()).filter(Boolean) : puckPrep ? [puckPrep] : [],
          }
        : undefined;

    return {
      id: shotId,
      timestamp,
      dateFormatted,
      beanId: `bean-${normalizeProfileTitle(beanName)}`,
      beanName,
      roaster,
      profileTitle,
      targetDose: dose,
      targetYield: actualYield,
      grindSetting,
      basket,
      waterTemperature: temps[0] || 93.0,
      equipment,
      actualDose: dose,
      actualYield,
      ratio,
      durationSeconds,
      peakPressure: Math.round(peakP * 10) / 10,
      avgPressure,
      avgFlow,
      channelDetected: false,
      channelCount: 0,
      rating: 8.5,
      tags: ["Imported from de1app"],
      baristaNotes: notes,
      telemetry,
    };
  } catch (err) {
    console.warn(`[PantaRhei] Error parsing TCL shot (${filename}):`, err);
    return null;
  }
}

// -------------------------------------------------------------
// Intelligent Profile Deduplication Engine
// -------------------------------------------------------------

export interface ProfileWithFolder {
  profile: ProfileItem;
  sourceFolder?: "profiles" | "profiles2" | string;
}

/**
 * Deduplicates profiles ensuring:
 * 1. Entries in 'profiles2' OVERRIDE and REPLACE entries in 'profiles' with matching titles.
 * 2. Only ONE unique entry per normalized profile title exists.
 * 3. Does not duplicate profiles already in `existingProfiles` (e.g. curated profiles in PantaRhei).
 */
export function deduplicateProfiles(
  incoming: ProfileWithFolder[],
  existingProfiles: ProfileItem[] = []
): ProfileDeduplicationResult {
  let duplicateCount = 0;
  let profiles2OverridesCount = 0;
  let skippedExistingCount = 0;

  // Build index of existing profiles
  const existingMap = new Map<string, ProfileItem>();
  for (const p of existingProfiles) {
    const key = normalizeProfileTitle(p.title);
    if (key) existingMap.set(key, p);
  }

  // Temporary map to resolve between incoming profiles: key -> ProfileWithFolder
  const selectedMap = new Map<string, ProfileWithFolder>();

  // Process incoming profiles
  for (const item of incoming) {
    const key = normalizeProfileTitle(item.profile.title);
    if (!key) continue;

    const isProfiles2 = (item.sourceFolder || "").toLowerCase().includes("profiles2");
    const existingCandidate = selectedMap.get(key);

    if (!existingCandidate) {
      // First time seeing this profile in this batch
      selectedMap.set(key, item);
    } else {
      // Conflict: same normalized title!
      duplicateCount++;
      const candidateIsProfiles2 = (existingCandidate.sourceFolder || "").toLowerCase().includes("profiles2");

      if (isProfiles2 && !candidateIsProfiles2) {
        // Incoming is from profiles2 and candidate was from profiles -> profiles2 WINS!
        selectedMap.set(key, item);
        profiles2OverridesCount++;
      } else if (!isProfiles2 && candidateIsProfiles2) {
        // Candidate is already from profiles2, keep candidate and discard incoming profiles entry
      } else {
        // Both are from the same folder: keep whichever has steps or is richer
        if ((item.profile.steps?.length || 0) > (existingCandidate.profile.steps?.length || 0)) {
          selectedMap.set(key, item);
        }
      }
    }
  }

  // Now filter against existing profiles in the library (if exact duplicate exists, omit unless custom override)
  const uniqueProfiles: ProfileItem[] = [];

  for (const [key, item] of selectedMap.entries()) {
    const alreadyInLibrary = existingMap.get(key);
    if (alreadyInLibrary) {
      // Already present in current library
      if (item.profile.steps && item.profile.steps.length > 0 && !alreadyInLibrary.isCustom) {
        // Allow user's custom profile to replace stock factory profile
        uniqueProfiles.push({ ...item.profile, isCustom: true });
      } else {
        skippedExistingCount++;
      }
    } else {
      uniqueProfiles.push(item.profile);
    }
  }

  return {
    uniqueProfiles,
    duplicateCount,
    profiles2OverridesCount,
    skippedExistingCount,
  };
}

// -------------------------------------------------------------
// Shot Deduplication Engine
// -------------------------------------------------------------

export function deduplicateShots(
  incoming: ShotRecord[],
  existing: ShotRecord[] = []
): ShotDeduplicationResult {
  let duplicateCount = 0;
  let skippedExistingCount = 0;

  const existingKeys = new Set<string>();
  const existingTimestamps: number[] = [];

  for (const s of existing) {
    existingKeys.add(normalizeShotKey(s));
    if (s.id) existingKeys.add(s.id);
    if (s.timestamp) {
      existingTimestamps.push(s.timestamp);
    }
  }

  const uniqueShots: ShotRecord[] = [];
  const batchKeys = new Set<string>();
  const batchTimestamps: number[] = [];

  const isDuplicateTimestamp = (ts: number, list: number[]) => {
    return list.some((existingTs) => Math.abs(ts - existingTs) <= 2000);
  };

  for (const s of incoming) {
    const key = normalizeShotKey(s);

    if (
      existingKeys.has(key) ||
      (s.id && existingKeys.has(s.id)) ||
      (s.timestamp && isDuplicateTimestamp(s.timestamp, existingTimestamps))
    ) {
      skippedExistingCount++;
      continue;
    }

    if (
      batchKeys.has(key) ||
      (s.id && batchKeys.has(s.id)) ||
      (s.timestamp && isDuplicateTimestamp(s.timestamp, batchTimestamps))
    ) {
      duplicateCount++;
      continue;
    }

    batchKeys.add(key);
    if (s.id) batchKeys.add(s.id);
    if (s.timestamp) batchTimestamps.push(s.timestamp);
    uniqueShots.push(s);
  }

  return {
    uniqueShots,
    duplicateCount,
    skippedExistingCount,
  };
}

// -------------------------------------------------------------
// Decaid Gateway API Sync
// -------------------------------------------------------------

export async function syncFromDecaidGateway(
  baseUrl: string = "http://localhost:8080"
): Promise<{ profiles: ProfileItem[]; shots: ShotRecord[] }> {
  const result: { profiles: ProfileItem[]; shots: ShotRecord[] } = {
    profiles: [],
    shots: [],
  };

  try {
    // 1. Fetch profiles from Decaid
    const profRes = await fetch(`${baseUrl}/api/v1/profiles`, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (profRes.ok) {
      const data = await profRes.json();
      if (Array.isArray(data)) {
        for (const item of data) {
          const parsed = parseTclProfile(JSON.stringify(item));
          if (parsed) result.profiles.push(parsed);
        }
      }
    }
  } catch (err) {
    console.warn("[PantaRhei] Decaid Gateway profiles endpoint unreachable, using local:", err);
  }

  try {
    // 2. Fetch historical shots from Decaid
    const shotRes = await fetch(`${baseUrl}/api/v1/shots`, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (shotRes.ok) {
      const data = await shotRes.json();
      if (Array.isArray(data)) {
        for (const item of data) {
          const parsed = parseShotFile(JSON.stringify(item));
          if (parsed) result.shots.push(parsed);
        }
      }
    }
  } catch (err) {
    console.warn("[PantaRhei] Decaid Gateway shots endpoint unreachable, using local:", err);
  }

  return result;
}

// -------------------------------------------------------------
// Asynchronous File & Folder Processor
// -------------------------------------------------------------

export async function processMigrationFiles(
  files: FileList | File[],
  existingProfiles: ProfileItem[] = [],
  existingShots: ShotRecord[] = []
): Promise<MigrationBatchResult> {
  const fileArray = Array.from(files);
  const rawProfiles: ProfileWithFolder[] = [];
  const rawShots: ShotRecord[] = [];

  for (const file of fileArray) {
    const path = (file as any).webkitRelativePath || file.name;
    const lowerPath = path.toLowerCase();

    // Determine folder origin
    let sourceFolder: "profiles" | "profiles2" | string = "other";
    if (lowerPath.includes("profiles2") || lowerPath.includes("profiles 2")) {
      sourceFolder = "profiles2";
    } else if (lowerPath.includes("profiles") || lowerPath.includes("profiles_v2")) {
      sourceFolder = "profiles";
    } else if (lowerPath.includes("history")) {
      sourceFolder = "history";
    }

    try {
      const content = await file.text();

      // Check if it's a shot file
      if (lowerPath.endsWith(".shot") || (sourceFolder === "history" && lowerPath.endsWith(".json"))) {
        const shot = parseShotFile(content, file.name);
        if (shot) rawShots.push(shot);
      }
      // Check if it's a profile file
      else if (lowerPath.endsWith(".tcl") || lowerPath.endsWith(".json") || sourceFolder === "profiles" || sourceFolder === "profiles2") {
        const profile = parseTclProfile(content, file.name, sourceFolder);
        if (profile) {
          rawProfiles.push({ profile, sourceFolder });
        }
      }
    } catch (e) {
      console.warn(`[PantaRhei] Failed to read file ${file.name}:`, e);
    }
  }

  // Run Deduplication
  const dedupProfiles = deduplicateProfiles(rawProfiles, existingProfiles);
  const dedupShots = deduplicateShots(rawShots, existingShots);

  return {
    importedProfiles: dedupProfiles.uniqueProfiles,
    importedShots: dedupShots.uniqueShots,
    profileStats: {
      totalParsed: rawProfiles.length,
      uniqueAdded: dedupProfiles.uniqueProfiles.length,
      duplicateCount: dedupProfiles.duplicateCount,
      profiles2OverridesCount: dedupProfiles.profiles2OverridesCount,
    },
    shotStats: {
      totalParsed: rawShots.length,
      uniqueAdded: dedupShots.uniqueShots.length,
      duplicateCount: dedupShots.duplicateCount,
    },
  };
}
