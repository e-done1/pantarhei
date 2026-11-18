import React, { useState, useMemo } from "react";
import type { PantaBean } from "../types/bean.ts";
import {
  formatVarietals,
  calculateRestDays,
  cloneBeanAsNewEntry,
  createNewBeanEntry,
  getVarietalsList,
} from "../types/bean.ts";
import {
  loadEquipmentInventory,
  getFreezerSlowdownFactor,
  type FreezerEquipmentItem,
} from "../types/equipment.ts";
import { BeanSearchIndex } from "../services/beanSearch.ts";
import {
  Search,
  Copy,
  Check,
  X,
  Sparkles,
  Plus,
  Scale,
  Pencil,
  ArrowLeft,
  Coffee,
  Snowflake,
  Sun,
  Mountain,
  Calendar,
  FileText,
  Zap,
  Thermometer,
} from "lucide-react";

interface BeanDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  beans: PantaBean[];
  activeBeanId?: string;
  onSelectBean: (bean: PantaBean) => void;
  onSaveBean: (newBean: PantaBean) => void;
  embedded?: boolean;
}

const COMMON_PACKAGE_SIZES = [
  { label: "200g", grams: 200 },
  { label: "250g", grams: 250 },
  { label: "300g", grams: 300 },
  { label: "500g", grams: 500 },
  { label: "1kg", grams: 1000 },
  { label: "2kg", grams: 2000 },
];

const POPULAR_ORIGINS = ["Ethiopia", "Colombia", "Panama", "Kenya", "Brazil", "Guatemala", "Costa Rica", "Yemen"];
const COMMON_PROCESSES = ["Washed", "Natural", "Honey", "Anaerobic", "Thermal Shock", "Wet Hulled"];
const ROAST_PROFILES = [
  "Ultra-Light/Nordic",
  "Light",
  "Medium-Light",
  "Medium",
  "Dark",
] as const;

