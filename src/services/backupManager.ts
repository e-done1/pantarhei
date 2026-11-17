/**
 * PantaRhei Backup Manager Service
 *
 * Handles creation, downloading, auto-backups, network peer transfers,
 * and executing imports with intelligent deduplication.
 */

import type {
  BackupType,
  PantaRheiSettingsPayload,
  PantaRheiBackupEnvelope,
  ImportStrategy,
  ImportExecutionResult,
} from "../types/backup.ts";
import {
  mergeProfiles,
  mergeBeans,
  mergeShots,
} from "../types/backup.ts";
import type { ProfileItem } from "../types/profile.ts";
import type { PantaBean } from "../types/bean.ts";
import type { ShotRecord } from "../types/shot.ts";
import { saveShotHistoryToStorage } from "../types/shot.ts";

export const AUTO_BACKUPS_STORAGE_KEY = "pantarhei_auto_backups_list";
const MAX_AUTO_BACKUPS = 5;

export interface AutoBackupEntry {
  id: string;
  createdAt: string;
  type: BackupType;
  itemCounts: {
    profiles: number;
    beans: number;
    shots: number;
  };
  envelope: PantaRheiBackupEnvelope;
}

/**
 * Creates a structured settings-only or full backup envelope
 */
export function buildBackupEnvelope(params: {
  type: BackupType;
  settings: PantaRheiSettingsPayload;
  profiles?: ProfileItem[];
  beans?: PantaBean[];
  shots?: ShotRecord[];
  sourceMachine?: {
    model?: string;
    serialNumber?: string;
    firmwareVersion?: string;
  };
}): PantaRheiBackupEnvelope {
  const now = new Date();
  const timestampSlug = now.toISOString().replace(/[:.]/g, "-");

  const envelope: PantaRheiBackupEnvelope = {
    format: "pantarhei_backup",
    version: 1,
    id: `backup-${timestampSlug}`,
    type: params.type,
    createdAt: now.toISOString(),
    appVersion: "1.0.0",
    sourceMachine: params.sourceMachine,
    settings: params.settings,
  };

  if (params.type === "full") {
    envelope.data = {
      profiles: params.profiles || [],
      beans: params.beans || [],
      shots: params.shots || [],
    };
  }

  return envelope;
}

/**
 * Generates and triggers browser download of backup file
 */
export function downloadBackupFile(envelope: PantaRheiBackupEnvelope): void {
  const dateStr = envelope.createdAt.slice(0, 10);
  const filename = `pantarhei_${envelope.type}_backup_${dateStr}_${envelope.id.slice(-6)}.json`;
  const json = JSON.stringify(envelope, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Pushes backup payload to another DE1 tablet or Decaid device on the local network
 */
export async function pushBackupToNetworkDevice(
  targetHost: string,
  targetPort: number,
  envelope: PantaRheiBackupEnvelope
): Promise<{ success: boolean; message: string }> {
  const endpoint = `http://${targetHost}:${targetPort}/api/v1/store/pantarhei/network_backup_inbox`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      return {
        success: true,
        message: `Successfully transferred backup to ${targetHost}:${targetPort}`,
      };
    } else {
      return {
        success: false,
        message: `Device replied with HTTP status ${res.status}: ${res.statusText}`,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to reach target device at ${targetHost}:${targetPort}. Verify IP and ensure Decaid is active on target.`,
    };
  }
}

/**
 * Saves rolling auto-backup in local storage
 */
export function saveAutoBackup(envelope: PantaRheiBackupEnvelope): void {
  if (typeof window === "undefined") return;

  try {
    const existing = getAutoBackups();
    const entry: AutoBackupEntry = {
      id: envelope.id,
      createdAt: envelope.createdAt,
      type: envelope.type,
      itemCounts: {
        profiles: envelope.data?.profiles?.length || 0,
        beans: envelope.data?.beans?.length || 0,
        shots: envelope.data?.shots?.length || 0,
      },
      envelope,
    };

    const updated = [entry, ...existing.filter((e) => e.id !== entry.id)].slice(0, MAX_AUTO_BACKUPS);
    localStorage.setItem(AUTO_BACKUPS_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn("[PantaRhei] Auto-backup failed:", err);
  }
}

/**
 * Retrieves rolling auto-backups
 */
export function getAutoBackups(): AutoBackupEntry[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(AUTO_BACKUPS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}

  return [];
}

/**
 * Executes the backup restore/import with specified strategy
 */
export function executeBackupImport(
  envelope: PantaRheiBackupEnvelope,
  current: {
    profiles: ProfileItem[];
    beans: PantaBean[];
    shots: ShotRecord[];
  },
  strategy: ImportStrategy
): ImportExecutionResult {
  if (envelope.format !== "pantarhei_backup") {
    return {
      success: false,
      message: "Invalid backup format.",
      importedProfiles: current.profiles,
      importedBeans: current.beans,
      importedShots: current.shots,
    };
  }

  const incomingProfiles = envelope.data?.profiles || [];
  const incomingBeans = envelope.data?.beans || [];
  const incomingShots = envelope.data?.shots || [];

  const mergedProfiles = mergeProfiles(current.profiles, incomingProfiles, strategy);
  const mergedBeans = mergeBeans(current.beans, incomingBeans, strategy);
  const mergedShots = mergeShots(current.shots, incomingShots, strategy);

  // Persist updated shot history to storage
  saveShotHistoryToStorage(mergedShots);

  const newProfilesAdded = mergedProfiles.length - current.profiles.length;
  const newBeansAdded = mergedBeans.length - current.beans.length;
  const newShotsAdded = mergedShots.length - current.shots.length;

  const summary = strategy === "replace_all"
    ? `Clean restore completed: Restored ${mergedProfiles.length} profiles, ${mergedBeans.length} coffees, and ${mergedShots.length} shots.`
    : `Deduplication merge completed: Added ${newProfilesAdded > 0 ? newProfilesAdded : 0} new profiles, ${newBeansAdded > 0 ? newBeansAdded : 0} new coffees, and ${newShotsAdded > 0 ? newShotsAdded : 0} new shots without creating duplicates.`;

  return {
    success: true,
    message: summary,
    importedProfiles: mergedProfiles,
    importedBeans: mergedBeans,
    importedShots: mergedShots,
    restoredSettings: envelope.settings,
  };
}
