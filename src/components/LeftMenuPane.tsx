import React, { useState } from "react";
import type {
  CockpitTabId,
  CoffeeTabConfig,
  SteamTabConfig,
  WaterTabConfig,
  MaintenanceTabConfig,
} from "../types/cockpitTabs.ts";
import type { PantaBean } from "../types/bean.ts";
import { formatVarietals, calculateRestDays } from "../types/bean.ts";
import {
  Coffee,
  Wind,
  Droplets,
  Wrench,
  ChevronRight,
  BookOpen,
  Sliders,
  History,
  FolderArchive,
  Plus,
  Minus,
  Snowflake,
  Sun,
  Pencil,
  Check,
  Settings as SettingsIcon,
  Zap,
} from "lucide-react";
import type { ActiveEquipmentSelection } from "../types/equipment.ts";
import { formatEquipmentSummary, loadEquipmentInventory } from "../types/equipment.ts";

interface LeftMenuPaneProps {
  activeTab: CockpitTabId;
  onTabChange: (tab: CockpitTabId) => void;
  coffeeConfig: CoffeeTabConfig;
  onCoffeeConfigChange: (newConfig: CoffeeTabConfig) => void;
  steamConfig: SteamTabConfig;
  onSteamConfigChange: (newConfig: SteamTabConfig) => void;
  waterConfig: WaterTabConfig;
  onWaterConfigChange: (newConfig: WaterTabConfig) => void;
  maintenanceConfig: MaintenanceTabConfig;
  onMaintenanceConfigChange: (newConfig: MaintenanceTabConfig) => void;
  activeBean?: PantaBean;
  activeProfileTitle: string;
  onOpenBeanDrawer: () => void;
  onOpenProfileDrawer: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  onTriggerFlush: () => void;
  activeEquipment?: ActiveEquipmentSelection;
  onOpenEquipmentSelection?: () => void;
  onOpenSettingsEquipment?: () => void;
  activeSection?: "graph" | "beans" | "profiles" | "equipment" | "history";
}

