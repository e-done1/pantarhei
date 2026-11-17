import React, { useState, useMemo, useEffect } from "react";
import curatedProfilesData from "../assets/profiles/curated_profiles.json";
import type { ProfileItem, ProfileStep } from "../types/profile.ts";
import {
  COMMON_PROFILE_CATEGORIES,
  createNewProfile,
  cloneProfile,
  createDefaultProfileSteps,
  loadCustomProfilesFromStorage,
  saveCustomProfilesToStorage,
  serializeToDecaidV2,
  serializeToDecaidTcl,
  generateProfileFilename,
} from "../types/profile.ts";
import { decaid } from "../services/decaidConnection.ts";
import {
  Search,
  Flame,
  Clock,
  Check,
  X,
  Plus,
  Pencil,
  Copy,
  ArrowLeft,
  Sliders,
  Thermometer,
  Trash2,
  Sparkles,
  Download,
  Eye,
  EyeOff,
} from "lucide-react";

export type { ProfileItem, ProfileStep };

interface ProfileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeProfileTitle: string;
  onSelectProfile: (profile: ProfileItem) => void;
  onSaveProfile?: (profile: ProfileItem) => void;
}

function downloadBlob(filename: string, content: string, mime: string) {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const ProfileDrawer: React.FC<ProfileDrawerProps> = ({
  isOpen,
  onClose,
  activeProfileTitle,
  onSelectProfile,
  onSaveProfile,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Profile Visibility Control (Eye icon / Hidden Profile IDs) persisted in localStorage
  const [hiddenProfileIds, setHiddenProfileIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("pantarhei_hidden_profile_ids");
      if (saved) return new Set(JSON.parse(saved));
    } catch {}
    return new Set();
  });
  const [showHidden, setShowHidden] = useState(false);

  const toggleProfileVisibility = (profileId: string) => {
    setHiddenProfileIds((prev) => {
      const next = new Set(prev);
      if (next.has(profileId)) {
        next.delete(profileId);
      } else {
        next.add(profileId);
      }
      try {
        localStorage.setItem("pantarhei_hidden_profile_ids", JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  // Custom Category Tags persisted in localStorage
  const [customCategories, setCustomCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("pantarhei_custom_profile_categories");
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagInput, setNewTagInput] = useState("");

  const handleAddTag = (tag: string) => {
    const trimmed = tag.trim().toLowerCase();
    if (!trimmed) return;
    if (!customCategories.includes(trimmed)) {
      const updated = [...customCategories, trimmed];
      setCustomCategories(updated);
      try {
        localStorage.setItem("pantarhei_custom_profile_categories", JSON.stringify(updated));
      } catch {}
    }
    setNewTagInput("");
    setIsAddingTag(false);
  };

  const handleRemoveTag = (tag: string) => {
    const trimmed = tag.toLowerCase();
    const updated = customCategories.filter((c) => c !== trimmed);
    setCustomCategories(updated);
    try {
      localStorage.setItem("pantarhei_custom_profile_categories", JSON.stringify(updated));
    } catch {}
    if (selectedCategory === trimmed) {
      setSelectedCategory(null);
    }
  };

  // Custom Profiles persisted in localStorage
  const [customProfiles, setCustomProfiles] = useState<ProfileItem[]>(() => {
    return loadCustomProfilesFromStorage();
  });

  // Re-sync from localStorage when drawer opens
  useEffect(() => {
    if (isOpen) {
      setCustomProfiles(loadCustomProfilesFromStorage());
    }
  }, [isOpen]);

  // Form State for Add / Edit
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);

  // Form Fields
  const [formTitle, setFormTitle] = useState("");
  const [formAuthor, setFormAuthor] = useState("");
  const [formCategory, setFormCategory] = useState("espresso");
  const [formBeverageType, setFormBeverageType] = useState("espresso");
  const [formTargetTemp, setFormTargetTemp] = useState<number>(93.0);
  const [formTargetDose, setFormTargetDose] = useState<number>(18.0);
  const [formTargetWeight, setFormTargetWeight] = useState<number>(36.0);
  const [formNotes, setFormNotes] = useState("");
  const [formSteps, setFormSteps] = useState<ProfileStep[]>([]);

  // Flatten curated profiles from curatedProfilesData
  const curatedProfiles: ProfileItem[] = useMemo(() => {
    const list: ProfileItem[] = [];
    const record = curatedProfilesData as Record<string, any[]>;
    for (const [catKey, profileArray] of Object.entries(record)) {
      if (Array.isArray(profileArray)) {
        profileArray.forEach((p, idx) => {
          list.push({
            id: `curated-${catKey}-${idx}-${p.title}`,
            title: p.title || "Untitled Profile",
            author: p.author || "Decent",
            category: catKey,
            beverage_type: p.beverage_type,
            notes: p.notes,
            target_temperature: p.tank_temperature ? parseFloat(p.tank_temperature) : 93.0,
            target_weight: p.target_weight ? parseFloat(p.target_weight) : 36.0,
            steps: p.steps,
            isCustom: false,
          });
        });
      }
    }
    return list;
  }, []);

  // Combined profiles: Custom profiles are prioritized at the top
  const allProfiles: ProfileItem[] = useMemo(() => {
    return [...customProfiles, ...curatedProfiles];
  }, [customProfiles, curatedProfiles]);

  // Pre-seeded recent profiles (constant shelf, respects visibility filter)
  const recentProfiles: ProfileItem[] = useMemo(() => {
    const base = allProfiles.slice(0, 5);
    if (showHidden) return base;
    return base.filter((p) => !hiddenProfileIds.has(p.id));
  }, [allProfiles, showHidden, hiddenProfileIds]);

  // Reactive Search Filtering & Alphabetical A-to-Z sorting
  const filteredProfiles = useMemo(() => {
    let result = allProfiles;

    // Filter out hidden profiles unless "Show All / Show Hidden" toggle is active
    if (!showHidden) {
      result = result.filter((p) => !hiddenProfileIds.has(p.id));
    }

    if (selectedCategory) {
      result = result.filter((p) => p.category.toLowerCase() === selectedCategory.toLowerCase());
    }

    if (!searchQuery.trim()) {
      // Sorted alphabetically from A to Z
      return [...result].sort((a, b) => a.title.localeCompare(b.title));
    }

    const q = searchQuery.toLowerCase().trim();
    // Scoring: title startsWith > title includes > notes includes, with alphabetical tie-break
    return [...result]
      .filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.author.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          (p.notes && p.notes.toLowerCase().includes(q))
      )
      .sort((a, b) => {
        const aStart = a.title.toLowerCase().startsWith(q) ? 1 : 0;
        const bStart = b.title.toLowerCase().startsWith(q) ? 1 : 0;
        if (bStart !== aStart) return bStart - aStart;
        return a.title.localeCompare(b.title);
      });
  }, [allProfiles, searchQuery, selectedCategory, showHidden, hiddenProfileIds]);

  // Sorted combined categories (standard + profile categories + custom tags)
  const categories = useMemo(() => {
    const set = new Set<string>();
    COMMON_PROFILE_CATEGORIES.forEach((c) => set.add(c.toLowerCase()));
    allProfiles.forEach((p) => {
      if (p.category) set.add(p.category.toLowerCase());
    });
    customCategories.forEach((c) => set.add(c.toLowerCase()));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allProfiles, customCategories]);

  // Handle Open Add Form
  const handleOpenAddForm = () => {
    const fresh = createNewProfile();
    setEditingProfileId(null);
    setFormTitle("");
    setFormAuthor("Barista");
    setFormCategory("espresso");
    setFormBeverageType("espresso");
    setFormTargetTemp(93.0);
    setFormTargetDose(18.0);
    setFormTargetWeight(36.0);
    setFormNotes("");
    setFormSteps(fresh.steps || createDefaultProfileSteps(93.0));
    setIsFormOpen(true);
  };

  // Handle Open Edit Form
  const handleOpenEditForm = (e: React.MouseEvent, profile: ProfileItem) => {
    e.stopPropagation();
    setEditingProfileId(profile.id);
    setFormTitle(profile.title);
    setFormAuthor(profile.author || "Barista");
    setFormCategory(profile.category || "espresso");
    setFormBeverageType(profile.beverage_type || "espresso");
    setFormTargetTemp(
      profile.target_temperature ? Number(profile.target_temperature) : 93.0
    );
    setFormTargetDose(
      profile.target_dose ? Number(profile.target_dose) : 18.0
    );
    setFormTargetWeight(
      profile.target_weight ? Number(profile.target_weight) : 36.0
    );
    setFormNotes(profile.notes || "");
    setFormSteps(
      profile.steps && profile.steps.length > 0
        ? JSON.parse(JSON.stringify(profile.steps))
        : createDefaultProfileSteps(
            profile.target_temperature ? Number(profile.target_temperature) : 93.0
          )
    );
    setIsFormOpen(true);
  };

  // Handle Clone
  const handleClone = (e: React.MouseEvent, profile: ProfileItem) => {
    e.stopPropagation();
    const cloned = cloneProfile(profile);
    const updated = [cloned, ...customProfiles];
    setCustomProfiles(updated);
    saveCustomProfilesToStorage(updated);

    // Write cloned profile directly to Decaid system folders (profiles_v2 & profiles2)
    decaid.saveProfile(cloned).then((res) => {
      if (res.locations && res.locations.length > 0) {
        setSaveMessage(`Cloned & saved to Decaid system folders (profiles_v2/ & profiles2/)`);
        setTimeout(() => setSaveMessage(null), 4000);
      }
    });

    if (onSaveProfile) {
      onSaveProfile(cloned);
    }
    onSelectProfile(cloned);
  };

  // Add Step to Form
  const handleAddStep = (name: string = "Extraction Step", pump: "pressure" | "flow" = "pressure", val: string = "9.00", sec: string = "15.00") => {
    const newStep: ProfileStep = {
      name,
      temperature: formTargetTemp.toFixed(1),
      sensor: "coffee",
      pump,
      transition: "smooth",
      pressure: pump === "pressure" ? val : "2.00",
      flow: pump === "flow" ? val : "2.2",
      seconds: sec,
      volume: "100.00",
      weight: "0",
    };
    setFormSteps([...formSteps, newStep]);
  };

  // Remove Step from Form
  const handleRemoveStep = (index: number) => {
    if (formSteps.length <= 1) return; // Keep at least one step
    setFormSteps(formSteps.filter((_, idx) => idx !== index));
  };

  // Update a field in a step
  const handleUpdateStep = (index: number, field: keyof ProfileStep, value: any) => {
    const updated = [...formSteps];
    updated[index] = { ...updated[index], [field]: value };
    setFormSteps(updated);
  };

  // Handle Save Form (Add or Edit)
  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();

    const finalTitle = formTitle.trim() || "Untitled Custom Profile";
    const now = new Date().toISOString();

    let savedItem: ProfileItem;

    if (editingProfileId) {
      // Check if editing an existing custom profile
      const existingCustomIdx = customProfiles.findIndex((p) => p.id === editingProfileId);
      if (existingCustomIdx >= 0) {
        savedItem = {
          ...customProfiles[existingCustomIdx],
          title: finalTitle,
          author: formAuthor.trim() || "Barista",
          category: formCategory.toLowerCase(),
          beverage_type: formBeverageType,
          target_temperature: formTargetTemp,
          target_dose: formTargetDose,
          target_weight: formTargetWeight,
          notes: formNotes.trim(),
          steps: formSteps,
          updatedAt: now,
        };
        const updated = [...customProfiles];
        updated[existingCustomIdx] = savedItem;
        setCustomProfiles(updated);
        saveCustomProfilesToStorage(updated);
      } else {
        // Editing a curated profile converts it into a custom modified profile
        const id = `custom-profile-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        savedItem = {
          id,
          title: finalTitle,
          author: formAuthor.trim() || "Barista",
          category: formCategory.toLowerCase(),
          beverage_type: formBeverageType,
          target_temperature: formTargetTemp,
          target_dose: formTargetDose,
          target_weight: formTargetWeight,
          notes: formNotes.trim(),
          steps: formSteps,
          isCustom: true,
          createdAt: now,
          updatedAt: now,
        };
        const updated = [savedItem, ...customProfiles];
        setCustomProfiles(updated);
        saveCustomProfilesToStorage(updated);
      }
    } else {
      // Create Brand New Profile
      const id = `custom-profile-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      savedItem = {
        id,
        title: finalTitle,
        author: formAuthor.trim() || "Barista",
        category: formCategory.toLowerCase(),
        beverage_type: formBeverageType,
        target_temperature: formTargetTemp,
        target_dose: formTargetDose,
        target_weight: formTargetWeight,
        notes: formNotes.trim(),
        steps: formSteps,
        isCustom: true,
        createdAt: now,
        updatedAt: now,
      };
      const updated = [savedItem, ...customProfiles];
      setCustomProfiles(updated);
      saveCustomProfilesToStorage(updated);
    }

    // Save to Decaid system-defined profile folders (profiles_v2/ & profiles2/) and REST API
    decaid
      .saveProfile(savedItem)
      .then((res) => {
        if (res.locations && res.locations.length > 0) {
          setSaveMessage("Saved to Decaid folders: profiles_v2/ & profiles2/");
          setTimeout(() => setSaveMessage(null), 4500);
        }
      })
      .catch((err) => {
        console.warn("[PantaRhei] Error saving profile to Decaid folders:", err);
      });

    if (onSaveProfile) {
      onSaveProfile(savedItem);
    }
    onSelectProfile(savedItem);
    setIsFormOpen(false);
  };

  const handleDownloadFile = (e: React.MouseEvent, p: ProfileItem, format: "v2" | "tcl") => {
    e.stopPropagation();
    if (format === "v2") {
      const v2 = serializeToDecaidV2(p);
      const filename = generateProfileFilename(p.title, "json");
      downloadBlob(filename, JSON.stringify(v2, null, 2), "application/json");
    } else {
      const tcl = serializeToDecaidTcl(p);
      const filename = generateProfileFilename(p.title, "tcl");
      downloadBlob(filename, tcl, "text/plain");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-start bg-black/75 backdrop-blur-sm select-none">
      <div className="w-[520px] h-full bg-decent-surface border-r border-decent-border shadow-2xl flex flex-col p-5">
        {/* VIEW 1: Profiles List View */}
        {!isFormOpen && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-decent-border/60">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                  <Flame className="w-4 h-4 text-amber-500" />
                  <span>Decaid Extraction Profiles</span>
                </h2>
                <div className="flex items-center space-x-2 mt-0.5">
                  <span className="text-xs text-decent-muted">
                    {allProfiles.length} profiles · {customProfiles.length} custom
                  </span>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {/* Show All / Hide Hidden Visibility Toggle */}
                <button
                  type="button"
                  onClick={() => setShowHidden(!showHidden)}
                  className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer ${
                    showHidden
                      ? "bg-amber-500/30 text-amber-300 border-amber-400 font-bold"
                      : "bg-decent-dark text-decent-muted border-decent-border hover:text-white hover:border-slate-500"
                  }`}
                  title={showHidden ? "Hide invisible profiles" : "Show all hidden profiles"}
                >
                  {showHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showHidden ? "Hide Hidden" : "Show All"}</span>
                  {hiddenProfileIds.size > 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-decent-muted font-mono">
                      {hiddenProfileIds.size}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleOpenAddForm}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 hover:border-amber-400 text-xs font-bold flex items-center space-x-1.5 transition-all shadow-sm cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Profile</span>
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

            {/* Save Confirmation Notification Banner */}
            {saveMessage && (
              <div className="my-2 p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/80 text-emerald-300 text-xs flex items-center space-x-2 animate-in fade-in duration-150">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-semibold">{saveMessage}</span>
              </div>
            )}

            {/* Reactive Search Input (Auto-Focused) */}
            <div className="my-3 relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-decent-muted" />
              <input
                type="text"
                autoFocus
                placeholder="Search profile name, author, or keyword (e.g. Strega, Sey, Bloom)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-decent-dark border border-decent-border text-xs text-white placeholder-decent-muted focus:outline-none focus:border-amber-500/70"
              />
            </div>

            {/* Category Tags: Wrapped lines with No Scrolling, Add & Remove Tags */}
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              <button
                type="button"
                onClick={() => setSelectedCategory(null)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-full border whitespace-nowrap transition-all cursor-pointer ${
                  selectedCategory === null
                    ? "bg-amber-500/30 text-amber-300 border-amber-400"
                    : "bg-decent-dark text-decent-muted border-decent-border hover:border-slate-500"
                }`}
              >
                All Categories
              </button>
              {categories.map((cat) => {
                const isCustom = customCategories.includes(cat);
                const isSelected = selectedCategory === cat;
                return (
                  <div key={cat} className="inline-flex items-center">
                    <button
                      type="button"
                      onClick={() => setSelectedCategory(isSelected ? null : cat)}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-full border whitespace-nowrap uppercase transition-all cursor-pointer ${
                        isSelected
                          ? "bg-amber-500/30 text-amber-300 border-amber-400 font-bold"
                          : "bg-decent-dark text-decent-muted border-decent-border hover:border-slate-500"
                      }`}
                    >
                      {cat}
                    </button>
                    {isCustom && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveTag(cat);
                        }}
                        className="ml-1 w-4 h-4 rounded-full bg-rose-600/30 hover:bg-rose-600 text-rose-300 hover:text-white flex items-center justify-center text-[10px] font-bold cursor-pointer transition-colors"
                        title={`Remove tag "${cat}"`}
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Add Tag Button / Inline Input */}
              {isAddingTag ? (
                <div className="inline-flex items-center space-x-1 bg-decent-dark px-2 py-0.5 rounded-full border border-amber-500/50">
                  <input
                    type="text"
                    autoFocus
                    placeholder="New tag..."
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddTag(newTagInput);
                      } else if (e.key === "Escape") {
                        setIsAddingTag(false);
                      }
                    }}
                    className="w-20 bg-transparent text-[11px] text-white focus:outline-none uppercase"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddTag(newTagInput)}
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
                  className="px-2 py-1 text-[11px] font-semibold rounded-full border border-dashed border-amber-500/50 text-amber-300/80 hover:text-amber-300 hover:border-amber-400 flex items-center space-x-1 cursor-pointer transition-all"
                  title="Add a custom category tag"
                >
                  <Plus className="w-3 h-3" />
                  <span>Tag</span>
                </button>
              )}
            </div>

            {/* Recent Profiles Shelf (Visible when search is untouched) */}
            {!searchQuery.trim() && selectedCategory === null && recentProfiles.length > 0 && (
              <div className="mb-3 p-3 rounded-2xl bg-decent-dark/60 border border-decent-border/50">
                <div className="text-[11px] font-semibold text-decent-muted uppercase tracking-wider flex items-center space-x-1.5 mb-2">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Recent Profiles</span>
                </div>
                <div className="space-y-1.5">
                  {recentProfiles.map((p) => {
                    const isHidden = hiddenProfileIds.has(p.id);
                    return (
                      <div
                        key={p.id}
                        onClick={() => {
                          onSelectProfile(p);
                          onClose();
                        }}
                        className={`px-3 py-2 rounded-xl border cursor-pointer flex items-center justify-between transition-all ${
                          isHidden
                            ? "bg-decent-dark/40 border-dashed border-slate-600 opacity-60"
                            : "bg-decent-card hover:bg-slate-800 border-decent-border/60 hover:border-amber-500/50"
                        }`}
                      >
                        <div className="flex items-center space-x-2 truncate">
                          <span className="text-xs font-bold text-white truncate">{p.title}</span>
                          {p.isCustom && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                              CUSTOM
                            </span>
                          )}
                        </div>
                        <div className="flex items-center space-x-2 shrink-0">
                          <span className="text-[10px] text-amber-400 font-mono uppercase">{p.category}</span>
                          {/* Visibility Eye Icon Button */}
                          <button
                            type="button"
                            title={isHidden ? "Unhide profile" : "Hide profile from list"}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleProfileVisibility(p.id);
                            }}
                            className={`p-1 rounded-lg border transition-colors cursor-pointer ${
                              isHidden
                                ? "text-rose-400 border-rose-500/50 bg-rose-950/40"
                                : "text-decent-muted hover:text-amber-300 border-transparent hover:border-slate-500"
                            }`}
                          >
                            {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Profiles List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {filteredProfiles.map((p) => {
                const isSelected = p.title === activeProfileTitle;
                const isHidden = hiddenProfileIds.has(p.id);

                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      onSelectProfile(p);
                      onClose();
                    }}
                    className={`p-3 rounded-xl border transition-all cursor-pointer group ${
                      isHidden
                        ? "bg-decent-dark/40 border-dashed border-slate-600 opacity-55"
                        : isSelected
                        ? "bg-amber-950/30 border-amber-500/80 shadow-md"
                        : "bg-decent-card border-decent-border/60 hover:border-slate-500"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-white truncate">{p.title}</span>
                          {p.isCustom && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/25 text-amber-300 border border-amber-500/40 font-mono">
                              CUSTOM
                            </span>
                          )}
                        </div>
                        <div className="flex items-center space-x-2 mt-1 text-[10px] text-decent-muted">
                          <span>By {p.author || "Decent"}</span>
                          {p.target_temperature && <span>· {p.target_temperature}°C</span>}
                          {p.target_weight && <span>· {p.target_weight}g target</span>}
                          {p.steps && <span>· {p.steps.length} steps</span>}
                        </div>
                      </div>

                      {/* Right Action Icons */}
                      <div className="flex items-center space-x-1.5 shrink-0">
                        <span className="text-[10px] text-decent-muted uppercase px-2 py-0.5 rounded-full bg-decent-dark border border-decent-border">
                          {p.category}
                        </span>

                        {/* Visibility Control (Eye / EyeOff) */}
                        <button
                          type="button"
                          title={isHidden ? "Unhide profile" : "Hide profile from list"}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleProfileVisibility(p.id);
                          }}
                          className={`p-1 rounded-lg border transition-colors cursor-pointer ${
                            isHidden
                              ? "text-rose-400 border-rose-500/50 bg-rose-950/40"
                              : "text-decent-muted hover:text-amber-300 border-transparent hover:border-slate-500"
                          }`}
                        >
                          {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>

                        {/* Edit Button */}
                        <button
                          type="button"
                          title="Edit Profile"
                          onClick={(e) => handleOpenEditForm(e, p)}
                          className="p-1 rounded-lg text-decent-muted hover:text-amber-300 hover:bg-slate-800 border border-transparent hover:border-amber-500/40 transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>

                        {/* Clone Button */}
                        <button
                          type="button"
                          title="Clone as Custom Profile"
                          onClick={(e) => handleClone(e, p)}
                          className="p-1 rounded-lg text-decent-muted hover:text-cyan-300 hover:bg-slate-800 border border-transparent hover:border-cyan-500/40 transition-colors cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>

                        {/* Export / Download v2 JSON Button */}
                        <button
                          type="button"
                          title="Download Decaid v2 JSON (.json)"
                          onClick={(e) => handleDownloadFile(e, p, "v2")}
                          className="p-1 rounded-lg text-decent-muted hover:text-emerald-300 hover:bg-slate-800 border border-transparent hover:border-emerald-500/40 transition-colors cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>

                        {isSelected && <Check className="w-4 h-4 text-emerald-400 ml-1" />}
                      </div>
                    </div>

                    {p.notes && (
                      <p className="text-[11px] text-decent-muted mt-1.5 line-clamp-2 leading-relaxed">
                        {p.notes}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* VIEW 2: Add / Edit Profile Form View */}
        {isFormOpen && (
          <div className="flex flex-col h-full">
            {/* Form Header */}
            <div className="flex items-center justify-between pb-3 border-b border-decent-border/60">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="flex items-center space-x-1 text-xs text-decent-muted hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Profiles</span>
              </button>
              <h2 className="text-sm font-bold text-white flex items-center space-x-1.5">
                <Sliders className="w-4 h-4 text-amber-500" />
                <span>{editingProfileId ? "Edit Extraction Profile" : "Add New Profile"}</span>
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-decent-muted hover:text-white hover:bg-decent-dark"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSaveForm} className="flex-1 overflow-y-auto space-y-4 py-3 pr-1 text-xs">
              {/* Profile Title & Author */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-decent-muted uppercase mb-1">
                    Profile Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="e.g. Blooming Allongé, Sey Flat 6-bar..."
                    className="w-full px-3 py-2 rounded-xl bg-decent-dark border border-decent-border text-white text-xs focus:outline-none focus:border-amber-500/70"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-decent-muted uppercase mb-1">
                    Author / Origin
                  </label>
                  <input
                    type="text"
                    value={formAuthor}
                    onChange={(e) => setFormAuthor(e.target.value)}
                    placeholder="e.g. Home Barista, Scott Rao..."
                    className="w-full px-3 py-2 rounded-xl bg-decent-dark border border-decent-border text-white text-xs focus:outline-none focus:border-amber-500/70"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-decent-muted uppercase mb-1">
                    Primary Category / Tag
                  </label>
                  <input
                    type="text"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    placeholder="espresso, flow, lever, etc."
                    className="w-full px-3 py-2 rounded-xl bg-decent-dark border border-decent-border text-white text-xs focus:outline-none focus:border-amber-500/70"
                  />
                </div>
              </div>

              {/* Profile Associated Tags / Categories (Wrapped with Add & Remove) */}
              <div>
                <label className="block text-[11px] font-semibold text-decent-muted uppercase mb-1.5 flex items-center justify-between">
                  <span>Associated Profile Tags</span>
                  <span className="text-[10px] text-amber-400 font-mono">Tap tag to assign</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((cat) => {
                    const isSelected = formCategory.toLowerCase() === cat.toLowerCase();
                    const isCustom = customCategories.includes(cat);
                    return (
                      <div key={cat} className="inline-flex items-center">
                        <button
                          type="button"
                          onClick={() => setFormCategory(cat)}
                          className={`px-2.5 py-1 rounded-lg text-[10.5px] font-mono uppercase border transition-all cursor-pointer ${
                            isSelected
                              ? "bg-amber-500/30 text-amber-300 border-amber-400 font-bold shadow-sm"
                              : "bg-decent-dark text-decent-muted border-decent-border hover:border-slate-500"
                          }`}
                        >
                          {cat}
                        </button>
                        {isCustom && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveTag(cat);
                            }}
                            className="ml-1 w-4 h-4 rounded-full bg-rose-600/30 hover:bg-rose-600 text-rose-300 hover:text-white flex items-center justify-center text-[10px] font-bold cursor-pointer transition-colors"
                            title={`Remove custom tag "${cat}"`}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {/* Add Tag directly in profile edit mode */}
                  {isAddingTag ? (
                    <div className="inline-flex items-center space-x-1 bg-decent-dark px-2 py-0.5 rounded-lg border border-amber-500/50">
                      <input
                        type="text"
                        autoFocus
                        placeholder="Tag name..."
                        value={newTagInput}
                        onChange={(e) => setNewTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (newTagInput.trim()) {
                              handleAddTag(newTagInput);
                              setFormCategory(newTagInput.trim().toLowerCase());
                            }
                          } else if (e.key === "Escape") {
                            setIsAddingTag(false);
                          }
                        }}
                        className="w-20 bg-transparent text-[11px] text-white focus:outline-none uppercase"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (newTagInput.trim()) {
                            handleAddTag(newTagInput);
                            setFormCategory(newTagInput.trim().toLowerCase());
                          }
                        }}
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
                      className="px-2 py-1 text-[10.5px] font-semibold rounded-lg border border-dashed border-amber-500/50 text-amber-300/80 hover:text-amber-300 hover:border-amber-400 flex items-center space-x-1 cursor-pointer transition-all"
                      title="Add a custom category tag"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Tag</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Targets: Temperature, Dose, Yield */}
              <div className="p-3 rounded-xl bg-decent-dark/60 border border-decent-border/60 space-y-3">
                <div className="text-[11px] font-semibold text-white uppercase tracking-wider flex items-center space-x-1.5">
                  <Thermometer className="w-3.5 h-3.5 text-amber-400" />
                  <span>Brew Targets & Ratio</span>
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[10px] text-decent-muted mb-1">Target Temp (°C)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="75"
                      max="98"
                      value={formTargetTemp}
                      onChange={(e) => setFormTargetTemp(parseFloat(e.target.value) || 93.0)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-decent-card border border-decent-border text-white text-xs font-mono focus:outline-none focus:border-amber-500/70"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-decent-muted mb-1">Dose (g)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="10"
                      max="30"
                      value={formTargetDose}
                      onChange={(e) => setFormTargetDose(parseFloat(e.target.value) || 18.0)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-decent-card border border-decent-border text-white text-xs font-mono focus:outline-none focus:border-amber-500/70"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-decent-muted mb-1">Yield / Weight (g)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="15"
                      max="150"
                      value={formTargetWeight}
                      onChange={(e) => setFormTargetWeight(parseFloat(e.target.value) || 36.0)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-decent-card border border-decent-border text-white text-xs font-mono focus:outline-none focus:border-amber-500/70"
                    />
                  </div>
                </div>
                <div className="text-[10px] text-amber-400/90 font-mono">
                  Ratio: 1 : {formTargetDose > 0 ? (formTargetWeight / formTargetDose).toFixed(1) : "2.0"}
                </div>
              </div>

              {/* Notes & Description */}
              <div>
                <label className="block text-[11px] font-semibold text-decent-muted uppercase mb-1">
                  Profile Notes & Extraction Guidelines
                </label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Recommended roast profile, basket size, tasting expectations..."
                  className="w-full px-3 py-2 rounded-xl bg-decent-dark border border-decent-border text-white text-xs focus:outline-none focus:border-amber-500/70 resize-none leading-relaxed"
                />
              </div>

              {/* Extraction Steps Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold text-white uppercase tracking-wider flex items-center space-x-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Extraction Steps ({formSteps.length})</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => handleAddStep("Extra Step", "pressure", "8.00", "12.00")}
                      className="px-2 py-1 rounded-lg bg-decent-dark hover:bg-slate-800 border border-decent-border text-[10px] text-amber-300 font-semibold flex items-center space-x-1 transition-all"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Step</span>
                    </button>
                  </div>
                </div>

                {/* Steps List */}
                <div className="space-y-2">
                  {formSteps.map((step, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl bg-decent-dark/80 border border-decent-border/60 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 flex-1 mr-2">
                          <span className="text-[10px] font-mono text-amber-400 w-4">#{idx + 1}</span>
                          <input
                            type="text"
                            value={step.name}
                            onChange={(e) => handleUpdateStep(idx, "name", e.target.value)}
                            placeholder="Step name..."
                            className="flex-1 px-2 py-1 rounded bg-decent-card border border-decent-border text-white text-xs focus:outline-none focus:border-amber-500/70"
                          />
                        </div>

                        {/* Pump Mode Toggle (Pressure vs Flow) */}
                        <div className="flex items-center rounded-lg bg-decent-card p-0.5 border border-decent-border mr-2">
                          <button
                            type="button"
                            onClick={() => handleUpdateStep(idx, "pump", "flow")}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase transition-colors ${
                              step.pump === "flow"
                                ? "bg-cyan-500/30 text-cyan-300 font-bold"
                                : "text-decent-muted"
                            }`}
                          >
                            Flow
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateStep(idx, "pump", "pressure")}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase transition-colors ${
                              step.pump === "pressure"
                                ? "bg-emerald-500/30 text-emerald-300 font-bold"
                                : "text-decent-muted"
                            }`}
                          >
                            Press
                          </button>
                        </div>

                        {/* Delete Step Button */}
                        <button
                          type="button"
                          onClick={() => handleRemoveStep(idx)}
                          disabled={formSteps.length <= 1}
                          className="p-1 rounded text-decent-muted hover:text-rose-400 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Step Parameters Grid */}
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[9px] text-decent-muted">
                            {step.pump === "pressure" ? "Target (bar)" : "Target (ml/s)"}
                          </label>
                          <input
                            type="text"
                            value={step.pump === "pressure" ? step.pressure : step.flow}
                            onChange={(e) =>
                              handleUpdateStep(
                                idx,
                                step.pump === "pressure" ? "pressure" : "flow",
                                e.target.value
                              )
                            }
                            className="w-full px-2 py-1 rounded bg-decent-card border border-decent-border text-white text-xs font-mono focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] text-decent-muted">Seconds (s)</label>
                          <input
                            type="text"
                            value={step.seconds}
                            onChange={(e) => handleUpdateStep(idx, "seconds", e.target.value)}
                            className="w-full px-2 py-1 rounded bg-decent-card border border-decent-border text-white text-xs font-mono focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] text-decent-muted">Temp (°C)</label>
                          <input
                            type="text"
                            value={step.temperature}
                            onChange={(e) => handleUpdateStep(idx, "temperature", e.target.value)}
                            className="w-full px-2 py-1 rounded bg-decent-card border border-decent-border text-white text-xs font-mono focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Form Footer Action Buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-decent-border/60">
                <div className="flex items-center space-x-1.5">
                  <button
                    type="button"
                    title="Download Decaid v2 JSON (.json)"
                    onClick={() => {
                      const item: ProfileItem = {
                        id: editingProfileId || "custom-profile",
                        title: formTitle || "Untitled Profile",
                        author: formAuthor,
                        category: formCategory,
                        beverage_type: formBeverageType,
                        target_temperature: formTargetTemp,
                        target_dose: formTargetDose,
                        target_weight: formTargetWeight,
                        notes: formNotes,
                        steps: formSteps,
                      };
                      const v2 = serializeToDecaidV2(item);
                      const filename = generateProfileFilename(item.title, "json");
                      downloadBlob(filename, JSON.stringify(v2, null, 2), "application/json");
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-decent-dark border border-decent-border text-decent-muted hover:text-emerald-300 text-[11px] font-semibold flex items-center space-x-1 transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    <span>v2 .json</span>
                  </button>
                  <button
                    type="button"
                    title="Download Legacy DE1 TCL (.tcl)"
                    onClick={() => {
                      const item: ProfileItem = {
                        id: editingProfileId || "custom-profile",
                        title: formTitle || "Untitled Profile",
                        author: formAuthor,
                        category: formCategory,
                        beverage_type: formBeverageType,
                        target_temperature: formTargetTemp,
                        target_dose: formTargetDose,
                        target_weight: formTargetWeight,
                        notes: formNotes,
                        steps: formSteps,
                      };
                      const tcl = serializeToDecaidTcl(item);
                      const filename = generateProfileFilename(item.title, "tcl");
                      downloadBlob(filename, tcl, "text/plain");
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-decent-dark border border-decent-border text-decent-muted hover:text-cyan-300 text-[11px] font-semibold flex items-center space-x-1 transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    <span>v1 .tcl</span>
                  </button>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="px-3.5 py-2 rounded-xl bg-decent-dark border border-decent-border text-decent-muted hover:text-white text-xs font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center space-x-1.5 transition-all shadow-md active:scale-95"
                  >
                    <Check className="w-4 h-4" />
                    <span>Save (v1 & v2)</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
