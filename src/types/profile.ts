/**
 * PantaRhei Profile Management & Decaid Profile Types
 *
 * Provides typed data contracts, step definitions, factories, and persistence
 * helpers for Decaid extraction profiles and custom barista profiles.
 */

export type PumpMode = "pressure" | "flow";
export type SensorTarget = "coffee" | "water";
export type TransitionType = "fast" | "smooth";
export type BeverageType = "espresso" | "filter" | "tea_portafilter" | "allonge" | "pourover" | "cleaning";

export interface ProfileStepExit {
  type: "pressure" | "flow" | "weight" | "temperature";
  condition: "over" | "under";
  value: string | number;
}

export interface ProfileStepLimiter {
  value: string | number;
  range: string | number;
}

export interface ProfileStep {
  name: string;
  temperature: string | number;
  sensor: SensorTarget;
  pump: PumpMode;
  transition: TransitionType;
  pressure: string | number;
  flow: string | number;
  seconds: string | number;
  volume: string | number;
  weight: string | number;
  exit?: ProfileStepExit;
  limiter?: ProfileStepLimiter;
}

export interface ProfileItem {
  id: string;
  title: string;
  author: string;
  category: string;
  beverage_type?: BeverageType | string;
  notes?: string;
  target_temperature?: number | string;
  target_weight?: number | string;
  target_volume?: number | string;
  target_dose?: number | string;
  steps?: ProfileStep[];
  isCustom?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export const COMMON_PROFILE_CATEGORIES = [
  "sey",
  "peony",
  "push",
  "tanat",
  "kawa",
  "filter3",
  "hmc",
  "turbo",
  "espresso",
  "flow",
  "lever",
  "filter",
  "allonge",
  "strega",
  "cleaning",
] as const;

export const COMMON_BEVERAGE_TYPES: { id: BeverageType; label: string }[] = [
  { id: "espresso", label: "Espresso" },
  { id: "filter", label: "Filter 2.0 / Pourover" },
  { id: "allonge", label: "Allongé" },
  { id: "tea_portafilter", label: "Tea / Extraction" },
  { id: "cleaning", label: "Cleaning / Rinse" },
];

/**
 * Standard 4-step modern extraction recipe for new profiles
 */
export function createDefaultProfileSteps(targetTemp: number = 93.0): ProfileStep[] {
  return [
    {
      name: "Pre-infusion",
      temperature: targetTemp.toFixed(1),
      sensor: "coffee",
      pump: "flow",
      transition: "fast",
      pressure: "3.00",
      flow: "4.0",
      seconds: "6.00",
      volume: "60.00",
      weight: "0",
      exit: {
        type: "pressure",
        condition: "over",
        value: "3.50",
      },
    },
    {
      name: "Soak / Bloom",
      temperature: targetTemp.toFixed(1),
      sensor: "coffee",
      pump: "flow",
      transition: "fast",
      pressure: "2.00",
      flow: "0.0",
      seconds: "4.00",
      volume: "0.00",
      weight: "0",
    },
    {
      name: "Ramp & Extraction",
      temperature: targetTemp.toFixed(1),
      sensor: "coffee",
      pump: "pressure",
      transition: "smooth",
      pressure: "9.00",
      flow: "2.2",
      seconds: "18.00",
      volume: "100.00",
      weight: "0",
      limiter: {
        value: "2.8",
        range: "0.5",
      },
    },
    {
      name: "Taper / Decline",
      temperature: (targetTemp - 2.0).toFixed(1),
      sensor: "coffee",
      pump: "pressure",
      transition: "smooth",
      pressure: "6.00",
      flow: "1.8",
      seconds: "8.00",
      volume: "80.00",
      weight: "0",
    },
  ];
}

/**
 * Factory for creating a fresh custom extraction profile
 */
export function createNewProfile(overrides?: Partial<ProfileItem>): ProfileItem {
  const id = `custom-profile-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  const defaultTemp = 93.0;

  return {
    id,
    title: "New Extraction Profile",
    author: "Barista",
    category: "espresso",
    beverage_type: "espresso",
    notes: "Custom extraction profile dialed in on PantaRhei.",
    target_temperature: defaultTemp,
    target_dose: 18.0,
    target_weight: 36.0,
    target_volume: 120,
    steps: createDefaultProfileSteps(defaultTemp),
    isCustom: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Clone an existing profile into a new independent custom profile
 */
export function cloneProfile(source: ProfileItem, newTitle?: string): ProfileItem {
  const id = `custom-profile-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  return {
    ...source,
    id,
    title: newTitle || `${source.title} (Copy)`,
    isCustom: true,
    steps: source.steps ? JSON.parse(JSON.stringify(source.steps)) : createDefaultProfileSteps(),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * LocalStorage Key for custom PantaRhei profiles
 */
export const CUSTOM_PROFILES_STORAGE_KEY = "pantarhei_custom_profiles";

/**
 * Load custom profiles from local storage with error safety
 */
export function loadCustomProfilesFromStorage(): ProfileItem[] {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(CUSTOM_PROFILES_STORAGE_KEY) : null;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("[PantaRhei] Failed to load custom profiles from storage:", err);
    return [];
  }
}

/**
 * Save custom profiles to local storage
 */
export function saveCustomProfilesToStorage(profiles: ProfileItem[]): void {
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(CUSTOM_PROFILES_STORAGE_KEY, JSON.stringify(profiles));
    }
  } catch (err) {
    console.error("[PantaRhei] Failed to save custom profiles to storage:", err);
  }
}

/**
 * Generate a safe, standard filename for saving to profiles or profiles_v2
 */
