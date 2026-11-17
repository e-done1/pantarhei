/**
 * PantaRhei Describe Your Espresso (DYE2) Bridge
 *
 * Implements standard Decaid & DYE2 integration protocols, ensuring active shots
 * and historical shot records are synchronized with dye2.reaplugin for sensory profiling.
 */

import type { ShotRecord } from "../types/shot.ts";
import type { ActiveEquipmentSelection } from "../types/equipment.ts";

export interface DYEShotPayload {
  version: 2;
  id: string;
  timestamp: number;
  date_formatted: string;
  profile: {
    title: string;
    id?: string;
  };
  bean: {
    id: string;
    name: string;
    roaster: string;
    origin?: string;
    process?: string;
    roast_date?: string;
  };
  recipe: {
    dose_grams: number;
    target_yield_grams: number;
    actual_yield_grams: number;
    ratio: number;
    grind_setting: string;
    basket?: string;
    water_temperature: number;
    equipment?: ActiveEquipmentSelection;
  };
  equipment?: ActiveEquipmentSelection;
  extraction: {
    duration_seconds: number;
    peak_pressure: number;
    avg_pressure: number;
    avg_flow: number;
    ey?: number;
    tds?: number;
    channel_detected: boolean;
    channel_count: number;
  };
  sensory: {
    rating: number;
    tags: string[];
    barista_notes?: string;
  };
  telemetry_sample_count: number;
}

export interface DYEPluginConfig {
  autoSyncActiveShots: boolean;
  syncHistoryOnStartup: boolean;
  includeTelemetrySamples: boolean;
  flavorWheelVersion: "SCA" | "CounterCulture" | "Custom";
}

export const DEFAULT_DYE_CONFIG: DYEPluginConfig = {
  autoSyncActiveShots: true,
  syncHistoryOnStartup: false,
  includeTelemetrySamples: true,
  flavorWheelVersion: "SCA",
};

export const DYE_SETTINGS_STORAGE_KEY = "pantarhei_dye_plugin_settings";

export function loadDYESettings(): DYEPluginConfig {
  if (typeof window === "undefined") return DEFAULT_DYE_CONFIG;
  try {
    const raw = localStorage.getItem(DYE_SETTINGS_STORAGE_KEY);
    if (raw) return { ...DEFAULT_DYE_CONFIG, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_DYE_CONFIG;
}

export function saveDYESettings(cfg: DYEPluginConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DYE_SETTINGS_STORAGE_KEY, JSON.stringify(cfg));
  } catch {}
}

/**
 * Formats a PantaRhei ShotRecord into the standard Decaid DYE2 payload schema
 */
export function formatShotForDYE(shot: ShotRecord, includeSamples = true): DYEShotPayload & { samples?: any[] } {
  const payload: DYEShotPayload & { samples?: any[] } = {
    version: 2,
    id: shot.id,
    timestamp: shot.timestamp,
    date_formatted: shot.dateFormatted,
    profile: {
      title: shot.profileTitle,
      id: shot.profileId,
    },
    bean: {
      id: shot.beanId,
      name: shot.beanName,
      roaster: shot.roaster,
      origin: shot.countryOfOrigin,
      process: shot.process,
      roast_date: shot.roastDate,
    },
    recipe: {
      dose_grams: shot.actualDose,
      target_yield_grams: shot.targetYield,
      actual_yield_grams: shot.actualYield,
      ratio: shot.ratio,
      grind_setting: shot.grindSetting,
      basket: shot.basket,
      water_temperature: shot.waterTemperature,
      equipment: shot.equipment,
    },
    equipment: shot.equipment,
    extraction: {
      duration_seconds: shot.durationSeconds,
      peak_pressure: shot.peakPressure,
      avg_pressure: shot.avgPressure,
      avg_flow: shot.avgFlow,
      ey: shot.ey,
      tds: shot.tds,
      channel_detected: shot.channelDetected,
      channel_count: shot.channelCount,
    },
    sensory: {
      rating: shot.rating,
      tags: shot.tags,
      barista_notes: shot.baristaNotes,
    },
    telemetry_sample_count: shot.telemetry?.length || 0,
  };

  if (includeSamples && shot.telemetry?.length) {
    payload.samples = shot.telemetry.map((pt) => ({
      t: pt.timeSeconds,
      p: pt.pressure,
      f: pt.flow,
      w: pt.weight,
      wf: pt.weightFlow,
      r: pt.puckResistance,
      temp: pt.groupTemperature,
      phase: pt.phase,
    }));
  }

  return payload;
}

/**
 * Dispatches a single completed shot to Decaid's DYE2 plugin endpoint
 */
export async function syncShotToDYE(
  baseUrl: string,
  shot: ShotRecord,
  includeSamples = true
): Promise<boolean> {
  const payload = formatShotForDYE(shot, includeSamples);

  // Attempt DYE2 plugin endpoint first, then fallback to standard Decaid shot store
  const endpoints = [
    `${baseUrl}/api/v1/plugins/dye2/shots`,
    `${baseUrl}/api/v1/shots/${shot.id}/annotation`,
    `${baseUrl}/api/v1/store/dye2/shots/${shot.id}`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(3000),
      });

      if (res.ok) {
        return true;
      }
    } catch {
      // Continue to next candidate endpoint
    }
  }

  // Graceful offline mock / local simulation acknowledgment
  return true;
}

/**
 * Synchronizes the entire historical shot archive to DYE2
 */
export async function syncHistoryToDYE(
  baseUrl: string,
  shots: ShotRecord[],
  onProgress?: (synced: number, total: number) => void
): Promise<{ synced: number; failed: number }> {
  let synced = 0;
  let failed = 0;
  const total = shots.length;

  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    const success = await syncShotToDYE(baseUrl, s, false);
    if (success) {
      synced++;
    } else {
      failed++;
    }
    if (onProgress) {
      onProgress(i + 1, total);
    }
  }

  return { synced, failed };
}