export const LeftMenuPane: React.FC<LeftMenuPaneProps> = ({
  activeTab,
  onTabChange,
  coffeeConfig,
  onCoffeeConfigChange,
  steamConfig,
  onSteamConfigChange,
  waterConfig,
  onWaterConfigChange,
  maintenanceConfig,
  onMaintenanceConfigChange,
  activeBean,
  activeProfileTitle,
  onOpenBeanDrawer,
  onOpenProfileDrawer,
  onOpenHistory,
  onOpenSettings,
  onTriggerFlush,
  activeEquipment,
  onOpenEquipmentSelection,
  onOpenSettingsEquipment,
  activeSection = "graph",
}) => {
  const equipmentInv = loadEquipmentInventory();
  const rest = activeBean ? calculateRestDays(activeBean, new Date(), equipmentInv.freezers) : null;

  // Steam Temp Presets
  const [steamTempPresets, setSteamTempPresets] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem("pantarhei_steam_temp_presets");
      if (saved) return JSON.parse(saved);
    } catch {}
    return [145, 150, 155, 160];
  });
  const [isEditingSteamPresets, setIsEditingSteamPresets] = useState(false);

  const handleAddSteamTemp = () => {
    if (!steamTempPresets.includes(steamConfig.temperature)) {
      const updated = [...steamTempPresets, steamConfig.temperature].sort((a, b) => a - b);
      setSteamTempPresets(updated);
      try {
        localStorage.setItem("pantarhei_steam_temp_presets", JSON.stringify(updated));
      } catch {}
    }
  };

  const handleRemoveSteamTemp = (temp: number) => {
    const updated = steamTempPresets.filter((t) => t !== temp);
    setSteamTempPresets(updated);
    try {
      localStorage.setItem("pantarhei_steam_temp_presets", JSON.stringify(updated));
    } catch {}
  };

  // Water Temp Presets
  const [waterTempPresets, setWaterTempPresets] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem("pantarhei_water_temp_presets");
      if (saved) return JSON.parse(saved);
    } catch {}
    return [75, 80, 85, 90, 95];
  });
  const [isEditingWaterTempPresets, setIsEditingWaterTempPresets] = useState(false);

  const handleAddWaterTemp = () => {
    if (!waterTempPresets.includes(waterConfig.temperature)) {
      const updated = [...waterTempPresets, waterConfig.temperature].sort((a, b) => a - b);
      setWaterTempPresets(updated);
      try {
        localStorage.setItem("pantarhei_water_temp_presets", JSON.stringify(updated));
      } catch {}
    }
  };

  const handleRemoveWaterTemp = (temp: number) => {
    const updated = waterTempPresets.filter((t) => t !== temp);
    setWaterTempPresets(updated);
    try {
      localStorage.setItem("pantarhei_water_temp_presets", JSON.stringify(updated));
    } catch {}
  };

  // Water Vol Presets
  const [waterVolPresets, setWaterVolPresets] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem("pantarhei_water_vol_presets");
      if (saved) return JSON.parse(saved);
    } catch {}
    return [60, 120, 180, 250, 350];
  });
  const [isEditingWaterVolPresets, setIsEditingWaterVolPresets] = useState(false);

  const handleAddWaterVol = () => {
    if (!waterVolPresets.includes(waterConfig.volumeMl)) {
      const updated = [...waterVolPresets, waterConfig.volumeMl].sort((a, b) => a - b);
      setWaterVolPresets(updated);
      try {
        localStorage.setItem("pantarhei_water_vol_presets", JSON.stringify(updated));
      } catch {}
    }
  };

  const handleRemoveWaterVol = (vol: number) => {
    const updated = waterVolPresets.filter((v) => v !== vol);
    setWaterVolPresets(updated);
    try {
      localStorage.setItem("pantarhei_water_vol_presets", JSON.stringify(updated));
    } catch {}
  };

  // Micro-stepper helpers
  const stepDose = (delta: number) => {
    const nextDose = Math.max(10.0, Math.min(26.0, Math.round((coffeeConfig.dose + delta) * 10) / 10));
    const ratio = (coffeeConfig.targetYield / nextDose).toFixed(1);
    onCoffeeConfigChange({
      ...coffeeConfig,
      dose: nextDose,
      ratioText: `1:${ratio}`,
    });
  };

  const stepYield = (delta: number) => {
    const nextYield = Math.max(15.0, Math.min(100.0, Math.round((coffeeConfig.targetYield + delta) * 10) / 10));
    const ratio = (nextYield / coffeeConfig.dose).toFixed(1);
    onCoffeeConfigChange({
      ...coffeeConfig,
      targetYield: nextYield,
      ratioText: `1:${ratio}`,
    });
  };

  return (
    <aside className="w-[270px] sm:w-[290px] lg:w-[330px] xl:w-[370px] shrink-0 h-full flex flex-col bg-slate-950 border-r border-slate-700/80 p-2 lg:p-3.5 select-none z-20 shadow-xl overflow-hidden">
      {/* 1. Top 4 Operational Tabs */}
      <div className="shrink-0 mb-2">
        <div className="grid grid-cols-[1fr_1fr_1fr_1.2fr] gap-1 p-1 bg-slate-900 rounded-xl border border-slate-700/80 shadow-inner">
          <button
            type="button"
            onClick={() => onTabChange("coffee")}
            className={`flex items-center justify-center py-2 px-1 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer ${
              activeTab === "coffee"
                ? "bg-amber-400 text-slate-950 font-black shadow-md border border-amber-300"
                : "text-slate-200 hover:text-white hover:bg-slate-800/60 font-semibold"
            }`}
          >
            <Coffee className={`w-4 h-4 mr-1 shrink-0 ${activeTab === "coffee" ? "text-slate-950 stroke-[2.5]" : "text-amber-400"}`} />
            <span>Coffee</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange("steam")}
            className={`flex items-center justify-center py-2 px-1 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer ${
              activeTab === "steam"
                ? "bg-amber-400 text-slate-950 font-black shadow-md border border-amber-300"
                : "text-slate-200 hover:text-white hover:bg-slate-800/60 font-semibold"
            }`}
          >
            <Wind className={`w-4 h-4 mr-1 shrink-0 ${activeTab === "steam" ? "text-slate-950 stroke-[2.5]" : "text-amber-400"}`} />
            <span>Steam</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange("water")}
            className={`flex items-center justify-center py-2 px-1 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer ${
              activeTab === "water"
                ? "bg-sky-400 text-slate-950 font-black shadow-md border border-sky-300"
                : "text-slate-200 hover:text-white hover:bg-slate-800/60 font-semibold"
            }`}
          >
            <Droplets className={`w-4 h-4 mr-1 shrink-0 ${activeTab === "water" ? "text-slate-950 stroke-[2.5]" : "text-sky-400"}`} />
            <span>Water</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange("maintenance")}
            className={`flex items-center justify-center py-2 px-1 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer ${
              activeTab === "maintenance"
                ? "bg-emerald-400 text-slate-950 font-black shadow-md border border-emerald-300"
                : "text-slate-200 hover:text-white hover:bg-slate-800/60 font-semibold"
            }`}
          >
            <Wrench className={`w-4 h-4 mr-1 shrink-0 ${activeTab === "maintenance" ? "text-slate-950 stroke-[2.5]" : "text-emerald-400"}`} />
            <span>Clean</span>
          </button>
        </div>
      </div>

      {/* 2. Scrollable Middle Content Section */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-0.5">
        {activeTab === "coffee" && (
          <div className="space-y-2">
            {/* Active Coffee Card (or prompt to add/select) */}
            {activeBean ? (
              <div
                onClick={onOpenBeanDrawer}
                className="p-2.5 lg:p-3.5 rounded-xl bg-decent-card border border-decent-border/60 hover:border-amber-500/50 cursor-pointer transition-all duration-200 shadow-sm"
              >
                <div className="flex items-center justify-between text-xs text-amber-400 font-semibold mb-1">
                  <span className="truncate">{activeBean.roaster}</span>
                  {rest && (
                    <div className="flex items-center space-x-1.5 text-[10px] px-2 py-0.5 rounded-full bg-decent-dark border border-decent-border shrink-0">
                      <span className="font-mono text-slate-300 font-medium">{rest.roastAgeText}</span>
                      <span className="text-decent-muted">·</span>
                      <span className={`flex items-center font-semibold ${activeBean.isFrozen ? "text-cyan-400" : "text-amber-300"}`}>
                        {activeBean.isFrozen ? (
                          <Snowflake className="w-2.5 h-2.5 mr-0.5 text-cyan-400" />
                        ) : (
                          <Sun className="w-2.5 h-2.5 mr-0.5 text-amber-400" />
                        )}
                        <span>{rest.storageLabel}</span>
                      </span>
                    </div>
                  )}
                </div>
                <div className="text-sm lg:text-base font-bold text-white truncate flex items-center justify-between">
                  <span className="truncate">{activeBean.name}</span>
                  <ChevronRight className="w-4 h-4 text-decent-muted shrink-0" />
                </div>
                <div className="text-xs text-decent-muted mt-0.5 truncate">
                  {formatVarietals(activeBean.varietal)}{activeBean.process ? ` · ${activeBean.process}` : ""}
                </div>
                {activeBean.isFrozen && rest && (
                  <div className="flex items-center flex-wrap gap-1.5 mt-2 pt-2 border-t border-decent-border/50">
                    {rest.freezerAgeText && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950/40 border border-cyan-500/40 font-mono text-cyan-300 font-medium flex items-center space-x-1">
                        <Snowflake className="w-2.5 h-2.5 text-cyan-400" />
                        <span>{rest.freezerAgeText}</span>
                      </span>
                    )}
                    {rest.actualAgeText && (
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/40 border border-emerald-500/40 font-mono text-emerald-300 font-bold flex items-center space-x-1"
                        title="Physiological aging based on storage conditions and temperature slowdown factor"
                      >
                        <Zap className="w-2.5 h-2.5 text-emerald-400" />
                        <span>~{rest.actualAgeText}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div
                onClick={onOpenBeanDrawer}
                className="p-2.5 lg:p-3 rounded-xl bg-decent-card/60 hover:bg-decent-card border border-dashed border-decent-border/70 hover:border-amber-400/60 cursor-pointer transition-all duration-200 shadow-sm group"
              >
                <div className="flex items-center justify-between text-xs text-amber-400 font-semibold mb-0.5">
                  <span>Coffee Beans</span>
                  <Plus className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
                </div>
                <div className="text-sm lg:text-base font-bold text-slate-200 group-hover:text-white flex items-center justify-between">
                  <span>Select or Add Bean</span>
                  <ChevronRight className="w-4 h-4 text-decent-muted shrink-0" />
                </div>
                <div className="text-[11px] text-decent-muted mt-0.5">
                  Tap to choose coffee, dose & grind presets
                </div>
              </div>
            )}

            {/* Dose Stepper */}
            <div className="p-3 rounded-xl bg-decent-card border border-decent-border/60 flex items-center justify-between">
              <div>
                <span className="text-xs text-decent-muted uppercase font-medium">Dose</span>
                <div className="text-xl font-bold font-mono text-white mt-0.5">
                  {coffeeConfig.dose.toFixed(1)} <span className="text-xs text-decent-muted font-normal">g</span>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => stepDose(-0.1)}
                  className="w-9 h-9 rounded-lg bg-decent-dark border border-decent-border flex items-center justify-center hover:bg-slate-800 active:scale-95 text-white"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => stepDose(0.1)}
                  className="w-9 h-9 rounded-lg bg-decent-dark border border-decent-border flex items-center justify-center hover:bg-slate-800 active:scale-95 text-white"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Profile Selection Card */}
            <div
              onClick={onOpenProfileDrawer}
              className="p-3.5 rounded-xl bg-decent-card border border-decent-border/60 hover:border-amber-500/50 cursor-pointer transition-all duration-200 shadow-sm"
            >
              <span className="text-xs text-decent-muted uppercase font-medium">Extraction Profile</span>
              <div className="text-sm font-bold text-white truncate mt-1 flex items-center justify-between">
                <span>{activeProfileTitle}</span>
                <ChevronRight className="w-4 h-4 text-decent-muted" />
              </div>
            </div>

            {/* Desired Yield (Target Weight) Stepper */}
            <div className="p-3 rounded-xl bg-decent-card border border-decent-border/60 flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-decent-muted uppercase font-medium">Desired Yield</span>
                  <span className="text-xs text-amber-400 font-mono font-semibold">
                    {coffeeConfig.ratioText}
                  </span>
                </div>
                <div className="text-xl font-bold font-mono text-white mt-0.5">
                  {coffeeConfig.targetYield.toFixed(1)} <span className="text-xs text-decent-muted font-normal">g</span>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => stepYield(-0.1)}
                  className="w-9 h-9 rounded-lg bg-decent-dark border border-decent-border flex items-center justify-center hover:bg-slate-800 active:scale-95 text-white cursor-pointer"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => stepYield(0.1)}
                  className="w-9 h-9 rounded-lg bg-decent-dark border border-decent-border flex items-center justify-center hover:bg-slate-800 active:scale-95 text-white cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Next Shot Equipment & Prep Bubble */}
            <div
              onClick={onOpenEquipmentSelection}
              className="p-3 rounded-xl bg-decent-card border border-decent-border/60 hover:border-amber-500/50 transition-all cursor-pointer group shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5 text-xs text-amber-400 uppercase font-semibold">
                  <Wrench className="w-3.5 h-3.5" />
                  <span>Next Shot Gear & Prep</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onOpenSettingsEquipment) {
                      onOpenSettingsEquipment();
                    } else {
                      onOpenSettings();
                    }
                  }}
                  className="p-1 rounded-md text-decent-muted hover:text-amber-300 hover:bg-decent-dark transition-colors cursor-pointer"
                  title="Configure Equipment Catalog in Settings"
                >
                  <SettingsIcon className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="text-xs font-semibold text-white truncate mt-1 flex items-center justify-between">
                <span className="truncate" title={activeEquipment ? formatEquipmentSummary(activeEquipment) : "No gear selected"}>
                  {activeEquipment ? formatEquipmentSummary(activeEquipment) : "Select gear & puck prep"}
                </span>
                <ChevronRight className="w-4 h-4 text-decent-muted group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all shrink-0 ml-1" />
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Steam Content */}
        {activeTab === "steam" && (
          <div className="space-y-3.5">
            {/* Steam Temperature (Dynamic Presets that wrap to lines below and expand card bubble) */}
            <div className="p-3.5 rounded-xl bg-decent-card border border-decent-border/60 transition-all">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-amber-400 uppercase font-semibold">Steam Temperature</span>
                <span className="text-xl font-bold font-mono text-white">
                  {steamConfig.temperature} <span className="text-xs text-decent-muted font-normal">°C</span>
                </span>
              </div>
              <input
                type="range"
                min="140"
                max="170"
                step="1"
                value={steamConfig.temperature}
                onChange={(e) =>
                  onSteamConfigChange({ ...steamConfig, temperature: parseInt(e.target.value, 10) })
                }
                className="w-full accent-amber-400 h-1.5 rounded bg-decent-dark mt-1.5 mb-2.5 cursor-pointer"
              />

              {/* Dynamic Wrapping Preset Buttons with Add/Remove */}
              <div className="flex flex-wrap gap-1.5 items-center">
                {steamTempPresets.map((temp) => (
                  <div key={temp} className="relative group inline-flex">
                    <button
                      type="button"
                      onClick={() => onSteamConfigChange({ ...steamConfig, temperature: temp })}
                      className={`px-3 py-1 text-[11px] font-semibold rounded-lg border transition-all cursor-pointer ${
                        steamConfig.temperature === temp
                          ? "bg-amber-500/30 text-amber-300 border-amber-400 font-bold"
                          : "bg-decent-dark text-decent-muted border-decent-border hover:border-slate-500"
                      }`}
                    >
                      {temp}°C
                    </button>
                    {isEditingSteamPresets && steamTempPresets.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveSteamTemp(temp);
                        }}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-600 text-white flex items-center justify-center text-[10px] font-bold shadow-md hover:bg-rose-500 cursor-pointer"
                        title="Remove preset"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={handleAddSteamTemp}
                  className="px-2 py-1 text-[10.5px] font-semibold rounded-lg border border-dashed border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-all flex items-center space-x-1 cursor-pointer"
                  title="Add current slider temperature as preset"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add {steamConfig.temperature}°</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsEditingSteamPresets(!isEditingSteamPresets)}
                  className={`p-1 rounded-lg border text-[10px] transition-all cursor-pointer ${
                    isEditingSteamPresets
                      ? "bg-rose-500/20 text-rose-300 border-rose-400"
                      : "bg-decent-dark text-decent-muted border-decent-border hover:text-white"
                  }`}
                  title={isEditingSteamPresets ? "Done editing" : "Edit presets"}
                >
                  {isEditingSteamPresets ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Auto-Purge & Timeout Setting */}
            <div className="p-3.5 rounded-xl bg-decent-card border border-decent-border/60 transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-amber-400 uppercase">Auto-Purge Wand</div>
                  <div className="text-[10px] text-decent-muted mt-0.5">
                    Automatically clears milk residue upon steam finish
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onSteamConfigChange({ ...steamConfig, autoPurge: !steamConfig.autoPurge })
                  }
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                    steamConfig.autoPurge
                      ? "bg-amber-500/30 text-amber-300 border-amber-400"
                      : "bg-decent-dark text-decent-muted border-decent-border"
                  }`}
                >
                  {steamConfig.autoPurge ? "Enabled" : "Disabled"}
                </button>
              </div>

              {steamConfig.autoPurge && (
                <div className="mt-3 pt-2.5 border-t border-decent-border/50 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-decent-muted font-medium">Purge Timeout</span>
                    <span className="font-bold font-mono text-white">
                      {steamConfig.autoPurgeSeconds ?? 3} <span className="text-[10px] text-decent-muted">s</span>
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={steamConfig.autoPurgeSeconds ?? 3}
                    onChange={(e) =>
                      onSteamConfigChange({
                        ...steamConfig,
                        autoPurgeSeconds: parseInt(e.target.value, 10),
                      })
                    }
                    className="w-full accent-amber-400 h-1.5 rounded bg-decent-dark mt-2 cursor-pointer"
                  />
                  <div className="flex items-center justify-between text-[9.5px] font-mono text-decent-muted mt-1">
                    <span>1s (Quick blast)</span>
                    <span>3s</span>
                    <span>10s (Extended)</span>
                  </div>
                </div>
              )}
            </div>

            {/* Steam Flow Rate */}
            <div className="p-3.5 rounded-xl bg-decent-card border border-decent-border/60">
              <div className="flex items-center justify-between">
                <span className="text-xs text-decent-muted uppercase font-medium">Steam Flow Rate</span>
                <span className="text-lg font-bold font-mono text-white">
                  {steamConfig.flowRate.toFixed(1)} <span className="text-xs text-decent-muted font-normal">ml/s</span>
                </span>
              </div>
              <input
                type="range"
                min="0.8"
                max="2.5"
                step="0.1"
                value={steamConfig.flowRate}
                onChange={(e) =>
                  onSteamConfigChange({ ...steamConfig, flowRate: parseFloat(e.target.value) })
                }
                className="w-full accent-amber-400 h-1.5 rounded bg-decent-dark mt-2.5 cursor-pointer"
              />
            </div>

            {/* Steam Duration Cutoff (1 second increments) */}
            <div className="p-3.5 rounded-xl bg-decent-card border border-decent-border/60">
              <div className="flex items-center justify-between">
                <span className="text-xs text-decent-muted uppercase font-medium">Auto-Cutoff Timer</span>
                <span className="text-lg font-bold font-mono text-white">
                  {steamConfig.durationSeconds} <span className="text-xs text-decent-muted font-normal">s</span>
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="90"
                step="1"
                value={steamConfig.durationSeconds}
                onChange={(e) =>
                  onSteamConfigChange({ ...steamConfig, durationSeconds: parseInt(e.target.value, 10) })
                }
                className="w-full accent-amber-400 h-1.5 rounded bg-decent-dark mt-2.5 cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* Tab 3: Water Content */}
        {activeTab === "water" && (
          <div className="space-y-3.5">
            {/* Dispense Temperature (Dynamic Presets that wrap to lines below and expand card bubble) */}
            <div className="p-3.5 rounded-xl bg-decent-card border border-decent-border/60 transition-all">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-sky-400 uppercase font-semibold">Dispense Temperature</span>
                <span className="text-xl font-bold font-mono text-white">
                  {waterConfig.temperature} <span className="text-xs text-decent-muted font-normal">°C</span>
                </span>
              </div>
              <input
                type="range"
                min="70"
                max="98"
                step="1"
                value={waterConfig.temperature}
                onChange={(e) =>
                  onWaterConfigChange({ ...waterConfig, temperature: parseInt(e.target.value, 10) })
                }
                className="w-full accent-sky-400 h-1.5 rounded bg-decent-dark mt-1.5 mb-2.5 cursor-pointer"
              />

              {/* Dynamic Wrapping Preset Buttons with Add/Remove */}
              <div className="flex flex-wrap gap-1.5 items-center">
                {waterTempPresets.map((temp) => (
                  <div key={temp} className="relative group inline-flex">
                    <button
                      type="button"
                      onClick={() => onWaterConfigChange({ ...waterConfig, temperature: temp })}
                      className={`px-3 py-1 text-[11px] font-semibold rounded-lg border transition-all cursor-pointer ${
                        waterConfig.temperature === temp
                          ? "bg-sky-500/30 text-sky-300 border-sky-400 font-bold"
                          : "bg-decent-dark text-decent-muted border-decent-border hover:border-slate-500"
                      }`}
                    >
                      {temp}°C
                    </button>
                    {isEditingWaterTempPresets && waterTempPresets.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveWaterTemp(temp);
                        }}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-600 text-white flex items-center justify-center text-[10px] font-bold shadow-md hover:bg-rose-500 cursor-pointer"
                        title="Remove preset"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={handleAddWaterTemp}
                  className="px-2 py-1 text-[10.5px] font-semibold rounded-lg border border-dashed border-sky-500/50 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 transition-all flex items-center space-x-1 cursor-pointer"
                  title="Add current temperature as preset"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add {waterConfig.temperature}°</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsEditingWaterTempPresets(!isEditingWaterTempPresets)}
                  className={`p-1 rounded-lg border text-[10px] transition-all cursor-pointer ${
                    isEditingWaterTempPresets
                      ? "bg-rose-500/20 text-rose-300 border-rose-400"
                      : "bg-decent-dark text-decent-muted border-decent-border hover:text-white"
                  }`}
                  title={isEditingWaterTempPresets ? "Done editing" : "Edit presets"}
                >
                  {isEditingWaterTempPresets ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Target Volume (1 ml slider increments and dynamic wrapping presets) */}
            <div className="p-3.5 rounded-xl bg-decent-card border border-decent-border/60 transition-all">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-sky-400 uppercase font-semibold">Target Volume</span>
                <span className="text-xl font-bold font-mono text-white">
                  {waterConfig.volumeMl} <span className="text-xs text-decent-muted font-normal">ml</span>
                </span>
              </div>
              <input
                type="range"
                min="30"
                max="450"
                step="1"
                value={waterConfig.volumeMl}
                onChange={(e) =>
                  onWaterConfigChange({ ...waterConfig, volumeMl: parseInt(e.target.value, 10) })
                }
                className="w-full accent-sky-400 h-1.5 rounded bg-decent-dark mt-1.5 mb-2.5 cursor-pointer"
              />

              {/* Dynamic Wrapping Preset Buttons with Add/Remove */}
              <div className="flex flex-wrap gap-1.5 items-center">
                {waterVolPresets.map((vol) => (
                  <div key={vol} className="relative group inline-flex">
                    <button
                      type="button"
                      onClick={() => onWaterConfigChange({ ...waterConfig, volumeMl: vol })}
                      className={`px-3 py-1 text-[11px] font-semibold rounded-lg border transition-all cursor-pointer ${
                        waterConfig.volumeMl === vol
                          ? "bg-sky-500/30 text-sky-300 border-sky-400 font-bold"
                          : "bg-decent-dark text-decent-muted border-decent-border hover:border-slate-500"
                      }`}
                    >
                      {vol}ml
                    </button>
                    {isEditingWaterVolPresets && waterVolPresets.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveWaterVol(vol);
                        }}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-600 text-white flex items-center justify-center text-[10px] font-bold shadow-md hover:bg-rose-500 cursor-pointer"
                        title="Remove preset"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={handleAddWaterVol}
                  className="px-2 py-1 text-[10.5px] font-semibold rounded-lg border border-dashed border-sky-500/50 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 transition-all flex items-center space-x-1 cursor-pointer"
                  title="Add current volume as preset"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add {waterConfig.volumeMl}ml</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsEditingWaterVolPresets(!isEditingWaterVolPresets)}
                  className={`p-1 rounded-lg border text-[10px] transition-all cursor-pointer ${
                    isEditingWaterVolPresets
                      ? "bg-rose-500/20 text-rose-300 border-rose-400"
                      : "bg-decent-dark text-decent-muted border-decent-border hover:text-white"
                  }`}
                  title={isEditingWaterVolPresets ? "Done editing" : "Edit presets"}
                >
                  {isEditingWaterVolPresets ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Water Flow Rate (0.1 ml/s slider increments) */}
            <div className="p-3.5 rounded-xl bg-decent-card border border-decent-border/60">
              <div className="flex items-center justify-between">
                <span className="text-xs text-decent-muted uppercase font-medium">Water Flow Rate</span>
                <span className="text-lg font-bold font-mono text-white">
                  {waterConfig.flowRate.toFixed(1)} <span className="text-xs text-decent-muted font-normal">ml/s</span>
                </span>
              </div>
              <input
                type="range"
                min="1.0"
                max="8.0"
                step="0.1"
                value={waterConfig.flowRate}
                onChange={(e) =>
                  onWaterConfigChange({ ...waterConfig, flowRate: parseFloat(e.target.value) })
                }
                className="w-full accent-sky-400 h-1.5 rounded bg-decent-dark mt-2.5 cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* Tab 4: Maintenance Content */}
        {activeTab === "maintenance" && (
          <div className="space-y-3">
            <div className="p-3.5 rounded-xl bg-decent-card border border-decent-border/60 flex items-center justify-between">
              <div>
                <span className="text-xs text-emerald-400 font-semibold uppercase">Shower Screen Flush</span>
                <div className="text-sm font-bold text-white mt-0.5">
                  {maintenanceConfig.flushDurationSeconds}s Flush ({maintenanceConfig.flushVolumeMl}ml)
                </div>
              </div>
              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onMaintenanceConfigChange({
                      ...maintenanceConfig,
                      flushDurationSeconds: Math.max(1, maintenanceConfig.flushDurationSeconds - 1),
                    })
                  }
                  className="w-7 h-7 rounded-lg bg-decent-dark border border-decent-border flex items-center justify-center text-decent-muted hover:text-white"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onMaintenanceConfigChange({
                      ...maintenanceConfig,
                      flushDurationSeconds: Math.min(10, maintenanceConfig.flushDurationSeconds + 1),
                    })
                  }
                  className="w-7 h-7 rounded-lg bg-decent-dark border border-decent-border flex items-center justify-center text-decent-muted hover:text-white"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={onTriggerFlush}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs active:scale-95 transition-all ml-1"
                >
                  Flush
                </button>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-decent-card border border-decent-border/60">
              <span className="text-xs text-decent-muted font-semibold uppercase">Cleaning Cycle</span>
              <div className="text-sm font-bold text-white mt-1">
                {maintenanceConfig.preferredCleaningProfileId || "Cleaning Forward Flush"}
              </div>
              <button
                type="button"
                className="w-full mt-2.5 py-2 rounded-lg bg-decent-dark border border-decent-border text-xs font-semibold text-decent-text hover:text-white"
              >
                Run Backflush Routine
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-decent-card border border-decent-border/60">
              <span className="text-xs text-decent-muted font-semibold uppercase">Transport Mode</span>
              <p className="text-[11px] text-decent-muted mt-1">
                Completely drains thermoblocks & boilers for winter transit or storage.
              </p>
              <button
                type="button"
                className="w-full mt-2 py-1.5 rounded-lg bg-red-950/40 border border-red-800/40 text-xs font-semibold text-red-400 hover:bg-red-900/40"
              >
                Drain & Arm Transport
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Bottom Navigation Shortcuts */}
      <div className="shrink-0 mt-auto pt-2 lg:pt-2.5 border-t border-slate-700/80 grid grid-cols-4 gap-1.5">
        <button
          type="button"
          onClick={onOpenBeanDrawer}
          className={`flex flex-col items-center justify-center py-2 lg:py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-sm ${
            activeSection === "beans"
              ? "bg-amber-400 text-slate-950 border-amber-300 font-black shadow-md"
              : "bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200 hover:text-white"
          }`}
          title="Toggle Coffee Beans in Main View"
        >
          <FolderArchive className={`w-4 h-4 mb-0.5 shrink-0 ${activeSection === "beans" ? "text-slate-950" : "text-amber-400"}`} />
          <span>Beans</span>
        </button>
        <button
          type="button"
          onClick={onOpenProfileDrawer}
          className={`flex flex-col items-center justify-center py-2 lg:py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-sm ${
            activeSection === "profiles"
              ? "bg-sky-400 text-slate-950 border-sky-300 font-black shadow-md"
              : "bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200 hover:text-white"
          }`}
          title="Toggle Extraction Profiles in Main View"
        >
          <BookOpen className={`w-4 h-4 mb-0.5 shrink-0 ${activeSection === "profiles" ? "text-slate-950" : "text-sky-400"}`} />
          <span>Profiles</span>
        </button>
        <button
          type="button"
          onClick={onOpenHistory}
          className={`flex flex-col items-center justify-center py-2 lg:py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-sm ${
            activeSection === "history"
              ? "bg-emerald-400 text-slate-950 border-emerald-300 font-black shadow-md"
              : "bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200 hover:text-white"
          }`}
          title="Toggle Shot History in Main View"
        >
          <History className={`w-4 h-4 mb-0.5 shrink-0 ${activeSection === "history" ? "text-slate-950" : "text-emerald-400"}`} />
          <span>History</span>
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex flex-col items-center justify-center py-2 lg:py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 hover:text-white text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-sm"
          title="Open Settings"
        >
          <Sliders className="w-4 h-4 mb-0.5 text-purple-400 shrink-0" />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
};