export const BeanDrawer: React.FC<BeanDrawerProps> = ({
  isOpen,
  onClose,
  beans,
  activeBeanId,
  onSelectBean,
  onSaveBean,
  embedded = false,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRoaster, setSelectedRoaster] = useState<string | undefined>(undefined);
  const [inStockOnly, setInStockOnly] = useState(false);

  // Add / Edit Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBeanId, setEditingBeanId] = useState<string | null>(null);

  // Form Fields
  const [formName, setFormName] = useState("");
  const [formRoaster, setFormRoaster] = useState("");
  const [formCountry, setFormCountry] = useState("Ethiopia");
  const [formRegion, setFormRegion] = useState("");
  const [formFarm, setFormFarm] = useState("");
  const [formVarietal, setFormVarietal] = useState("Kurume, Dega");
  const [formProcess, setFormProcess] = useState("Washed");
  const [formAltitude, setFormAltitude] = useState("");
  const [formCropYear, setFormCropYear] = useState("");
  const [formRoastDate, setFormRoastDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [formRoastProfile, setFormRoastProfile] = useState<"Ultra-Light/Nordic" | "Light" | "Medium-Light" | "Medium" | "Dark">("Light");
  const [formTotalGrams, setFormTotalGrams] = useState<number>(250);
  const [formRemainingGrams, setFormRemainingGrams] = useState<number>(250);
  const [formTargetDose, setFormTargetDose] = useState<number>(18.0);
  const [formTargetYield, setFormTargetYield] = useState<number>(36.0);
  const [formTargetGrind, setFormTargetGrind] = useState("4.2");
  const [formPreferredBasket, setFormPreferredBasket] = useState("CB");
  const [formPreferredProfileId, setFormPreferredProfileId] = useState("");
  const [formBaristaNotes, setFormBaristaNotes] = useState("");
  const [formTastingNotes, setFormTastingNotes] = useState("Floral, Bergamot, Stone Fruit");
  const [formTags, setFormTags] = useState<string[]>(["Floral", "Bergamot", "Stone Fruit"]);
  const [newTagInput, setNewTagInput] = useState("");
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [formRestDays, setFormRestDays] = useState(14);
  const [formIsFrozen, setFormIsFrozen] = useState(false);
  const [formFrozenDate, setFormFrozenDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [formFreezerId, setFormFreezerId] = useState<string>("freezer-std");
  const [formFreezerName, setFormFreezerName] = useState<string>("Standard Freezer");
  const [formFreezerTemp, setFormFreezerTemp] = useState<number>(-18);

  const equipmentInv = useMemo(() => loadEquipmentInventory(), [isOpen]);
  const freezersList: FreezerEquipmentItem[] = equipmentInv.freezers;

  const POPULAR_TASTING_TAGS = [
    "Floral",
    "Bergamot",
    "Jasmine",
    "Stone Fruit",
    "Peach",
    "Citrus",
    "Chocolate",
    "Caramel",
    "Berry",
    "Sweet",
    "Tropical",
    "Honey",
  ];

  const handleAddCoffeeTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    if (!formTags.includes(trimmed)) {
      const updated = [...formTags, trimmed];
      setFormTags(updated);
      setFormTastingNotes(updated.join(", "));
    }
    setNewTagInput("");
    setIsAddingTag(false);
  };

  const handleRemoveCoffeeTag = (tagToRemove: string) => {
    const updated = formTags.filter((t) => t !== tagToRemove);
    setFormTags(updated);
    setFormTastingNotes(updated.join(", "));
  };

  // Total Available Stock Calculation across all beans
  const totalStockGrams = useMemo(() => {
    return beans.reduce((acc, b) => acc + (b.remainingGrams || 0), 0);
  }, [beans]);

  const totalStockFormatted = useMemo(() => {
    if (totalStockGrams >= 1000) {
      return `${(totalStockGrams / 1000).toFixed(2)} kg`;
    }
    return `${totalStockGrams}g`;
  }, [totalStockGrams]);

  // Inverted search index
  const searchIndex = useMemo(() => new BeanSearchIndex(beans), [beans]);

  // Filtered beans
  const filteredBeans = useMemo(() => {
    return searchIndex.search(searchQuery, {
      roaster: selectedRoaster,
      inStock: inStockOnly ? true : undefined,
    });
  }, [searchIndex, searchQuery, selectedRoaster, inStockOnly]);

  const uniqueRoasters = useMemo(() => searchIndex.getUniqueRoasters(), [searchIndex]);

  if (!isOpen) return null;

  // Open Form to Add Brand New Coffee
  const handleOpenAddForm = () => {
    setEditingBeanId(null);
    setFormName("");
    setFormRoaster(uniqueRoasters[0] || "");
    setFormCountry("Ethiopia");
    setFormRegion("");
    setFormFarm("");
    setFormVarietal("Heirloom");
    setFormProcess("Washed");
    setFormAltitude("");
    setFormCropYear(new Date().getFullYear().toString());
    setFormRoastDate(new Date().toISOString().split("T")[0]);
    setFormRoastProfile("Light");
    setFormTotalGrams(250);
    setFormRemainingGrams(250);
    setFormTargetDose(18.0);
    setFormTargetYield(36.0);
    setFormTargetGrind("4.0");
    setFormPreferredBasket("CB");
    setFormPreferredProfileId("");
    setFormBaristaNotes("");
    setFormTastingNotes("");
    setFormTags([]);
    setFormRestDays(14);
    setFormIsFrozen(false);
    setFormFrozenDate(new Date().toISOString().split("T")[0]);
    setFormFreezerId(freezersList[0]?.id || "freezer-std");
    setFormFreezerName(freezersList[0]?.name || "Standard Freezer");
    setFormFreezerTemp(freezersList[0]?.temperatureC ?? -18);
    setIsFormOpen(true);
  };

  // Open Form to Edit Existing Coffee (Allows fixing typos or adding missing details)
  const handleOpenEditForm = (e: React.MouseEvent, bean: PantaBean) => {
    e.stopPropagation();
    setEditingBeanId(bean.id);
    setFormName(bean.name);
    setFormRoaster(bean.roaster);
    setFormCountry(bean.countryOfOrigin);
    setFormRegion(bean.region || "");
    setFormFarm(bean.farm || "");
    setFormVarietal(formatVarietals(bean.varietal));
    setFormProcess(bean.process);
    setFormAltitude(bean.altitude || "");
    setFormCropYear(bean.cropYear || "");
    setFormRoastDate(bean.roastDate);
    setFormRoastProfile(bean.roastProfile || "Light");
    setFormTotalGrams(bean.totalGrams || 250);
    setFormRemainingGrams(bean.remainingGrams ?? bean.totalGrams ?? 250);
    setFormTargetDose(bean.targetDose || 18.0);
    setFormTargetYield(bean.targetYield || 36.0);
    setFormTargetGrind(bean.targetGrind || "4.0");
    setFormPreferredBasket(bean.preferredBasket || "CB");
    setFormPreferredProfileId(bean.preferredProfileId || "");
    setFormBaristaNotes(bean.baristaNotes || "");
    const tags = bean.tastingNotes && Array.isArray(bean.tastingNotes) ? [...bean.tastingNotes] : [];
    setFormTags(tags);
    setFormTastingNotes(tags.join(", "));
    setFormRestDays(bean.recommendedRestDays ?? 14);
    setFormIsFrozen(Boolean(bean.isFrozen));
    setFormFrozenDate(bean.frozenDate || (bean.roastDate || new Date().toISOString().split("T")[0]));
    setFormFreezerId(bean.freezerId || freezersList[0]?.id || "freezer-std");
    setFormFreezerName(bean.freezerName || freezersList[0]?.name || "Standard Freezer");
    setFormFreezerTemp(typeof bean.freezerTempC === "number" ? bean.freezerTempC : (freezersList[0]?.temperatureC ?? -18));
    setIsFormOpen(true);
  };

  // Clone action
  const handleClone = (e: React.MouseEvent, source: PantaBean) => {
    e.stopPropagation();
    const cloned = cloneBeanAsNewEntry(source);
    onSaveBean(cloned);
    onSelectBean(cloned);
  };

  // Quick Dose Decrement (-18g dose)
  const handleQuickDeduct = (e: React.MouseEvent, bean: PantaBean) => {
    e.stopPropagation();
    const dose = bean.targetDose || 18.0;
    const updatedRemaining = Math.max(0, Math.round((bean.remainingGrams - dose) * 10) / 10);
    const updated: PantaBean = {
      ...bean,
      remainingGrams: updatedRemaining,
      updatedAt: new Date().toISOString(),
    };
    onSaveBean(updated);
    if (bean.id === activeBeanId) {
      onSelectBean(updated);
    }
  };

  // Save Form (New or Edit)
  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();

    const varietalsArray = getVarietalsList(formVarietal);
    const notesArray =
      formTags.length > 0
        ? formTags
        : formTastingNotes
            .split(/[,/]/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0);

    if (editingBeanId) {
      const existing = beans.find((b) => b.id === editingBeanId);
      if (existing) {
        const updated: PantaBean = {
          ...existing,
          name: formName.trim() || "Untitled Lot",
          roaster: formRoaster.trim() || "Unknown Roaster",
          countryOfOrigin: formCountry.trim() || "Single Origin",
          region: formRegion.trim() || undefined,
          farm: formFarm.trim() || undefined,
          varietal: varietalsArray.length > 0 ? varietalsArray : formVarietal,
          process: formProcess.trim() || "Washed",
          altitude: formAltitude.trim() || undefined,
          cropYear: formCropYear.trim() || undefined,
          roastDate: formRoastDate,
          roastProfile: formRoastProfile,
          totalGrams: Number(formTotalGrams) || 250,
          remainingGrams: Math.min(Number(formTotalGrams) || 250, Number(formRemainingGrams) || 0),
          targetDose: Number(formTargetDose) || 18.0,
          targetYield: Number(formTargetYield) || 36.0,
          targetGrind: formTargetGrind.trim() || "4.0",
          preferredBasket: formPreferredBasket.trim() || undefined,
          preferredProfileId: formPreferredProfileId.trim() || undefined,
          baristaNotes: formBaristaNotes.trim() || undefined,
          tastingNotes: notesArray,
          recommendedRestDays: Number(formRestDays) || 14,
          isFrozen: formIsFrozen,
          frozenDate: formIsFrozen ? (formFrozenDate || new Date().toISOString().split("T")[0]) : undefined,
          freezerId: formIsFrozen ? formFreezerId : undefined,
          freezerName: formIsFrozen ? formFreezerName : undefined,
          freezerTempC: formIsFrozen ? Number(formFreezerTemp) || -18 : undefined,
          updatedAt: new Date().toISOString(),
        };
        onSaveBean(updated);
        if (updated.id === activeBeanId) {
          onSelectBean(updated);
        }
      }
    } else {
      const newEntry = createNewBeanEntry({
        name: formName,
        roaster: formRoaster,
        countryOfOrigin: formCountry,
        region: formRegion,
        farm: formFarm,
        varietal: varietalsArray.length > 0 ? varietalsArray : formVarietal,
        process: formProcess,
        altitude: formAltitude,
        cropYear: formCropYear,
        roastDate: formRoastDate,
        roastProfile: formRoastProfile,
        totalGrams: Number(formTotalGrams) || 250,
        remainingGrams: Number(formRemainingGrams) || Number(formTotalGrams) || 250,
        targetDose: Number(formTargetDose) || 18.0,
        targetYield: Number(formTargetYield) || 36.0,
        targetGrind: formTargetGrind,
        preferredBasket: formPreferredBasket,
        preferredProfileId: formPreferredProfileId,
        baristaNotes: formBaristaNotes,
        tastingNotes: notesArray,
        recommendedRestDays: Number(formRestDays) || 14,
        isFrozen: formIsFrozen,
        frozenDate: formIsFrozen ? (formFrozenDate || new Date().toISOString().split("T")[0]) : undefined,
        freezerId: formIsFrozen ? formFreezerId : undefined,
        freezerName: formIsFrozen ? formFreezerName : undefined,
        freezerTempC: formIsFrozen ? Number(formFreezerTemp) || -18 : undefined,
      });

      onSaveBean(newEntry);
      onSelectBean(newEntry);
    }

    setIsFormOpen(false);
  };

  if (!isOpen) return null;

  const drawerContent = (
    <div
      className={
        embedded
          ? "w-full h-full flex flex-col min-h-0 bg-slate-900/95 border border-slate-700/80 rounded-2xl p-4 lg:p-5 shadow-2xl overflow-hidden select-none"
          : "w-[520px] h-full bg-decent-surface border-r border-decent-border shadow-2xl flex flex-col p-5 min-h-0 select-none"
      }
    >
        {/* Header with Total Available Weight */}
        <div className="flex items-center justify-between pb-3 border-b border-decent-border/60 shrink-0">
          <div>
            <h2 className="text-base font-bold text-white flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Coffee Inventory & Dial-in Memory</span>
            </h2>
            <div className="text-xs text-decent-muted flex items-center space-x-2 mt-0.5">
              <span>{beans.length} lots</span>
              <span>·</span>
              <span className="text-amber-300 font-semibold flex items-center space-x-1">
                <Scale className="w-3 h-3 text-amber-400" />
                <span>Total Available: {totalStockFormatted}</span>
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {!isFormOpen && (
              <button
                type="button"
                onClick={handleOpenAddForm}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer"
                title="Add a brand new coffee lot from scratch"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                <span>Add Coffee</span>
              </button>
            )}

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
        </div>

        {/* VIEW 1: ADD OR EDIT COFFEE FORM */}
        {isFormOpen ? (
          <form onSubmit={handleSaveForm} className="flex-1 flex flex-col overflow-y-auto mt-3 pr-1 space-y-3.5">
            <div className="flex items-center justify-between pb-1 border-b border-decent-border/40">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="flex items-center space-x-1 text-xs text-decent-muted hover:text-white transition-all cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Inventory</span>
              </button>
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                {editingBeanId ? "Edit Coffee Lot" : "Add Brand New Lot"}
              </span>
            </div>

            {/* Coffee Name & Roaster */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-decent-muted uppercase tracking-wider mb-1">
                  Coffee / Lot Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Worka Sakaro, Pink Bourbon"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-decent-dark border border-decent-border text-xs text-white placeholder-decent-muted/60 focus:outline-none focus:border-amber-500/80"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-decent-muted uppercase tracking-wider mb-1">
                  Roaster *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sey, April, Onyx"
                  value={formRoaster}
                  onChange={(e) => setFormRoaster(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-decent-dark border border-decent-border text-xs text-white placeholder-decent-muted/60 focus:outline-none focus:border-amber-500/80"
                />
              </div>
            </div>

            {/* Country of Origin & Quick Origin Chips */}
            <div>
              <label className="block text-[11px] font-semibold text-decent-muted uppercase tracking-wider mb-1">
                Country of Origin *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Ethiopia, Colombia"
                value={formCountry}
                onChange={(e) => setFormCountry(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl bg-decent-dark border border-decent-border text-xs text-white placeholder-decent-muted/60 focus:outline-none focus:border-amber-500/80"
              />
              <div className="flex flex-wrap gap-1 mt-1.5">
                {POPULAR_ORIGINS.map((orig) => (
                  <button
                    key={orig}
                    type="button"
                    onClick={() => setFormCountry(orig)}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-medium border transition-all ${
                      formCountry === orig
                        ? "bg-amber-500/30 text-amber-300 border-amber-500/80"
                        : "bg-decent-dark text-decent-muted border-decent-border hover:border-slate-500"
                    }`}
                  >
                    {orig}
                  </button>
                ))}
              </div>
            </div>

            {/* Region & Farm / Producer (Separate inputs for clean typo fixing & missing info) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-decent-muted uppercase tracking-wider mb-1">
                  Region / Washing Station
                </label>
                <input
                  type="text"
                  placeholder="e.g. Gedeb, Yirgacheffe, Cauca"
                  value={formRegion}
                  onChange={(e) => setFormRegion(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-decent-dark border border-decent-border text-xs text-white placeholder-decent-muted/60 focus:outline-none focus:border-amber-500/80"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-decent-muted uppercase tracking-wider mb-1">
                  Farm / Estate / Producer
                </label>
                <input
                  type="text"
                  placeholder="e.g. Finca El Paraiso, Worka Co-op"
                  value={formFarm}
                  onChange={(e) => setFormFarm(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-decent-dark border border-decent-border text-xs text-white placeholder-decent-muted/60 focus:outline-none focus:border-amber-500/80"
                />
              </div>
            </div>

            {/* Altitude & Harvest Crop Year */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-decent-muted uppercase tracking-wider mb-1 flex items-center space-x-1">
                  <Mountain className="w-3 h-3 text-cyan-400" />
                  <span>Altitude / Elevation</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 2100m, 1850-2100m"
                  value={formAltitude}
                  onChange={(e) => setFormAltitude(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-decent-dark border border-decent-border text-xs text-white placeholder-decent-muted/60 focus:outline-none focus:border-amber-500/80 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-decent-muted uppercase tracking-wider mb-1 flex items-center space-x-1">
                  <Calendar className="w-3 h-3 text-amber-400" />
                  <span>Crop / Harvest Year</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 2024, 2023/2024"
                  value={formCropYear}
                  onChange={(e) => setFormCropYear(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-decent-dark border border-decent-border text-xs text-white placeholder-decent-muted/60 focus:outline-none focus:border-amber-500/80 font-mono"
                />
              </div>
            </div>

            {/* Varietals */}
            <div>
              <label className="block text-[11px] font-semibold text-decent-muted uppercase tracking-wider mb-1">
                Varietals (comma or slash separated)
              </label>
              <input
                type="text"
                placeholder="e.g. Geisha, Pink Bourbon, SL28, SL34"
                value={formVarietal}
                onChange={(e) => setFormVarietal(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl bg-decent-dark border border-decent-border text-xs text-white placeholder-decent-muted/60 focus:outline-none focus:border-amber-500/80"
              />
            </div>

            {/* Process & Quick Chips */}
            <div>
              <label className="block text-[11px] font-semibold text-decent-muted uppercase tracking-wider mb-1">
                Processing Method
              </label>
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {COMMON_PROCESSES.map((proc) => (
                  <button
                    key={proc}
                    type="button"
                    onClick={() => setFormProcess(proc)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                      formProcess === proc
                        ? "bg-emerald-500/30 text-emerald-300 border-emerald-500/80"
                        : "bg-decent-dark text-decent-muted border-decent-border hover:border-slate-500"
                    }`}
                  >
                    {proc}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Or type custom process (e.g. Anaerobic Natural, Koji)"
                value={formProcess}
                onChange={(e) => setFormProcess(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl bg-decent-dark border border-decent-border text-xs text-white placeholder-decent-muted/60 focus:outline-none focus:border-amber-500/80"
              />
            </div>

            {/* Roast Profile Selector */}
            <div>
              <label className="block text-[11px] font-semibold text-decent-muted uppercase tracking-wider mb-1">
                Roast Profile / Degree
              </label>
              <div className="flex flex-wrap gap-1.5">
                {ROAST_PROFILES.map((profile) => (
                  <button
                    key={profile}
                    type="button"
                    onClick={() => setFormRoastProfile(profile)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                      formRoastProfile === profile
                        ? "bg-amber-500/30 text-amber-300 border-amber-500/80"
                        : "bg-decent-dark text-decent-muted border-decent-border hover:border-slate-500"
                    }`}
                  >
                    {profile}
                  </button>
                ))}
              </div>
            </div>

            {/* TOTAL AVAILABLE WEIGHT & PACKAGE SIZES (200g, 250g, 1kg, etc.) */}
            <div className="p-3 rounded-2xl bg-decent-dark/70 border border-decent-border/60 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                  <Scale className="w-3.5 h-3.5 text-amber-400" />
                  <span>Package & Available Weight</span>
                </span>
                <span className="text-[11px] font-mono text-amber-400 font-bold">
                  {formTotalGrams >= 1000
                    ? `${(formTotalGrams / 1000).toFixed(2)} kg`
                    : `${formTotalGrams}g`}{" "}
                  package
                </span>
              </div>

              {/* Fast Preset Package Size Chips */}
              <div className="flex flex-wrap gap-1.5">
                {COMMON_PACKAGE_SIZES.map((size) => (
                  <button
                    key={size.label}
                    type="button"
                    onClick={() => {
                      setFormTotalGrams(size.grams);
                      if (formRemainingGrams === formTotalGrams || !editingBeanId) {
                        setFormRemainingGrams(size.grams);
                      }
                    }}
                    className={`px-2.5 py-1 rounded-xl text-xs font-mono font-bold border transition-all ${
                      formTotalGrams === size.grams
                        ? "bg-amber-500 text-slate-950 border-amber-400 shadow-md scale-105"
                        : "bg-decent-surface text-decent-muted border-decent-border hover:border-slate-400"
                    }`}
                  >
                    {size.label}
                  </button>
                ))}
              </div>

              {/* Precise Grams Input */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[10px] text-decent-muted uppercase tracking-wider mb-0.5">
                    Total Bag Size (grams)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    step="1"
                    value={formTotalGrams}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      setFormTotalGrams(val);
                      if (formRemainingGrams === formTotalGrams || !editingBeanId) {
                        setFormRemainingGrams(val);
                      }
                    }}
                    className="w-full px-3 py-1.5 rounded-xl bg-decent-surface border border-decent-border font-mono text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-decent-muted uppercase tracking-wider mb-0.5">
                    Currently Available (grams)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={formTotalGrams}
                    step="1"
                    value={formRemainingGrams}
                    onChange={(e) => setFormRemainingGrams(Number(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 rounded-xl bg-decent-surface border border-decent-border font-mono text-xs text-emerald-400 font-bold focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>
            </div>

            {/* Roast Date & Rest Days */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-decent-muted uppercase tracking-wider mb-1">
                  Roast Date
                </label>
                <input
                  type="date"
                  value={formRoastDate}
                  onChange={(e) => setFormRoastDate(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-decent-dark border border-decent-border text-xs text-white focus:outline-none focus:border-amber-500/80 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-decent-muted uppercase tracking-wider mb-1">
                  Rec. Rest Window (Days)
                </label>
                <input
                  type="number"
                  min="0"
                  max="90"
                  value={formRestDays}
                  onChange={(e) => setFormRestDays(Number(e.target.value) || 14)}
                  className="w-full px-3 py-1.5 rounded-xl bg-decent-dark border border-decent-border text-xs text-white font-mono focus:outline-none focus:border-amber-500/80"
                />
              </div>
            </div>

            {/* Dial-in Target Dose, Yield & Grind */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-decent-muted uppercase tracking-wider mb-0.5">
                  Target Dose (g)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formTargetDose}
                  onChange={(e) => setFormTargetDose(Number(e.target.value) || 18.0)}
                  className="w-full px-2 py-1.5 rounded-xl bg-decent-dark border border-decent-border font-mono text-xs text-white focus:outline-none focus:border-amber-500/80"
                />
              </div>

              <div>
                <label className="block text-[10px] text-decent-muted uppercase tracking-wider mb-0.5">
                  Target Yield (g)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formTargetYield}
                  onChange={(e) => setFormTargetYield(Number(e.target.value) || 36.0)}
                  className="w-full px-2 py-1.5 rounded-xl bg-decent-dark border border-decent-border font-mono text-xs text-white focus:outline-none focus:border-amber-500/80"
                />
              </div>

              <div>
                <label className="block text-[10px] text-decent-muted uppercase tracking-wider mb-0.5">
                  Grind Setting
                </label>
                <input
                  type="text"
                  placeholder="e.g. 4.2"
                  value={formTargetGrind}
                  onChange={(e) => setFormTargetGrind(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-xl bg-decent-dark border border-decent-border font-mono text-xs text-white focus:outline-none focus:border-amber-500/80"
                />
              </div>
            </div>

            {/* Associated Tags / Tasting Notes (Wrapped lines with Add & Remove) */}
            <div>
              <label className="block text-[11px] font-semibold text-decent-muted uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span>Associated Coffee Tags / Tasting Notes</span>
                <span className="text-[10px] text-amber-400 font-mono">
                  {formTags.length} {formTags.length === 1 ? "tag" : "tags"}
                </span>
              </label>

              {/* Active Tags with Remove button */}
              <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-decent-dark/80 border border-decent-border/60 min-h-[42px] items-center">
                {formTags.length === 0 && !isAddingTag && (
                  <span className="text-[11px] text-decent-muted italic">
                    No tags associated yet. Add custom tags below or pick from suggestions.
                  </span>
                )}
                {formTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  >
                    <span>{tag}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveCoffeeTag(tag)}
                      className="ml-1.5 w-3.5 h-3.5 rounded-full hover:bg-rose-600 hover:text-white flex items-center justify-center text-[11px] font-bold text-amber-400 transition-colors cursor-pointer"
                      title={`Remove tag "${tag}"`}
                    >
                      ×
                    </button>
                  </span>
                ))}

                {/* Inline Add Tag Input */}
                {isAddingTag ? (
                  <div className="inline-flex items-center space-x-1 bg-decent-card px-2 py-0.5 rounded-lg border border-amber-500/50">
                    <input
                      type="text"
                      autoFocus
                      placeholder="Tag descriptor..."
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddCoffeeTag(newTagInput);
                        } else if (e.key === "Escape") {
                          setIsAddingTag(false);
                        }
                      }}
                      className="w-24 bg-transparent text-xs text-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddCoffeeTag(newTagInput)}
                      className="text-amber-400 hover:text-amber-300 text-xs font-bold cursor-pointer"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddingTag(false)}
                      className="text-decent-muted hover:text-white text-xs cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsAddingTag(true)}
                    className="px-2 py-1 text-xs font-semibold rounded-lg border border-dashed border-amber-500/50 text-amber-300/80 hover:text-amber-300 hover:border-amber-400 flex items-center space-x-1 cursor-pointer transition-all"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Tag</span>
                  </button>
                )}
              </div>

              {/* Quick Popular Descriptor Suggestions */}
              <div className="flex flex-wrap gap-1 mt-2">
                <span className="text-[10px] text-decent-muted mr-1 self-center uppercase">Suggestions:</span>
                {POPULAR_TASTING_TAGS.map((tag) => {
                  const isAlreadyAdded = formTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      disabled={isAlreadyAdded}
                      onClick={() => handleAddCoffeeTag(tag)}
                      className={`px-2 py-0.5 rounded-md text-[10.5px] border transition-all cursor-pointer ${
                        isAlreadyAdded
                          ? "opacity-35 bg-decent-dark text-decent-muted border-decent-border/40 cursor-not-allowed"
                          : "bg-decent-dark text-slate-300 border-decent-border hover:border-amber-500/50 hover:text-amber-300 active:scale-95"
                      }`}
                    >
                      + {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Equipment Pairing: Preferred Basket & Extraction Profile */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-decent-muted uppercase tracking-wider mb-1">
                  Preferred Basket
                </label>
                <input
                  type="text"
                  placeholder="e.g. CB, NB, IMS 18g, Wafo"
                  value={formPreferredBasket}
                  onChange={(e) => setFormPreferredBasket(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-decent-dark border border-decent-border text-xs text-white placeholder-decent-muted/60 focus:outline-none focus:border-amber-500/80 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-decent-muted uppercase tracking-wider mb-1">
                  Preferred Profile ID / Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. sey-flow, strega-plus"
                  value={formPreferredProfileId}
                  onChange={(e) => setFormPreferredProfileId(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-decent-dark border border-decent-border text-xs text-white placeholder-decent-muted/60 focus:outline-none focus:border-amber-500/80 font-mono"
                />
              </div>
            </div>

            {/* Storage Method Selection (Room Temperature vs Freezer Stasis) */}
            <div>
              <label className="block text-[11px] font-semibold text-decent-muted uppercase tracking-wider mb-1">
                Storage Method
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFormIsFrozen(false)}
                  className={`p-2.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                    !formIsFrozen
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/90 shadow-sm"
                      : "bg-decent-dark text-decent-muted border-decent-border hover:border-slate-500"
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <Sun className={`w-4 h-4 ${!formIsFrozen ? "text-amber-400" : "text-decent-muted"}`} />
                    <div className="text-left">
                      <div className="text-xs font-semibold text-white">Room Temperature</div>
                      <div className="text-[10px] text-decent-muted font-normal">Ambient bar storage</div>
                    </div>
                  </div>
                  {!formIsFrozen && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setFormIsFrozen(true);
                    if (!formFrozenDate) {
                      setFormFrozenDate(new Date().toISOString().split("T")[0]);
                    }
                  }}
                  className={`p-2.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                    formIsFrozen
                      ? "bg-cyan-500/20 text-cyan-300 border-cyan-400/90 shadow-sm"
                      : "bg-decent-dark text-decent-muted border-decent-border hover:border-slate-500"
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <Snowflake className={`w-4 h-4 ${formIsFrozen ? "text-cyan-400 animate-pulse" : "text-decent-muted"}`} />
                    <div className="text-left">
                      <div className="text-xs font-semibold text-white">Freezer Storage</div>
                      <div className="text-[10px] text-cyan-300/80 font-normal">Deep freeze stasis</div>
                    </div>
                  </div>
                  {formIsFrozen && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                </button>
              </div>

              {/* Multi-Freezer & Cabin Temperature Configuration (Visible when Freezer Storage is selected) */}
              {formIsFrozen && (
                <div className="mt-2.5 p-3.5 rounded-xl bg-cyan-950/25 border border-cyan-500/40 space-y-3 animate-in fade-in duration-200">
                  {/* Multi-Freezer Selection */}
                  <div>
                    <label className="text-[11px] font-semibold text-cyan-300 uppercase tracking-wider flex items-center justify-between mb-1.5">
                      <span className="flex items-center space-x-1.5">
                        <Snowflake className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Select Cold Storage Unit</span>
                      </span>
                      <span className="text-[10px] text-cyan-400 font-mono">
                        {freezersList.length} {freezersList.length === 1 ? "unit" : "units"} available
                      </span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {freezersList.map((f) => {
                        const isChosen = formFreezerId === f.id;
                        return (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => {
                              setFormFreezerId(f.id);
                              setFormFreezerName(f.name);
                              setFormFreezerTemp(f.temperatureC);
                            }}
                            className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                              isChosen
                                ? "bg-cyan-500/30 text-white border-cyan-400 shadow-sm"
                                : "bg-decent-dark text-decent-muted border-decent-border hover:border-slate-500 hover:text-white"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold">{f.name}</span>
                              <span className="text-[10px] font-mono text-cyan-400">{f.temperatureC}°C</span>
                            </div>
                            <div className="text-[10px] text-cyan-300/70 mt-0.5">
                              {getFreezerSlowdownFactor(f.temperatureC)}× slowdown
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Cabin Temperature & Slowdown Factor Readout */}
                  <div className="p-2.5 rounded-lg bg-decent-dark border border-cyan-500/30 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Thermometer className="w-4 h-4 text-cyan-400 shrink-0" />
                      <div>
                        <div className="text-xs font-medium text-white flex items-center space-x-1.5">
                          <span>Cabin Temperature:</span>
                          <span className="font-mono text-cyan-300 font-bold">{formFreezerTemp}°C</span>
                        </div>
                        <div className="text-[10px] text-cyan-200/80">
                          {(() => {
                            const factor = getFreezerSlowdownFactor(formFreezerTemp);
                            return `Slows aging by ${factor}× (${factor} days frozen = 1 day room temp)`;
                          })()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <input
                        type="number"
                        step="1"
                        max="0"
                        min="-100"
                        value={formFreezerTemp}
                        onChange={(e) => setFormFreezerTemp(Number(e.target.value) || -18)}
                        className="w-16 px-2 py-1 rounded bg-black/60 border border-cyan-500/50 text-xs font-mono text-cyan-300 text-center focus:outline-none focus:border-cyan-400"
                      />
                      <span className="text-xs text-decent-muted">°C</span>
                    </div>
                  </div>

                  {/* Date Put in Freezer */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-cyan-300 uppercase tracking-wider flex items-center space-x-1.5">
                        <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Date Put in Freezer</span>
                      </label>
                      {formFrozenDate && (
                        <span className="text-[10.5px] font-mono text-cyan-400 font-semibold">
                          {(() => {
                            const today = new Date().getTime();
                            const fDate = new Date(formFrozenDate).getTime();
                            const diff = Math.max(0, Math.floor((today - fDate) / (1000 * 60 * 60 * 24)));
                            return `${diff} ${diff === 1 ? "day" : "days"} in freezer`;
                          })()}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="relative flex-1">
                        <input
                          type="date"
                          value={formFrozenDate}
                          max={new Date().toISOString().split("T")[0]}
                          onChange={(e) => setFormFrozenDate(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg bg-decent-dark border border-cyan-500/50 text-xs font-mono text-white focus:outline-none focus:border-cyan-400 transition-colors"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormFrozenDate(new Date().toISOString().split("T")[0])}
                        className="px-2.5 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-xs font-semibold text-cyan-300 transition-all active:scale-95 cursor-pointer shrink-0"
                      >
                        Today
                      </button>
                    </div>
                  </div>

                  {/* Live Physiological Actual Aging Preview */}
                  {(() => {
                    const today = new Date().getTime();
                    const roastTime = new Date(formRoastDate || new Date()).getTime();
                    const frozenTime = new Date(formFrozenDate || new Date()).getTime();
                    const totalDaysSinceRoast = Math.max(0, Math.floor((today - roastTime) / (1000 * 60 * 60 * 24)));
                    const daysRoomRest = Math.max(0, Math.floor((Math.min(today, frozenTime) - roastTime) / (1000 * 60 * 60 * 24)));
                    const daysFrozen = Math.max(0, Math.floor((today - Math.max(roastTime, frozenTime)) / (1000 * 60 * 60 * 24)));
                    const factor = getFreezerSlowdownFactor(formFreezerTemp);
                    const actualAge = Math.round((daysRoomRest + daysFrozen / factor) * 10) / 10;

                    return (
                      <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/40 text-emerald-300">
                        <div className="flex items-center space-x-1.5 text-xs font-bold">
                          <Zap className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Calculated Actual Aging: ~{actualAge} days</span>
                          <span className="text-emerald-400/70 font-normal font-mono">(vs {totalDaysSinceRoast} calendar days)</span>
                        </div>
                        <div className="text-[10.5px] text-emerald-300/80 mt-1 font-mono">
                          Room rest: {daysRoomRest}d · Frozen: {daysFrozen}d at {formFreezerTemp}°C ({factor}× slowdown)
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Barista Puck Prep Notes */}
            <div>
              <label className="block text-[11px] font-semibold text-decent-muted uppercase tracking-wider mb-1 flex items-center space-x-1">
                <FileText className="w-3 h-3 text-amber-400" />
                <span>Barista Puck Prep & Dial-in Notes</span>
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Bottom paper filter, 100°C water, gentle tamp, 15s preinfusion..."
                value={formBaristaNotes}
                onChange={(e) => setFormBaristaNotes(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl bg-decent-dark border border-decent-border text-xs text-white placeholder-decent-muted/60 focus:outline-none focus:border-amber-500/80 resize-none leading-relaxed"
              />
            </div>

            {/* Submit & Cancel Actions */}
            <div className="pt-2 flex items-center justify-end space-x-2 border-t border-decent-border/50">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="px-4 py-2 rounded-xl bg-decent-dark border border-decent-border text-xs font-semibold text-decent-muted hover:text-white transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-lg transition-all active:scale-95 cursor-pointer"
              >
                {editingBeanId ? "Save Changes" : "Add to Inventory & Activate"}
              </button>
            </div>
          </form>
        ) : (
          /* VIEW 2: COFFEE INVENTORY LIST */
          <>
            {/* Multi-Token Search Bar */}
            <div className="my-2.5 relative shrink-0">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-decent-muted" />
              <input
                type="text"
                placeholder="Search farm, varietal, roaster, origin, altitude..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 rounded-xl bg-decent-dark border border-decent-border text-xs text-white placeholder-decent-muted focus:outline-none focus:border-amber-500/70"
              />
            </div>

            {/* Facet Chips */}
            <div className="flex items-center space-x-1.5 overflow-x-auto pb-1.5 mb-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setInStockOnly(!inStockOnly)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-full border whitespace-nowrap transition-all ${
                  inStockOnly
                    ? "bg-emerald-500/30 text-emerald-300 border-emerald-400"
                    : "bg-decent-dark text-decent-muted border-decent-border"
                }`}
              >
                In Stock Only
              </button>
              {uniqueRoasters.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setSelectedRoaster(selectedRoaster === r ? undefined : r)}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-full border whitespace-nowrap transition-all ${
                    selectedRoaster === r
                      ? "bg-amber-500/30 text-amber-300 border-amber-400"
                      : "bg-decent-dark text-decent-muted border-decent-border"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            {/* Beans List with Available Weight Indicators */}
            <div className={`flex-1 overflow-y-auto space-y-2.5 pr-1 min-h-0 ${embedded ? "grid grid-cols-1 md:grid-cols-2 gap-2.5 space-y-0" : ""}`}>
              {filteredBeans.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-center p-4 rounded-2xl bg-decent-dark/40 border border-decent-border/40">
                  <Coffee className="w-8 h-8 text-decent-muted mb-2 opacity-50" />
                  <span className="text-xs font-semibold text-white">No matching coffees found</span>
                  <p className="text-[11px] text-decent-muted mt-1 max-w-xs">
                    Try adjusting your search query, or click "+ Add Coffee" above to create a new lot.
                  </p>
                </div>
              ) : (
                filteredBeans.map((b) => {
                  const isSelected = b.id === activeBeanId;
                  const rest = calculateRestDays(b, new Date(), freezersList);
                  const totalGrams = b.totalGrams || 250;
                  const remainingGrams = b.remainingGrams ?? totalGrams;
                  const pctRemaining = Math.round((remainingGrams / totalGrams) * 100);

                  const totalLabel = totalGrams >= 1000 ? `${(totalGrams / 1000).toFixed(1)}kg` : `${totalGrams}g`;

                  return (
                    <div
                      key={b.id}
                      onClick={() => {
                        onSelectBean(b);
                        onClose();
                      }}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-amber-950/20 border-amber-500/80 shadow-md"
                          : "bg-decent-card border-decent-border/60 hover:border-slate-500"
                      }`}
                    >
                      {/* Top Row: Roaster, Storage & Days After Roast & Active Badge */}
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-semibold text-amber-400">{b.roaster}</span>
                        <div className="flex items-center space-x-2">
                          <div className="flex items-center flex-wrap gap-1 text-[10px] px-2 py-0.5 rounded-full bg-decent-dark border border-decent-border">
                            <span className="font-mono text-slate-300 font-medium">{rest.roastAgeText}</span>
                            <span className="text-decent-muted">·</span>
                            <span className={`flex items-center font-semibold ${b.isFrozen ? "text-cyan-400" : "text-amber-300"}`}>
                              {b.isFrozen && <Snowflake className="w-2.5 h-2.5 mr-0.5 text-cyan-400" />}
                              <span>{rest.storageLabel}</span>
                            </span>
                            {b.isFrozen && rest.freezerAgeText && (
                              <>
                                <span className="text-decent-muted">·</span>
                                <span className="text-cyan-300 font-mono font-medium">{rest.freezerAgeText}</span>
                              </>
                            )}
                            {b.isFrozen && rest.actualAgeText && (
                              <>
                                <span className="text-decent-muted">·</span>
                                <span className="text-emerald-400 font-mono font-bold" title="Effective physiological aging based on storage temperature slowdown">
                                  ~{rest.actualAgeText}
                                </span>
                              </>
                            )}
                          </div>
                          {isSelected && (
                            <span className="flex items-center text-emerald-400 text-xs font-bold">
                              <Check className="w-3.5 h-3.5 mr-0.5" /> Active
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Bean Name */}
                      <div className="flex items-center space-x-1.5">
                        <div className="text-sm font-bold text-white truncate">{b.name}</div>
                        {b.isFrozen && (
                          <Snowflake className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        )}
                        {b.roastProfile && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
                            {b.roastProfile}
                          </span>
                        )}
                      </div>

                      {/* Origin & Terroir */}
                      <div className="text-xs text-decent-muted mt-0.5">
                        {b.countryOfOrigin}
                        {b.region ? ` · ${b.region}` : ""}
                        {b.farm ? ` · ${b.farm}` : ""}
                        {b.altitude ? ` · ${b.altitude}` : ""}
                        {b.cropYear ? ` · ${b.cropYear}` : ""}
                      </div>

                      <div className="text-[11px] text-decent-muted mt-0.5">
                        Varietals: <span className="text-slate-300 font-medium">{formatVarietals(b.varietal)}</span> · {b.process}
                      </div>

                      {/* Associated Coffee Tags / Tasting Notes */}
                      {b.tastingNotes && b.tastingNotes.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {b.tastingNotes.map((note) => (
                            <span
                              key={note}
                              className="text-[9.5px] px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/25"
                            >
                              {note}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* TOTAL AVAILABLE WEIGHT & PERCENTAGE PROGRESS BAR */}
                      <div className="mt-2 pt-2 border-t border-decent-border/40">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="text-decent-muted flex items-center space-x-1">
                            <Scale className="w-3 h-3 text-amber-400" />
                            <span>Available Weight:</span>
                          </span>
                          <span className="font-bold text-white">
                            <span className={remainingGrams < 50 ? "text-red-400" : "text-emerald-400"}>
                              {remainingGrams}g
                            </span>{" "}
                            / {totalLabel}{" "}
                            <span className="text-[10px] text-decent-muted font-normal">
                              ({pctRemaining}%)
                            </span>
                          </span>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full bg-decent-dark rounded-full h-1.5 mt-1 overflow-hidden border border-white/5">
                          <div
                            className={`h-full rounded-full transition-all ${
                              pctRemaining > 45 ? "bg-emerald-500" : pctRemaining > 15 ? "bg-amber-500" : "bg-red-500"
                            }`}
                            style={{ width: `${Math.min(100, Math.max(0, pctRemaining))}%` }}
                          />
                        </div>
                      </div>

                      {/* Action Bar: Quick -18g dose, Edit, Clone */}
                      <div className="mt-2.5 pt-2 border-t border-decent-border/40 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={(e) => handleQuickDeduct(e, b)}
                          className="text-[10.5px] font-mono text-decent-muted hover:text-white px-2 py-0.5 rounded-md bg-decent-dark hover:bg-slate-800 border border-decent-border transition-all active:scale-95"
                          title="Deduct single shot dose from bag"
                        >
                          -{(b.targetDose || 18.0).toFixed(0)}g shot
                        </button>

                        <div className="flex items-center space-x-1.5">
                          {/* Edit Bean */}
                          <button
                            type="button"
                            onClick={(e) => handleOpenEditForm(e, b)}
                            className="text-[11px] font-semibold text-slate-300 hover:text-white flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-decent-dark hover:bg-slate-800 border border-decent-border transition-all active:scale-95"
                            title="Edit this coffee's parameters or weight"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Edit</span>
                          </button>

                          {/* Clone as New Batch */}
                          <button
                            type="button"
                            onClick={(e) => handleClone(e, b)}
                            className="text-[11px] font-semibold text-sky-400 hover:text-sky-300 flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-sky-950/40 border border-sky-800/40 hover:bg-sky-900/40 transition-all active:scale-95"
                            title="Clone as new batch with reset weight"
                          >
                            <Copy className="w-3 h-3" />
                            <span>Clone</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
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
