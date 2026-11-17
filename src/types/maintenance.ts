/**
 * PantaRhei Machine Maintenance Types & Triggers
 *
 * Tracks maintenance reminders for:
 * 1. Group Head Cleaning (running a cleaning profile with blind basket & cleaning agent):
 *    Default interval: 2 days (configurable 1 to 30 days).
 * 2. Descale (boiler and hydraulic circuit descaling):
 *    Default interval: 2 months (configurable 1 to 12 months).
 */

export interface MachineMaintenanceConfig {
  cleaningIntervalDays: number;         // 1 to 30 days, default: 2
  lastCleaningTimestamp: number;        // Epoch timestamp (ms) of last cleaning
  descaleIntervalMonths: number;        // 1 to 12 months, default: 2 (or up to 12)
  lastDescaleTimestamp: number;         // Epoch timestamp (ms) of last descale
}

export const DEFAULT_MAINTENANCE_CONFIG: MachineMaintenanceConfig = {
  cleaningIntervalDays: 2,
  lastCleaningTimestamp: Date.now(),
  descaleIntervalMonths: 2,
  lastDescaleTimestamp: Date.now(),
};

export const MAINTENANCE_STORAGE_KEY = "pantarhei_machine_maintenance_config";

export function loadMaintenanceConfig(): MachineMaintenanceConfig {
  if (typeof window === "undefined") return DEFAULT_MAINTENANCE_CONFIG;
  try {
    const raw = localStorage.getItem(MAINTENANCE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        cleaningIntervalDays: Math.min(30, Math.max(1, Number(parsed.cleaningIntervalDays) || 2)),
        lastCleaningTimestamp: Number(parsed.lastCleaningTimestamp) || Date.now(),
        descaleIntervalMonths: Math.min(12, Math.max(1, Number(parsed.descaleIntervalMonths) || 2)),
        lastDescaleTimestamp: Number(parsed.lastDescaleTimestamp) || Date.now(),
      };
    }
  } catch {}
  return DEFAULT_MAINTENANCE_CONFIG;
}

export function saveMaintenanceConfig(config: MachineMaintenanceConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MAINTENANCE_STORAGE_KEY, JSON.stringify(config));
  } catch {}
}

export interface MaintenanceStatus {
  isCleaningDue: boolean;
  cleaningDaysPassed: number;
  cleaningDaysRemaining: number;
  isDescaleDue: boolean;
  descaleMonthsPassed: number;
  descaleMonthsRemaining: number;
  primaryActionType: "cleaning" | "descale" | "both" | "none";
  badgeLabel: string | null;
  tooltipText: string;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MS_PER_MONTH = MS_PER_DAY * 30.4375;

export function getMaintenanceStatus(
  config: MachineMaintenanceConfig,
  currentTime = Date.now()
): MaintenanceStatus {
  const cleaningIntervalDays = Math.min(30, Math.max(1, config.cleaningIntervalDays || 2));
  const descaleIntervalMonths = Math.min(12, Math.max(1, config.descaleIntervalMonths || 2));

  const cleaningElapsedMs = Math.max(0, currentTime - config.lastCleaningTimestamp);
  const cleaningDaysPassed = Math.floor(cleaningElapsedMs / MS_PER_DAY);
  const isCleaningDue = cleaningDaysPassed >= cleaningIntervalDays;
  const cleaningDaysRemaining = Math.max(0, cleaningIntervalDays - cleaningDaysPassed);

  const descaleElapsedMs = Math.max(0, currentTime - config.lastDescaleTimestamp);
  const descaleMonthsPassed = Math.floor(descaleElapsedMs / MS_PER_MONTH);
  const isDescaleDue = descaleMonthsPassed >= descaleIntervalMonths;
  const descaleMonthsRemaining = Math.max(0, descaleIntervalMonths - descaleMonthsPassed);

  let primaryActionType: "cleaning" | "descale" | "both" | "none" = "none";
  let badgeLabel: string | null = null;
  let tooltipText = "";

  if (isCleaningDue && isDescaleDue) {
    primaryActionType = "both";
    badgeLabel = "Maintenance Due";
    tooltipText = `Group head cleaning and descaling are both overdue. Click to open cleaning context.`;
  } else if (isCleaningDue) {
    primaryActionType = "cleaning";
    badgeLabel = "Clean Group Head";
    tooltipText = `Group head cleaning overdue (${cleaningDaysPassed} days since last clean). Click to run cleaning routine.`;
  } else if (isDescaleDue) {
    primaryActionType = "descale";
    badgeLabel = "Descale Required";
    tooltipText = `Machine descaling overdue (${descaleMonthsPassed} months since last descale). Click to start descaling.`;
  }

  return {
    isCleaningDue,
    cleaningDaysPassed,
    cleaningDaysRemaining,
    isDescaleDue,
    descaleMonthsPassed,
    descaleMonthsRemaining,
    primaryActionType,
    badgeLabel,
    tooltipText,
  };
}

export function formatTimeAgo(timestamp: number, currentTime = Date.now()): string {
  if (!timestamp) return "Never";
  const diffDays = Math.floor(Math.max(0, currentTime - timestamp) / MS_PER_DAY);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays} days ago`;
  const diffMonths = Math.floor(diffDays / 30.4375);
  if (diffMonths === 1) return "1 month ago";
  return `${diffMonths} months ago`;
}