export function generateProfileFilename(title: string, extension: "json" | "tcl"): string {
  if (extension === "json") {
    const sanitized = title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return `${sanitized || "custom_profile"}.json`;
  } else {
    // Legacy DE1 .tcl filename: keeps spaces and readable title
    const sanitized = title
      .trim()
      .replace(/[<>:"/\\|?*]/g, "")
      .replace(/\s+/g, " ")
      .toLowerCase();
    return `${sanitized || "custom_profile"}.tcl`;
  }
}

/**
 * Serializes a PantaRhei Profile into standard Decaid v2 JSON format
 * Matches Decaid's defaultProfiles/*.json structure.
 */
export function serializeToDecaidV2(profile: ProfileItem): Record<string, any> {
  const steps = (profile.steps || createDefaultProfileSteps()).map((step) => ({
    name: step.name || "Step",
    temperature: String(step.temperature || profile.target_temperature || "93.0"),
    sensor: step.sensor || "coffee",
    pump: step.pump || "pressure",
    transition: step.transition || "smooth",
    pressure: String(step.pressure || "0"),
    flow: String(step.flow || "0"),
    seconds: String(step.seconds || "10"),
    volume: String(step.volume || "0"),
    weight: String(step.weight || "0"),
    ...(step.exit ? { exit: step.exit } : {}),
    ...(step.limiter ? { limiter: step.limiter } : {}),
  }));

  return {
    version: "2",
    title: profile.title.trim() || "Untitled Profile",
    author: profile.author?.trim() || "Barista",
    notes: profile.notes?.trim() || "",
    beverage_type: profile.beverage_type || "espresso",
    steps,
    tank_temperature: String(profile.target_temperature || "93.0"),
    target_weight: String(profile.target_weight || "36"),
    target_volume: String(profile.target_volume || "0"),
    target_volume_count_start: "0",
    legacy_profile_type: "settings_2c",
    type: "advanced",
    lang: "",
    hidden: "",
    reference_file: "",
    changes_since_last_espresso: "",
  };
}

/**
 * Strips legacy TCL fields and validates pump discrimination for Decaid's Rea Gateway API (PUT /workflow, POST /machine/profile)
 * Prevents Rea's strict Dart deserializer from stalling or failing with 400.
 */
export function sanitizeProfileForRea(profileData: Record<string, any>): Record<string, any> {
  const profile = JSON.parse(JSON.stringify(profileData));
  profile.version = profile.version || "2";

  for (const k of ["type", "legacy_profile_type", "lang", "hidden", "reference_file", "changes_since_last_espresso"]) {
    delete profile[k];
  }

  if (Array.isArray(profile?.steps)) {
    for (const step of profile.steps) {
      if (step.pump === "flow") {
        delete step.pressure;
      } else if (step.pump === "pressure") {
        delete step.flow;
      }
      if (step.limiter && (step.limiter.value === 0 || step.limiter.value === "0")) {
        delete step.limiter;
      }
      if (step.exit && step.exit.type !== "pressure" && step.exit.type !== "flow") {
        delete step.exit;
      }
    }
  }

  return profile;
}

/**
 * Serializes a PantaRhei Profile into Decent DE1 legacy TCL format
 * Suitable for saving to the legacy `profiles` directory
 */
export function serializeToDecaidTcl(profile: ProfileItem): string {
  const escapeTcl = (val: string | number | undefined): string => {
    if (val === undefined || val === null) return "{}";
    const str = String(val);
    if (str.includes(" ") || str.includes("{") || str.includes("}") || str === "") {
      return `{${str.replace(/[{}]/g, "")}}`;
    }
    return str;
  };

  const stepsTcl = (profile.steps || createDefaultProfileSteps()).map((step) => {
    const hasExit = Boolean(step.exit);
    const exitIf = hasExit ? 1 : 0;
    const exitType = step.exit ? `${step.exit.type}_${step.exit.condition}` : "";
    const exitVal = step.exit ? step.exit.value : "0";

    const parts = [
      `exit_if ${exitIf}`,
      `flow ${step.flow || 0}`,
      `volume ${step.volume || 0}`,
      `transition ${step.transition || "smooth"}`,
      `temperature ${step.temperature || profile.target_temperature || 93.0}`,
      `weight ${step.weight || 0}`,
      `name {${String(step.name || "Step").replace(/[{}]/g, "")}}`,
      `pressure ${step.pressure || 0}`,
      `sensor ${step.sensor || "coffee"}`,
      `pump ${step.pump || "pressure"}`,
      `seconds ${step.seconds || 10}`,
    ];

    if (hasExit) {
      parts.push(`exit_type ${exitType}`);
      if (step.exit?.type === "pressure") parts.push(`exit_pressure_${step.exit.condition} ${exitVal}`);
      if (step.exit?.type === "flow") parts.push(`exit_flow_${step.exit.condition} ${exitVal}`);
    }

    return `{${parts.join(" ")}}`;
  });

  const lines = [
    `advanced_shot {${stepsTcl.join(" ")}}`,
    `author ${escapeTcl(profile.author || "Barista")}`,
    `beverage_type ${escapeTcl(profile.beverage_type || "espresso")}`,
    `espresso_temperature ${profile.target_temperature || 93.0}`,
    `final_desired_shot_volume ${profile.target_volume || 0}`,
    `final_desired_shot_weight ${profile.target_weight || 36.0}`,
    `profile_notes ${escapeTcl(profile.notes || "")}`,
    `profile_title ${escapeTcl(profile.title || "Untitled Profile")}`,
  ];

  return lines.join("\n") + "\n";
}

