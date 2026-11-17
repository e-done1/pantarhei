import React, { useState, useEffect } from "react";
import type { GoButtonViewModel } from "../types/cockpitTabs.ts";
import { Coffee, Wind, Droplets, Wrench, Wifi } from "lucide-react";

interface RaceGoButtonProps {
  viewModel: GoButtonViewModel;
  isExtracting: boolean;
  shotStartTime: number; // timestamp in ms when extraction started
  onStart: () => void;
  onStop: () => void;
  onOpenPairing?: () => void;
}

export const RaceGoButton: React.FC<RaceGoButtonProps> = ({
  viewModel,
  isExtracting,
  shotStartTime,
  onStart,
  onStop,
  onOpenPairing,
}) => {
  const [isStopArmed, setIsStopArmed] = useState(false);
  const [countdownRemaining, setCountdownRemaining] = useState(0);

  // Safety Window: 2.0-second delay after Go tap before STOP becomes armed
  // Strictly isolates stop trigger to this button face only (no accidental screen tap aborts)
  useEffect(() => {
    if (!isExtracting) {
      setIsStopArmed(false);
      setCountdownRemaining(0);
      return;
    }

    const checkArming = () => {
      const elapsed = Date.now() - shotStartTime;
      const remaining = Math.max(0, 2000 - elapsed);
      setCountdownRemaining(Math.ceil(remaining / 1000));

      if (elapsed >= 2000) {
        setIsStopArmed(true);
      } else {
        setIsStopArmed(false);
      }
    };

    checkArming();
    const interval = setInterval(checkArming, 100);
    return () => clearInterval(interval);
  }, [isExtracting, shotStartTime]);

  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Stop propagation to prevent accidental parent triggers
    if (isExtracting) {
      if (isStopArmed) {
        onStop();
      }
      return;
    }

    if (viewModel.isReady) {
      onStart();
    }
  };

  // 1. Extraction Active Mode: Dedicated Stop Button
  if (isExtracting) {
    return (
      <div className="flex flex-col items-center justify-center select-none">
        <button
          type="button"
          disabled={!isStopArmed}
          onClick={handleButtonClick}
          className={`relative group w-36 h-36 rounded-full flex flex-col items-center justify-center transition-all duration-300 transform active:scale-95 shadow-2xl border-4 ${
            isStopArmed
              ? "bg-gradient-to-b from-red-600 to-red-800 border-red-400 text-white animate-race-stop cursor-pointer"
              : "bg-red-950/70 border-red-800/60 text-red-300/60 cursor-not-allowed opacity-80"
          }`}
          style={{
            boxShadow: isStopArmed
              ? "0 0 35px rgba(239, 68, 68, 0.8), inset 0 0 15px rgba(255, 255, 255, 0.4)"
              : "none",
          }}
        >
          {/* Inner tactile bezel */}
          <div className="w-28 h-28 rounded-full border border-white/20 flex flex-col items-center justify-center bg-black/20">
            <span className="font-extrabold tracking-widest text-2xl uppercase">
              {isStopArmed ? "STOP" : `ARMING`}
            </span>
            <span className="text-[11px] font-semibold tracking-wider opacity-90 mt-0.5">
              {isStopArmed ? "ABORT SHOT" : `${countdownRemaining}s delay`}
            </span>
          </div>
        </button>
        <span className="mt-3 text-xs font-medium text-red-400/90 tracking-wide">
          {isStopArmed ? "Tap STOP to finish" : "Safety 2s delay armed"}
        </span>
      </div>
    );
  }

  // 2. Ready / Idle Mode: Contextual Race Go Button
  const haloClass =
    viewModel.haloColor === "neon-green"
      ? "animate-race-green"
      : viewModel.haloColor === "amber-glow"
      ? "animate-race-amber"
      : viewModel.haloColor === "cyan-blue"
      ? "animate-race-blue"
      : "";

  const buttonGradient =
    !viewModel.isReady
      ? "from-slate-800 to-slate-900 border-slate-700 text-slate-500"
      : viewModel.haloColor === "neon-green"
      ? "from-emerald-500 to-emerald-700 border-emerald-300 text-white"
      : viewModel.haloColor === "amber-glow"
      ? "from-amber-500 to-amber-700 border-amber-300 text-white"
      : "from-sky-500 to-sky-700 border-sky-300 text-white";

  return (
    <div className="flex flex-col items-center justify-center select-none">
      <button
        type="button"
        disabled={!viewModel.isReady}
        onClick={handleButtonClick}
        className={`relative group w-36 h-36 rounded-full flex flex-col items-center justify-center transition-all duration-300 transform ${
          viewModel.isReady
            ? `active:scale-95 shadow-2xl border-4 ${haloClass} cursor-pointer`
            : "cursor-not-allowed opacity-40 border-4 border-slate-700"
        } bg-gradient-to-b ${buttonGradient}`}
      >
        {/* Metallic Bezel Ring */}
        <div className="w-28 h-28 rounded-full border border-white/30 flex flex-col items-center justify-center bg-black/20 shadow-inner">
          {/* Operation Icon */}
          {viewModel.actionType === "espresso" && (
            <Coffee className="w-5 h-5 mb-0.5 opacity-90 drop-shadow" />
          )}
          {viewModel.actionType === "steam" && (
            <Wind className="w-5 h-5 mb-0.5 opacity-90 drop-shadow" />
          )}
          {viewModel.actionType === "water" && (
            <Droplets className="w-5 h-5 mb-0.5 opacity-90 drop-shadow" />
          )}
          {viewModel.actionType === "flush" && (
            <Wrench className="w-5 h-5 mb-0.5 opacity-90 drop-shadow" />
          )}

          <span className="font-extrabold tracking-widest text-3xl uppercase leading-none my-0.5">
            {viewModel.label}
          </span>
          {viewModel.subLabel && viewModel.isReady && (
            <span className="text-[11px] font-mono font-semibold tracking-wider opacity-90 mt-0.5">
              {viewModel.subLabel}
            </span>
          )}
        </div>
      </button>

      {/* Readiness Blocker or Ready Caption */}
      <div className="mt-3 text-center min-h-[22px] px-2 flex justify-center">
        {!viewModel.isReady && viewModel.blockerReason ? (
          <button
            type="button"
            onClick={onOpenPairing}
            className={`text-xs font-semibold px-3 py-1 rounded-full tracking-wide transition-all ${
              onOpenPairing
                ? "bg-amber-950/70 hover:bg-amber-900/90 border border-amber-600/80 text-amber-300 hover:text-white cursor-pointer shadow-md active:scale-95 flex items-center space-x-1.5"
                : "bg-amber-950/60 border border-amber-800/60 text-amber-400 cursor-default"
            }`}
            title={onOpenPairing ? "Click to open Decent DE1 pairing & connection settings" : undefined}
          >
            {viewModel.blockerReason.toLowerCase().includes("disconnected") && (
              <Wifi className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-pulse" />
            )}
            <span>
              {viewModel.blockerReason}
              {onOpenPairing && viewModel.blockerReason.toLowerCase().includes("disconnected") ? " · Tap to Pair" : ""}
            </span>
          </button>
        ) : (
          <span className="text-xs font-medium text-emerald-400/90 tracking-widest uppercase">
            Machine Ready
          </span>
        )}
      </div>
    </div>
  );
};
