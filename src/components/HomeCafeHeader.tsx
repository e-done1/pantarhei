import React from "react";
import type { CafeHeaderConfig } from "../types/header.ts";
import { calculateHeaderFit } from "../services/headerFit.ts";
import { Paintbrush } from "lucide-react";

interface HomeCafeHeaderProps {
  config: CafeHeaderConfig;
  onOpenSettings?: () => void;
}

export const HomeCafeHeader: React.FC<HomeCafeHeaderProps> = ({ config, onOpenSettings }) => {
  if (!config.enabled || !config.text.trim()) {
    return null;
  }

  const fit = calculateHeaderFit(config);

  return (
    <header
      onClick={onOpenSettings}
      className={`w-full flex items-center justify-center transition-all duration-300 border-b border-decent-border/40 bg-decent-surface/40 backdrop-blur-sm px-4 group relative ${
        onOpenSettings ? "cursor-pointer hover:bg-decent-surface/60" : ""
      }`}
      style={{
        height: `${fit.stripeHeight}px`,
        maxHeight: `${fit.maxAllowedHeight}px`,
      }}
      title={onOpenSettings ? "Click to customize home cafe title, font and colors" : undefined}
    >
      <div className="flex flex-col items-center justify-center leading-tight">
        <h1
          className="font-bold tracking-wider transition-all duration-200 truncate select-none text-center"
          style={{
            fontFamily: config.fontFamily || "inherit",
            fontSize: `${fit.actualFontSize}px`,
            color: config.color || "#f8fafc",
            letterSpacing: `${config.letterSpacing || 2}px`,
            textShadow: "0 2px 8px rgba(0,0,0,0.4)",
          }}
        >
          {config.text}
        </h1>
        {config.subtitleText && (
          <span
            className="tracking-widest uppercase mt-0.5 select-none font-medium"
            style={{
              fontSize: `${Math.max(10, Math.round(fit.actualFontSize * 0.52))}px`,
              color: config.subtitleColor || "#94a3b8",
            }}
          >
            {config.subtitleText}
          </span>
        )}
      </div>

      {onOpenSettings && (
        <div className="absolute right-4 opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-1 text-xs text-decent-muted">
          <Paintbrush className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[11px] text-amber-300">Edit Title & Colors</span>
        </div>
      )}
    </header>
  );
};
