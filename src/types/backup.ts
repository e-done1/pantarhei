/**
 * PantaRhei Backup, Migration & Deduplication Data Contracts
 *
 * Provides schemas for settings snapshots, full data archives (profiles, beans, shots),
 * rolling auto-backups, and intelligent deduplication algorithms for seamless machine migration.
 */

import type { CafeHeaderConfig } from "./header.ts";
import type { ScreensaverConfig } from "./screensaver.ts";
import type {
  CoffeeTabConfig,
  SteamTabConfig,
  WaterTabConfig,
  MaintenanceTabConfig,
} from "./cockpitTabs.ts";
import type { ProfileItem } from "./profile.ts";
import type { PantaBean } from "./bean.ts";
import type { ShotRecord } from "./shot.ts";
import type { EquipmentInventory, ActiveEquipmentSelection } from "./equipment.ts";
import type { MachineMaintenanceConfig } from "./maintenance.ts";

export type BackupType = "full" | "settings";

export interface PantaRheiSettingsPayload {
  headerConfig: CafeHeaderConfig;
  clockPaletteId: string;
  fluidEnabled: boolean;
  screensaverConfig: ScreensaverConfig;
  cockpitConfigs: {
    coffee: CoffeeTabConfig;
    steam: SteamTabConfig;
    water: WaterTabConfig;
    maintenance: MaintenanceTabConfig;
  };
  scaleConfig: {
    autoTareShot: boolean;
    autoTareCup: boolean;
  };
  deviceConfig: {
    host: string;
    port: number;
    dontShowStartupModal: boolean;
  };
  pluginSettings: Record<string, any>;
  equipmentInventory?: EquipmentInventory;
  activeEquipment?: ActiveEquipmentSelection;
  machineMaintenanceConfig?: MachineMaintenanceConfig;
}

export interface PantaRheiBackupEnvelope {
  format: "pantarhei_backup";
  version: 1;
  id: string; // e.g. "backup-20261116-233000"
  type: BackupType;
  createdAt: string; // ISO 8601
  appVersion: string;
  sourceMachine?: {
    model?: string;
    serialNumber?: string;
    firmwareVersion?: string;
  };
  settings: PantaRheiSettingsPayload;
  data?: {
    profiles: ProfileItem[];
    beans: PantaBean[];
    shots: ShotRecord[];
  };
}

export interface ImportPreviewResult {
  isValid: boolean;
  error?: string;
  type: BackupType;
  createdAt: string;
  sourceMachine?: string;
  profilesDiff: {
    incomingCount: number;
    newCount: number;
    existingCount: number;
  };
  beansDiff: {
    incomingCount: number;
    newCount: number;
    existingCount: number;
  };
  shotsDiff: {
    incomingCount: number;
    newCount: number;
    duplicateCount: number;
  };
  hasSettings: boolean;
}

export type ImportStrategy = "merge_deduplicate" | "replace_all";

export interface ImportExecutionResult {
  success: boolean;
  message: string;
  importedProfiles: ProfileItem[];
  importedBeans: PantaBean[];
  importedShots: ShotRecord[];
  restoredSettings?: PantaRheiSettingsPayload;
}

// -------------------------------------------------------------
// Deduplication Key Normalizers
// -------------------------------------------------------------

export function normalizeProfileKey(p: Partial<ProfileItem>): string {
  const title = (p.title || "").toLowerCase().trim();
  const author = (p.author || "").toLowerCase().trim();
  if (title) {
    return `${title}::${author}`;
  }
  return (p.id || "").toLowerCase().trim();
}

export function normalizeBeanKey(b: Partial<PantaBean>): string {
  const name = (b.name || "").toLowerCase().trim();
  const roaster = (b.roaster || "").toLowerCase().trim();
  const roastDate = (b.roastDate || "").trim();
  return `${name}::${roaster}::${roastDate}`;
}

export function normalizeShotKey(s: Partial<ShotRecord>): string {
  if (s.id) {
    return s.id.trim();
  }
  const ts = s.timestamp || 0;
  const beanName = (s.beanName || "").toLowerCase().trim();
  const dur = Math.round((s.durationSeconds || 0) * 10) / 10;
  return `${ts}::${beanName}::${dur}`;
}

// -------------------------------------------------------------
// Merge & Deduplication Functions
// -------------------------------------------------------------

export function mergeProfiles(
  current: ProfileItem[],
  incoming: ProfileItem[],
  strategy: ImportStrategy
): ProfileItem[] {
  if (strategy === "replace_all") {
    return [...incoming];
  }

  const existingMap = new Map<string, ProfileItem>();
  for (const p of current) {
    existingMap.set(normalizeProfileKey(p), p);
  }

  const merged = [...current];

  for (const item of incoming) {
    const key = normalizeProfileKey(item);
    if (!existingMap.has(key)) {
      // New profile - insert
      merged.push(item);
      existingMap.set(key, item);
    } else {
      // Existing profile: if incoming is custom and updated, or current is default, keep or update cleanly
      const currentIdx = merged.findIndex((p) => normalizeProfileKey(p) === key);
      if (currentIdx !== -1 && item.isCustom) {
        merged[currentIdx] = { ...merged[currentIdx], ...item };
      }
    }
  }

  return merged;
}

