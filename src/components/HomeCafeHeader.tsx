import React from "react";
import type { CafeHeaderConfig } from "../types/header.ts";
import type { MaintenanceStatus } from "../types/maintenance.ts";
import { calculateHeaderFit } from "../services/headerFit.ts";
import { DigitalClock } from "./DigitalClock.tsx";
import { Paintbrush, Sparkles, Wrench, Play, WifiOff } from "lucide-react";

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
      className="w-full flex items-center justify-between transition-all duration-300 border-b border-decent-border/40 bg-decent-surface/40 backdrop-blur-sm px-3 lg:px-5 relative select-none shrink-0"
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
              fontSize: `${Math.min(fit.actualFontSize, 22)}px`,
              color: config.color || "#f8fafc",
              letterSpacing: `${config.letterSpacing || 2}px`,
              textShadow: "0 2px 8px rgba(0,0,0,0.4)",
            }}
          >
            {config.text}
          </h1>
          {config.subtitleText && (
            <span
              className="tracking-widest uppercase select-none font-medium truncate max-w-full mt-0.5"
              style={{
                fontSize: `${Math.max(9, Math.round(fit.actualFontSize * 0.48))}px`,
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
      <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0 z-20">
        {/* Cleaning Due Alert Button */}
        {maintenanceStatus?.isCleaningDue && (
          <button
            type="button"
            onClick={() => onNavigateToMaintenance?.("cleaning")}
            className="px-2.5 py-1 rounded-xl bg-gradient-to-r from-rose-500/25 via-amber-500/20 to-rose-500/25 hover:from-rose-500/35 hover:to-amber-500/35 border border-rose-400/60 hover:border-rose-300 text-rose-300 hover:text-rose-100 text-[11px] sm:text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer shadow-md active:scale-95 animate-pulse"
            title={maintenanceStatus.tooltipText || "Group head cleaning overdue. Click to run cleaning routine."}
          >
            <Wrench className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span className="hidden sm:inline">Clean Head</span>
            <span className="sm:hidden">Clean</span>
          </button>
        )}

        {/* Descale Due Alert Button */}
        {maintenanceStatus?.isDescaleDue && (
          <button
            type="button"
            onClick={() => onNavigateToMaintenance?.("descale")}
            className="px-2.5 py-1 rounded-xl bg-gradient-to-r from-amber-500/25 via-rose-500/20 to-amber-500/25 hover:from-amber-500/35 hover:to-rose-500/35 border border-amber-400/60 hover:border-amber-300 text-amber-300 hover:text-amber-100 text-[11px] sm:text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer shadow-md active:scale-95 animate-pulse"
            title={maintenanceStatus.tooltipText || "Machine descaling overdue. Click to run descaling routine."}
          >
            <Wrench className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="hidden sm:inline">Descale Due</span>
            <span className="sm:hidden">Descale</span>
          </button>
        )}

        {/* Update Available Indicator Button */}
        {hasUpdateAvailable && (
          <button
            type="button"
            onClick={onOpenUpdates}
            className="px-2.5 py-1 rounded-xl bg-gradient-to-r from-amber-500/20 via-sky-500/20 to-amber-500/20 hover:from-amber-500/30 hover:to-sky-500/30 border border-amber-400/60 hover:border-amber-300 text-amber-300 hover:text-amber-100 text-[11px] sm:text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer shadow-md active:scale-95 animate-pulse"
            title="Software or firmware updates are available. Click to open updates."
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="hidden sm:inline">Update Available</span>
            <span className="sm:hidden">Update</span>
          </button>
        )}

        {/* Simulator Brew Trigger / Go Button */}
        {onStartAction && !isExtracting && (
          <button
            type="button"
            onClick={onStartAction}
            className="px-3 py-1 rounded-xl bg-gradient-to-r from-emerald-600/90 to-teal-600/90 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-[11px] sm:text-xs flex items-center space-x-1.5 shadow-md active:scale-95 transition-all border border-emerald-400/50 cursor-pointer"
            title={isSimulatorMode ? "Start simulated extraction (Simulator Mode)" : "Start Extraction (Brew)"}
          >
            <Play className="w-3 h-3 fill-current" />
            <span>{isSimulatorMode ? "Simulate Shot" : "Go!"}</span>
          </button>
        )}

        {/* Machine Pairing / Connection Status Indicator */}
        {!isMachineConnected && !isSimulatorMode && (
          <button
            type="button"
            onClick={onOpenPairing}
            className="px-2.5 py-1 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 hover:text-amber-100 text-[11px] sm:text-xs font-medium flex items-center space-x-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
            title="Machine disconnected. Click to open connection and pair."
          >
            <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="hidden md:inline">Disconnected · Tap to Pair</span>
            <span className="md:hidden">Pair DE1</span>
          </button>
        )}

        {isSimulatorMode && (
          <button
            type="button"
            onClick={onOpenPairing}
            className="px-2 py-0.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 text-sky-300 text-[10px] font-mono flex items-center space-x-1 cursor-pointer transition-all"
            title="Running in local simulator mode. Click to open connection settings."
          >
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse"></span>
            <span>Simulator</span>
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
