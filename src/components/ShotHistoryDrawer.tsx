import React, { useState, useMemo, useRef, useEffect } from "react";
import type { ShotRecord, ShotFilterOptions } from "../types/shot.ts";
import { searchShotHistory } from "../types/shot.ts";
import {
  History,
  Search,
  X,
  Star,
  ArrowLeft,
  Check,
  AlertTriangle,
  RotateCcw,
  Maximize2,
  Trash2,
  Coffee,
  Plus,
  Pencil,
  Wrench,
} from "lucide-react";
import { formatEquipmentSummary } from "../types/equipment.ts";

interface ShotHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  shots: ShotRecord[];
  onSelectShotAsReference: (shot: ShotRecord) => void;
  onRedialShot: (shot: ShotRecord) => void;
  onDeleteShot?: (shotId: string) => void;
  onUpdateShot?: (updatedShot: ShotRecord) => void;
  embedded?: boolean;
}

/**
 * Thumbnail canvas displaying a mini pressure & flow curve for each shot card
 */
const ShotMiniCurve: React.FC<{ telemetry: ShotRecord["telemetry"]; width?: number; height?: number }> = ({
  telemetry,
  width = 120,
  height = 42,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !telemetry || telemetry.length < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const maxT = Math.max(1, telemetry[telemetry.length - 1]?.timeSeconds || 30);
    const maxP = 12; // bar
    const maxF = 8;  // ml/s

    // Draw Pressure curve (Emerald green)
    ctx.beginPath();
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 1.6;
    telemetry.forEach((pt, idx) => {
      const x = (pt.timeSeconds / maxT) * width;
      const y = height - (Math.min(maxP, pt.pressure) / maxP) * (height - 4) - 2;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw Flow curve (Cyan)
    ctx.beginPath();
    ctx.strokeStyle = "#06b6d4";
    ctx.lineWidth = 1.4;
    telemetry.forEach((pt, idx) => {
      const x = (pt.timeSeconds / maxT) * width;
      const y = height - (Math.min(maxF, pt.flow) / maxF) * (height - 4) - 2;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [telemetry, width, height]);

  return <canvas ref={canvasRef} style={{ width, height }} className="rounded bg-black/40 border border-white/5" />;
};

export const ShotHistoryDrawer: React.FC<ShotHistoryDrawerProps> = ({
  isOpen,
  onClose,
  shots,
  onSelectShotAsReference,
  onRedialShot,
  onDeleteShot,
  onUpdateShot,
  embedded = false,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBean, setSelectedBean] = useState<string | undefined>(undefined);
  const [selectedProfile, setSelectedProfile] = useState<string | undefined>(undefined);
  const [minRating, setMinRating] = useState<number | undefined>(undefined);
  const [channelFilter, setChannelFilter] = useState<"all" | "channeled" | "clean">("all");
  const [dateRange, setDateRange] = useState<"all" | "today" | "week" | "month">("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "rating" | "time" | "yield">("newest");

  // Custom Coffee and Profile Filter Tags persisted in localStorage
  const [customCoffeeTags, setCustomCoffeeTags] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("pantarhei_history_custom_coffee_tags");
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [isAddingCoffeeTag, setIsAddingCoffeeTag] = useState(false);
  const [newCoffeeTagInput, setNewCoffeeTagInput] = useState("");

  const [customProfileTags, setCustomProfileTags] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("pantarhei_history_custom_profile_tags");
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [isAddingProfileTag, setIsAddingProfileTag] = useState(false);
  const [newProfileTagInput, setNewProfileTagInput] = useState("");

  const handleAddCoffeeTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    if (!customCoffeeTags.includes(trimmed)) {
      const updated = [...customCoffeeTags, trimmed];
      setCustomCoffeeTags(updated);
      try {
        localStorage.setItem("pantarhei_history_custom_coffee_tags", JSON.stringify(updated));
      } catch {}
    }
    setSelectedBean(trimmed);
    setNewCoffeeTagInput("");
    setIsAddingCoffeeTag(false);
  };

  const handleRemoveCoffeeTag = (tag: string) => {
    const updated = customCoffeeTags.filter((t) => t !== tag);
    setCustomCoffeeTags(updated);
    try {
      localStorage.setItem("pantarhei_history_custom_coffee_tags", JSON.stringify(updated));
    } catch {}
    if (selectedBean === tag) {
      setSelectedBean(undefined);
    }
  };

  const handleAddProfileTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    if (!customProfileTags.includes(trimmed)) {
      const updated = [...customProfileTags, trimmed];
      setCustomProfileTags(updated);
      try {
        localStorage.setItem("pantarhei_history_custom_profile_tags", JSON.stringify(updated));
      } catch {}
    }
    setSelectedProfile(trimmed);
    setNewProfileTagInput("");
    setIsAddingProfileTag(false);
  };

  const handleRemoveProfileTag = (tag: string) => {
    const updated = customProfileTags.filter((t) => t !== tag);
    setCustomProfileTags(updated);
    try {
      localStorage.setItem("pantarhei_history_custom_profile_tags", JSON.stringify(updated));
    } catch {}
    if (selectedProfile === tag) {
      setSelectedProfile(undefined);
    }
  };

  // Inspecting specific shot in detail
  const [inspectingShot, setInspectingShot] = useState<ShotRecord | null>(null);
  const [inspectCanvasTab, setInspectCanvasTab] = useState<"all" | "pressure" | "flow">("all");
  const inspectCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Editing specific shot in detail
  const [editingShot, setEditingShot] = useState<ShotRecord | null>(null);

  // Edit form states
  const [editBeanName, setEditBeanName] = useState("");
  const [editRoaster, setEditRoaster] = useState("");
  const [editCountry, setEditCountry] = useState("");
  const [editProcess, setEditProcess] = useState("");
  const [editRoastDate, setEditRoastDate] = useState("");

  const [editGrindSetting, setEditGrindSetting] = useState("");
  const [editBasket, setEditBasket] = useState("");
  const [editGrinder, setEditGrinder] = useState("");
  const [editBurrs, setEditBurrs] = useState("");
  const [editScale, setEditScale] = useState("");
  const [editTampers, setEditTampers] = useState("");
  const [editDistributors, setEditDistributors] = useState("");
  const [editWdt, setEditWdt] = useState("");
  const [editRdt, setEditRdt] = useState("");
  const [editWaterTemp, setEditWaterTemp] = useState(93.0);
  const [editActualDose, setEditActualDose] = useState(18.0);
  const [editActualYield, setEditActualYield] = useState(36.0);

  const [editTds, setEditTds] = useState(9.4);
  const [editEy, setEditEy] = useState(18.8);

  const [editRating, setEditRating] = useState(8.5);
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editBaristaNotes, setEditBaristaNotes] = useState("");

  const [isAddingEditTag, setIsAddingEditTag] = useState(false);
  const [newEditTagInput, setNewEditTagInput] = useState("");
  const [showSavedToast, setShowSavedToast] = useState(false);

  const handleStartEdit = (shot: ShotRecord) => {
    setEditingShot(shot);
    setEditBeanName(shot.beanName);
    setEditRoaster(shot.roaster);
    setEditCountry(shot.countryOfOrigin || "");
    setEditProcess(shot.process || "");
    setEditRoastDate(shot.roastDate || "");

    setEditGrindSetting(shot.grindSetting);
    setEditBasket(shot.basket || (shot.equipment?.basket || "CB 18g"));
    setEditGrinder(shot.equipment?.grinder || "");
    setEditBurrs(shot.equipment?.burrs || "");
    setEditScale(shot.equipment?.scale || "");
    setEditTampers(shot.equipment?.tampers ? shot.equipment.tampers.join(", ") : "");
    setEditDistributors(shot.equipment?.distributors ? shot.equipment.distributors.join(", ") : "");
    setEditWdt(shot.equipment?.wdt ? shot.equipment.wdt.join(", ") : "");
    setEditRdt(shot.equipment?.rdt ? shot.equipment.rdt.join(", ") : "");
    setEditWaterTemp(shot.waterTemperature || 93.0);
    setEditActualDose(shot.actualDose);
    setEditActualYield(shot.actualYield);

    const initialTds = shot.tds ?? 9.4;
    setEditTds(initialTds);
    const initialEy = shot.ey ?? (shot.actualDose > 0 ? Math.round(((shot.actualYield * initialTds) / shot.actualDose) * 100) / 100 : 0);
    setEditEy(initialEy);

    setEditRating(shot.rating);
    setEditTags(shot.tags ? [...shot.tags] : []);
    setEditBaristaNotes(shot.baristaNotes || "");
    setIsAddingEditTag(false);
    setNewEditTagInput("");
    setShowSavedToast(false);
  };

  const handleTdsChange = (newTds: number) => {
    setEditTds(newTds);
    if (editActualDose > 0) {
      const recalculated = Math.round(((editActualYield * newTds) / editActualDose) * 100) / 100;
      setEditEy(recalculated);
    }
  };

  const handleYieldChange = (newYield: number) => {
    setEditActualYield(newYield);
    if (editActualDose > 0 && editTds > 0) {
      const recalculated = Math.round(((newYield * editTds) / editActualDose) * 100) / 100;
      setEditEy(recalculated);
    }
  };

  const handleDoseChange = (newDose: number) => {
    setEditActualDose(newDose);
    if (newDose > 0 && editTds > 0) {
      const recalculated = Math.round(((editActualYield * editTds) / newDose) * 100) / 100;
      setEditEy(recalculated);
    }
  };

  const handleAddEditTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    if (!editTags.includes(trimmed)) {
      setEditTags([...editTags, trimmed]);
    }
    setNewEditTagInput("");
    setIsAddingEditTag(false);
  };

  const handleRemoveEditTag = (tag: string) => {
    setEditTags(editTags.filter((t) => t !== tag));
  };

  const handleSaveEdit = () => {
    if (!editingShot) return;

    const updated: ShotRecord = {
      ...editingShot,
      beanName: editBeanName.trim() || editingShot.beanName,
      roaster: editRoaster.trim() || editingShot.roaster,
      countryOfOrigin: editCountry.trim() || undefined,
      process: editProcess.trim() || undefined,
      roastDate: editRoastDate.trim() || undefined,
      grindSetting: editGrindSetting.trim() || editingShot.grindSetting,
      basket: editBasket.trim() || editingShot.basket,
      waterTemperature: editWaterTemp,
      actualDose: editActualDose,
      actualYield: editActualYield,
      ratio: editActualDose > 0 ? Math.round((editActualYield / editActualDose) * 100) / 100 : editingShot.ratio,
      tds: editTds,
      ey: editEy,
      rating: editRating,
      tags: editTags,
      baristaNotes: editBaristaNotes.trim() || undefined,
      equipment: {
        grinder: editGrinder.trim() || undefined,
        burrs: editBurrs.trim() || undefined,
        basket: editBasket.trim() || undefined,
        scale: editScale.trim() || undefined,
        tampers: editTampers ? editTampers.split(",").map((s) => s.trim()).filter(Boolean) : (editingShot.equipment?.tampers || []),
        distributors: editDistributors ? editDistributors.split(",").map((s) => s.trim()).filter(Boolean) : (editingShot.equipment?.distributors || []),
        wdt: editWdt ? editWdt.split(",").map((s) => s.trim()).filter(Boolean) : (editingShot.equipment?.wdt || []),
        rdt: editRdt ? editRdt.split(",").map((s) => s.trim()).filter(Boolean) : (editingShot.equipment?.rdt || []),
      },
    };

    if (onUpdateShot) {
      onUpdateShot(updated);
    }

    if (inspectingShot && inspectingShot.id === updated.id) {
      setInspectingShot(updated);
    }

    setShowSavedToast(true);
    setTimeout(() => {
      setShowSavedToast(false);
      setEditingShot(null);
    }, 700);
  };

  // Facet options extracted from shots
  const distinctBeans = useMemo(() => {
    const map = new Map<string, string>();
    shots.forEach((s) => map.set(s.beanName, s.roaster));
    return Array.from(map.entries()).map(([name, roaster]) => ({ name, roaster }));
  }, [shots]);

  const distinctProfiles = useMemo(() => {
    const set = new Set<string>();
    shots.forEach((s) => set.add(s.profileTitle));
    return Array.from(set);
  }, [shots]);

  // Reactive filtered & sorted list
  const filteredShots = useMemo(() => {
    const filters: ShotFilterOptions = {
      beanName: selectedBean,
      profileTitle: selectedProfile,
      minRating,
      channelFilter,
      dateRange,
      sortBy,
    };
    return searchShotHistory(shots, searchQuery, filters);
  }, [shots, searchQuery, selectedBean, selectedProfile, minRating, channelFilter, dateRange, sortBy]);

  // Large Inspection Canvas Renderer
  useEffect(() => {
    if (!inspectingShot || !inspectCanvasRef.current) return;
    const canvas = inspectCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    const padLeft = 40;
    const padBottom = 26;
    const padTop = 18;
    const padRight = 30;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    const pts = inspectingShot.telemetry;
    if (pts.length < 2) return;

    const finalT = Math.max(1, pts[pts.length - 1].timeSeconds);
    const maxT = Math.ceil(finalT / 5) * 5;
    const maxP = 12; // bar
    const maxF = 8;  // ml/s
    const maxW = Math.max(45, inspectingShot.actualYield * 1.15);

    // Grid lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    for (let p = 0; p <= maxP; p += 3) {
      const y = padTop + plotH - (p / maxP) * plotH;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + plotW, y);
      ctx.stroke();

      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.font = "9px monospace";
      ctx.fillText(`${p}b`, padLeft - 22, y + 3);
    }

    // Time Axis labels
    for (let t = 0; t <= maxT; t += 5) {
      const x = padLeft + (t / maxT) * plotW;
      ctx.beginPath();
      ctx.moveTo(x, padTop + plotH);
      ctx.lineTo(x, padTop + plotH + 4);
      ctx.stroke();

      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.font = "9px monospace";
      ctx.fillText(`${t}s`, x - 6, padTop + plotH + 16);
    }

    // Weight curve (Dark Brown #78350f)
    ctx.beginPath();
    ctx.strokeStyle = "#78350f";
    ctx.lineWidth = 2;
    pts.forEach((pt, idx) => {
      const x = padLeft + (pt.timeSeconds / maxT) * plotW;
      const y = padTop + plotH - (pt.weight / maxW) * plotH;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Flow curve (Cyan #06b6d4)
    if (inspectCanvasTab === "all" || inspectCanvasTab === "flow") {
      ctx.beginPath();
      ctx.strokeStyle = "#06b6d4";
      ctx.lineWidth = 2;
      pts.forEach((pt, idx) => {
        const x = padLeft + (pt.timeSeconds / maxT) * plotW;
        const y = padTop + plotH - (pt.flow / maxF) * plotH;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // Pressure curve (Emerald #10b981)
    if (inspectCanvasTab === "all" || inspectCanvasTab === "pressure") {
      ctx.beginPath();
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 2.5;
      pts.forEach((pt, idx) => {
        const x = padLeft + (pt.timeSeconds / maxT) * plotW;
        const y = padTop + plotH - (pt.pressure / maxP) * plotH;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // Channeling Flags if any
    pts.forEach((pt) => {
      if (pt.channelDetected) {
        const x = padLeft + (pt.timeSeconds / maxT) * plotW;
        const y = padTop + plotH - (pt.pressure / maxP) * plotH;
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }, [inspectingShot, inspectCanvasTab]);

  if (!isOpen) return null;

  const drawerContent = (
    <div
      className={
        embedded
          ? "w-full h-full flex flex-col min-h-0 bg-slate-900/95 border border-slate-700/80 rounded-2xl p-4 lg:p-5 shadow-2xl overflow-hidden select-none"
          : "w-[550px] h-full bg-decent-surface border-r border-decent-border shadow-2xl flex flex-col p-5 min-h-0 select-none"
      }
    >
        {/* VIEW 1: SHOT LIST & SEARCH */}
        {!inspectingShot && !editingShot && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-decent-border/60 shrink-0">
              <div>
                <h2 className="text-base font-bold text-white flex items-center space-x-2">
                  <History className="w-4 h-4 text-amber-500" />
                  <span>Shot History & Dial-in Archive</span>
                </h2>
                <div className="text-xs text-decent-muted mt-0.5">
                  {shots.length} shots recorded · Multi-Field Search & Filter
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-600 text-xs font-semibold flex items-center space-x-1 cursor-pointer transition-colors shadow-sm"
                title="Return to cockpit graph"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Back to Graph</span>
              </button>
            </div>

            {/* Free-Text Search Input */}
            <div className="my-2.5 relative shrink-0">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-decent-muted" />
              <input
                type="text"
                autoFocus
                placeholder="Search coffee, roaster, profile, notes, grind, or sensory tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 rounded-xl bg-decent-dark border border-decent-border text-xs text-white placeholder-decent-muted focus:outline-none focus:border-amber-500/70"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-2.5 text-decent-muted hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Pills with Wrapped Lines & Add/Remove Tags */}
            <div className="space-y-2 pb-2.5 border-b border-decent-border/40 shrink-0 text-xs">
              {/* Coffee Bean Filter Chips (Wrapped with Add/Remove) */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider mr-1">
                  Coffee:
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedBean(undefined)}
                  className={`px-2 py-0.5 rounded-lg text-[10.5px] font-semibold border transition-all cursor-pointer ${
                    selectedBean === undefined
                      ? "bg-amber-500/30 text-amber-300 border-amber-400 font-bold"
                      : "bg-decent-dark text-decent-muted border-decent-border hover:border-slate-500"
                  }`}
                >
                  All Coffees
                </button>
                {distinctBeans.map((b) => (
                  <button
                    key={b.name}
                    type="button"
                    onClick={() => setSelectedBean(selectedBean === b.name ? undefined : b.name)}
                    className={`px-2 py-0.5 rounded-lg text-[10.5px] font-semibold border transition-all cursor-pointer ${
                      selectedBean === b.name
                        ? "bg-amber-500/30 text-amber-300 border-amber-400 font-bold shadow-sm"
                        : "bg-decent-dark text-decent-muted border-decent-border hover:border-slate-500"
                    }`}
                  >
                    {b.name}
                  </button>
                ))}
                {customCoffeeTags.map((tag) => (
                  <div key={tag} className="inline-flex items-center">
                    <button
                      type="button"
                      onClick={() => setSelectedBean(selectedBean === tag ? undefined : tag)}
                      className={`px-2 py-0.5 rounded-lg text-[10.5px] font-semibold border transition-all cursor-pointer ${
                        selectedBean === tag
                          ? "bg-amber-500/30 text-amber-300 border-amber-400 font-bold shadow-sm"
                          : "bg-decent-dark text-amber-300/80 border-amber-500/30 hover:border-amber-500/60"
                      }`}
                    >
                      {tag}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveCoffeeTag(tag);
                      }}
                      className="ml-1 w-3.5 h-3.5 rounded-full bg-rose-600/30 hover:bg-rose-600 text-rose-300 hover:text-white flex items-center justify-center text-[10px] font-bold cursor-pointer transition-colors"
                      title={`Remove tag "${tag}"`}
                    >
                      ×
                    </button>
                  </div>
                ))}

                {/* Add Coffee Tag */}
                {isAddingCoffeeTag ? (
                  <div className="inline-flex items-center space-x-1 bg-decent-dark px-2 py-0.5 rounded-lg border border-amber-500/50">
                    <input
                      type="text"
                      autoFocus
                      placeholder="Coffee tag..."
                      value={newCoffeeTagInput}
                      onChange={(e) => setNewCoffeeTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddCoffeeTag(newCoffeeTagInput);
                        } else if (e.key === "Escape") {
                          setIsAddingCoffeeTag(false);
                        }
                      }}
                      className="w-20 bg-transparent text-[10.5px] text-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddCoffeeTag(newCoffeeTagInput)}
                      className="text-amber-400 hover:text-amber-300 text-xs font-bold cursor-pointer"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddingCoffeeTag(false)}
                      className="text-decent-muted hover:text-white text-xs cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsAddingCoffeeTag(true)}
                    className="px-2 py-0.5 text-[10.5px] font-semibold rounded-lg border border-dashed border-amber-500/40 text-amber-300/80 hover:text-amber-300 hover:border-amber-400 flex items-center space-x-1 cursor-pointer transition-all"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Tag</span>
                  </button>
                )}
              </div>

              {/* Extraction Profile Filter Chips (Wrapped with Add/Remove) */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-cyan-400 font-semibold uppercase tracking-wider mr-1">
                  Profile:
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedProfile(undefined)}
                  className={`px-2 py-0.5 rounded-lg text-[10.5px] font-semibold border transition-all cursor-pointer ${
                    selectedProfile === undefined
                      ? "bg-cyan-500/30 text-cyan-300 border-cyan-400 font-bold"
                      : "bg-decent-dark text-decent-muted border-decent-border hover:border-slate-500"
                  }`}
                >
                  All Profiles
                </button>
                {distinctProfiles.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSelectedProfile(selectedProfile === p ? undefined : p)}
                    className={`px-2 py-0.5 rounded-lg text-[10.5px] font-semibold border transition-all cursor-pointer ${
                      selectedProfile === p
                        ? "bg-cyan-500/30 text-cyan-300 border-cyan-400 font-bold shadow-sm"
                        : "bg-decent-dark text-decent-muted border-decent-border hover:border-slate-500"
                    }`}
                  >
                    {p}
                  </button>
                ))}
                {customProfileTags.map((tag) => (
                  <div key={tag} className="inline-flex items-center">
                    <button
                      type="button"
                      onClick={() => setSelectedProfile(selectedProfile === tag ? undefined : tag)}
                      className={`px-2 py-0.5 rounded-lg text-[10.5px] font-semibold border transition-all cursor-pointer ${
                        selectedProfile === tag
                          ? "bg-cyan-500/30 text-cyan-300 border-cyan-400 font-bold shadow-sm"
                          : "bg-decent-dark text-cyan-300/80 border-cyan-500/30 hover:border-cyan-500/60"
                      }`}
                    >
                      {tag}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveProfileTag(tag);
                      }}
                      className="ml-1 w-3.5 h-3.5 rounded-full bg-rose-600/30 hover:bg-rose-600 text-rose-300 hover:text-white flex items-center justify-center text-[10px] font-bold cursor-pointer transition-colors"
                      title={`Remove tag "${tag}"`}
                    >
                      ×
                    </button>
                  </div>
                ))}

                {/* Add Profile Tag */}
                {isAddingProfileTag ? (
                  <div className="inline-flex items-center space-x-1 bg-decent-dark px-2 py-0.5 rounded-lg border border-cyan-500/50">
                    <input
                      type="text"
                      autoFocus
                      placeholder="Profile tag..."
                      value={newProfileTagInput}
                      onChange={(e) => setNewProfileTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddProfileTag(newProfileTagInput);
                        } else if (e.key === "Escape") {
                          setIsAddingProfileTag(false);
                        }
                      }}
                      className="w-20 bg-transparent text-[10.5px] text-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddProfileTag(newProfileTagInput)}
                      className="text-cyan-400 hover:text-cyan-300 text-xs font-bold cursor-pointer"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddingProfileTag(false)}
                      className="text-decent-muted hover:text-white text-xs cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsAddingProfileTag(true)}
                    className="px-2 py-0.5 text-[10.5px] font-semibold rounded-lg border border-dashed border-cyan-500/40 text-cyan-300/80 hover:text-cyan-300 hover:border-cyan-400 flex items-center space-x-1 cursor-pointer transition-all"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Tag</span>
                  </button>
                )}
              </div>

              {/* Quality & Sort Controls */}
              <div className="flex items-center justify-between pt-0.5 text-[11px] flex-wrap gap-y-1.5">
                {/* Rating, Channel & Date Filters */}
                <div className="flex items-center space-x-1.5">
                  <button
                    type="button"
                    onClick={() => setMinRating(minRating === 9.0 ? undefined : 9.0)}
                    className={`px-2 py-0.5 rounded-md border flex items-center space-x-1 transition-all ${
                      minRating === 9.0
                        ? "bg-amber-500/30 text-amber-300 border-amber-400 font-bold"
                        : "bg-decent-dark text-decent-muted border-decent-border"
                    }`}
                  >
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    <span>9.0+</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setChannelFilter(channelFilter === "channeled" ? "all" : "channeled")
                    }
                    className={`px-2 py-0.5 rounded-md border flex items-center space-x-1 transition-all ${
                      channelFilter === "channeled"
                        ? "bg-rose-500/30 text-rose-300 border-rose-400 font-bold"
                        : "bg-decent-dark text-decent-muted border-decent-border"
                    }`}
                  >
                    <AlertTriangle className="w-3 h-3 text-rose-400" />
                    <span>Channeled</span>
                  </button>

                  {/* Date Range Selector */}
                  <div className="flex items-center space-x-0.5 bg-decent-dark border border-decent-border rounded-md p-0.5">
                    {(
                      [
                        { id: "all", label: "All" },
                        { id: "today", label: "Today" },
                        { id: "week", label: "7d" },
                        { id: "month", label: "30d" },
                      ] as const
                    ).map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setDateRange(r.id)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-all ${
                          dateRange === r.id
                            ? "bg-amber-500/30 text-amber-300 font-bold"
                            : "text-decent-muted hover:text-white"
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sort Selector */}
                <div className="flex items-center space-x-1.5 text-decent-muted">
                  <span>Sort:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="bg-decent-dark border border-decent-border rounded px-1.5 py-0.5 text-[10.5px] text-white focus:outline-none"
                  >
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                    <option value="rating">Highest Rating</option>
                    <option value="time">Fastest Extraction</option>
                    <option value="yield">Yield Weight</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Shots List */}
            <div className="flex-1 overflow-y-auto space-y-2.5 mt-2 pr-1">
              {filteredShots.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-center p-4 rounded-2xl bg-decent-dark/40 border border-decent-border/40">
                  <Coffee className="w-8 h-8 text-decent-muted mb-2 opacity-50" />
                  <span className="text-xs font-semibold text-white">No shots match your query</span>
                  <p className="text-[11px] text-decent-muted mt-1 max-w-xs">
                    Try clearing filters or search terms to inspect the full dial-in archive.
                  </p>
                </div>
              ) : (
                filteredShots.map((shot) => (
                  <div
                    key={shot.id}
                    className="p-3.5 rounded-2xl bg-decent-card border border-decent-border/60 hover:border-slate-500 transition-all space-y-2.5"
                  >
                    {/* Top Row: Date, Bean, Roaster & Rating */}
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-white truncate">{shot.beanName}</span>
                          <span className="text-[11px] text-amber-400/90 font-medium">· {shot.roaster}</span>
                        </div>
                        <div className="text-[10px] text-decent-muted mt-0.5 flex items-center space-x-2">
                          <span>{shot.dateFormatted}</span>
                          <span>·</span>
                          <span className="text-cyan-300 font-mono">{shot.profileTitle}</span>
                        </div>
                      </div>

                      {/* Rating & Channel Badge */}
                      <div className="flex items-center space-x-1.5 shrink-0">
                        {shot.channelDetected && (
                          <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center space-x-1">
                            <AlertTriangle className="w-2.5 h-2.5 text-rose-400" />
                            <span>Channeled</span>
                          </span>
                        )}
                        <span className="text-xs font-bold font-mono text-amber-300 px-2 py-0.5 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center space-x-1">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          <span>{shot.rating.toFixed(1)}</span>
                        </span>
                      </div>
                    </div>

                    {/* Middle Row: Metrics Grid + Mini Curve */}
                    <div className="flex items-center justify-between pt-1 border-t border-decent-border/40">
                      {/* Metric Chips */}
                      <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-[11px] font-mono">
                        <div>
                          <span className="text-decent-muted text-[10px]">Dose → Yield</span>
                          <div className="text-white font-bold">
                            {shot.actualDose.toFixed(1)}g → {shot.actualYield.toFixed(1)}g
                          </div>
                        </div>
                        <div>
                          <span className="text-decent-muted text-[10px]">Ratio & Time</span>
                          <div className="text-white font-bold">
                            1:{shot.ratio.toFixed(2)} · {shot.durationSeconds.toFixed(1)}s
                          </div>
                        </div>
                        <div>
                          <span className="text-decent-muted text-[10px]">Peak & Flow</span>
                          <div className="text-white font-bold">
                            {shot.peakPressure.toFixed(1)}b · {shot.avgFlow.toFixed(1)}ml/s
                          </div>
                        </div>
                      </div>

                      {/* Mini Curve Canvas */}
                      <div className="shrink-0 ml-2" title="Green: Pressure, Cyan: Flow">
                        <ShotMiniCurve telemetry={shot.telemetry} width={110} height={38} />
                      </div>
                    </div>

                    {/* Sensory Descriptors */}
                    {shot.tags && shot.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {shot.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-[9.5px] px-2 py-0.2 rounded-full bg-decent-dark border border-decent-border text-decent-muted"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Barista Notes Preview */}
                    {shot.baristaNotes && (
                      <p className="text-[11px] text-decent-muted/90 italic line-clamp-1 leading-relaxed">
                        "{shot.baristaNotes}"
                      </p>
                    )}

                    {/* Action Buttons Bar */}
                    <div className="flex items-center justify-between pt-2 border-t border-decent-border/40 text-xs">
                      <div className="flex items-center space-x-1.5">
                        {/* Edit Shot Parameters */}
                        <button
                          type="button"
                          onClick={() => handleStartEdit(shot)}
                          className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 hover:text-white flex items-center space-x-1 transition-all active:scale-95 cursor-pointer"
                          title="Edit beans, recipe, equipment, TDS, rating, and tasting notes"
                        >
                          <Pencil className="w-3 h-3 text-amber-400" />
                          <span>Edit</span>
                        </button>

                        {/* Inspect Curve */}
                        <button
                          type="button"
                          onClick={() => setInspectingShot(shot)}
                          className="px-2.5 py-1 rounded-lg bg-decent-dark hover:bg-slate-800 border border-decent-border text-slate-200 hover:text-white flex items-center space-x-1 transition-all active:scale-95"
                          title="Inspect full graph and dial-in details"
                        >
                          <Maximize2 className="w-3 h-3 text-cyan-400" />
                          <span>Inspect</span>
                        </button>

                        {/* Set as Reference Curve on Main Graph */}
                        <button
                          type="button"
                          onClick={() => {
                            onSelectShotAsReference(shot);
                            onClose();
                          }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/40 border border-emerald-500/50 text-emerald-300 flex items-center space-x-1 transition-all active:scale-95"
                          title="Load this curve as the reference shot in the Cockpit"
                        >
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>Load as Reference</span>
                        </button>

                        {/* Re-dial Machine to this recipe */}
                        <button
                          type="button"
                          onClick={() => {
                            onRedialShot(shot);
                            onClose();
                          }}
                          className="px-2 py-1 rounded-lg bg-decent-dark hover:bg-slate-800 border border-decent-border text-amber-300 hover:text-amber-200 flex items-center space-x-1 transition-all active:scale-95"
                          title="Adopt this bean, profile, and target dose for your next shot"
                        >
                          <RotateCcw className="w-3 h-3 text-amber-400" />
                          <span>Re-dial</span>
                        </button>
                      </div>

                      {/* Delete */}
                      {onDeleteShot && (
                        <button
                          type="button"
                          onClick={() => onDeleteShot(shot.id)}
                          className="p-1 text-decent-muted hover:text-rose-400 transition-colors"
                          title="Delete shot from history"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* VIEW 2: DETAILED SHOT INSPECTOR & CURVE VIEW */}
        {inspectingShot && !editingShot && (
          <div className="flex flex-col h-full space-y-3">
            {/* Inspector Header */}
            <div className="flex items-center justify-between pb-3 border-b border-decent-border/60 shrink-0">
              <button
                type="button"
                onClick={() => setInspectingShot(null)}
                className="flex items-center space-x-1 text-xs text-decent-muted hover:text-white transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to History</span>
              </button>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => handleStartEdit(inspectingShot)}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-semibold flex items-center space-x-1 cursor-pointer transition-all active:scale-95 shadow-sm"
                  title="Edit coffee, equipment settings, TDS, rating, and notes"
                >
                  <Pencil className="w-3.5 h-3.5 text-amber-400" />
                  <span>Edit Shot</span>
                </button>
                <span className="text-xs font-bold text-cyan-400 font-mono uppercase tracking-wider">
                  Shot Inspection
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-decent-muted hover:text-white hover:bg-decent-dark cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Coffee & Profile Title */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">{inspectingShot.beanName}</h3>
                <div className="text-xs text-decent-muted">
                  {inspectingShot.roaster} · {inspectingShot.profileTitle}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-mono font-bold text-amber-400">
                  ★ {inspectingShot.rating.toFixed(1)} / 10
                </div>
                <div className="text-[10px] text-decent-muted">{inspectingShot.dateFormatted}</div>
              </div>
            </div>

            {/* Curve Channel Mode Selector */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-1 rounded-lg bg-decent-dark p-0.5 border border-decent-border">
                <button
                  type="button"
                  onClick={() => setInspectCanvasTab("all")}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                    inspectCanvasTab === "all" ? "bg-amber-500/30 text-amber-300 font-bold" : "text-decent-muted"
                  }`}
                >
                  All Channels
                </button>
                <button
                  type="button"
                  onClick={() => setInspectCanvasTab("pressure")}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                    inspectCanvasTab === "pressure" ? "bg-emerald-500/30 text-emerald-300 font-bold" : "text-decent-muted"
                  }`}
                >
                  Pressure (bar)
                </button>
                <button
                  type="button"
                  onClick={() => setInspectCanvasTab("flow")}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                    inspectCanvasTab === "flow" ? "bg-cyan-500/30 text-cyan-300 font-bold" : "text-decent-muted"
                  }`}
                >
                  Flow (ml/s)
                </button>
              </div>

              <span className="text-[10px] font-mono text-decent-muted">
                {inspectingShot.telemetry.length} data points
              </span>
            </div>

            {/* Interactive Canvas Graph */}
            <div className="h-52 w-full rounded-2xl bg-decent-dark/90 border border-decent-border/60 overflow-hidden relative">
              <canvas ref={inspectCanvasRef} className="w-full h-full" />
            </div>

            {/* Key Extraction Metrics Grid */}
            <div className="grid grid-cols-4 gap-2 text-xs p-3 rounded-2xl bg-decent-dark/70 border border-decent-border/60 font-mono">
              <div>
                <span className="text-[10px] text-decent-muted">Input Dose</span>
                <div className="text-white font-bold">{inspectingShot.actualDose.toFixed(1)}g</div>
              </div>
              <div>
                <span className="text-[10px] text-decent-muted">Final Yield</span>
                <div className="text-white font-bold">{inspectingShot.actualYield.toFixed(1)}g</div>
              </div>
              <div>
                <span className="text-[10px] text-decent-muted">Brew Ratio</span>
                <div className="text-amber-400 font-bold">1:{inspectingShot.ratio.toFixed(2)}</div>
              </div>
              <div>
                <span className="text-[10px] text-decent-muted">Shot Time</span>
                <div className="text-white font-bold">{inspectingShot.durationSeconds.toFixed(1)}s</div>
              </div>
              <div>
                <span className="text-[10px] text-decent-muted">Peak Pressure</span>
                <div className="text-emerald-400 font-bold">{inspectingShot.peakPressure.toFixed(1)} bar</div>
              </div>
              <div>
                <span className="text-[10px] text-decent-muted">Avg Water Flow</span>
                <div className="text-cyan-400 font-bold">{inspectingShot.avgFlow.toFixed(1)} ml/s</div>
              </div>
              <div>
                <span className="text-[10px] text-decent-muted">Grind Setting</span>
                <div className="text-white font-bold">{inspectingShot.grindSetting}</div>
              </div>
              <div>
                <span className="text-[10px] text-decent-muted">Estimated EY%</span>
                <div className="text-amber-300 font-bold">{inspectingShot.ey ? `${inspectingShot.ey}%` : "—"}</div>
              </div>
            </div>

            {/* Channeling & Integrity Feedback */}
            <div className="p-2.5 rounded-xl bg-decent-dark/50 border border-decent-border/50 flex items-center justify-between text-xs">
              <span className="text-decent-muted">Puck Integrity:</span>
              {inspectingShot.channelDetected ? (
                <span className="text-rose-400 font-bold flex items-center space-x-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Channeling Detected ({inspectingShot.channelCount} events)</span>
                </span>
              ) : (
                <span className="text-emerald-400 font-bold flex items-center space-x-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>Uniform Flow & Extraction</span>
                </span>
              )}
            </div>

            {/* Sensory Descriptors */}
            {inspectingShot.tags && inspectingShot.tags.length > 0 && (
              <div>
                <span className="text-[10px] font-semibold text-decent-muted uppercase tracking-wider block mb-1">
                  Flavor Descriptors & Sensory
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {inspectingShot.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 font-medium"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Equipment & Puck Prep */}
            {inspectingShot.equipment && (
              <div>
                <span className="text-[10px] font-semibold text-decent-muted uppercase tracking-wider block mb-1">
                  Equipment & Puck Prep
                </span>
                <div className="p-2.5 rounded-xl bg-decent-dark/60 border border-decent-border/60 text-xs text-amber-300 font-medium flex items-center space-x-2">
                  <Wrench className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="truncate">{formatEquipmentSummary(inspectingShot.equipment)}</span>
                </div>
              </div>
            )}

            {/* Notes */}
            {inspectingShot.baristaNotes && (
              <div className="flex-1 overflow-y-auto">
                <span className="text-[10px] font-semibold text-decent-muted uppercase tracking-wider block mb-1">
                  Barista Notes
                </span>
                <p className="text-xs text-white/90 bg-decent-dark/60 p-2.5 rounded-xl border border-decent-border/60 leading-relaxed italic">
                  "{inspectingShot.baristaNotes}"
                </p>
              </div>
            )}

            {/* Inspector Footer Actions */}
            <div className="pt-2 flex items-center justify-between border-t border-decent-border/60 shrink-0">
              <button
                type="button"
                onClick={() => {
                  onRedialShot(inspectingShot);
                  onClose();
                }}
                className="px-3.5 py-1.5 rounded-xl bg-decent-dark hover:bg-slate-800 border border-decent-border text-amber-300 text-xs font-semibold flex items-center space-x-1.5 transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Re-dial This Recipe</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onSelectShotAsReference(inspectingShot);
                  onClose();
                }}
                className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 text-xs font-bold flex items-center space-x-1.5 shadow-md transition-all active:scale-95"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Load as Reference Curve</span>
              </button>
            </div>
          </div>
        )}

        {/* VIEW 3: EDIT SHOT DATA */}
        {editingShot && (
          <div className="flex flex-col h-full space-y-3">
            {/* Edit Header */}
            <div className="flex items-center justify-between pb-3 border-b border-decent-border/60 shrink-0">
              <button
                type="button"
                onClick={() => setEditingShot(null)}
                className="flex items-center space-x-1 text-xs text-decent-muted hover:text-white transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>{inspectingShot ? "Back to Inspection" : "Back to History"}</span>
              </button>
              <span className="text-xs font-bold text-amber-400 font-mono uppercase tracking-wider flex items-center space-x-1.5">
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit Shot Data</span>
              </span>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-decent-muted hover:text-white hover:bg-decent-dark cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 text-xs">
              {/* SECTION 1: Coffee Bean & Terroir */}
              <div className="p-3.5 rounded-2xl bg-decent-dark border border-decent-border/70 space-y-2.5">
                <div className="flex items-center space-x-2 text-amber-400 font-bold uppercase tracking-wider text-[11px]">
                  <Coffee className="w-3.5 h-3.5" />
                  <span>Coffee & Terroir</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] text-decent-muted block mb-1">Coffee / Lot Name</label>
                    <input
                      type="text"
                      value={editBeanName}
                      onChange={(e) => setEditBeanName(e.target.value)}
                      placeholder="e.g. Worka Sakaro"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-decent-surface border border-decent-border text-white text-xs focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-decent-muted block mb-1">Roaster</label>
                    <input
                      type="text"
                      value={editRoaster}
                      onChange={(e) => setEditRoaster(e.target.value)}
                      placeholder="e.g. Sey Coffee"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-decent-surface border border-decent-border text-white text-xs focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-decent-muted block mb-1">Country / Origin</label>
                    <input
                      type="text"
                      value={editCountry}
                      onChange={(e) => setEditCountry(e.target.value)}
                      placeholder="e.g. Ethiopia"
                      className="w-full px-2.5 py-1 rounded-lg bg-decent-surface border border-decent-border text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-decent-muted block mb-1">Process</label>
                    <input
                      type="text"
                      value={editProcess}
                      onChange={(e) => setEditProcess(e.target.value)}
                      placeholder="e.g. Washed / Natural"
                      className="w-full px-2.5 py-1 rounded-lg bg-decent-surface border border-decent-border text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-decent-muted block mb-1">Roast Date</label>
                    <input
                      type="date"
                      value={editRoastDate}
                      onChange={(e) => setEditRoastDate(e.target.value)}
                      className="w-full px-2 py-1 rounded-lg bg-decent-surface border border-decent-border text-white text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: Equipment & Recipe Setpoints */}
              <div className="p-3.5 rounded-2xl bg-decent-dark border border-decent-border/70 space-y-2.5">
                <div className="flex items-center justify-between text-cyan-400 font-bold uppercase tracking-wider text-[11px]">
                  <div className="flex items-center space-x-1.5">
                    <Wrench className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Equipment & Recipe</span>
                  </div>
                  <span className="font-mono text-[10px] text-decent-muted truncate max-w-[200px]">
                    Profile: {editingShot.profileTitle}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-decent-muted block mb-1">Grinder</label>
                    <input
                      type="text"
                      value={editGrinder}
                      onChange={(e) => setEditGrinder(e.target.value)}
                      placeholder="e.g. Lagom P64"
                      className="w-full px-2.5 py-1 rounded-lg bg-decent-surface border border-decent-border text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-decent-muted block mb-1">Burrs</label>
                    <input
                      type="text"
                      value={editBurrs}
                      onChange={(e) => setEditBurrs(e.target.value)}
                      placeholder="e.g. SSP 64mm Cast"
                      className="w-full px-2.5 py-1 rounded-lg bg-decent-surface border border-decent-border text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-decent-muted block mb-1">Scale</label>
                    <input
                      type="text"
                      value={editScale}
                      onChange={(e) => setEditScale(e.target.value)}
                      placeholder="e.g. Decent Scale DS-104"
                      className="w-full px-2.5 py-1 rounded-lg bg-decent-surface border border-decent-border text-white text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-decent-muted block mb-1">Basket</label>
                    <input
                      type="text"
                      value={editBasket}
                      onChange={(e) => setEditBasket(e.target.value)}
                      placeholder="e.g. CB 18g, Wafo"
                      className="w-full px-2.5 py-1 rounded-lg bg-decent-surface border border-decent-border text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-decent-muted block mb-1">Grind Setting</label>
                    <input
                      type="text"
                      value={editGrindSetting}
                      onChange={(e) => setEditGrindSetting(e.target.value)}
                      placeholder="e.g. 4.2"
                      className="w-full px-2.5 py-1 rounded-lg bg-decent-surface border border-decent-border text-white text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-decent-muted block mb-1">Water Temp (°C)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={editWaterTemp}
                      onChange={(e) => setEditWaterTemp(parseFloat(e.target.value) || 93.0)}
                      className="w-full px-2.5 py-1 rounded-lg bg-decent-surface border border-decent-border text-white text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-decent-muted block mb-1">Tamper(s)</label>
                    <input
                      type="text"
                      value={editTampers}
                      onChange={(e) => setEditTampers(e.target.value)}
                      placeholder="e.g. Normcore V4 58.5mm"
                      className="w-full px-2.5 py-1 rounded-lg bg-decent-surface border border-decent-border text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-decent-muted block mb-1">WDT Tool(s)</label>
                    <input
                      type="text"
                      value={editWdt}
                      onChange={(e) => setEditWdt(e.target.value)}
                      placeholder="e.g. AutoComb, 0.25mm"
                      className="w-full px-2.5 py-1 rounded-lg bg-decent-surface border border-decent-border text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-decent-muted block mb-1">RDT Prep</label>
                    <input
                      type="text"
                      value={editRdt}
                      onChange={(e) => setEditRdt(e.target.value)}
                      placeholder="e.g. 2 Sprays Mist"
                      className="w-full px-2.5 py-1 rounded-lg bg-decent-surface border border-decent-border text-white text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-decent-border/40 items-center">
                  <div>
                    <label className="text-[10px] text-decent-muted block mb-1">Dose (g)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={editActualDose}
                      onChange={(e) => handleDoseChange(parseFloat(e.target.value) || 18.0)}
                      className="w-full px-2.5 py-1 rounded-lg bg-decent-surface border border-decent-border text-white text-xs font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-decent-muted block mb-1">Actual Yield (g)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={editActualYield}
                      onChange={(e) => handleYieldChange(parseFloat(e.target.value) || 36.0)}
                      className="w-full px-2.5 py-1 rounded-lg bg-decent-surface border border-decent-border text-white text-xs font-mono font-bold"
                    />
                  </div>
                  <div className="pt-2 text-center">
                    <span className="text-[10px] text-decent-muted block uppercase">Ratio</span>
                    <span className="text-amber-400 font-mono font-bold text-sm">
                      1:{editActualDose > 0 ? (editActualYield / editActualDose).toFixed(2) : "2.0"}
                    </span>
                  </div>
                </div>
              </div>

              {/* SECTION 3: Refractometer & Extraction Metrics (TDS & EY) */}
              <div className="p-3.5 rounded-2xl bg-decent-dark border border-decent-border/70 space-y-2.5">
                <div className="flex items-center justify-between text-emerald-400 font-bold uppercase tracking-wider text-[11px]">
                  <span>Refractometer & Extraction</span>
                  <span className="font-mono text-[10px] text-decent-muted">
                    EY% = (Yield × TDS) / Dose
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 items-center">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] text-decent-muted">TDS (%)</label>
                      <span className="font-mono font-bold text-cyan-400 text-xs">
                        {editTds.toFixed(1)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="6.0"
                      max="14.0"
                      step="0.1"
                      value={editTds}
                      onChange={(e) => handleTdsChange(parseFloat(e.target.value))}
                      className="w-full accent-cyan-400 h-1.5 rounded bg-decent-surface cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] text-decent-muted">Extraction Yield (EY%)</label>
                      <span className="font-mono font-bold text-amber-300 text-xs">
                        {editEy.toFixed(2)}%
                      </span>
                    </div>
                    <input
                      type="number"
                      step="0.1"
                      value={editEy}
                      onChange={(e) => setEditEy(parseFloat(e.target.value) || 0)}
                      className="w-full px-2.5 py-1 rounded-lg bg-decent-surface border border-decent-border text-white text-xs font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 4: Sensory Tasting Notes & Rating */}
              <div className="p-3.5 rounded-2xl bg-decent-dark border border-decent-border/70 space-y-2.5">
                <div className="flex items-center justify-between text-amber-400 font-bold uppercase tracking-wider text-[11px]">
                  <span>Sensory Descriptors & Rating</span>
                  <div className="flex items-center space-x-1 text-amber-400">
                    <Star className="w-3.5 h-3.5 fill-amber-400" />
                    <span className="font-mono font-bold text-sm text-white">
                      {editRating.toFixed(1)} / 10
                    </span>
                  </div>
                </div>

                {/* Rating Slider */}
                <div>
                  <input
                    type="range"
                    min="0.0"
                    max="10.0"
                    step="0.5"
                    value={editRating}
                    onChange={(e) => setEditRating(parseFloat(e.target.value))}
                    className="w-full accent-amber-400 h-1.5 rounded bg-decent-surface cursor-pointer"
                  />
                </div>

                {/* Tasting Tags */}
                <div>
                  <label className="text-[10px] text-decent-muted block mb-1">Flavor Tags</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {editTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center space-x-1 text-xs px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40"
                      >
                        <span>{tag}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveEditTag(tag)}
                          className="hover:text-rose-400 text-amber-400 font-bold ml-1 cursor-pointer"
                        >
                          ×
                        </button>
                      </span>
                    ))}

                    {isAddingEditTag ? (
                      <div className="inline-flex items-center space-x-1 bg-decent-surface px-2 py-0.5 rounded-lg border border-amber-400">
                        <input
                          type="text"
                          autoFocus
                          placeholder="Add tag..."
                          value={newEditTagInput}
                          onChange={(e) => setNewEditTagInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddEditTag(newEditTagInput);
                            } else if (e.key === "Escape") {
                              setIsAddingEditTag(false);
                            }
                          }}
                          className="w-20 bg-transparent text-xs text-white focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddEditTag(newEditTagInput)}
                          className="text-amber-400 hover:text-amber-300 font-bold"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsAddingEditTag(false)}
                          className="text-decent-muted hover:text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsAddingEditTag(true)}
                        className="px-2 py-0.5 rounded-lg border border-dashed border-amber-500/40 text-amber-300 hover:text-amber-200 text-xs flex items-center space-x-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Tag</span>
                      </button>
                    )}
                  </div>

                  {/* Quick Preset Suggestion Chips */}
                  <div className="flex flex-wrap gap-1">
                    {["Sweet", "Bright", "Floral", "Fruity", "Chocolate", "Clean", "Complex", "Juicy", "Balanced"].map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => handleAddEditTag(suggestion)}
                        className={`text-[9.5px] px-2 py-0.5 rounded-md border transition-all cursor-pointer ${
                          editTags.includes(suggestion)
                            ? "bg-amber-500/30 text-amber-300 border-amber-400 font-semibold"
                            : "bg-decent-surface text-decent-muted border-decent-border/60 hover:text-slate-200"
                        }`}
                      >
                        +{suggestion}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Barista Notes */}
                <div>
                  <label className="text-[10px] text-decent-muted block mb-1">Barista Notes</label>
                  <textarea
                    rows={2}
                    value={editBaristaNotes}
                    onChange={(e) => setEditBaristaNotes(e.target.value)}
                    placeholder="Describe puck prep, channel resistance, mouthfeel, or finish..."
                    className="w-full px-2.5 py-1.5 rounded-xl bg-decent-surface border border-decent-border text-white text-xs focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>
            </div>

            {/* Edit Footer Actions */}
            <div className="pt-2 flex items-center justify-between border-t border-decent-border/60 shrink-0">
              <button
                type="button"
                onClick={() => setEditingShot(null)}
                className="px-3.5 py-1.5 rounded-xl bg-decent-dark hover:bg-slate-800 border border-decent-border text-decent-muted hover:text-white text-xs font-semibold cursor-pointer transition-all"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSaveEdit}
                className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 text-xs font-bold flex items-center space-x-1.5 shadow-md transition-all active:scale-95 cursor-pointer"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>{showSavedToast ? "✓ Saved to Decaid History & DYE2!" : "Save & Sync to Decaid & DYE2"}</span>
              </button>
            </div>
          </div>
        )}
    </div>
  );

  if (embedded) {
    return drawerContent;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-start bg-black/75 backdrop-blur-sm select-none animate-in fade-in duration-150">
      {drawerContent}
    </div>
  );
};