export function mergeBeans(
  current: PantaBean[],
  incoming: PantaBean[],
  strategy: ImportStrategy
): PantaBean[] {
  if (strategy === "replace_all") {
    return [...incoming];
  }

  const existingMap = new Map<string, PantaBean>();
  for (const b of current) {
    existingMap.set(normalizeBeanKey(b), b);
  }

  const merged = [...current];

  for (const item of incoming) {
    const key = normalizeBeanKey(item);
    if (!existingMap.has(key)) {
      merged.push(item);
      existingMap.set(key, item);
    } else {
      // Update details like remaining grams or tasting notes if incoming has more data
      const idx = merged.findIndex((b) => normalizeBeanKey(b) === key);
      if (idx !== -1) {
        merged[idx] = {
          ...merged[idx],
          totalGrams: item.totalGrams ?? merged[idx].totalGrams,
          remainingGrams: item.remainingGrams ?? merged[idx].remainingGrams,
          isFrozen: item.isFrozen ?? merged[idx].isFrozen,
          tastingNotes: Array.from(new Set([...(merged[idx].tastingNotes || []), ...(item.tastingNotes || [])])),
        };
      }
    }
  }

  return merged;
}

export function mergeShots(
  current: ShotRecord[],
  incoming: ShotRecord[],
  strategy: ImportStrategy
): ShotRecord[] {
  if (strategy === "replace_all") {
    return [...incoming];
  }

  const existingKeys = new Set<string>();
  for (const s of current) {
    existingKeys.add(normalizeShotKey(s));
    if (s.id) existingKeys.add(s.id);
  }

  const merged = [...current];

  for (const item of incoming) {
    const key = normalizeShotKey(item);
    if (!existingKeys.has(key) && (!item.id || !existingKeys.has(item.id))) {
      merged.push(item);
      existingKeys.add(key);
      if (item.id) existingKeys.add(item.id);
    }
  }

  // Sort newest first
  merged.sort((a, b) => b.timestamp - a.timestamp);
  return merged;
}

// -------------------------------------------------------------
// Preview Backup Import
// -------------------------------------------------------------

export function previewBackupImport(
  envelope: PantaRheiBackupEnvelope,
  current: {
    profiles: ProfileItem[];
    beans: PantaBean[];
    shots: ShotRecord[];
  }
): ImportPreviewResult {
  if (envelope.format !== "pantarhei_backup" || !envelope.version) {
    return {
      isValid: false,
      error: "Invalid file format. File is not a valid PantaRhei backup JSON.",
      type: "settings",
      createdAt: "",
      profilesDiff: { incomingCount: 0, newCount: 0, existingCount: 0 },
      beansDiff: { incomingCount: 0, newCount: 0, existingCount: 0 },
      shotsDiff: { incomingCount: 0, newCount: 0, duplicateCount: 0 },
      hasSettings: false,
    };
  }

  const incomingProfiles = envelope.data?.profiles || [];
  const incomingBeans = envelope.data?.beans || [];
  const incomingShots = envelope.data?.shots || [];

  // Profiles analysis
  const currentProfileKeys = new Set(current.profiles.map(normalizeProfileKey));
  let newProfiles = 0;
  let existingProfiles = 0;
  for (const p of incomingProfiles) {
    if (currentProfileKeys.has(normalizeProfileKey(p))) {
      existingProfiles++;
    } else {
      newProfiles++;
    }
  }

  // Beans analysis
  const currentBeanKeys = new Set(current.beans.map(normalizeBeanKey));
  let newBeans = 0;
  let existingBeans = 0;
  for (const b of incomingBeans) {
    if (currentBeanKeys.has(normalizeBeanKey(b))) {
      existingBeans++;
    } else {
      newBeans++;
    }
  }

  // Shots analysis
  const currentShotKeys = new Set<string>();
  for (const s of current.shots) {
    currentShotKeys.add(normalizeShotKey(s));
    if (s.id) currentShotKeys.add(s.id);
  }

  let newShots = 0;
  let duplicateShots = 0;
  for (const s of incomingShots) {
    if (currentShotKeys.has(normalizeShotKey(s)) || (s.id && currentShotKeys.has(s.id))) {
      duplicateShots++;
    } else {
      newShots++;
    }
  }

  return {
    isValid: true,
    type: envelope.type,
    createdAt: envelope.createdAt,
    sourceMachine: envelope.sourceMachine?.model
      ? `${envelope.sourceMachine.model} (${envelope.sourceMachine.serialNumber || "No S/N"})`
      : undefined,
    profilesDiff: {
      incomingCount: incomingProfiles.length,
      newCount: newProfiles,
      existingCount: existingProfiles,
    },
    beansDiff: {
      incomingCount: incomingBeans.length,
      newCount: newBeans,
      existingCount: existingBeans,
    },
    shotsDiff: {
      incomingCount: incomingShots.length,
      newCount: newShots,
      duplicateCount: duplicateShots,
    },
    hasSettings: Boolean(envelope.settings),
  };
}
