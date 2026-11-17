import React, { useState, useEffect, useRef } from "react";
import { decaid } from "../services/decaidConnection.ts";
import type {
  MachineConnectionStatus,
  DiscoveredMachine,
  PairedScaleInfo,
  DiscoveredScale,
} from "../types/device.ts";
import { SUPPORTED_SCALE_MODELS } from "../types/device.ts";
import type { ProfileItem } from "../types/profile.ts";
import type { ShotRecord } from "../types/shot.ts";
import {
  processMigrationFiles,
  syncFromDecaidGateway,
  type MigrationBatchResult,
} from "../services/legacyMigration.ts";
import {
  loadCustomProfilesFromStorage,
  saveCustomProfilesToStorage,
} from "../types/profile.ts";
import { saveShotHistoryToStorage } from "../types/shot.ts";
import { mergeProfiles, mergeShots } from "../types/backup.ts";
import {
  Coffee,
  Scale,
  Wifi,
  Bluetooth,
  RefreshCw,
  Check,
  X,
  AlertTriangle,
  Play,
  FolderOpen,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Layers,
  History,
} from "lucide-react";

interface ConnectMachineModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinueSimulator: () => void;
  onImportData?: (data: { profiles: ProfileItem[]; shots: ShotRecord[] }) => void;
  existingProfiles?: ProfileItem[];
  existingShots?: ShotRecord[];
}

