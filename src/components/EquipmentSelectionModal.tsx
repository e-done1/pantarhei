import React from "react";
import type { EquipmentInventory, ActiveEquipmentSelection } from "../types/equipment.ts";
import { formatEquipmentSummary, getFreezerSlowdownFactor } from "../types/equipment.ts";
import {
  Wrench,
  X,
  Check,
  Settings,
  Scale,
  Sparkles,
  Layers,
  CircleDot,
  CheckSquare,
  Snowflake,
} from "lucide-react";

interface EquipmentSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  inventory: EquipmentInventory;
  selection: ActiveEquipmentSelection;
  onSelectionChange: (newSelection: ActiveEquipmentSelection) => void;
  onOpenSettingsEquipment: () => void;
}

export const EquipmentSelectionModal: React.FC<EquipmentSelectionModalProps> = ({
  isOpen,
  onClose,
  inventory,
  selection,
  onSelectionChange,
  onOpenSettingsEquipment,
}) => {
  if (!isOpen) return null;

  // Single-select toggle handler
  const handleToggleSingle = (
    category: "grinder" | "burrs" | "basket" | "scale",
    item: string
  ) => {
    const current = selection[category];
    const next = current === item ? undefined : item;
    const updated: ActiveEquipmentSelection = {
      ...selection,
      [category]: next,
    };
    onSelectionChange(updated);
  };

  // Multi-select toggle handler
  const handleToggleMulti = (
    category: "tampers" | "distributors" | "wdt" | "rdt",
    item: string
  ) => {
    const list = selection[category] || [];
    const exists = list.includes(item);
    const updatedList = exists
      ? list.filter((i) => i !== item)
      : [...list, item];
    const updated: ActiveEquipmentSelection = {
      ...selection,
      [category]: updatedList,
    };
    onSelectionChange(updated);
  };

  const summary = formatEquipmentSummary(selection);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-6 select-none animate-in fade-in duration-150">
      <div className="w-[840px] max-h-[92vh] rounded-3xl bg-decent-surface border border-decent-border shadow-2xl flex flex-col p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-decent-border/60 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
              <Wrench className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <span>Next Shot Equipment & Prep</span>
              </h2>
              <div className="text-xs text-decent-muted mt-0.5">
                Select the hardware gear & puck prep tools attached to the upcoming extraction
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenSettingsEquipment();
              }}
              className="px-3 py-1.5 rounded-xl bg-decent-dark hover:bg-slate-800 border border-amber-500/40 text-amber-300 hover:text-amber-200 text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
              title="Open Equipment catalog in Settings to add or remove gear"
            >
              <Settings className="w-3.5 h-3.5 text-amber-400" />
              <span>Edit Gear Catalog</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-decent-muted hover:text-white hover:bg-decent-dark transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Gear Categories Grid */}
        <div className="flex-1 overflow-y-auto space-y-4 py-3 pr-1 text-xs">
          {/* CATEGORY 1: GRINDER (Single Select) */}
          <div className="p-3.5 rounded-2xl bg-decent-card border border-decent-border/70 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center space-x-1.5">
                <CircleDot className="w-3.5 h-3.5 text-amber-400" />
                <span>Grinder</span>
              </span>
              <span className="text-[10px] px-2 py-0.2 rounded-full bg-amber-500/15 text-amber-300 font-mono">
                Single Choice
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {inventory.grinders.map((g) => {
                const isSelected = selection.grinder === g;
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => handleToggleSingle("grinder", g)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer flex items-center space-x-1.5 ${
                      isSelected
                        ? "bg-amber-500/30 text-amber-300 border-amber-400 font-bold shadow-sm"
                        : "bg-decent-dark text-decent-muted border-decent-border hover:border-slate-500 hover:text-white"
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 text-amber-400" />}
                    <span>{g}</span>
                  </button>
                );
              })}
              {inventory.grinders.length === 0 && (
                <span className="text-decent-muted text-[11px] italic">No grinders in catalog. Add via Settings.</span>
              )}
            </div>
          </div>

          {/* CATEGORY 2: BURR(S) (Single Select) */}
          <div className="p-3.5 rounded-2xl bg-decent-card border border-decent-border/70 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center space-x-1.5">
                <CircleDot className="w-3.5 h-3.5 text-cyan-400" />
                <span>Burrs</span>
              </span>
              <span className="text-[10px] px-2 py-0.2 rounded-full bg-cyan-500/15 text-cyan-300 font-mono">
                Single Choice
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {inventory.burrs.map((b) => {
                const isSelected = selection.burrs === b;
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => handleToggleSingle("burrs", b)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer flex items-center space-x-1.5 ${
                      isSelected
                        ? "bg-cyan-500/30 text-cyan-300 border-cyan-400 font-bold shadow-sm"
                        : "bg-decent-dark text-decent-muted border-decent-border hover:border-slate-500 hover:text-white"
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 text-cyan-400" />}
                    <span>{b}</span>
                  </button>
                );
              })}
              {inventory.burrs.length === 0 && (
                <span className="text-decent-muted text-[11px] italic">No burrs in catalog. Add via Settings.</span>
              )}
            </div>
          </div>

          {/* CATEGORY 3: BASKET (Single Select) */}
          <div className="p-3.5 rounded-2xl bg-decent-card border border-decent-border/70 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center space-x-1.5">
                <CircleDot className="w-3.5 h-3.5 text-emerald-400" />
                <span>Filter Basket</span>
              </span>
              <span className="text-[10px] px-2 py-0.2 rounded-full bg-emerald-500/15 text-emerald-300 font-mono">
                Single Choice
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {inventory.baskets.map((b) => {
                const isSelected = selection.basket === b;
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => handleToggleSingle("basket", b)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer flex items-center space-x-1.5 ${
                      isSelected
                        ? "bg-emerald-500/30 text-emerald-300 border-emerald-400 font-bold shadow-sm"
                        : "bg-decent-dark text-decent-muted border-decent-border hover:border-slate-500 hover:text-white"
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 text-emerald-400" />}
                    <span>{b}</span>
                  </button>
                );
              })}
              {inventory.baskets.length === 0 && (
                <span className="text-decent-muted text-[11px] italic">No baskets in catalog. Add via Settings.</span>
              )}
            </div>
          </div>

          {/* CATEGORY 4: SCALE (Single Select) */}
          <div className="p-3.5 rounded-2xl bg-decent-card border border-decent-border/70 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-sky-400 uppercase tracking-wider flex items-center space-x-1.5">
                <Scale className="w-3.5 h-3.5 text-sky-400" />
                <span>Scale</span>
              </span>
              <span className="text-[10px] px-2 py-0.2 rounded-full bg-sky-500/15 text-sky-300 font-mono">
                Single Choice
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {inventory.scales.map((s) => {
                const isSelected = selection.scale === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleToggleSingle("scale", s)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer flex items-center space-x-1.5 ${
                      isSelected
                        ? "bg-sky-500/30 text-sky-300 border-sky-400 font-bold shadow-sm"
                        : "bg-decent-dark text-decent-muted border-decent-border hover:border-slate-500 hover:text-white"
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 text-sky-400" />}
                    <span>{s}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* CATEGORY 5: TAMPER(S) (Multi-Select) */}
          <div className="p-3.5 rounded-2xl bg-decent-card border border-decent-border/70 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center space-x-1.5">
                <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                <span>Tamper(s)</span>
              </span>
              <span className="text-[10px] px-2 py-0.2 rounded-full bg-purple-500/15 text-purple-300 font-mono">
                Multiple Allowed
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {inventory.tampers.map((t) => {
                const isSelected = (selection.tampers || []).includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleToggleMulti("tampers", t)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer flex items-center space-x-1.5 ${
                      isSelected
                        ? "bg-purple-500/30 text-purple-300 border-purple-400 font-bold shadow-sm"
                        : "bg-decent-dark text-decent-muted border-decent-border hover:border-slate-500 hover:text-white"
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[10px] ${isSelected ? "border-purple-400 bg-purple-500 text-white" : "border-slate-600"}`}>
                      {isSelected ? "✓" : ""}
                    </span>
                    <span>{t}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* CATEGORY 6: DISTRIBUTOR(S) (Multi-Select) */}
          <div className="p-3.5 rounded-2xl bg-decent-card border border-decent-border/70 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                <span>Distributor / Leveler</span>
              </span>
              <span className="text-[10px] px-2 py-0.2 rounded-full bg-purple-500/15 text-purple-300 font-mono">
                Multiple Allowed
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {inventory.distributors.map((d) => {
                const isSelected = (selection.distributors || []).includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleToggleMulti("distributors", d)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer flex items-center space-x-1.5 ${
                      isSelected
                        ? "bg-purple-500/30 text-purple-300 border-purple-400 font-bold shadow-sm"
                        : "bg-decent-dark text-decent-muted border-decent-border hover:border-slate-500 hover:text-white"
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[10px] ${isSelected ? "border-purple-400 bg-purple-500 text-white" : "border-slate-600"}`}>
                      {isSelected ? "✓" : ""}
                    </span>
                    <span>{d}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* CATEGORY 7: WDT TOOL(S) (Multi-Select) */}
          <div className="p-3.5 rounded-2xl bg-decent-card border border-decent-border/70 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rose-300 uppercase tracking-wider flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-rose-400" />
                <span>WDT Tool(s)</span>
              </span>
              <span className="text-[10px] px-2 py-0.2 rounded-full bg-purple-500/15 text-purple-300 font-mono">
                Multiple Allowed
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {inventory.wdt.map((w) => {
                const isSelected = (selection.wdt || []).includes(w);
                return (
                  <button
                    key={w}
                    type="button"
                    onClick={() => handleToggleMulti("wdt", w)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer flex items-center space-x-1.5 ${
                      isSelected
                        ? "bg-rose-500/30 text-rose-300 border-rose-400 font-bold shadow-sm"
                        : "bg-decent-dark text-decent-muted border-decent-border hover:border-slate-500 hover:text-white"
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[10px] ${isSelected ? "border-rose-400 bg-rose-500 text-white" : "border-slate-600"}`}>
                      {isSelected ? "✓" : ""}
                    </span>
                    <span>{w}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* CATEGORY 8: RDT (Multi-Select) */}
          <div className="p-3.5 rounded-2xl bg-decent-card border border-decent-border/70 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-sky-300 uppercase tracking-wider flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                <span>RDT Technique (Water Droplets / Mist)</span>
              </span>
              <span className="text-[10px] px-2 py-0.2 rounded-full bg-purple-500/15 text-purple-300 font-mono">
                Multiple Allowed
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {inventory.rdt.map((r) => {
                const isSelected = (selection.rdt || []).includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => handleToggleMulti("rdt", r)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer flex items-center space-x-1.5 ${
                      isSelected
                        ? "bg-sky-500/30 text-sky-300 border-sky-400 font-bold shadow-sm"
                        : "bg-decent-dark text-decent-muted border-decent-border hover:border-slate-500 hover:text-white"
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[10px] ${isSelected ? "border-sky-400 bg-sky-500 text-white" : "border-slate-600"}`}>
                      {isSelected ? "✓" : ""}
                    </span>
                    <span>{r}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* CATEGORY 9: COLD STORAGE & FREEZERS */}
          <div className="p-3.5 rounded-2xl bg-cyan-950/20 border border-cyan-500/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center space-x-1.5">
                <Snowflake className="w-3.5 h-3.5 text-cyan-400" />
                <span>Cold Storage & Freezers</span>
              </span>
              <span className="text-[10px] px-2 py-0.2 rounded-full bg-cyan-500/15 text-cyan-300 font-mono">
                {(inventory.freezers || []).length} Available
              </span>
            </div>
            <div className="text-[11px] text-cyan-200/70">
              Assigned per coffee lot in Bean Inventory. Physics: -18°C slows aging by 12×; -40°C slows aging by 50×.
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {(inventory.freezers || []).map((f) => (
                <div
                  key={f.id}
                  className="px-3 py-1.5 rounded-xl border border-cyan-500/30 bg-decent-dark text-xs flex items-center space-x-2"
                >
                  <Snowflake className="w-3 h-3 text-cyan-400" />
                  <span className="font-semibold text-white">{f.name}</span>
                  <span className="font-mono text-cyan-300">{f.temperatureC}°C</span>
                  <span className="text-[10px] text-cyan-400/80 font-mono">
                    ({getFreezerSlowdownFactor(f.temperatureC)}× slowdown)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-decent-border/60 flex items-center justify-between shrink-0">
          <div className="flex-1 min-w-0 pr-4">
            <span className="text-[10px] text-decent-muted block uppercase tracking-wider font-semibold">
              Active Gear Selection:
            </span>
            <div className="text-xs text-white font-mono truncate mt-0.5">
              {summary}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer flex items-center space-x-1.5 shrink-0"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>Apply to Next Shot</span>
          </button>
        </div>
      </div>
    </div>
  );
};
