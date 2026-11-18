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
import type { PantaBean } from "../types/bean.ts";
import { createNewBeanEntry } from "../types/bean.ts";
import type { TelemetryPoint } from "./telemetrySimulator.ts";
import { normalizeShotKey } from "../types/backup.ts";

function createTimeoutSignal(ms: number): AbortSignal | undefined {
  if (typeof AbortSignal !== "undefined" && typeof (AbortSignal as any).timeout === "function") {
    return (AbortSignal as any).timeout(ms);
  }
  if (typeof AbortController !== "undefined") {
    const controller = new AbortController();
    setTimeout(() => {
      try {
        controller.abort();
      } catch {
        // ignore
      }
    }, ms);
    return controller.signal;
  }
  return undefined;
}

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

export interface DecaidDiscoveredEquipment {
  grinders: string[];
  burrs: string[];
  baskets: string[];
  scales: string[];
  tampers: string[];
  distributors: string[];
}

export interface DecaidGatewaySyncResult {
  profiles: ProfileItem[];
  shots: ShotRecord[];
  beans: PantaBean[];
  equipment: DecaidDiscoveredEquipment;
  activeEquipment?: Partial<ActiveEquipmentSelection>;
  latestShot?: ShotRecord;
  activeBean?: PantaBean;
  activeProfileTitle?: string;
  activeDose?: number;
  activeTargetYield?: number;
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
  beans?: PantaBean[];
  equipment?: DecaidDiscoveredEquipment;
}

// -------------------------------------------------------------
// Terroir & Equipment Context Parsers
// -------------------------------------------------------------

export interface ParsedCoffeeDetails {
  name: string;
  roaster: string;
  countryOfOrigin: string;
  region?: string;
  process: string;
  varietal?: string[];
  altitude?: string;
}

export function parseCoffeeDetails(coffeeName?: string, roaster?: string): ParsedCoffeeDetails {
  if (!coffeeName || !coffeeName.trim()) {
    return {
      name: "Imported Coffee",
      roaster: (roaster && roaster.trim()) || "Unknown Roaster",
      countryOfOrigin: "Single Origin",
      process: "Washed",
    };
  }
  const raw = coffeeName.trim();

  // Known coffee origin countries
  const countries = [
    "Ethiopia", "Kenya", "Colombia", "Panama", "Guatemala", "Costa Rica",
    "Brazil", "Rwanda", "Burundi", "Honduras", "El Salvador", "Indonesia",
    "Yemen", "Ecuador", "Peru", "Mexico", "Tanzania", "Uganda"
  ];
  const country = countries.find((c) => new RegExp(`\\b${c}\\b`, "i").test(raw)) || "Single Origin";

  // Known processing methods
  const processes = [
    "Anaerobic Natural", "Anaerobic Washed", "Thermal Shock", "Double Fermentation",
    "Washed", "Natural", "Honey", "Wet Hulled"
  ];
  let process = "Washed";
  for (const p of processes) {
    if (new RegExp(`\\b${p}\\b`, "i").test(raw)) {
      process = p;
      break;
    }
  }

  // Altitude extraction (e.g. "1,900 - 2,300 masl", "2100m")
  const altMatch = raw.match(/([0-9,.\s-]+)\s*(?:masl|m\.a\.s\.l|m\b)/i);
  const altitude = altMatch ? altMatch[0].replace(/^[^0-9]+/, "").trim() : undefined;

  // Varietals extraction
  const varietalKeywords = [
    "Heirloom", "SL28", "SL34", "Ruiru11", "Batian", "Geisha", "Gesha",
    "Pink Bourbon", "Red Bourbon", "Yellow Bourbon", "Bourbon", "Caturra",
    "Castillo", "Typica", "Pacamara", "Catuai", "Kurume", "Dega", "Sidra",
    "Wush Wush", "Java"
  ];
  const foundVarietals = varietalKeywords.filter((v) => new RegExp(`\\b${v}\\b`, "i").test(raw));

  // Region / Area extraction
  const regionKeywords = [
    "Guji", "Yirgacheffe", "Sidama", "Nyeri", "Kirinyaga", "Inoi",
    "Hambela Wamena", "Hambela", "Huila", "Cauca", "Antioquia", "Boquete", "Tarrazu"
  ];
  const foundRegion = regionKeywords.find((r) => new RegExp(`\\b${r}\\b`, "i").test(raw));

  // Clean Lot Name (first segments before process/country/varietals)
  const segments = raw.split(/,\s*/);
  let name = segments[0] || "Imported Coffee";
  if (
    segments.length > 1 &&
    !processes.some((p) => segments[1].toLowerCase().includes(p.toLowerCase())) &&
    !countries.some((c) => segments[1].toLowerCase().includes(c.toLowerCase())) &&
    !varietalKeywords.some((v) => segments[1].toLowerCase().includes(v.toLowerCase()))
  ) {
    name = `${segments[0]}, ${segments[1]}`;
  }

  return {
    name: name.trim(),
    roaster: (roaster && roaster.trim()) || "Unknown Roaster",
    countryOfOrigin: country,
    region: foundRegion,
    process,
    varietal: foundVarietals.length > 0 ? foundVarietals : undefined,
    altitude,
  };
}