export const ConnectMachineModal: React.FC<ConnectMachineModalProps> = ({
  isOpen,
  onClose,
  onContinueSimulator,
  onImportData,
  existingProfiles = [],
  existingShots = [],
}) => {
  const [machineStatus, setMachineStatus] = useState<MachineConnectionStatus>(() => decaid.getMachineStatus());
  const [pairedScale, setPairedScale] = useState<PairedScaleInfo | null>(() => decaid.getPairedScale());

  const [hostInput, setHostInput] = useState<string>(() => decaid.getHost());
  const [portInput, setPortInput] = useState<number>(() => decaid.getPort());

  // Scanning state
  const [isScanningMachines, setIsScanningMachines] = useState(false);
  const [discoveredMachines, setDiscoveredMachines] = useState<DiscoveredMachine[]>([]);
  const [isScanningScales, setIsScanningScales] = useState(false);
  const [discoveredScales, setDiscoveredScales] = useState<DiscoveredScale[]>([]);

  const [activeTab, setActiveTab] = useState<"machine" | "scale" | "sync">("machine");
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Folder & Gateway Migration State
  const historyInputRef = useRef<HTMLInputElement>(null);
  const profilesInputRef = useRef<HTMLInputElement>(null);
  const allFolderInputRef = useRef<HTMLInputElement>(null);

  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [isSyncingGateway, setIsSyncingGateway] = useState(false);
  const [migrationResult, setMigrationResult] = useState<MigrationBatchResult | null>(null);
  const [isMigrationApplied, setIsMigrationApplied] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  // Sync reactive device changes
  useEffect(() => {
    const unsub = decaid.addDeviceListener(() => {
      setMachineStatus(decaid.getMachineStatus());
      setPairedScale(decaid.getPairedScale());
    });
    return unsub;
  }, []);

  if (!isOpen) return null;

  const handleConnect = async () => {
    setConnectionError(null);
    const ok = await decaid.connectLiveMachine(hostInput, portInput);
    if (!ok) {
      setConnectionError(`Could not reach Decaid at ${hostInput}:${portInput}. Ensure Decaid is running with REST API enabled.`);
    } else {
      setActiveTab("scale");
    }
  };

  const handleScanMachines = async () => {
    setIsScanningMachines(true);
    setConnectionError(null);
    try {
      const machines = await decaid.scanForMachines();
      setDiscoveredMachines(machines);
    } finally {
      setIsScanningMachines(false);
    }
  };

  const handleSelectDiscoveredMachine = async (m: DiscoveredMachine) => {
    if (m.connectionType === "network") {
      const [h, p] = m.address.split(":");
      setHostInput(h || "localhost");
      if (p) setPortInput(parseInt(p, 10));
      await decaid.connectLiveMachine(h, p ? parseInt(p, 10) : 8080);
      setActiveTab("scale");
    } else {
      await decaid.connectLiveMachine();
      setActiveTab("scale");
    }
  };

  const handleScanScales = async () => {
    setIsScanningScales(true);
    try {
      const scales = await decaid.scanForScales();
      setDiscoveredScales(scales);
    } finally {
      setIsScanningScales(false);
    }
  };

  const handlePairScale = async (scale: DiscoveredScale) => {
    await decaid.pairScale(scale);
    setActiveTab("sync");
  };

  const handleDisconnectScale = () => {
    decaid.disconnectScale();
  };

  const handleContinueSimulator = () => {
    if (dontShowAgain && typeof window !== "undefined") {
      try {
        localStorage.setItem("pantarhei_dont_show_startup_connect", "true");
        localStorage.setItem("pantarhei_onboarding_completed", "true");
      } catch {}
    }
    decaid.enableSimulatorMode();
    onContinueSimulator();
    onClose();
  };

  // -------------------------------------------------------------
  // File & Gateway Migration Handlers
  // -------------------------------------------------------------

  const handleProcessUploadedFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsProcessingFiles(true);
    setSyncFeedback(null);
    setIsMigrationApplied(false);

    try {
      const currentCustom = loadCustomProfilesFromStorage();
      const allProfiles = [...existingProfiles, ...currentCustom];
      const result = await processMigrationFiles(files, allProfiles, existingShots);
      setMigrationResult(result);

      if (result.importedProfiles.length > 0 || result.importedShots.length > 0) {
        setSyncFeedback({
          type: "info",
          message: `Parsed ${result.profileStats.totalParsed} profiles (${result.profileStats.uniqueAdded} unique, ${result.profileStats.profiles2OverridesCount} profiles2 overrides) and ${result.shotStats.totalParsed} shots. Click "Apply to Library" to finish.`,
        });
      } else {
        setSyncFeedback({
          type: "info",
          message: "Files processed. All discovered records already exist in your library (no duplicates added).",
        });
      }
    } catch (err: any) {
      setSyncFeedback({
        type: "error",
        message: `Failed to process files: ${err.message || "Unknown error"}`,
      });
    } finally {
      setIsProcessingFiles(false);
    }
  };

  const handleSyncFromGateway = async () => {
    setIsSyncingGateway(true);
    setSyncFeedback(null);
    setIsMigrationApplied(false);

    try {
      const gatewayUrl = `http://${hostInput}:${portInput}`;
      const data = await syncFromDecaidGateway(gatewayUrl);

      const currentCustom = loadCustomProfilesFromStorage();
      const allProfiles = [...existingProfiles, ...currentCustom];

      // Direct merge
      const mergedShots = mergeShots(existingShots, data.shots, "merge_deduplicate");
      const newShots = mergedShots.filter((s) => !existingShots.some((es) => es.id === s.id));

      const mergedProfs = mergeProfiles(allProfiles, data.profiles, "merge_deduplicate");
      const newProfs = mergedProfs.filter((p) => !allProfiles.some((ep) => ep.title === p.title));

      const result: MigrationBatchResult = {
        importedProfiles: newProfs,
        importedShots: newShots,
        profileStats: {
          totalParsed: data.profiles.length,
          uniqueAdded: newProfs.length,
          duplicateCount: data.profiles.length - newProfs.length,
          profiles2OverridesCount: 0,
        },
        shotStats: {
          totalParsed: data.shots.length,
          uniqueAdded: newShots.length,
          duplicateCount: data.shots.length - newShots.length,
        },
      };

      setMigrationResult(result);

      if (newProfs.length > 0 || newShots.length > 0) {
        setSyncFeedback({
          type: "info",
          message: `Found ${newProfs.length} new profiles and ${newShots.length} historical shots on Decaid Gateway.`,
        });
      } else {
        setSyncFeedback({
          type: "success",
          message: "Decaid Gateway queried: Your PantaRhei library is already fully up to date.",
        });
      }
    } catch (err: any) {
      setSyncFeedback({
        type: "error",
        message: `Gateway sync error: ${err.message || "Could not reach Decaid"}`,
      });
    } finally {
      setIsSyncingGateway(false);
    }
  };

  const handleApplyMigration = () => {
    if (!migrationResult) return;

    // Apply profiles
    if (migrationResult.importedProfiles.length > 0) {
      const existing = loadCustomProfilesFromStorage();
      const merged = mergeProfiles(existing, migrationResult.importedProfiles, "merge_deduplicate");
      saveCustomProfilesToStorage(merged);
    }

    // Apply shots
    if (migrationResult.importedShots.length > 0) {
      const merged = mergeShots(existingShots, migrationResult.importedShots, "merge_deduplicate");
      saveShotHistoryToStorage(merged);
    }

    // Notify parent if provided
    if (onImportData) {
      onImportData({
        profiles: migrationResult.importedProfiles,
        shots: migrationResult.importedShots,
      });
    }

    setIsMigrationApplied(true);
    setSyncFeedback({
      type: "success",
      message: `Successfully added ${migrationResult.importedProfiles.length} profiles and ${migrationResult.importedShots.length} shots to your library!`,
    });
  };

  const handleFinishOnboarding = () => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("pantarhei_onboarding_completed", "true");
      } catch {}
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 select-none animate-in fade-in duration-200">
      <div className="w-[720px] max-h-[94vh] rounded-3xl bg-decent-surface border border-decent-border shadow-2xl flex flex-col p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-decent-border/60">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Coffee className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <span>PantaRhei Setup & Migration</span>
                {machineStatus === "connected" ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-mono">
                    CONNECTED
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 font-mono">
                    DISCONNECTED
                  </span>
                )}
              </h2>
              <p className="text-xs text-decent-muted mt-0.5">
                Pair your DE1 machine, connect Bluetooth scales, and sync past history & profiles from de1app.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-decent-muted hover:text-white hover:bg-decent-dark transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3-Step Wizard Navigation Tabs */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-decent-dark/80 rounded-xl border border-decent-border/60 my-3 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("machine")}
            className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
              activeTab === "machine"
                ? "bg-amber-500/30 text-amber-300 border border-amber-500/50 shadow-sm"
                : "text-decent-muted hover:text-white"
            }`}
          >
            <Coffee className="w-3.5 h-3.5 mr-1" />
            <span>1. DE1 Machine</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("scale")}
            className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
              activeTab === "scale"
                ? "bg-sky-500/30 text-sky-300 border border-sky-500/50 shadow-sm"
                : "text-decent-muted hover:text-white"
            }`}
          >
            <Scale className="w-3.5 h-3.5 mr-1" />
            <span>2. BT Scale</span>
            {pairedScale && <span className="w-2 h-2 rounded-full bg-emerald-400 ml-1" />}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("sync")}
            className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
              activeTab === "sync"
                ? "bg-purple-500/30 text-purple-300 border border-purple-500/50 shadow-sm"
                : "text-decent-muted hover:text-white"
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5 mr-1" />
            <span>3. Sync Past Data</span>
            {isMigrationApplied && <span className="w-2 h-2 rounded-full bg-emerald-400 ml-1" />}
          </button>
        </div>

        {/* Tab 1: Machine Connection Content */}
        {activeTab === "machine" && (
          <div className="flex-1 overflow-y-auto space-y-4 py-1 pr-1 text-xs">
            {connectionError && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/80 text-rose-300 text-xs flex items-start space-x-2 animate-in fade-in duration-150">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-bold">Connection Failed</div>
                  <div className="text-[11px] opacity-90 mt-0.5">{connectionError}</div>
                </div>
              </div>
            )}

            {/* Quick Network Connect via Decaid Bridge */}
            <div className="p-4 rounded-2xl bg-decent-card border border-decent-border/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                  <Wifi className="w-3.5 h-3.5 text-amber-400" />
                  <span>Decaid Bridge Address (REST & WebSocket)</span>
                </span>
                <span className="text-[10px] text-decent-muted font-mono">Standard Port: 8080</span>
              </div>

              <div className="grid grid-cols-[1fr_90px_110px] gap-2 items-center">
                <div>
                  <label className="text-[10px] text-decent-muted block mb-0.5 uppercase tracking-wider">Host / Tablet IP</label>
                  <input
                    type="text"
                    value={hostInput}
                    onChange={(e) => setHostInput(e.target.value)}
                    placeholder="localhost or 192.168.1.X"
                    className="w-full px-3 py-1.5 rounded-xl bg-decent-dark border border-decent-border text-white text-xs font-mono focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-decent-muted block mb-0.5 uppercase tracking-wider">Port</label>
                  <input
                    type="number"
                    value={portInput}
                    onChange={(e) => setPortInput(parseInt(e.target.value, 10) || 8080)}
                    className="w-full px-2.5 py-1.5 rounded-xl bg-decent-dark border border-decent-border text-white text-xs font-mono focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div className="pt-3.5">
                  <button
                    type="button"
                    onClick={handleConnect}
                    disabled={machineStatus === "connecting"}
                    className="w-full py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center space-x-1 transition-all cursor-pointer shadow-md disabled:opacity-50"
                  >
                    {machineStatus === "connecting" ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>{machineStatus === "connecting" ? "Connecting..." : "Connect"}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Discover DE1 Machines via BLE or Network Scan */}
            <div className="p-4 rounded-2xl bg-decent-card border border-decent-border/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                  <Bluetooth className="w-3.5 h-3.5 text-sky-400" />
                  <span>Discover DE1 Machines (Network & BLE)</span>
                </span>
                <button
                  type="button"
                  onClick={handleScanMachines}
                  disabled={isScanningMachines}
                  className="px-2.5 py-1 rounded-lg bg-decent-dark border border-decent-border text-xs text-slate-300 hover:text-white flex items-center space-x-1 cursor-pointer transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${isScanningMachines ? "animate-spin text-amber-400" : ""}`} />
                  <span>{isScanningMachines ? "Scanning..." : "Scan DE1"}</span>
                </button>
              </div>

              {discoveredMachines.length > 0 ? (
                <div className="space-y-1.5">
                  {discoveredMachines.map((m) => (
                    <div
                      key={m.id}
                      className="p-2.5 rounded-xl bg-decent-dark/80 border border-decent-border/60 flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-bold text-white flex items-center space-x-2">
                          <span>{m.name}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono">
                            {m.connectionType.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-[10px] text-decent-muted font-mono mt-0.5">{m.address}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSelectDiscoveredMachine(m)}
                        className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-bold cursor-pointer transition-all"
                      >
                        Pair & Connect
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-2 text-[11px] text-decent-muted italic">
                  {isScanningMachines ? "Scanning for active DE1 machines..." : "No machines scanned yet. Click 'Scan DE1' to discover."}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Bluetooth Scale Pairing Content */}
        {activeTab === "scale" && (
          <div className="flex-1 overflow-y-auto space-y-4 py-1 pr-1 text-xs">
            {pairedScale ? (
              <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/50 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                    <Scale className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center space-x-2">
                      <span>{pairedScale.name}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-mono">
                        CONNECTED
                      </span>
                    </div>
                    <div className="text-[11px] text-decent-muted mt-0.5 font-mono">
                      Weight: {pairedScale.weightGrams.toFixed(1)}g · Battery: {pairedScale.batteryPercentage}%
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDisconnectScale}
                  className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-semibold cursor-pointer transition-all"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-decent-dark/60 border border-decent-border/60 text-center py-4 space-y-2">
                <Scale className="w-8 h-8 text-decent-muted mx-auto" />
                <div className="text-xs font-bold text-white">No Bluetooth Scale Paired</div>
                <p className="text-[11px] text-decent-muted max-w-sm mx-auto">
                  Pair a Bluetooth scale to enable real-time weight flow curves, flow-by-weight calculation, and automatic stop at target yield.
                </p>
              </div>
            )}

            {/* Scan for Bluetooth Scales */}
            <div className="p-4 rounded-2xl bg-decent-card border border-decent-border/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                  <Bluetooth className="w-3.5 h-3.5 text-sky-400" />
                  <span>Discover Nearby Scales</span>
                </span>
                <button
                  type="button"
                  onClick={handleScanScales}
                  disabled={isScanningScales}
                  className="px-2.5 py-1 rounded-lg bg-decent-dark border border-decent-border text-xs text-slate-300 hover:text-white flex items-center space-x-1 cursor-pointer transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${isScanningScales ? "animate-spin text-sky-400" : ""}`} />
                  <span>{isScanningScales ? "Scanning..." : "Scan Scales"}</span>
                </button>
              </div>

              {discoveredScales.length > 0 ? (
                <div className="space-y-1.5">
                  {discoveredScales.map((s) => (
                    <div
                      key={s.id}
                      className="p-2.5 rounded-xl bg-decent-dark/80 border border-decent-border/60 flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-2.5">
                        <div className="w-7 h-7 rounded-lg bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
                          <Scale className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white">{s.name}</div>
                          <div className="text-[10px] text-decent-muted font-mono">{s.address} · {s.rssi} dBm</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handlePairScale(s)}
                        className="px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 text-[11px] font-bold cursor-pointer transition-all"
                      >
                        Pair Scale
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-2 text-[11px] text-decent-muted italic">
                  {isScanningScales ? "Searching for active Bluetooth scales..." : "Click 'Scan Scales' to detect nearby scales."}
                </div>
              )}
            </div>

            {/* Supported Models Badges */}
            <div>
              <span className="text-[10px] text-decent-muted uppercase tracking-wider block mb-1.5">
                Officially Supported Scale Protocols
              </span>
              <div className="flex flex-wrap gap-1">
                {SUPPORTED_SCALE_MODELS.map((m) => (
                  <span
                    key={m.id}
                    className="text-[10px] px-2 py-0.5 rounded-md bg-decent-dark text-slate-300 border border-decent-border"
                  >
                    {m.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Sync History & Profiles (Onboarding / Migration) */}
        {activeTab === "sync" && (
          <div className="flex-1 overflow-y-auto space-y-4 py-1 pr-1 text-xs">
            {/* Hidden File Inputs for Directory / Multi-file picking */}
            <input
              ref={historyInputRef}
              type="file"
              // @ts-ignore
              webkitdirectory=""
              directory=""
              multiple
              className="hidden"
              onChange={(e) => handleProcessUploadedFiles(e.target.files)}
            />
            <input
              ref={profilesInputRef}
              type="file"
              // @ts-ignore
              webkitdirectory=""
              directory=""
              multiple
              className="hidden"
              onChange={(e) => handleProcessUploadedFiles(e.target.files)}
            />
            <input
              ref={allFolderInputRef}
              type="file"
              // @ts-ignore
              webkitdirectory=""
              directory=""
              multiple
              className="hidden"
              onChange={(e) => handleProcessUploadedFiles(e.target.files)}
            />

            {/* Info Banner */}
            <div className="p-3.5 rounded-2xl bg-purple-950/40 border border-purple-500/50 space-y-1.5">
              <div className="flex items-center space-x-2 text-purple-300 font-bold text-xs">
                <FolderOpen className="w-4 h-4" />
                <span>Sync Existing Extraction History & Profiles</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Bring in your past espresso shots and custom profiles whether migrating from another Decaid skin or the original <span className="font-mono text-purple-300 font-semibold">de1app</span>.
              </p>
            </div>

            {/* Deduplication Guarantee Pill */}
            <div className="p-3 rounded-2xl bg-decent-dark border border-decent-border/80 flex items-start space-x-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-[11px] text-decent-muted">
                <span className="font-semibold text-slate-200">Anti-Duplication Guarantee:</span> When syncing both <span className="font-mono text-white">profiles/</span> and <span className="font-mono text-white">profiles2/</span>, your customized versions in <span className="font-mono text-amber-300">profiles2/</span> automatically override factory profiles. Duplicate profiles are strictly eliminated to keep your Profile Drawer clean.
              </div>
            </div>

            {/* Action Cards Grid: Folder Browse vs Decaid Gateway */}
            <div className="grid grid-cols-2 gap-3">
              {/* Option 1: Browse de1app Folders */}
              <div className="p-3.5 rounded-2xl bg-decent-card border border-decent-border/60 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center space-x-2 text-xs font-bold text-white mb-1">
                    <History className="w-4 h-4 text-amber-400" />
                    <span>Browse de1app Folders</span>
                  </div>
                  <div className="text-[10px] text-decent-muted">
                    Select folders on your tablet or computer:
                    <ul className="list-disc list-inside mt-1 space-y-0.5 font-mono text-[9.5px]">
                      <li>history/ (.shot files)</li>
                      <li>profiles/ & profiles2/ (.tcl files)</li>
                    </ul>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => historyInputRef.current?.click()}
                      disabled={isProcessingFiles}
                      className="py-1.5 px-2 rounded-xl bg-decent-dark hover:bg-slate-800 border border-decent-border text-white text-[11px] font-semibold flex items-center justify-center space-x-1 cursor-pointer transition-all active:scale-95 shadow-sm"
                      title="Select the history/ folder containing .shot files"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                      <span>History Folder</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => profilesInputRef.current?.click()}
                      disabled={isProcessingFiles}
                      className="py-1.5 px-2 rounded-xl bg-decent-dark hover:bg-slate-800 border border-decent-border text-white text-[11px] font-semibold flex items-center justify-center space-x-1 cursor-pointer transition-all active:scale-95 shadow-sm"
                      title="Select profiles/ or profiles2/ folder containing .tcl files"
                    >
                      <Layers className="w-3.5 h-3.5 text-purple-400" />
                      <span>Profiles Folder</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => allFolderInputRef.current?.click()}
                    disabled={isProcessingFiles}
                    className="w-full py-2 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center justify-center space-x-1.5 cursor-pointer transition-all active:scale-95 shadow-sm"
                    title="Select root de1app folder to import history and profiles together"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Browse Entire de1app Folder</span>
                  </button>
                </div>
              </div>

              {/* Option 2: Live Decaid Gateway API Sync */}
              <div className="p-3.5 rounded-2xl bg-decent-card border border-decent-border/60 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center space-x-2 text-xs font-bold text-white mb-1">
                    <Wifi className="w-4 h-4 text-sky-400" />
                    <span>Decaid Gateway Sync</span>
                  </div>
                  <div className="text-[10px] text-decent-muted">
                    Fetch past extractions and stored profiles directly from Decaid REST endpoints (<span className="font-mono">/api/v1/profiles</span> & <span className="font-mono">/api/v1/shots</span>).
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSyncFromGateway}
                  disabled={isSyncingGateway}
                  className="w-full py-2 px-3 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 text-xs font-bold flex items-center justify-center space-x-1.5 cursor-pointer transition-all active:scale-95 shadow-sm"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingGateway ? "animate-spin" : ""}`} />
                  <span>{isSyncingGateway ? "Querying Gateway..." : "Sync via Decaid Gateway"}</span>
                </button>
              </div>
            </div>

            {/* Migration Feedback Message */}
            {syncFeedback && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center space-x-2 animate-in fade-in duration-150 ${
                  syncFeedback.type === "success"
                    ? "bg-emerald-950/50 text-emerald-300 border border-emerald-500/60"
                    : syncFeedback.type === "error"
                    ? "bg-rose-950/50 text-rose-300 border border-rose-500/60"
                    : "bg-purple-950/50 text-purple-200 border border-purple-500/50"
                }`}
              >
                {syncFeedback.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : syncFeedback.type === "error" ? (
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                ) : (
                  <RefreshCw className="w-4 h-4 text-purple-400 animate-spin shrink-0" />
                )}
                <span>{syncFeedback.message}</span>
              </div>
            )}

            {/* Migration Summary & Apply Card */}
            {migrationResult && (
              <div className="p-4 rounded-2xl bg-decent-card border border-decent-border/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Discovered Records & Deduplication Summary</span>
                  </span>
                  <span className="text-[10px] text-decent-muted font-mono">
                    Ready to Apply
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-2.5 rounded-xl bg-decent-dark border border-decent-border">
                    <div className="text-[10px] text-decent-muted uppercase">Profiles to Add</div>
                    <div className="text-base font-bold text-white font-mono mt-0.5">
                      {migrationResult.profileStats.uniqueAdded}
                    </div>
                    <div className="text-[9.5px] text-emerald-400 mt-0.5">
                      {migrationResult.profileStats.duplicateCount} duplicates eliminated ({migrationResult.profileStats.profiles2OverridesCount} profiles2 overrides)
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-decent-dark border border-decent-border">
                    <div className="text-[10px] text-decent-muted uppercase">Shots to Add</div>
                    <div className="text-base font-bold text-white font-mono mt-0.5">
                      {migrationResult.shotStats.uniqueAdded}
                    </div>
                    <div className="text-[9.5px] text-slate-400 mt-0.5">
                      {migrationResult.shotStats.duplicateCount} duplicates ignored
                    </div>
                  </div>
                </div>

                {!isMigrationApplied ? (
                  <button
                    type="button"
                    onClick={handleApplyMigration}
                    disabled={migrationResult.importedProfiles.length === 0 && migrationResult.importedShots.length === 0}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center space-x-1.5 shadow-md active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    <span>Apply & Save to PantaRhei Library</span>
                  </button>
                ) : (
                  <div className="p-2.5 rounded-xl bg-emerald-950/40 text-emerald-300 border border-emerald-500/50 text-xs font-bold text-center flex items-center justify-center space-x-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Applied to Library Successfully</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer / Wizard Actions */}
        <div className="pt-3 border-t border-decent-border/60 shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <label className="flex items-center space-x-2 cursor-pointer text-xs text-decent-muted">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="rounded bg-decent-dark border-decent-border text-amber-500"
              />
              <span>Don't show this alert on startup</span>
            </label>

            <div className="flex items-center space-x-2">
              {activeTab === "machine" && (
                <button
                  type="button"
                  onClick={() => setActiveTab("scale")}
                  className="px-3.5 py-2 rounded-xl bg-decent-dark hover:bg-slate-800 border border-decent-border text-white font-semibold text-xs flex items-center space-x-1.5 cursor-pointer transition-all"
                >
                  <span>Next: Scale Pairing</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}

              {activeTab === "scale" && (
                <button
                  type="button"
                  onClick={() => setActiveTab("sync")}
                  className="px-3.5 py-2 rounded-xl bg-decent-dark hover:bg-slate-800 border border-decent-border text-white font-semibold text-xs flex items-center space-x-1.5 cursor-pointer transition-all"
                >
                  <span>Next: Sync Data</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}

              {activeTab === "sync" && (
                <button
                  type="button"
                  onClick={handleFinishOnboarding}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold text-xs flex items-center space-x-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Finish Setup & Enter Cockpit</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleContinueSimulator}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-500 hover:to-sky-400 text-white font-bold text-xs flex items-center space-x-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Continue Simulator</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
