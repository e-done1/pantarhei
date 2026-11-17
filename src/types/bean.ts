/**
 * PantaRhei Coffee Bean & Batch Types
 * Comprehensive data model for single-user inventory, deep terroir indexing,
 * multi-varietal lots, rest calculation, and batch cloning.
 */

export interface PantaBean {
  // Identity & Core Taxonomy
  id: string;                         // Unique ID (UUID or slug)
  name: string;                       // Lot / Coffee Name (e.g. "Worka Sakaro", "El Paraiso Diego Bermudez")
  roaster: string;                    // Roaster name (e.g. "Sey", "April", "Gardelli", "Tim Wendelboe")

  // Terroir, Origin & Farming (All Indexed & Searchable)
  countryOfOrigin: string;            // Country (e.g. "Ethiopia", "Colombia", "Kenya", "Panama")
  region?: string;                    // Area / Province / Washing Station (e.g. "Gedeb, Yirgacheffe", "Cauca, Piendamo")
  farm?: string;                      // Farm / Estate / Producer / Cooperative (e.g. "Finca El Paraiso", "Worka Cooperative")
  varietal?: string | string[];       // Single variety or multiple varieties (e.g. ["SL28", "SL34"], "Kurume, Dega", "Pink Bourbon")
  process: string;                    // Processing method (e.g. "Washed", "Natural", "Honey", "Anaerobic Washed", "Thermal Shock")
  altitude?: string;                  // Single altitude or range (e.g. "2100m", "1900-2200m")
  cropYear?: string;                  // Harvest / crop year (e.g. "2024", "2023/2024")

  // Sensory & Roasting
  roastDate: string;                  // YYYY-MM-DD
  roastProfile?: "Ultra-Light/Nordic" | "Light" | "Medium-Light" | "Medium" | "Dark";
  tastingNotes: string[];             // Granular flavor descriptors e.g. ["Bergamot", "Jasmine", "Peach", "Earl Grey"]
  recommendedRestDays: number;        // Suggested degassing rest window (e.g. 14-21 days)

  // Dynamic Batch & Inventory Tracking
  totalGrams: number;                 // Starting bag weight (e.g. 250g)
  remainingGrams: number;             // Decremented automatically per shot dose
  isFrozen: boolean;                  // Freezer storage flag
  frozenDate?: string;                // Date moved to freezer (preserves rest calculation)
  thawedDate?: string;                // Date taken out of freezer

  // Dial-in Defaults & Equipment Pairing
  targetDose: number;                 // e.g. 18.0g
  targetYield: number;                // e.g. 45.0g
  targetGrind: string;                // e.g. "4.2" on Philos, "1.8" on P64
  preferredProfileId?: string;        // Linked Decaid / DE1 profile hash or title
  preferredBasket?: "CB" | "NB" | string; // Preferred basket geometry
  baristaNotes?: string;              // Custom notes on puck prep, water recipe, or extraction tips
  archived?: boolean;                 // Soft-archived when bag is empty
  createdAt: string;                  // ISO timestamp
  updatedAt: string;                  // ISO timestamp
}

export interface BeanQueryOptions {
  roaster?: string;
  countryOfOrigin?: string;
  varietal?: string;                  // Matches if the lot contains this specific variety
  process?: string;
  isFrozen?: boolean;
  inStock?: boolean;
  archived?: boolean;
}

export interface RestStatusResult {
  daysSinceRoast: number;
  recommendedRestDays: number;
  daysRemainingToPeak: number;
  status: "resting" | "peak" | "aging" | "frozen";
  label: string;
  roastAgeText: string;
  storageLabel: string;
  storageMethod: "room_temperature" | "freezer";
}

/**
 * Normalizes varietal input into an array of distinct variety strings.
 * Handles string[] directly, or splits delimited strings (e.g. "SL28, SL34", "Kurume / Dega", "Caturra + Castillo").
 */
export function getVarietalsList(varietalInput?: string | string[]): string[] {
  if (!varietalInput) return [];
  if (Array.isArray(varietalInput)) {
    return varietalInput.map((v) => v.trim()).filter((v) => v.length > 0);
  }
  return varietalInput
    .split(/[,/\\+&]|(?:\band\b)/i)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

/**
 * Formats multiple varieties into a clean, comma-separated display string
 */
export function formatVarietals(varietalInput?: string | string[]): string {
  const list = getVarietalsList(varietalInput);
  return list.join(", ");
}

/**
 * Generates a unique UUID with fallback for standard environments
 */
export function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "bean_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 9);
}

/**
 * Creates a brand new coffee lot entry from scratch with standard defaults
 */