export interface ParsedEquipmentDetails {
  grinder?: string;
  burrs?: string;
  basket?: string;
  scale?: string;
  grindSetting: string;
  tampers: string[];
  distributors: string[];
}

export function parseEquipmentDetails(
  grinderModel?: string,
  grinderSetting?: string,
  scaleModel?: string
): ParsedEquipmentDetails {
  let grinder = grinderModel ? grinderModel.trim() : undefined;
  let burrs: string | undefined = undefined;
  let grind = "2.0";
  let basket: string | undefined = undefined;
  const tampers: string[] = [];
  const distributors: string[] = [];

  if (grinder) {
    // Normalize known typos like "Laom" -> "Lagom"
    grinder = grinder.replace(/\bLaom\b/gi, "Lagom");
    const burrMatch = grinder.match(/with\s+(.+)$/i);
    if (burrMatch) {
      burrs = burrMatch[1].replace(/burrs?$/i, "").trim();
      grinder = grinder.replace(/\s+with\s+.+$/i, "").trim();
    }
  }

  if (grinderSetting) {
    const s = grinderSetting.trim();

    // 1. Extract numeric grind setting (leading number or number followed by grind/setting)
    const grindMatch = s.match(/^\s*([0-9]+(?:\.[0-9]+)?)/i) || s.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:grind|setting)?/i);
    if (grindMatch) grind = grindMatch[1];

    // 2. Extract leveler / distributor (e.g. "6.5 mm spacers on leveler")
    const levelerMatch = s.match(/([^,+]+leveler[^,+]*|[^,+]*spacers[^,+]*)/i);
    if (levelerMatch) {
      distributors.push(levelerMatch[1].trim());
    }

    // 3. Extract tamper (e.g. "Bravo Tamper", "Decent Tamper")
    const tamperMatch = s.match(/([^,+]+tamper[^,+]*)/i);
    if (tamperMatch) {
      tampers.push(tamperMatch[1].trim());
    }

    // 4. Extract basket (e.g. "HE basket", "IMS 18g", "Wafo Spirit")
    const basketMatch = s.match(/([^,+]+basket[^,+]*|\b(?:HE|VST|IMS|Wafo|Decent\s+[CN]B)\b[^,+]*)/i);
    if (basketMatch) {
      let bStr = basketMatch[1].trim();
      if (/^HE\s*basket$/i.test(bStr)) bStr = "HE Basket";
      basket = bStr;
    }
  }

  return {
    grinder,
    burrs,
    basket: basket || (grinder ? "HE Basket" : undefined),
    scale: scaleModel || undefined,
    grindSetting: grind,
    tampers,
    distributors,
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

// -------------------------------------------------------------
// Decaid v2 JSON & Gateway Object Parsers
// -------------------------------------------------------------

export function parseDecaidProfile(item: any): ProfileItem | null {
  if (!item) return null;
  const p = item.profile || item;
  if (!p || (!p.title && !p.name)) return null;

  const title = String(p.title || p.name || "Imported Profile").trim();
  const notes = String(p.notes || "").trim();
  const author = String(p.author || "Decent").trim();
  const beverage_type = p.beverage_type || "espresso";
  const target_temperature = Number(p.tank_temperature || p.target_temperature || 93.0);
  const target_weight = Number(p.target_weight || p.final_desired_shot_weight || 36.0);
  const target_volume = Number(p.target_volume || 0);

  const steps: ProfileStep[] = Array.isArray(p.steps)
    ? p.steps.map((st: any) => ({
        name: st.name || "Extraction Step",
        pump: st.pump === "flow" ? "flow" : "pressure",
        transition: st.transition === "smooth" ? "smooth" : "fast",
        sensor: st.sensor === "water" ? "water" : "coffee",
        pressure: String(st.pressure ?? 0),
        flow: String(st.flow ?? 0),
        temperature: String(st.temperature ?? target_temperature),
        seconds: String(st.seconds ?? 10),
        volume: String(st.volume ?? 0),
        weight: String(st.weight ?? 0),
        exit: st.exit || undefined,
        limiter: st.limiter || undefined,
      }))
    : [];

  return {
    id: item.id || `profile-${normalizeProfileTitle(title)}-${Date.now()}`,
    title,
    author,
    category: beverage_type === "filter" ? "filter" : "custom",
    beverage_type,
    notes,
    target_temperature,
    target_weight,
    target_volume,
    steps: steps.length > 0 ? steps : undefined,
    isCustom: true,
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || new Date().toISOString(),
  };
}

export function parseDecaidShot(item: any): ShotRecord | null {
  if (!item) return null;

  // 1. Direct PantaRhei ShotRecord format
  const isDirectShotRecord = item.beanName !== undefined && item.profileTitle !== undefined;
  if (isDirectShotRecord) {
    return {
      id: item.id || `shot-${item.timestamp || Date.now()}`,
      timestamp: item.timestamp || Date.now(),
      dateFormatted: item.dateFormatted || new Date(item.timestamp || Date.now()).toLocaleDateString(),
      beanId: item.beanId || "bean-imported",
      beanName: item.beanName || "Imported Coffee",
      roaster: item.roaster || "Unknown Roaster",
      countryOfOrigin: item.countryOfOrigin,
      process: item.process,
      roastDate: item.roastDate,
      profileTitle: item.profileTitle || "Imported Profile",
      profileId: item.profileId,
      targetDose: item.targetDose || item.actualDose || 18.0,
      targetYield: item.targetYield || item.actualYield || 36.0,
      grindSetting: String(item.grindSetting || "4.0"),
      basket: item.basket || "CB",
      waterTemperature: item.waterTemperature || 93.0,
      equipment: item.equipment,
      actualDose: item.actualDose || 18.0,
      actualYield: item.actualYield || 36.0,
      ratio: item.ratio || (item.actualYield && item.actualDose ? Math.round((item.actualYield / item.actualDose) * 100) / 100 : 2.0),
      durationSeconds: item.durationSeconds || 28.0,
      peakPressure: item.peakPressure || 9.0,
      avgPressure: item.avgPressure || 6.5,
      avgFlow: item.avgFlow || 2.0,
      tds: item.tds,
      ey: item.ey,
      channelDetected: Boolean(item.channelDetected),
      channelCount: item.channelCount || 0,
      rating: item.rating || 8.0,
      tags: Array.isArray(item.tags) ? item.tags : ["Imported"],
      baristaNotes: item.baristaNotes || "",
      telemetry: Array.isArray(item.telemetry) ? item.telemetry : [],
    };
  }

  // 2. Decaid Gateway Shot structure: { id, timestamp, workflow: { name, profile, context }, annotations: { ... } }
  const ctx = item.workflow?.context || {};
  const annotations = item.annotations || {};

  const rawTimestamp = item.timestamp ? Date.parse(item.timestamp) : Date.now();
  const timestamp = isNaN(rawTimestamp) ? Date.now() : rawTimestamp;
  const dateFormatted = new Date(timestamp).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const coffee = parseCoffeeDetails(ctx.coffeeName, ctx.coffeeRoaster);
  const eq = parseEquipmentDetails(ctx.grinderModel, ctx.grinderSetting);

  const targetDose = Number(ctx.targetDoseWeight || annotations.actualDoseWeight || 18.0);
  const targetYield = Number(ctx.targetYield || annotations.actualYield || 36.0);
  const actualDose = Number(annotations.actualDoseWeight || ctx.targetDoseWeight || 18.0);
  const actualYield = Number(annotations.actualYield || ctx.targetYield || 36.0);
  const ratio = actualDose > 0 ? Math.round((actualYield / actualDose) * 100) / 100 : 2.0;

  const profileTitle = item.workflow?.name || item.workflow?.profile?.title || "Decent Profile";
  const profileId = item.workflow?.id;

  const tags: string[] = [
    "Imported from Decaid",
    coffee.countryOfOrigin,
    coffee.process,
    coffee.roaster,
    eq.grinder,
    eq.burrs,
    eq.basket,
    ...eq.tampers,
  ].filter(Boolean) as string[];

  const baristaNotesParts: string[] = [];
  if (ctx.baristaName) baristaNotesParts.push(`Barista: ${ctx.baristaName}`);
  if (ctx.drinkerName) baristaNotesParts.push(`Drinker: ${ctx.drinkerName}`);
  if (ctx.grinderSetting) baristaNotesParts.push(`Prep: ${ctx.grinderSetting}`);

  return {
    id: item.id || `decaid-${timestamp}`,
    timestamp,
    dateFormatted,
    beanId: `bean-${normalizeProfileTitle(coffee.name)}`,
    beanName: coffee.name,
    roaster: coffee.roaster,
    countryOfOrigin: coffee.countryOfOrigin,
    process: coffee.process,
    profileTitle,
    profileId,
    targetDose,
    targetYield,
    grindSetting: eq.grindSetting,
    basket: eq.basket || "CB",
    waterTemperature: 93.0,
    equipment: {
      grinder: eq.grinder,
      burrs: eq.burrs,
      basket: eq.basket,
      scale: eq.scale,
      tampers: eq.tampers,
      distributors: eq.distributors,
      wdt: [],
      rdt: [],
    },
    actualDose,
    actualYield,
    ratio,
    durationSeconds: 28.0,
    peakPressure: 9.0,
    avgPressure: 6.5,
    avgFlow: 2.0,
    channelDetected: false,
    channelCount: 0,
    rating: annotations.enjoyment ? Number(annotations.enjoyment) : 8.5,
    tds: annotations.drinkTds ? Number(annotations.drinkTds) : undefined,
    ey: annotations.drinkEy ? Number(annotations.drinkEy) : undefined,
    tags,
    baristaNotes: baristaNotesParts.join(" · "),
    telemetry: [],
  };
}

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
      const decaidProf = parseDecaidProfile(parsed);
      if (decaidProf) {
        if (filename && decaidProf.title === "Imported Profile") {
          decaidProf.title = filename.replace(/\.(json|tcl)$/i, "");
        }
        return decaidProf;
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
      const decaidShot = parseDecaidShot(parsed);
      if (decaidShot) return decaidShot;
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

/**
 * Converts Decaid telemetry measurements into PantaRhei TelemetryPoint series
 */
export function convertDecaidMeasurementsToTelemetry(
  measurements: any[],
  baseTimestamp: number = Date.now()
): TelemetryPoint[] {
  if (!Array.isArray(measurements) || measurements.length === 0) return [];

  const firstT = measurements[0]?.machine?.timestamp
    ? new Date(measurements[0].machine.timestamp).getTime()
    : baseTimestamp;

  return measurements.map((m: any, i: number) => {
    const rawT = m.machine?.timestamp
      ? new Date(m.machine.timestamp).getTime()
      : firstT + i * 250;
    const timeSeconds = Math.max(0, Math.round(((rawT - firstT) / 1000) * 10) / 10);
    const pressure = Math.round((m.machine?.pressure ?? 0) * 10) / 10;
    const targetPressure = m.machine?.targetPressure >= 0 ? Math.round(m.machine.targetPressure * 10) / 10 : 0;
    const flow = Math.round((m.machine?.flow ?? 0) * 10) / 10;
    const targetFlow = m.machine?.targetFlow >= 0 ? Math.round(m.machine.targetFlow * 10) / 10 : 0;
    const weight = Math.round((m.scale?.weight ?? 0) * 10) / 10;
    const weightFlow = Math.round((m.scale?.weightFlow ?? 0) * 10) / 10;
    const groupTemperature = Math.round((m.machine?.groupTemperature ?? 93.0) * 10) / 10;
    const targetGroupTemp = Math.round((m.machine?.targetGroupTemperature ?? 93.0) * 10) / 10;
    const steamTemperature = Math.round((m.machine?.steamTemperature ?? 0) * 10) / 10;
    const puckResistance = flow > 0.1 ? Math.round((pressure / (flow * flow)) * 100) / 100 : 0;

    return {
      timestamp: baseTimestamp + Math.round(timeSeconds * 1000),
      timeSeconds,
      pressure,
      targetPressure,
      flow,
      targetFlow,
      weightFlow,
      weight,
      groupTemperature,
      targetGroupTemp,
      steamTemperature,
      puckResistance,
      phase: timeSeconds < 5 ? "preinfusion" : "extraction",
      channelDetected: false,
    };
  });
}

export async function syncFromDecaidGateway(
  baseUrl: string = "http://localhost:8080",
  limit: number = 100
): Promise<DecaidGatewaySyncResult> {
  const result: DecaidGatewaySyncResult = {
    profiles: [],
    shots: [],
    beans: [],
    equipment: {
      grinders: [],
      burrs: [],
      baskets: [],
      scales: [],
      tampers: [],
      distributors: [],
    },
  };

  const discoveredBeansMap = new Map<string, PantaBean>();
  const grindersSet = new Set<string>();
  const burrsSet = new Set<string>();
  const basketsSet = new Set<string>();
  const scalesSet = new Set<string>();
  const tampersSet = new Set<string>();
  const distributorsSet = new Set<string>();

  // 1. Fetch profiles from Decaid
  try {
    const profRes = await fetch(`${baseUrl}/api/v1/profiles`, {
      headers: { "Content-Type": "application/json" },
      signal: createTimeoutSignal(5000),
    });
    if (profRes.ok) {
      const data = await profRes.json();
      const items = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
      for (const item of items) {
        const parsed = parseDecaidProfile(item);
        if (parsed) result.profiles.push(parsed);
      }
    }
  } catch (err) {
    console.warn("[PantaRhei] Decaid Gateway profiles endpoint unreachable:", err);
  }

  // 2. Fetch grinders & burrs inventory
  try {
    const gRes = await fetch(`${baseUrl}/api/v1/grinders`, {
      headers: { "Content-Type": "application/json" },
      signal: createTimeoutSignal(5000),
    });
    if (gRes.ok) {
      const data = await gRes.json();
      const items = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
      for (const g of items) {
        if (g.model) {
          const parsed = parseEquipmentDetails(g.model);
          if (parsed.grinder) grindersSet.add(parsed.grinder);
          if (parsed.burrs) burrsSet.add(parsed.burrs);
        }
      }
    }
  } catch (err) {
    console.warn("[PantaRhei] Decaid Gateway grinders endpoint unreachable:", err);
  }

  // 3. Fetch comprehensive beans & bean batches from Decaid / DYE database
  try {
    const [beansRes, batchesRes] = await Promise.all([
      fetch(`${baseUrl}/api/v1/beans`, {
        headers: { "Content-Type": "application/json" },
        signal: createTimeoutSignal(5000),
      }).catch(() => null),
      fetch(`${baseUrl}/api/v1/bean-batches`, {
        headers: { "Content-Type": "application/json" },
        signal: createTimeoutSignal(5000),
      }).catch(() => null),
    ]);

    let rawBeans: any[] = [];
    if (beansRes && beansRes.ok) {
      const data = await beansRes.json();
      rawBeans = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
    }

    let rawBatches: any[] = [];
    if (batchesRes && batchesRes.ok) {
      const data = await batchesRes.json();
      rawBatches = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
    }

    const batchMap = new Map<string, any>();
    for (const b of rawBatches) {
      if (b.beanId) {
        batchMap.set(b.beanId, b);
      }
    }

    for (const rb of rawBeans) {
      const batch = batchMap.get(rb.id);
      const details = parseCoffeeDetails(rb.name, rb.roaster);
      const beanKey = `${normalizeProfileTitle(details.name)}-${normalizeProfileTitle(details.roaster)}`;

      let roastProfile: PantaBean["roastProfile"] = undefined;
      const rl = (batch?.roastLevel || "").toLowerCase();
      if (rl.includes("ultra") || rl.includes("nordic")) roastProfile = "Ultra-Light/Nordic";
      else if (rl.includes("medium_light") || rl.includes("medium-light")) roastProfile = "Medium-Light";
      else if (rl.includes("light")) roastProfile = "Light";
      else if (rl.includes("medium")) roastProfile = "Medium";
      else if (rl.includes("dark")) roastProfile = "Dark";

      const beanEntry = createNewBeanEntry({
        id: rb.id,
        name: details.name,
        roaster: details.roaster,
        countryOfOrigin: details.countryOfOrigin,
        region: details.region,
        process: details.process,
        varietal: details.varietal,
        altitude: details.altitude,
        roastProfile,
        isFrozen: Boolean(batch?.frozen),
        baristaNotes: rb.notes || undefined,
        archived: Boolean(rb.archived || batch?.archived),
        createdAt: rb.createdAt,
        updatedAt: rb.updatedAt,
        totalGrams: 250,
        remainingGrams: 250,
      });

      discoveredBeansMap.set(beanKey, beanEntry);
      if (rb.id) {
        discoveredBeansMap.set(`id-${rb.id}`, beanEntry);
      }
      if (batch?.id) {
        discoveredBeansMap.set(`batch-${batch.id}`, beanEntry);
      }
    }
  } catch (err) {
    console.warn("[PantaRhei] Decaid Gateway beans/batches endpoint unreachable:", err);
  }

  // 4. Fetch historical shots from Decaid
  try {
    const shotRes = await fetch(`${baseUrl}/api/v1/shots?limit=${limit}`, {
      headers: { "Content-Type": "application/json" },
      signal: createTimeoutSignal(6000),
    });
    if (shotRes.ok) {
      const data = await shotRes.json();
      const items = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
      for (const item of items) {
        const shot = parseDecaidShot(item);
        if (!shot) continue;
        result.shots.push(shot);

        // Discovered Equipment Indexing
        if (shot.equipment) {
          if (shot.equipment.grinder) grindersSet.add(shot.equipment.grinder);
          if (shot.equipment.burrs) burrsSet.add(shot.equipment.burrs);
          if (shot.equipment.basket) basketsSet.add(shot.equipment.basket);
          if (shot.equipment.scale) scalesSet.add(shot.equipment.scale);
          for (const t of shot.equipment.tampers || []) tampersSet.add(t);
          for (const d of shot.equipment.distributors || []) distributorsSet.add(d);
        }

        // Fallback bean discovery if beans endpoint didn't populate it
        const ctx = item.workflow?.context || {};
        const coffee = parseCoffeeDetails(ctx.coffeeName, ctx.coffeeRoaster);
        const beanKey = `${normalizeProfileTitle(coffee.name)}-${normalizeProfileTitle(coffee.roaster)}`;
        if (coffee.name && !discoveredBeansMap.has(beanKey)) {
          const newBean = createNewBeanEntry({
            name: coffee.name,
            roaster: coffee.roaster,
            countryOfOrigin: coffee.countryOfOrigin,
            region: coffee.region,
            process: coffee.process,
            varietal: coffee.varietal,
            altitude: coffee.altitude,
            totalGrams: 250,
            remainingGrams: 250,
            targetDose: shot.targetDose,
            targetYield: shot.targetYield,
            targetGrind: shot.grindSetting,
            preferredProfileId: shot.profileTitle,
            preferredBasket: shot.basket,
          });
          discoveredBeansMap.set(beanKey, newBean);
        }
      }
    }
  } catch (err) {
    console.warn("[PantaRhei] Decaid Gateway shots endpoint unreachable:", err);
  }

  // 5. Fetch telemetry and details for the latest shot to ensure seamless cockpit transition!
  if (result.shots.length > 0) {
    const latestShot = result.shots[0];
    try {
      const detailRes = await fetch(`${baseUrl}/api/v1/shots/${latestShot.id}`, {
        headers: { "Content-Type": "application/json" },
        signal: createTimeoutSignal(5000),
      });
      if (detailRes.ok) {
        const detail = await detailRes.json();
        if (detail.measurements && Array.isArray(detail.measurements)) {
          const telemetry = convertDecaidMeasurementsToTelemetry(detail.measurements, latestShot.timestamp);
          if (telemetry.length > 0) {
            latestShot.telemetry = telemetry;
            const finalPt = telemetry[telemetry.length - 1];
            const peakP = telemetry.reduce((max, pt) => Math.max(max, pt.pressure), 0);
            const sumFlow = telemetry.reduce((sum, pt) => sum + pt.flow, 0);
            latestShot.durationSeconds = finalPt.timeSeconds;
            latestShot.peakPressure = peakP;
            latestShot.avgFlow = Math.round((sumFlow / telemetry.length) * 10) / 10;
            if (detail.annotations?.actualYield || finalPt.weight > 0) {
              latestShot.actualYield = detail.annotations?.actualYield || finalPt.weight;
            }
          }
        }

        if (detail.annotations?.actualDoseWeight) {
          latestShot.actualDose = Number(detail.annotations.actualDoseWeight);
        }
        if (detail.annotations?.enjoyment) {
          latestShot.rating = Number(detail.annotations.enjoyment);
        }
        if (detail.annotations?.drinkEy) {
          latestShot.ey = Number(detail.annotations.drinkEy);
        }
        if (detail.annotations?.drinkTds) {
          latestShot.tds = Number(detail.annotations.drinkTds);
        }

        // Equipment from latest shot context
        const ctx = detail.workflow?.context || {};
        if (ctx.targetDoseWeight) latestShot.targetDose = Number(ctx.targetDoseWeight);
        if (ctx.targetYield) latestShot.targetYield = Number(ctx.targetYield);

        const eqParsed = parseEquipmentDetails(ctx.grinderModel, ctx.grinderSetting);
        latestShot.equipment = {
          grinder: eqParsed.grinder,
          burrs: eqParsed.burrs,
          basket: eqParsed.basket,
          scale: eqParsed.scale,
          tampers: eqParsed.tampers,
          distributors: eqParsed.distributors,
          wdt: [],
          rdt: [],
        };
        latestShot.grindSetting = eqParsed.grindSetting;

        // Find active bean
        let matchedBean: PantaBean | undefined = undefined;
        if (ctx.beanBatchId && discoveredBeansMap.has(`batch-${ctx.beanBatchId}`)) {
          matchedBean = discoveredBeansMap.get(`batch-${ctx.beanBatchId}`);
        } else if (ctx.coffeeName) {
          const coffee = parseCoffeeDetails(ctx.coffeeName, ctx.coffeeRoaster);
          const beanKey = `${normalizeProfileTitle(coffee.name)}-${normalizeProfileTitle(coffee.roaster)}`;
          matchedBean = discoveredBeansMap.get(beanKey);
        }

        if (matchedBean) {
          matchedBean.targetDose = latestShot.actualDose || latestShot.targetDose || 18.0;
          matchedBean.targetYield = latestShot.actualYield || latestShot.targetYield || 36.0;
          matchedBean.targetGrind = latestShot.grindSetting;
          matchedBean.preferredProfileId = latestShot.profileTitle;
          if (latestShot.basket) matchedBean.preferredBasket = latestShot.basket;
          result.activeBean = matchedBean;
        }
      }
    } catch (err) {
      console.warn("[PantaRhei] Error fetching latest shot detail for telemetry transition:", err);
    }

    result.latestShot = latestShot;
    result.activeProfileTitle = latestShot.profileTitle;
    result.activeDose = latestShot.actualDose || latestShot.targetDose;
    result.activeTargetYield = latestShot.actualYield || latestShot.targetYield;

    if (latestShot.equipment) {
      result.activeEquipment = {
        grinder: latestShot.equipment.grinder,
        burrs: latestShot.equipment.burrs,
        basket: latestShot.equipment.basket,
        scale: latestShot.equipment.scale,
        tampers: latestShot.equipment.tampers || [],
        distributors: latestShot.equipment.distributors || [],
        wdt: [],
        rdt: [],
      };
    }
  }

  // Filter out internal id/batch lookup entries from beans array
  const uniqueBeansList: PantaBean[] = [];
  const seenIds = new Set<string>();
  for (const [key, bean] of discoveredBeansMap.entries()) {
    if (key.startsWith("id-") || key.startsWith("batch-")) continue;
    if (!seenIds.has(bean.id)) {
      seenIds.add(bean.id);
      uniqueBeansList.push(bean);
    }
  }
  result.beans = uniqueBeansList;

  // If activeBean still not assigned, pick first bean
  if (!result.activeBean && result.beans.length > 0) {
    result.activeBean = result.beans[0];
  }

  result.equipment = {
    grinders: Array.from(grindersSet),
    burrs: Array.from(burrsSet),
    baskets: Array.from(basketsSet),
    scales: Array.from(scalesSet),
    tampers: Array.from(tampersSet),
    distributors: Array.from(distributorsSet),
  };

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
