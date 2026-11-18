import React, { useState, useEffect } from "react";
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
import type { PantaBean } from "../types/bean.ts";
import type { EquipmentInventory, ActiveEquipmentSelection } from "../types/equipment.ts";
import {
  syncFromDecaidGateway,
  type DecaidGatewaySyncResult,
} from "../services/legacyMigration.ts";
import {
  loadCustomProfilesFromStorage,
  saveCustomProfilesToStorage,
} from "../types/profile.ts";
import { saveShotHistoryToStorage } from "../types/shot.ts";
import { loadBeansFromStorage, saveBeansToStorage } from "../types/bean.ts";
import {
  loadEquipmentInventory,
  saveEquipmentInventory,
  loadActiveEquipment,
  saveActiveEquipment,
} from "../types/equipment.ts";
import { mergeProfiles, mergeShots, mergeBeans } from "../types/backup.ts";
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
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  SkipForward,
} from "lucide-react";

interface ConnectMachineModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinueSimulator: () => void;
  onImportData?: (data: {
    profiles: ProfileItem[];
    shots: ShotRecord[];
    beans?: PantaBean[];
    equipment?: Partial<EquipmentInventory>;
    activeEquipment?: Partial<ActiveEquipmentSelection>;
  }) => void;
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
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [machineStatus, setMachineStatus] = useState<MachineConnectionStatus>(() => decaid.getMachineStatus());
  const [pairedScale, setPairedScale] = useState<PairedScaleInfo | null>(() => decaid.getPairedScale());

  const [hostInput, setHostInput] = useState<string>(() => decaid.getHost());
  const [portInput, setPortInput] = useState<number>(() => decaid.getPort());

  // Machine discovery state
  const [isScanningMachines, setIsScanningMachines] = useState(false);
  const [discoveredMachines, setDiscoveredMachines] = useState<DiscoveredMachine[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Scale discovery state
  const [isScanningScales, setIsScanningScales] = useState(false);
  const [discoveredScales, setDiscoveredScales] = useState<DiscoveredScale[]>([]);

  // Gateway Sync State
  const [isSyncingGateway, setIsSyncingGateway] = useState(false);
  const [syncResult, setSyncResult] = useState<DecaidGatewaySyncResult | null>(null);
  const [isSyncApplied, setIsSyncApplied] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  const [dontShowAgain, setDontShowAgain] = useState(false);

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
      setStep(2);
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
      setStep(2);
    } else {
      await decaid.connectLiveMachine();
      setStep(2);
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
    setStep(3);
  };

  const handleDisconnectScale = () => {
    decaid.disconnectScale();
  };

  const handleContinueSimulator = () => {
    if (typeof window !== "undefined") {
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
  // Decaid Automated Single-Action Gateway Import
  // -------------------------------------------------------------

  const handleSyncFromGateway = async () => {
    setIsSyncingGateway(true);
    setSyncFeedback(null);
    setIsSyncApplied(false);

    try {
      const gatewayUrl = `http://${hostInput}:${portInput}`;
      const data = await syncFromDecaidGateway(gatewayUrl, 100);

      // Save profiles
      if (data.profiles.length > 0) {
        const currentCustom = loadCustomProfilesFromStorage();
        const mergedProfs = mergeProfiles([...existingProfiles, ...currentCustom], data.profiles, "merge_deduplicate");
        saveCustomProfilesToStorage(mergedProfs);
      }

      // Save shots
      if (data.shots.length > 0) {
        const mergedShots = mergeShots(existingShots, data.shots, "merge_deduplicate");
        saveShotHistoryToStorage(mergedShots);
      }

      // Save beans
      if (data.beans.length > 0) {
        const currentBeans = loadBeansFromStorage();
        const mergedBeansList = mergeBeans(currentBeans, data.beans, "merge_deduplicate");
        saveBeansToStorage(mergedBeansList);
      }

      // Save equipment inventory
      if (data.equipment) {
        const currentInv = loadEquipmentInventory();
        const updatedInv: EquipmentInventory = {
          ...currentInv,
          grinders: Array.from(new Set([...currentInv.grinders, ...data.equipment.grinders])),
          burrs: Array.from(new Set([...currentInv.burrs, ...data.equipment.burrs])),
          baskets: Array.from(new Set([...currentInv.baskets, ...data.equipment.baskets])),
          scales: Array.from(new Set([...currentInv.scales, ...data.equipment.scales])),
          tampers: Array.from(new Set([...currentInv.tampers, ...data.equipment.tampers])),
          distributors: Array.from(new Set([...currentInv.distributors, ...data.equipment.distributors])),
        };
        saveEquipmentInventory(updatedInv);
      }

      // Update active equipment if found
      if (data.activeEquipment) {
        const currentActive = loadActiveEquipment();
        saveActiveEquipment({
          ...currentActive,
          grinder: data.activeEquipment.grinder || currentActive.grinder,
          burrs: data.activeEquipment.burrs || currentActive.burrs,
          basket: data.activeEquipment.basket || currentActive.basket,
          tampers: data.activeEquipment.tampers && data.activeEquipment.tampers.length > 0 ? data.activeEquipment.tampers : currentActive.tampers,
          distributors: data.activeEquipment.distributors && data.activeEquipment.distributors.length > 0 ? data.activeEquipment.distributors : currentActive.distributors,
        });
      }

      setSyncResult(data);
      setIsSyncApplied(true);

      // Notify parent app
      if (onImportData) {
        onImportData(data);
      }

      setSyncFeedback({
        type: "success",
        message: `Successfully imported ${data.profiles.length} profiles, ${data.shots.length} shots, ${data.beans.length} coffees, and active gear from Decaid! Cockpit initialized with your last shot.`,
      });
    } catch (err: any) {
      setSyncFeedback({
        type: "error",
        message: `Gateway sync error: ${err.message || "Could not reach Decaid"}`,
      });
    } finally {
      setIsSyncingGateway(false);
    }
  };

  const handleFinishOnboarding = () => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("pantarhei_onboarding_completed", "true");
        if (dontShowAgain) {
          localStorage.setItem("pantarhei_dont_show_startup_connect", "true");
        }
      } catch {}
    }
    onClose();
  };

  const handleSkipSyncAndFinish = () => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("pantarhei_onboarding_completed", "true");
        if (dontShowAgain) {
          localStorage.setItem("pantarhei_dont_show_startup_connect", "true");
        }
      } catch {}
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 select-none animate-in fade-in duration-200">
      <div className="w-[680px] max-w-[96vw] max-h-[94vh] rounded-3xl bg-decent-surface border border-decent-border shadow-2xl flex flex-col p-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-decent-border/60">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Coffee className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <span>PantaRhei Welcome & Setup</span>
                {machineStatus === "connected" ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-mono">
                    DE1 CONNECTED
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 font-mono">
                    DE1 DISCONNECTED
                  </span>
                )}
              </h2>
              <p className="text-xs text-decent-muted mt-0.5">
                Quick 3-step setup: connect your machine, pair a scale, and import past data.
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

        {/* 3-Step Walkthrough Breadcrumbs */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-decent-dark/80 rounded-xl border border-decent-border/60 my-3 shrink-0">
          <button
            type="button"
            onClick={() => setStep(1)}
            className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
              step === 1
                ? "bg-amber-500/30 text-amber-300 border border-amber-500/50 shadow-sm"
                : "text-decent-muted hover:text-white"
            }`}
          >
            <Coffee className="w-3.5 h-3.5 mr-1" />
            <span>1. DE1 Machine</span>
            {machineStatus === "connected" && <span className="w-2 h-2 rounded-full bg-emerald-400 ml-1" />}
          </button>

          <button
            type="button"
            onClick={() => setStep(2)}
            className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
              step === 2
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
            onClick={() => setStep(3)}
            className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
              step === 3
                ? "bg-purple-500/30 text-purple-300 border border-purple-500/50 shadow-sm"
                : "text-decent-muted hover:text-white"
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            <span>3. Sync Past Data</span>
            {isSyncApplied && <span className="w-2 h-2 rounded-full bg-emerald-400 ml-1" />}
          </button>
        </div>

        {/* Step 1: Connect DE1 Machine */}
        {step === 1 && (
          <div className="flex-1 overflow-y-auto space-y-3.5 py-1 pr-1 text-xs">
            <div className="p-3 rounded-2xl bg-amber-950/30 border border-amber-500/40 text-[11px] text-amber-200/90 leading-relaxed">
              Hardware Bluetooth Low Energy (BLE) pairing with your DE1 is managed natively by Decaid (<span className="font-semibold text-white">Decaid Settings → Devices</span>). Panta Rhei interfaces with Decaid's local Gateway (<span className="font-mono font-semibold text-white">127.0.0.1:8080</span>) to stream live telemetry and send commands.
            </div>

            {connectionError && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/80 text-rose-300 text-xs flex items-start space-x-2 animate-in fade-in duration-150">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-bold">Connection Failed</div>
                  <div className="text-[11px] opacity-90 mt-0.5">{connectionError}</div>
                </div>
              </div>
            )}

            {/* Current Machine Status Card */}
            {machineStatus === "connected" ? (
              <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/50 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                    <Coffee className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center space-x-2">
                      <span>{decaid.getMachineInfo().model || "Decent DE1"}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-mono">
                        CONNECTED
                      </span>
                    </div>
                    <div className="text-[11px] text-decent-muted mt-0.5 font-mono">
                      Serial: {decaid.getMachineInfo().serialNumber || "Live"} · Firmware: v{decaid.getMachineInfo().firmwareVersion || "1.42"} · State: {decaid.getMachineInfo().state}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center space-x-1 transition-all cursor-pointer shadow-md"
                >
                  <span>Next: Scale</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-amber-500/30 flex items-start space-x-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                  <Bluetooth className="w-4 h-4" />
                </div>
                <div className="flex-1 text-[11px] text-slate-300 leading-relaxed">
                  <div className="font-bold text-white text-xs mb-0.5">Machine Not Connected in Decaid</div>
                  If Decaid has not yet paired with your DE1, switch to the Decaid native screen and tap <span className="text-amber-300 font-semibold">Settings → Devices</span> to connect to your DE1 over Bluetooth. Panta Rhei will automatically detect the connection as soon as Decaid connects.
                </div>
              </div>
            )}

            {/* Network Bridge Connect Form */}
            <div className="p-4 rounded-2xl bg-decent-card border border-decent-border/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                  <Wifi className="w-3.5 h-3.5 text-amber-400" />
                  <span>Decaid Gateway Connection</span>
                </span>
                <span className="text-[10px] text-decent-muted font-mono">Default: 127.0.0.1:8080</span>
              </div>

              <div className="grid grid-cols-[1fr_80px_110px] gap-2 items-center">
                <div>
                  <label className="text-[10px] text-decent-muted block mb-0.5 uppercase tracking-wider">Host / Tablet IP</label>
                  <input
                    type="text"
                    value={hostInput}
                    onChange={(e) => setHostInput(e.target.value)}
                    placeholder="127.0.0.1 or tablet IP"
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
                    <span>{machineStatus === "connecting" ? "Checking..." : "Connect"}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Check Active Devices */}
            <div className="p-4 rounded-2xl bg-decent-card border border-decent-border/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                  <Bluetooth className="w-3.5 h-3.5 text-sky-400" />
                  <span>Decaid Gateway Devices</span>
                </span>
                <button
                  type="button"
                  onClick={handleScanMachines}
                  disabled={isScanningMachines}
                  className="px-2.5 py-1 rounded-lg bg-decent-dark border border-decent-border text-xs text-slate-300 hover:text-white flex items-center space-x-1 cursor-pointer transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${isScanningMachines ? "animate-spin text-amber-400" : ""}`} />
                  <span>{isScanningMachines ? "Checking..." : "Refresh"}</span>
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
                        Select
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-2 text-[11px] text-decent-muted italic">
                  {isScanningMachines ? "Checking Decaid for connected DE1 hardware..." : "Hardware pairing is managed by Decaid. Once connected in Decaid, it will appear here."}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Connect Bluetooth Scale */}
        {step === 2 && (
          <div className="flex-1 overflow-y-auto space-y-3.5 py-1 pr-1 text-xs">
            <div className="p-3 rounded-2xl bg-sky-950/30 border border-sky-500/40 text-[11px] text-sky-200/90 leading-relaxed">
              Bluetooth scales pair directly with the native Decaid Android app (<span className="font-semibold text-white">Decaid Settings → Devices → Scale</span>). Decaid streams live weight and gravimetric flow to Panta Rhei automatically.
            </div>

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
                        CONNECTED VIA DECAID
                      </span>
                    </div>
                    <div className="text-[11px] text-decent-muted mt-0.5 font-mono">
                      Weight: {pairedScale.weightGrams.toFixed(1)}g · Battery: {pairedScale.batteryPercentage}%
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => decaid.tareScale()}
                    className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer shadow-sm"
                  >
                    Tare (0.0g)
                  </button>
                  <button
                    type="button"
                    onClick={handleDisconnectScale}
                    className="px-2.5 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-semibold cursor-pointer transition-all"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-decent-dark/60 border border-decent-border/60 text-center py-4 space-y-2">
                <Scale className="w-8 h-8 text-decent-muted mx-auto" />
                <div className="text-xs font-bold text-white">No Bluetooth Scale Connected in Decaid</div>
                <p className="text-[11px] text-decent-muted max-w-sm mx-auto leading-relaxed">
                  Turn on your scale and pair it in <span className="text-sky-300 font-semibold">Decaid Settings → Devices → Scale</span>. Panta Rhei will automatically display weight as soon as Decaid connects.
                </p>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleScanScales}
                    disabled={isScanningScales}
                    className="px-3 py-1.5 rounded-xl bg-sky-600/30 hover:bg-sky-600/40 border border-sky-500/40 text-sky-200 text-xs font-semibold inline-flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isScanningScales ? "animate-spin text-sky-300" : ""}`} />
                    <span>{isScanningScales ? "Checking Decaid Scale..." : "Check Scale Status"}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Discovered Scale Results (if any reported by Decaid API) */}
            {discoveredScales.length > 0 && (
              <div className="p-4 rounded-2xl bg-decent-card border border-decent-border/60 space-y-3">
                <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                  <Bluetooth className="w-3.5 h-3.5 text-sky-400" />
                  <span>Decaid Scale Discovered</span>
                </span>
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
                          <div className="text-[10px] text-decent-muted font-mono">{s.address}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handlePairScale(s)}
                        className="px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 text-[11px] font-bold cursor-pointer transition-all"
                      >
                        Select Scale
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Supported Models Badges */}
            <div className="pt-1">
              <span className="text-[10px] text-decent-muted uppercase tracking-wider block mb-1">
                Supported Scale Protocols in Decaid
              </span>
              <div className="flex flex-wrap gap-1">
                {SUPPORTED_SCALE_MODELS.map((m) => (
                  <span
                    key={m.id}
                    className="text-[9.5px] px-2 py-0.5 rounded-md bg-decent-dark text-slate-300 border border-decent-border"
                  >
                    {m.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Automatic Decaid History & Profile Sync */}
        {step === 3 && (
          <div className="flex-1 overflow-y-auto space-y-3.5 py-1 pr-1 text-xs">
            <div className="p-3.5 rounded-2xl bg-purple-950/30 border border-purple-500/40 space-y-1.5">
              <div className="flex items-center space-x-2 text-purple-300 font-bold text-xs">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span>Automatic Decaid History & Profile Sync</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Bring in your extraction profiles, historical shots, coffee inventory, and grinder/basket equipment directly from the Decaid Gateway with a single tap. If you prefer a completely clean start, simply click <span className="font-semibold text-white">"Cancel / Skip Sync"</span> below.
              </p>
            </div>

            {/* Single Action Import Card */}
            <div className="p-4 rounded-2xl bg-decent-card border border-decent-border/80 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <RefreshCw className="w-4 h-4 text-sky-400" />
                  <span className="text-xs font-bold text-white">Direct Decaid Gateway Sync</span>
                </div>
                <span className="text-[10px] text-decent-muted font-mono">
                  {hostInput}:{portInput}
                </span>
              </div>

              <p className="text-[11px] text-decent-muted">
                Fetches all stored profiles from <span className="font-mono text-purple-300">/api/v1/profiles</span> and your past espresso shots from <span className="font-mono text-amber-300">/api/v1/shots</span>, parsing terroir, dose, yield, grinders, burrs, and puck prep into fully searchable records.
              </p>

              <button
                type="button"
                onClick={handleSyncFromGateway}
                disabled={isSyncingGateway}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-sky-600 hover:from-purple-500 hover:to-sky-500 text-white font-bold text-xs flex items-center justify-center space-x-2 cursor-pointer transition-all active:scale-98 shadow-lg disabled:opacity-60"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncingGateway ? "animate-spin" : ""}`} />
                <span>{isSyncingGateway ? "Importing from Decaid Gateway..." : "Import History & Profiles from Decaid"}</span>
              </button>
            </div>

            {/* Feedback Toast */}
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

            {/* Discovered Records Summary */}
            {syncResult && (
              <div className="p-3.5 rounded-2xl bg-decent-card border border-decent-border/80 space-y-2.5 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Imported Records & Hardware Equipment</span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono font-semibold">
                    SAVED TO LIBRARY
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="p-2 rounded-xl bg-decent-dark border border-decent-border">
                    <div className="text-[9.5px] text-decent-muted uppercase">Profiles</div>
                    <div className="text-sm font-bold text-white font-mono mt-0.5">
                      {syncResult.profiles.length}
                    </div>
                  </div>
                  <div className="p-2 rounded-xl bg-decent-dark border border-decent-border">
                    <div className="text-[9.5px] text-decent-muted uppercase">Shots</div>
                    <div className="text-sm font-bold text-white font-mono mt-0.5">
                      {syncResult.shots.length}
                    </div>
                  </div>
                  <div className="p-2 rounded-xl bg-decent-dark border border-decent-border">
                    <div className="text-[9.5px] text-decent-muted uppercase">Coffees</div>
                    <div className="text-sm font-bold text-white font-mono mt-0.5">
                      {syncResult.beans.length}
                    </div>
                  </div>
                  <div className="p-2 rounded-xl bg-decent-dark border border-decent-border">
                    <div className="text-[9.5px] text-decent-muted uppercase">Gear Items</div>
                    <div className="text-sm font-bold text-white font-mono mt-0.5">
                      {syncResult.equipment.grinders.length +
                        syncResult.equipment.burrs.length +
                        syncResult.equipment.baskets.length +
                        syncResult.equipment.tampers.length +
                        syncResult.equipment.distributors.length}
                    </div>
                  </div>
                </div>

                {/* Discovered Gear Detail */}
                {(syncResult.equipment.grinders.length > 0 || syncResult.equipment.baskets.length > 0) && (
                  <div className="text-[10.5px] text-slate-300 bg-decent-dark p-2 rounded-xl border border-decent-border/60">
                    <span className="text-amber-400 font-semibold">Active Hardware: </span>
                    {[
                      syncResult.activeEquipment?.grinder,
                      syncResult.activeEquipment?.burrs ? `(${syncResult.activeEquipment.burrs})` : "",
                      syncResult.activeEquipment?.basket,
                      ...(syncResult.activeEquipment?.tampers || []),
                      ...(syncResult.activeEquipment?.distributors || []),
                    ].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer Walkthrough Navigation */}
        <div className="pt-3 border-t border-decent-border/60 shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <label className="flex items-center space-x-2 cursor-pointer text-xs text-decent-muted">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="rounded bg-decent-dark border-decent-border text-amber-500"
              />
              <span>Don't show this walkthrough on startup</span>
            </label>

            <div className="flex items-center space-x-2">
              {/* Step 1 Actions */}
              {step === 1 && (
                <>
                  <button
                    type="button"
                    onClick={handleContinueSimulator}
                    className="px-3 py-1.5 rounded-xl bg-decent-dark hover:bg-slate-800 border border-decent-border text-slate-300 font-semibold text-xs flex items-center space-x-1 cursor-pointer transition-all"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Simulator Mode</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center space-x-1.5 cursor-pointer transition-all shadow-md"
                  >
                    <span>Next: Scale Setup</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </>
              )}

              {/* Step 2 Actions */}
              {step === 2 && (
                <>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="px-3 py-1.5 rounded-xl bg-decent-dark hover:bg-slate-800 border border-decent-border text-slate-300 font-semibold text-xs flex items-center space-x-1 cursor-pointer transition-all"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="px-3 py-1.5 rounded-xl bg-decent-dark hover:bg-slate-800 border border-slate-600 text-slate-200 font-semibold text-xs flex items-center space-x-1 cursor-pointer transition-all"
                    title="Continue without pairing a Bluetooth scale"
                  >
                    <SkipForward className="w-3.5 h-3.5 text-amber-400" />
                    <span>Skip (No Scale)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="px-3.5 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center space-x-1.5 cursor-pointer transition-all shadow-md"
                  >
                    <span>Next: Sync Past Data</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </>
              )}

              {/* Step 3 Actions */}
              {step === 3 && (
                <>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="px-3 py-1.5 rounded-xl bg-decent-dark hover:bg-slate-800 border border-decent-border text-slate-300 font-semibold text-xs flex items-center space-x-1 cursor-pointer transition-all"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSkipSyncAndFinish}
                    className="px-3 py-1.5 rounded-xl bg-decent-dark hover:bg-slate-800 border border-decent-border text-slate-300 font-semibold text-xs flex items-center space-x-1 cursor-pointer transition-all"
                  >
                    <span>Cancel / Skip Sync</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleFinishOnboarding}
                    className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold text-xs flex items-center space-x-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Finish & Start Brewing</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