export function createNewBeanEntry(params: {
  name: string;
  roaster: string;
  countryOfOrigin: string;
  region?: string;
  farm?: string;
  varietal?: string | string[];
  process: string;
  altitude?: string;
  cropYear?: string;
  roastDate?: string;
  roastProfile?: "Ultra-Light/Nordic" | "Light" | "Medium-Light" | "Medium" | "Dark";
  tastingNotes?: string[];
  recommendedRestDays?: number;
  totalGrams: number;
  remainingGrams?: number;
  isFrozen?: boolean;
  targetDose?: number;
  targetYield?: number;
  targetGrind?: string;
  preferredProfileId?: string;
  preferredBasket?: string;
  baristaNotes?: string;
}): PantaBean {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  return {
    id: generateUUID(),
    name: params.name.trim() || "Untitled Lot",
    roaster: params.roaster.trim() || "Unknown Roaster",
    countryOfOrigin: params.countryOfOrigin.trim() || "Single Origin",
    region: params.region?.trim() || undefined,
    farm: params.farm?.trim() || undefined,
    varietal: params.varietal || "Heirloom",
    process: params.process || "Washed",
    altitude: params.altitude?.trim() || undefined,
    cropYear: params.cropYear || now.getFullYear().toString(),
    roastDate: params.roastDate || todayStr,
    roastProfile: params.roastProfile || "Light",
    tastingNotes: params.tastingNotes || [],
    recommendedRestDays: params.recommendedRestDays ?? 14,
    totalGrams: params.totalGrams || 250,
    remainingGrams: params.remainingGrams ?? (params.totalGrams || 250),
    isFrozen: Boolean(params.isFrozen),
    targetDose: params.targetDose ?? 18.0,
    targetYield: params.targetYield ?? 36.0,
    targetGrind: params.targetGrind || "4.0",
    preferredProfileId: params.preferredProfileId,
    preferredBasket: params.preferredBasket,
    baristaNotes: params.baristaNotes,
    archived: false,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

/**
 * "Clone / Edit Old Coffee as New Entry" Action
 * Duplicates an existing coffee's terroir, origin, multi-varietal array, and dial-in parameters
 * while cleanly detaching batch specifics (new UUID, new roastDate, full remaining grams, unfrozen).
 */
export function cloneBeanAsNewEntry(source: PantaBean, overrides?: Partial<PantaBean>): PantaBean {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const newId = generateUUID();

  // Clone varietal cleanly whether array or string
  const clonedVarietal = Array.isArray(source.varietal)
    ? [...source.varietal]
    : source.varietal;

  return {
    id: newId,
    name: source.name,
    roaster: source.roaster,
    countryOfOrigin: source.countryOfOrigin,
    region: source.region,
    farm: source.farm,
    varietal: clonedVarietal,
    process: source.process,
    altitude: source.altitude,
    cropYear: overrides?.cropYear ?? source.cropYear,
    roastDate: overrides?.roastDate ?? todayStr,
    roastProfile: source.roastProfile,
    tastingNotes: [...source.tastingNotes],
    recommendedRestDays: source.recommendedRestDays,
    totalGrams: overrides?.totalGrams ?? source.totalGrams,
    remainingGrams: overrides?.remainingGrams ?? (overrides?.totalGrams ?? source.totalGrams),
    isFrozen: false,
    frozenDate: undefined,
    thawedDate: undefined,
    targetDose: source.targetDose,
    targetYield: source.targetYield,
    targetGrind: source.targetGrind,
    preferredProfileId: source.preferredProfileId,
    preferredBasket: source.preferredBasket,
    baristaNotes: source.baristaNotes,
    archived: false,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  };
}

/**
 * Computes rest days and window status dynamically against a reference date
 */
export function calculateRestDays(bean: PantaBean, referenceDate = new Date()): RestStatusResult {
  const restTarget = bean.recommendedRestDays || 14;
  const roastTime = new Date(bean.roastDate).getTime();
  const refTime = referenceDate.getTime();
  const daysSinceRoast = Math.max(0, Math.floor((refTime - roastTime) / (1000 * 60 * 60 * 24)));
  const dayUnit = daysSinceRoast === 1 ? "day" : "days";
  const roastAgeText = `${daysSinceRoast} ${dayUnit} after roast`;
  const storageMethod: "room_temperature" | "freezer" = bean.isFrozen ? "freezer" : "room_temperature";
  const storageLabel = bean.isFrozen ? "Freezer" : "Room Temp";

  if (bean.isFrozen) {
    return {
      daysSinceRoast,
      recommendedRestDays: restTarget,
      daysRemainingToPeak: 0,
      status: "frozen",
      label: "Frozen (Stasis)",
      roastAgeText,
      storageLabel,
      storageMethod,
    };
  }

  if (daysSinceRoast < restTarget) {
    const daysRemaining = restTarget - daysSinceRoast;
    return {
      daysSinceRoast,
      recommendedRestDays: restTarget,
      daysRemainingToPeak: daysRemaining,
      status: "resting",
      label: `Resting (Day ${daysSinceRoast}/${restTarget} — ${daysRemaining}d to peak)`,
      roastAgeText,
      storageLabel,
      storageMethod,
    };
  }

  // Peak window is restTarget up to restTarget + 28 days (~4 weeks peak)
  const peakWindowEnd = restTarget + 28;
  if (daysSinceRoast <= peakWindowEnd) {
    return {
      daysSinceRoast,
      recommendedRestDays: restTarget,
      daysRemainingToPeak: 0,
      status: "peak",
      label: `Peak Window (Day ${daysSinceRoast})`,
      roastAgeText,
      storageLabel,
      storageMethod,
    };
  }

  return {
    daysSinceRoast,
    recommendedRestDays: restTarget,
    daysRemainingToPeak: 0,
    status: "aging",
    label: `Aging (Day ${daysSinceRoast})`,
    roastAgeText,
    storageLabel,
    storageMethod,
  };
}

/**
 * Returns clean storage method and roast age strings for coffee cards
 */
export function getStorageAndRoastAge(bean: PantaBean, referenceDate = new Date()): {
  daysSinceRoast: number;
  roastAgeText: string;
  storageMethod: "room_temperature" | "freezer";
  storageLabel: string;
  isFrozen: boolean;
} {
  const rest = calculateRestDays(bean, referenceDate);
  return {
    daysSinceRoast: rest.daysSinceRoast,
    roastAgeText: rest.roastAgeText,
    storageMethod: rest.storageMethod,
    storageLabel: rest.storageLabel,
    isFrozen: !!bean.isFrozen,
  };
}

export const BEANS_STORAGE_KEY = "pantarhei_beans_inventory";

export function loadBeansFromStorage(fallback: PantaBean[] = []): PantaBean[] {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(BEANS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return fallback;
}

export function saveBeansToStorage(beans: PantaBean[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(BEANS_STORAGE_KEY, JSON.stringify(beans));
  } catch {}
}

