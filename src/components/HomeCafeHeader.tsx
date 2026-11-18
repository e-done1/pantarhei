import React from "react";
import type { CafeHeaderConfig } from "../types/header.ts";
import type { MaintenanceStatus } from "../types/maintenance.ts";
import { calculateHeaderFit } from "../services/headerFit.ts";
import { DigitalClock } from "./DigitalClock.tsx";
import { Paintbrush, Wrench, Play } from "lucide-react";

interface HomeCafeHeaderProps {
  config: CafeHeaderConfig;
  onOpenSettings?: () => void;
  clockPaletteId?: string;
  hasUpdateAvailable?: boolean;
  onOpenUpdates?: () => void;
  maintenanceStatus?: MaintenanceStatus;
  onNavigateToMaintenance?: (type: "cleaning" | "descale" | "both" | "none") => void;
  isMachineConnected?: boolean;
  isSimulatorMode?: boolean;
  onOpenPairing?: () => void;
  onStartAction?: () => void;
  isExtracting?: boolean;
}

export const HomeCafeHeader: React.FC<HomeCafeHeaderProps> = ({
  config,
  onOpenSettings,
  clockPaletteId,
  hasUpdateAvailable = false,
  onOpenUpdates,
  maintenanceStatus,
  onNavigateToMaintenance,
  isMachineConnected = false,
  isSimulatorMode = false,
  onOpenPairing,
  onStartAction,
  isExtracting = false,
}) => {
  const isCompactHeight = typeof window !== "undefined" && window.innerHeight < 650;
  const fit = calculateHeaderFit(config, {
    maxHeight: isCompactHeight ? 44 : 52,
  });

  const hasCafeTitle = config.enabled && Boolean(config.text && config.text.trim());
  const headerHeight = hasCafeTitle ? Math.max(44, fit.stripeHeight) : 44;

  return (
    <header
      className="w-full flex items-center justify-between transition-all duration-300 border-b border-slate-700/80 bg-slate-950 px-3 lg:px-5 relative select-none shrink-0 shadow-lg"
      style={{
        height: `${headerHeight}px`,
        maxHeight: `${Math.max(52, fit.maxAllowedHeight)}px`,
      }}
    >
      {/* 1. Left Corner: Compact Digital Clock */}
      <div className="flex items-center shrink-0 z-20">
        <DigitalClock paletteId={clockPaletteId} compact />
      </div>

      {/* 2. Center: Customizable Cafe Title & Subtitle */}
      {hasCafeTitle ? (
        <div
          onClick={onOpenSettings}
          className={`flex-1 min-w-0 flex flex-col items-center justify-center leading-tight px-2 text-center group ${
            onOpenSettings ? "cursor-pointer hover:opacity-90" : ""
          }`}
          title={onOpenSettings ? "Click to customize home cafe title, font and colors" : undefined}
        >
          <h1
            className="font-bold tracking-wider transition-all duration-200 truncate select-none text-center max-w-full"
            style={{
              fontFamily: config.fontFamily || "inherit",
              fontSize: `${Math.min(fit.actualFontSize, 18)}px`,
              color: config.color || "#f8fafc",
              letterSpacing: `${config.letterSpacing || 1.5}px`,
              textShadow: "0 2px 8px rgba(0,0,0,0.4)",
            }}
          >
            {config.text}
          </h1>
          {config.subtitleText && (
            <span
              className="tracking-widest uppercase select-none font-medium truncate max-w-full mt-0.5"
              style={{
                fontSize: `${Math.max(8.5, Math.round(fit.actualFontSize * 0.45))}px`,
                color: config.subtitleColor || "#94a3b8",
              }}
            >
              {config.subtitleText}
            </span>
          )}
        </div>
      ) : (
        <div className="flex-1 min-w-0" />
      )}

      {/* 3. Right Corner: Action Buttons in a line based on relevance */}
      <div className="flex items-center space-x-1 sm:space-x-1.5 shrink-0 z-20">
        {/* Cleaning Due Alert Button */}
        {maintenanceStatus?.isCleaningDue && (
          <button
            type="button"
            onClick={() => onNavigateToMaintenance?.("cleaning")}
            className="px-2 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 border-2 border-rose-500 text-rose-300 hover:text-rose-100 text-xs font-bold flex items-center space-x-1 transition-all cursor-pointer shadow-md active:scale-95"
            title={maintenanceStatus.tooltipText || "Group head cleaning overdue. Click to run cleaning routine."}
          >
            <Wrench className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span className="hidden md:inline">Clean Head</span>
            <span className="md:hidden">Clean</span>
          </button>
        )}

        {/* Descale Due Alert Button */}
        {maintenanceStatus?.isDescaleDue && (
          <button
            type="button"
            onClick={() => onNavigateToMaintenance?.("descale")}
            className="px-2 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 border-2 border-amber-500 text-amber-300 hover:text-amber-100 text-xs font-bold flex items-center space-x-1 transition-all cursor-pointer shadow-md active:scale-95"
            title={maintenanceStatus.tooltipText || "Machine descaling overdue. Click to run descaling routine."}
          >
            <Wrench className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="hidden md:inline">Descale Due</span>
            <span className="md:hidden">Descale</span>
          </button>
        )}

        {/* Update Available Indicator Button (High Contrast, No Blinking) */}
        {hasUpdateAvailable && (
          <button
            type="button"
            onClick={onOpenUpdates}
            className="px-2 sm:px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 border-2 border-amber-400 text-amber-300 hover:text-white text-xs font-bold flex items-center space-x-1 transition-all cursor-pointer shadow-md active:scale-95"
            title="Software or firmware updates are available. Click to open updates."
          >
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0 shadow-[0_0_8px_#f59e0b]" />
            <span className="hidden sm:inline font-extrabold tracking-wide">Update Available</span>
            <span className="sm:hidden font-extrabold tracking-wide">Update</span>
          </button>
        )}

        {/* Simulator Brew Trigger / Go Button */}
        {onStartAction && !isExtracting && (
          <button
            type="button"
            onClick={onStartAction}
            className="px-2.5 sm:px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-xs flex items-center space-x-1 shadow-md active:scale-95 transition-all border border-emerald-300 cursor-pointer"
            title={isSimulatorMode ? "Start simulated extraction (Simulator Mode)" : "Start Extraction (Brew)"}
          >
            <Play className="w-3.5 h-3.5 fill-current text-slate-950" />
            <span className="hidden sm:inline">{isSimulatorMode ? "Simulate Shot" : "Go!"}</span>
            <span className="sm:hidden">Go!</span>
          </button>
        )}

        {/* Machine Pairing / Connection Status Indicator (High Contrast: White on Slate-900) */}
        {!isMachineConnected && !isSimulatorMode && (
          <button
            type="button"
            onClick={onOpenPairing}
            className="px-2.5 sm:px-3 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 border-2 border-amber-500 text-white text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer shadow-md active:scale-95"
            title="Machine disconnected. Click to open connection and pair."
          >
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0 shadow-[0_0_8px_#f59e0b]" />
            <span className="hidden md:inline text-white font-extrabold tracking-wide">Disconnected · Tap to Pair</span>
            <span className="md:hidden text-white font-extrabold tracking-wide">Pair DE1</span>
          </button>
        )}

        {isSimulatorMode && (
          <button
            type="button"
            onClick={onOpenPairing}
            className="px-2 py-0.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-sky-400 text-sky-300 text-[11px] font-mono flex items-center space-x-1 cursor-pointer transition-all"
            title="Running in local simulator mode. Click to open connection settings."
          >
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse"></span>
            <span className="font-bold">Simulator</span>
          </button>
        )}

        {/* Appearance Customizer Icon */}
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="p-1.5 rounded-lg text-decent-muted hover:text-white hover:bg-decent-card/50 transition-colors cursor-pointer"
            title="Customize Home Cafe Header & Appearance"
          >
            <Paintbrush className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </header>
  );
};
