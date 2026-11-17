import React, { useState, useEffect, useMemo, useRef } from "react";
import type { CafeHeaderConfig } from "../types/header.ts";
import { calculateHeaderFit } from "../services/headerFit.ts";
import { CLOCK_PALETTES } from "./DigitalClock.tsx";
import { decaid } from "../services/decaidConnection.ts";
import type {
  MachineConnectionStatus,
  DE1MachineInfo,
  DiscoveredMachine,
  PairedScaleInfo,
  DiscoveredScale,
} from "../types/device.ts";
import { SUPPORTED_SCALE_MODELS } from "../types/device.ts";
import type { ScreensaverConfig } from "../types/screensaver.ts";
import {
  loadScreensaverConfigFromStorage,
  saveScreensaverConfigToStorage,
} from "../types/screensaver.ts";
import type { DecaidPluginManifest } from "../types/plugin.ts";
import {
  loadPluginsFromStorage,
  savePluginsToStorage,
  discoverDecaidPlugins,
  setDecaidPluginEnabled,
} from "../types/plugin.ts";
import {
  loadCustomProfilesFromStorage,
  saveCustomProfilesToStorage,
} from "../types/profile.ts";
import type { PantaBean } from "../types/bean.ts";
import {
  saveBeansToStorage,
} from "../types/bean.ts";
import type { ShotRecord } from "../types/shot.ts";
import { saveShotHistoryToStorage } from "../types/shot.ts";
import type {
  CoffeeTabConfig,
  SteamTabConfig,
  WaterTabConfig,
  MaintenanceTabConfig,
} from "../types/cockpitTabs.ts";
import type {
  PantaRheiSettingsPayload,
  PantaRheiBackupEnvelope,
  ImportPreviewResult,
  ImportStrategy,
} from "../types/backup.ts";
import { previewBackupImport, mergeProfiles, mergeShots } from "../types/backup.ts";
import {
  processMigrationFiles,
  syncFromDecaidGateway,
  type MigrationBatchResult,
} from "../services/legacyMigration.ts";
import {
  buildBackupEnvelope,
  downloadBackupFile,
  pushBackupToNetworkDevice,
  saveAutoBackup,
  getAutoBackups,
  executeBackupImport,
  type AutoBackupEntry,
} from "../services/backupManager.ts";
import {
  loadDYESettings,
  saveDYESettings,
  syncHistoryToDYE,
  type DYEPluginConfig,
} from "../services/dyeBridge.ts";
import {
  loadVisualizerSettings,
  saveVisualizerSettings,
  persistVisualizerSettings,
  testVisualizerConnection,
  type VisualizerPluginConfig,
} from "../services/visualizerBridge.ts";
import {
  X,
  Sparkles,
  Droplets,
  Sliders,
  Type,
  Clock,
  Eye,
  Coffee,
  Scale,
  Wifi,
  Bluetooth,
  RefreshCw,
  Moon,
  Sun,
  Battery,
  Check,
  AlertTriangle,
  Monitor,
  Folder,
  Puzzle,
  ExternalLink,
  Download,
  Upload,
  Database,
  HardDrive,
  Settings as SettingsIcon,
  Send,
  CheckCircle2,
  Layers,
  ArrowLeft,
  ShieldCheck,
  Wrench,
  Plus,
  Cpu,
  FolderOpen,
  History,
  Snowflake,
  Trash2,
} from "lucide-react";
import type { EquipmentInventory, FreezerEquipmentItem } from "../types/equipment.ts";
import { loadEquipmentInventory, saveEquipmentInventory, getFreezerSlowdownFactor } from "../types/equipment.ts";
import {
  saveScreensaverImages,
  loadScreensaverImages,
  getScreensaverImageCount,
  clearScreensaverImages,
  DEFAULT_OFFLINE_SCREENSAVER_IMAGES,
} from "../services/screensaverImageStore.ts";
import type { SystemVersionInfo, ReleaseChannel } from "../types/device.ts";
import type { MachineMaintenanceConfig } from "../types/maintenance.ts";
import {
  loadMaintenanceConfig,
  saveMaintenanceConfig,
  getMaintenanceStatus,
  formatTimeAgo,
} from "../types/maintenance.ts";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  headerConfig: CafeHeaderConfig;
  onHeaderConfigChange: (config: CafeHeaderConfig) => void;
  clockPaletteId: string;
  onClockPaletteChange: (id: string) => void;
  fluidEnabled: boolean;
  onFluidEnabledChange: (enabled: boolean) => void;
  screensaverConfig?: ScreensaverConfig;
  onScreensaverConfigChange?: (config: ScreensaverConfig) => void;
  beans?: PantaBean[];
  onBeansChange?: (beans: PantaBean[]) => void;
  shots?: ShotRecord[];
  onShotsChange?: (shots: ShotRecord[]) => void;
  cockpitConfigs?: {
    coffee: CoffeeTabConfig;
    steam: SteamTabConfig;
    water: WaterTabConfig;
    maintenance: MaintenanceTabConfig;
  };
  onCockpitConfigsChange?: (configs: {
    coffee: CoffeeTabConfig;
    steam: SteamTabConfig;
    water: WaterTabConfig;
    maintenance: MaintenanceTabConfig;
  }) => void;
  equipmentInventory?: EquipmentInventory;
  onEquipmentInventoryChange?: (inv: EquipmentInventory) => void;
  maintenanceConfig?: MachineMaintenanceConfig;
  onMaintenanceConfigChange?: (config: MachineMaintenanceConfig) => void;
  onNavigateToMaintenanceContext?: (actionType: "cleaning" | "descale") => void;
  initialTab?: "appearance" | "screensaver" | "pairing" | "plugins" | "backup" | "equipment";
}

const FONT_OPTIONS = [
  { label: "Modern Sans", value: "system-ui, -apple-system, sans-serif" },
  { label: "Elegant Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Tech Monospace", value: "ui-monospace, 'SF Mono', monospace" },
  { label: "Editorial Luxury", value: "'Playfair Display', Georgia, serif" },
  { label: "Geometric Display", value: "'Trebuchet MS', 'Segoe UI', sans-serif" },
];


export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  headerConfig,
  onHeaderConfigChange,
  clockPaletteId,
  onClockPaletteChange,
  fluidEnabled,
  onFluidEnabledChange,
  screensaverConfig: propsScreensaverConfig,
  onScreensaverConfigChange,
  beans = [],
  onBeansChange,
  shots = [],
  onShotsChange,
  cockpitConfigs,
  onCockpitConfigsChange,
  equipmentInventory: propsEquipmentInventory,
  onEquipmentInventoryChange,
  maintenanceConfig: propsMaintenanceConfig,
  onMaintenanceConfigChange,
  onNavigateToMaintenanceContext,
  initialTab = "appearance",
}) => {
  // Navigation: Appearance, Screensaver, Pairing, Equipment, Plugins, Backup
  const [activeTab, setActiveTab] = useState<"appearance" | "screensaver" | "pairing" | "plugins" | "backup" | "equipment">(initialTab);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Machine Maintenance Configuration State
  const [maintCfg, setMaintCfg] = useState<MachineMaintenanceConfig>(() => {
    return propsMaintenanceConfig || loadMaintenanceConfig();
  });

  useEffect(() => {
    if (propsMaintenanceConfig) {
      setMaintCfg(propsMaintenanceConfig);
    }
  }, [propsMaintenanceConfig]);

  const maintStatus = useMemo(() => getMaintenanceStatus(maintCfg), [maintCfg]);

  const handleUpdateCleaningInterval = (days: number) => {
    const clamped = Math.min(30, Math.max(1, days));
    const updated: MachineMaintenanceConfig = { ...maintCfg, cleaningIntervalDays: clamped };
    setMaintCfg(updated);
    saveMaintenanceConfig(updated);
    onMaintenanceConfigChange?.(updated);
  };

  const handleUpdateDescaleInterval = (months: number) => {
    const clamped = Math.min(12, Math.max(1, months));
    const updated: MachineMaintenanceConfig = { ...maintCfg, descaleIntervalMonths: clamped };
    setMaintCfg(updated);
    saveMaintenanceConfig(updated);
    onMaintenanceConfigChange?.(updated);
  };

  const handleMarkCleanedToday = () => {
    const updated: MachineMaintenanceConfig = { ...maintCfg, lastCleaningTimestamp: Date.now() };
    setMaintCfg(updated);
    saveMaintenanceConfig(updated);
    onMaintenanceConfigChange?.(updated);
  };

  const handleMarkDescaledToday = () => {
    const updated: MachineMaintenanceConfig = { ...maintCfg, lastDescaleTimestamp: Date.now() };
    setMaintCfg(updated);
    saveMaintenanceConfig(updated);
    onMaintenanceConfigChange?.(updated);
  };

  // Equipment Inventory State
  const [equipmentInv, setEquipmentInv] = useState<EquipmentInventory>(() => {
    return propsEquipmentInventory || loadEquipmentInventory();
  });
  const [newEquipInput, setNewEquipInput] = useState<Record<string, string>>({
    grinders: "",
    burrs: "",
    baskets: "",
    scales: "",
    tampers: "",
    distributors: "",
    wdt: "",
    rdt: "",
  });
  const [newFreezerName, setNewFreezerName] = useState("");
  const [newFreezerTemp, setNewFreezerTemp] = useState<number>(-18);

  useEffect(() => {
    if (propsEquipmentInventory) {
      setEquipmentInv(propsEquipmentInventory);
    }
  }, [propsEquipmentInventory]);

  const handleAddEquipmentItem = (category: "grinders" | "burrs" | "baskets" | "scales" | "tampers" | "distributors" | "wdt" | "rdt") => {
    const text = (newEquipInput[category] || "").trim();
    if (!text) return;
    if (equipmentInv[category].includes(text)) {
      setNewEquipInput((prev) => ({ ...prev, [category]: "" }));
      return;
    }
    const updated: EquipmentInventory = {
      ...equipmentInv,
      [category]: [...equipmentInv[category], text],
    };
    setEquipmentInv(updated);
    saveEquipmentInventory(updated);
    onEquipmentInventoryChange?.(updated);
    setNewEquipInput((prev) => ({ ...prev, [category]: "" }));
  };

  const handleRemoveEquipmentItem = (category: "grinders" | "burrs" | "baskets" | "scales" | "tampers" | "distributors" | "wdt" | "rdt", item: string) => {
    const updated: EquipmentInventory = {
      ...equipmentInv,
      [category]: equipmentInv[category].filter((x) => x !== item),
    };
    setEquipmentInv(updated);
    saveEquipmentInventory(updated);
    onEquipmentInventoryChange?.(updated);
  };

  const handleAddFreezer = () => {
    const name = newFreezerName.trim();
    if (!name) return;
    const newFreezer: FreezerEquipmentItem = {
      id: "freezer-" + Date.now(),
      name,
      temperatureC: Number(newFreezerTemp) || -18,
    };
    const updated: EquipmentInventory = {
      ...equipmentInv,
      freezers: [...(equipmentInv.freezers || []), newFreezer],
    };
    setEquipmentInv(updated);
    saveEquipmentInventory(updated);
    onEquipmentInventoryChange?.(updated);
    setNewFreezerName("");
    setNewFreezerTemp(-18);
  };

  const handleRemoveFreezer = (id: string) => {
    const list = equipmentInv.freezers || [];
    if (list.length <= 1) return; // Keep at least one freezer
    const updated: EquipmentInventory = {
      ...equipmentInv,
      freezers: list.filter((f) => f.id !== id),
    };
    setEquipmentInv(updated);
    saveEquipmentInventory(updated);
    onEquipmentInventoryChange?.(updated);
  };

  const handleUpdateFreezerTemp = (id: string, temp: number) => {
    const list = equipmentInv.freezers || [];
    const updated: EquipmentInventory = {
      ...equipmentInv,
      freezers: list.map((f) => (f.id === id ? { ...f, temperatureC: temp } : f)),
    };
    setEquipmentInv(updated);
    saveEquipmentInventory(updated);
    onEquipmentInventoryChange?.(updated);
  };

  // Screensaver Configuration State
  const [screensaver, setScreensaver] = useState<ScreensaverConfig>(() => {
    return propsScreensaverConfig || loadScreensaverConfigFromStorage();
  });

  const updateScreensaver = (partial: Partial<ScreensaverConfig>) => {
    const updated = { ...screensaver, ...partial };
    setScreensaver(updated);
    saveScreensaverConfigToStorage(updated);
    if (onScreensaverConfigChange) {
      onScreensaverConfigChange(updated);
    }
  };

  // Screensaver Custom Folder & Image Pool State
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [customImagesCount, setCustomImagesCount] = useState<number>(0);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isReadingFolder, setIsReadingFolder] = useState<boolean>(false);
  const [folderFeedback, setFolderFeedback] = useState<string | null>(null);

  useEffect(() => {
    getScreensaverImageCount().then((count) => setCustomImagesCount(count));
    loadScreensaverImages().then((imgs) => setImagePreviews(imgs.slice(0, 12)));
  }, []);

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsReadingFolder(true);
    setFolderFeedback("Reading images from selected folder...");

    try {
      const imageFiles = Array.from(files).filter((file) =>
        file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name)
      );

      if (imageFiles.length === 0) {
        setFolderFeedback("No image files (.jpg, .png, .webp) found in the selected folder.");
        setIsReadingFolder(false);
        return;
      }

      // Infer folder name from first relative path or input
      const firstPath = (imageFiles[0] as any).webkitRelativePath || "";
      const folderName = firstPath ? firstPath.split("/")[0] : "Custom Folder";

      // Read images into Data URLs
      const readPromises = imageFiles.map((file) => {
        return new Promise<{ name: string; dataUrl: string }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve({ name: file.name, dataUrl: reader.result as string });
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
      });

      const loadedImages = await Promise.all(readPromises);
      await saveScreensaverImages(loadedImages);

      setCustomImagesCount(loadedImages.length);
      setImagePreviews(loadedImages.slice(0, 12).map((img) => img.dataUrl));
      updateScreensaver({ imageFolder: folderName, imageCount: loadedImages.length });
      setFolderFeedback(`✓ Loaded ${loadedImages.length} images from folder "${folderName}"!`);
      setTimeout(() => setFolderFeedback(null), 5000);
    } catch (err) {
      setFolderFeedback(`Error loading images: ${String(err)}`);
    } finally {
      setIsReadingFolder(false);
    }
  };

  const handleClearImages = async () => {
    await clearScreensaverImages();
    setCustomImagesCount(0);
    setImagePreviews(DEFAULT_OFFLINE_SCREENSAVER_IMAGES);
    updateScreensaver({ imageFolder: "Default Specialty Coffee Collection", imageCount: 0 });
    setFolderFeedback("Reset to default offline specialty coffee collection.");
    setTimeout(() => setFolderFeedback(null), 3000);
  };

  // Reactive Device States from decaid (Pairing tab)
  const [machineStatus, setMachineStatus] = useState<MachineConnectionStatus>(() => decaid.getMachineStatus());
  const [machineInfo, setMachineInfo] = useState<DE1MachineInfo>(() => decaid.getMachineInfo());
  const [pairedScale, setPairedScale] = useState<PairedScaleInfo | null>(() => decaid.getPairedScale());
  const [systemVersion, setSystemVersion] = useState<SystemVersionInfo>(() => decaid.getSystemVersion());
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [isUpdatingFirmware, setIsUpdatingFirmware] = useState(false);
  const [isUpdatingSoftware, setIsUpdatingSoftware] = useState(false);
  const [updateFeedback, setUpdateFeedback] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  const [hostInput, setHostInput] = useState<string>(() => decaid.getHost());
  const [portInput, setPortInput] = useState<number>(() => decaid.getPort());

  const [isScanningMachines, setIsScanningMachines] = useState(false);
  const [discoveredMachines, setDiscoveredMachines] = useState<DiscoveredMachine[]>([]);
  const [isScanningScales, setIsScanningScales] = useState(false);
  const [discoveredScales, setDiscoveredScales] = useState<DiscoveredScale[]>([]);

  const [autoTareShot, setAutoTareShot] = useState(() => {
    try {
      return localStorage.getItem("pantarhei_scale_autotare_shot") !== "false";
    } catch {}
    return true;
  });

  const [autoTareCup, setAutoTareCup] = useState(() => {
    try {
      return localStorage.getItem("pantarhei_scale_autotare_cup") === "true";
    } catch {}
    return false;
  });

  const [connectionMessage, setConnectionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Decaid Plugins State
  const [plugins, setPlugins] = useState<DecaidPluginManifest[]>(() => loadPluginsFromStorage());
  const [isRefreshingPlugins, setIsRefreshingPlugins] = useState(false);

  // Plugin Sub-Panel Configuration State
  const [selectedPluginConfigId, setSelectedPluginConfigId] = useState<"visualizer" | "dye2" | null>(null);
  const [visualizerConfig, setVisualizerConfig] = useState<VisualizerPluginConfig>(() => loadVisualizerSettings());
  const [visualizerTestResult, setVisualizerTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTestingVisualizer, setIsTestingVisualizer] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [visualizerSavedFeedback, setVisualizerSavedFeedback] = useState(false);

  const [dyeConfig, setDyeConfig] = useState<DYEPluginConfig>(() => loadDYESettings());
  const [dyeSyncProgress, setDyeSyncProgress] = useState<{ synced: number; total: number } | null>(null);
  const [isSyncingDye, setIsSyncingDye] = useState(false);
  const [dyeSyncResult, setDyeSyncResult] = useState<{ success: boolean; message: string } | null>(null);

  // Backup & Deduplication State
  const [autoBackups, setAutoBackups] = useState<AutoBackupEntry[]>(() => getAutoBackups());
  const [networkTargetHost, setNetworkTargetHost] = useState("192.168.1.");
  const [networkTargetPort, setNetworkTargetPort] = useState(8080);
  const [isPushingNetwork, setIsPushingNetwork] = useState(false);
  const [networkPushResult, setNetworkPushResult] = useState<{ success: boolean; message: string } | null>(null);

  const [parsedImportEnvelope, setParsedImportEnvelope] = useState<PantaRheiBackupEnvelope | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreviewResult | null>(null);
  const [importStrategy, setImportStrategy] = useState<ImportStrategy>("merge_deduplicate");
  const [importToast, setImportToast] = useState<{ success: boolean; message: string } | null>(null);
  const [isImportFileError, setIsImportFileError] = useState<string | null>(null);

  // Folder & Gateway Migration State
  const migrationHistoryInputRef = useRef<HTMLInputElement>(null);
  const migrationProfilesInputRef = useRef<HTMLInputElement>(null);
  const migrationAllFolderInputRef = useRef<HTMLInputElement>(null);

  const [migrationBatch, setMigrationBatch] = useState<MigrationBatchResult | null>(null);
  const [isProcessingMigrationFiles, setIsProcessingMigrationFiles] = useState(false);
  const [isSyncingMigrationGateway, setIsSyncingMigrationGateway] = useState(false);
  const [migrationToast, setMigrationToast] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [isMigrationDone, setIsMigrationDone] = useState(false);

  // Sync with live decaid device updates
  useEffect(() => {
    const unsub = decaid.addDeviceListener(() => {
      setMachineStatus(decaid.getMachineStatus());
      setMachineInfo(decaid.getMachineInfo());
      setPairedScale(decaid.getPairedScale());
      setSystemVersion(decaid.getSystemVersion());
    });
    return unsub;
  }, []);

  const handleCheckUpdates = async () => {
    setIsCheckingUpdates(true);
    setUpdateFeedback(null);
    try {
      const ver = await decaid.checkSystemVersions();
      setSystemVersion(ver);
      if (ver.firmwareUpdateAvailable || ver.softwareUpdateAvailable) {
        setUpdateFeedback({
          type: "info",
          message: `Updates available: ${ver.firmwareUpdateAvailable ? `DE1 Firmware v${ver.latestFirmwareVersion} ` : ""}${ver.softwareUpdateAvailable ? `Decaid v${ver.latestSoftwareVersion}` : ""}`,
        });
      } else {
        setUpdateFeedback({
          type: "success",
          message: "All components are up to date (DE1 Machine & Decaid Software).",
        });
      }
    } catch (err: any) {
      setUpdateFeedback({
        type: "error",
        message: `Failed to check for updates: ${err.message || "Network error"}`,
      });
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  const handleChannelChange = async (newChannel: ReleaseChannel) => {
    if (newChannel === systemVersion.targetChannel || isCheckingUpdates) return;
    setIsCheckingUpdates(true);
    setUpdateFeedback({
      type: "info",
      message: `Switching update channel to ${newChannel.toUpperCase()} and checking for releases...`,
    });
    try {
      const ver = await decaid.setUpdateChannel(newChannel);
      setSystemVersion(ver);
      if (ver.firmwareUpdateAvailable || ver.softwareUpdateAvailable) {
        setUpdateFeedback({
          type: "info",
          message: `Updates available on ${newChannel.toUpperCase()} channel: ${ver.firmwareUpdateAvailable ? `DE1 Firmware v${ver.latestFirmwareVersion} ` : ""}${ver.softwareUpdateAvailable ? `Decaid v${ver.latestSoftwareVersion}` : ""}`,
        });
      } else {
        setUpdateFeedback({
          type: "success",
          message: `All components are up to date on the ${newChannel.toUpperCase()} channel.`,
        });
      }
    } catch (err: any) {
      setUpdateFeedback({
        type: "error",
        message: `Failed to switch channel: ${err.message || "Network error"}`,
      });
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  const renderChannelBadge = (channel?: ReleaseChannel) => {
    const ch = channel || "stable";
    switch (ch) {
      case "beta":
        return (
          <span className="text-[8.5px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
            Beta
          </span>
        );
      case "nightly":
        return (
          <span className="text-[8.5px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/40">
            Nightly
          </span>
        );
      case "stable":
      default:
        return (
          <span className="text-[8.5px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            Stable
          </span>
        );
    }
  };

  const handleUpdateFirmware = async () => {
    setIsUpdatingFirmware(true);
    setUpdateFeedback({
      type: "info",
      message: "Flashing DE1 machine firmware via BLE... Please keep machine powered on.",
    });
    try {
      const res = await decaid.triggerFirmwareUpdate();
      setSystemVersion(decaid.getSystemVersion());
      setMachineInfo(decaid.getMachineInfo());
      if (res.ok) {
        setUpdateFeedback({
          type: "success",
          message: res.message,
        });
      } else {
        setUpdateFeedback({
          type: "error",
          message: res.message,
        });
      }
    } catch (err: any) {
      setUpdateFeedback({
        type: "error",
        message: `Firmware flash error: ${err.message || "Unknown error"}`,
      });
    } finally {
      setIsUpdatingFirmware(false);
    }
  };

  const handleUpdateSoftware = async () => {
    setIsUpdatingSoftware(true);
    setUpdateFeedback({
      type: "info",
      message: "Downloading and updating Decaid software package...",
    });
    try {
      const res = await decaid.triggerSoftwareUpdate();
      setSystemVersion(decaid.getSystemVersion());
      setMachineInfo(decaid.getMachineInfo());
      if (res.ok) {
        setUpdateFeedback({
          type: "success",
          message: res.message,
        });
      } else {
        setUpdateFeedback({
          type: "error",
          message: res.message,
        });
      }
    } catch (err: any) {
      setUpdateFeedback({
        type: "error",
        message: `Software update error: ${err.message || "Unknown error"}`,
      });
    } finally {
      setIsUpdatingSoftware(false);
    }
  };

  // Discover plugins on opening or changing to plugins tab
  const handleRefreshPlugins = async () => {
    setIsRefreshingPlugins(true);
    try {
      const baseUrl = `http://${hostInput}:${portInput}`;
      const discovered = await discoverDecaidPlugins(baseUrl);
      setPlugins(discovered);
    } finally {
      setIsRefreshingPlugins(false);
    }
  };

  // Custom profiles cache for backup
  const currentCustomProfiles = useMemo(() => loadCustomProfilesFromStorage(), [isOpen]);

  if (!isOpen) return null;

  const headerFit = calculateHeaderFit(headerConfig);

  const handleConnectMachine = async () => {
    setConnectionMessage(null);
    const ok = await decaid.connectLiveMachine(hostInput, portInput);
    if (ok) {
      setConnectionMessage({ type: "success", text: "Connected successfully to Decaid live bridge!" });
      setTimeout(() => setConnectionMessage(null), 4000);
    } else {
      setConnectionMessage({ type: "error", text: `Could not connect to Decaid at ${hostInput}:${portInput}` });
    }
  };

  const handleScanMachines = async () => {
    setIsScanningMachines(true);
    try {
      const list = await decaid.scanForMachines();
      setDiscoveredMachines(list);
    } finally {
      setIsScanningMachines(false);
    }
  };

  const handleScanScales = async () => {
    setIsScanningScales(true);
    try {
      const list = await decaid.scanForScales();
      setDiscoveredScales(list);
    } finally {
      setIsScanningScales(false);
    }
  };

  const handlePairScale = async (scale: DiscoveredScale) => {
    await decaid.pairScale(scale);
  };

  const handleTogglePlugin = async (pluginId: string, currentEnabled: boolean) => {
    const next = !currentEnabled;
    const updated = plugins.map((p) => (p.id === pluginId ? { ...p, enabled: next } : p));
    setPlugins(updated);
    savePluginsToStorage(updated);
    const baseUrl = `http://${hostInput}:${portInput}`;
    await setDecaidPluginEnabled(baseUrl, pluginId, next);
  };

  // Visualizer Handlers
  const handleSaveVisualizer = async () => {
    const baseUrl = `http://${hostInput}:${portInput}`;
    await persistVisualizerSettings(baseUrl, visualizerConfig);
    setVisualizerSavedFeedback(true);
    setTimeout(() => setVisualizerSavedFeedback(false), 3000);
  };

  const handleTestVisualizer = async () => {
    setIsTestingVisualizer(true);
    setVisualizerTestResult(null);
    try {
      const res = await testVisualizerConnection(visualizerConfig.userToken);
      setVisualizerTestResult(res);
    } finally {
      setIsTestingVisualizer(false);
    }
  };

  // DYE Handlers
  const handleSaveDyeConfig = (partial: Partial<DYEPluginConfig>) => {
    const updated = { ...dyeConfig, ...partial };
    setDyeConfig(updated);
    saveDYESettings(updated);
  };

  const handleSyncAllShotsToDye = async () => {
    if (shots.length === 0) {
      setDyeSyncResult({ success: false, message: "No shots in history to synchronize." });
      return;
    }
    setIsSyncingDye(true);
    setDyeSyncProgress({ synced: 0, total: shots.length });
    setDyeSyncResult(null);
    try {
      const baseUrl = `http://${hostInput}:${portInput}`;
      const res = await syncHistoryToDYE(baseUrl, shots, (synced, total) => {
        setDyeSyncProgress({ synced, total });
      });
      setDyeSyncResult({
        success: true,
        message: `Successfully synchronized ${res.synced} shot record${res.synced === 1 ? "" : "s"} to DYE2!`,
      });
    } catch (e: any) {
      setDyeSyncResult({
        success: false,
        message: `Synchronization error: ${e?.message || "Unknown error"}`,
      });
    } finally {
      setIsSyncingDye(false);
    }
  };

  // Backup & Restore Handlers
  const assembleCurrentSettingsPayload = (): PantaRheiSettingsPayload => ({
    headerConfig,
    clockPaletteId,
    fluidEnabled,
    screensaverConfig: screensaver,
    cockpitConfigs: cockpitConfigs || {
      coffee: { dose: 18.0, targetYield: 36.0, profileId: "idan-strega-plus", ratioText: "1:2.0" },
      steam: { temperature: 150, flowRate: 1.2, durationSeconds: 45, autoPurge: true, autoPurgeSeconds: 3 },
      water: { temperature: 85, flowRate: 4.0, volumeMl: 150, autoStopOnScale: true },
      maintenance: { flushDurationSeconds: 3, flushVolumeMl: 40, preferredCleaningProfileId: "Clean Thorough Forward Flush", transportArmed: false },
    },
    scaleConfig: { autoTareShot, autoTareCup },
    deviceConfig: {
      host: hostInput,
      port: portInput,
      dontShowStartupModal: typeof window !== "undefined" && localStorage.getItem("pantarhei_dont_show_startup_connect") === "true",
    },
    pluginSettings: {
      visualizer: visualizerConfig,
      dye2: dyeConfig,
    },
  });

  const handleExportSettingsBackup = () => {
    const envelope = buildBackupEnvelope({
      type: "settings",
      settings: assembleCurrentSettingsPayload(),
      sourceMachine: {
        model: machineInfo.model,
        serialNumber: machineInfo.serialNumber,
        firmwareVersion: machineInfo.firmwareVersion,
      },
    });
    downloadBackupFile(envelope);
    saveAutoBackup(envelope);
    setAutoBackups(getAutoBackups());
  };

  const handleExportFullBackup = () => {
    const envelope = buildBackupEnvelope({
      type: "full",
      settings: assembleCurrentSettingsPayload(),
      profiles: currentCustomProfiles,
      beans,
      shots,
      sourceMachine: {
        model: machineInfo.model,
        serialNumber: machineInfo.serialNumber,
        firmwareVersion: machineInfo.firmwareVersion,
      },
    });
    downloadBackupFile(envelope);
    saveAutoBackup(envelope);
    setAutoBackups(getAutoBackups());
  };

  const handlePushBackupToNetwork = async () => {
    setIsPushingNetwork(true);
    setNetworkPushResult(null);
    try {
      const envelope = buildBackupEnvelope({
        type: "full",
        settings: assembleCurrentSettingsPayload(),
        profiles: currentCustomProfiles,
        beans,
        shots,
        sourceMachine: {
          model: machineInfo.model,
          serialNumber: machineInfo.serialNumber,
          firmwareVersion: machineInfo.firmwareVersion,
        },
      });
      const res = await pushBackupToNetworkDevice(networkTargetHost, networkTargetPort, envelope);
      setNetworkPushResult(res);
    } finally {
      setIsPushingNetwork(false);
    }
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImportFileError(null);
    setImportToast(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        const preview = previewBackupImport(parsed, {
          profiles: currentCustomProfiles,
          beans,
          shots,
        });

        if (!preview.isValid) {
          setIsImportFileError(preview.error || "Invalid backup file.");
          setParsedImportEnvelope(null);
          setImportPreview(null);
          return;
        }

        setParsedImportEnvelope(parsed);
        setImportPreview(preview);
      } catch (err: any) {
        setIsImportFileError(`Failed to parse backup JSON: ${err.message}`);
        setParsedImportEnvelope(null);
        setImportPreview(null);
      }
    };
    reader.readAsText(file);
  };

  const handleExecuteImport = () => {
    if (!parsedImportEnvelope) return;

    const result = executeBackupImport(
      parsedImportEnvelope,
      {
        profiles: currentCustomProfiles,
        beans,
        shots,
      },
      importStrategy
    );

    if (result.success) {
      saveCustomProfilesToStorage(result.importedProfiles);
      if (onBeansChange) onBeansChange(result.importedBeans);
      saveBeansToStorage(result.importedBeans);
      if (onShotsChange) onShotsChange(result.importedShots);

      if (result.restoredSettings) {
        const s = result.restoredSettings;
        if (s.headerConfig) onHeaderConfigChange(s.headerConfig);
        if (s.clockPaletteId) onClockPaletteChange(s.clockPaletteId);
        if (typeof s.fluidEnabled === "boolean") onFluidEnabledChange(s.fluidEnabled);
        if (s.screensaverConfig && onScreensaverConfigChange) onScreensaverConfigChange(s.screensaverConfig);
        if (s.scaleConfig) {
          setAutoTareShot(s.scaleConfig.autoTareShot);
          setAutoTareCup(s.scaleConfig.autoTareCup);
        }
        if (s.cockpitConfigs && onCockpitConfigsChange) {
          onCockpitConfigsChange(s.cockpitConfigs);
        }
        if (s.pluginSettings?.visualizer) {
          setVisualizerConfig(s.pluginSettings.visualizer);
          saveVisualizerSettings(s.pluginSettings.visualizer);
        }
        if (s.pluginSettings?.dye2) {
          setDyeConfig(s.pluginSettings.dye2);
          saveDYESettings(s.pluginSettings.dye2);
        }
      }

      setImportToast({ success: true, message: result.message });
      setParsedImportEnvelope(null);
      setImportPreview(null);
    } else {
      setImportToast({ success: false, message: result.message });
    }
  };

  const handleProcessFolderFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsProcessingMigrationFiles(true);
    setMigrationToast(null);
    setIsMigrationDone(false);
    try {
      const allProfiles = [...currentCustomProfiles];
      const result = await processMigrationFiles(files, allProfiles, shots);
      setMigrationBatch(result);
      if (result.importedProfiles.length > 0 || result.importedShots.length > 0) {
        setMigrationToast({
          type: "info",
          message: `Parsed ${result.profileStats.totalParsed} profiles (${result.profileStats.uniqueAdded} unique, ${result.profileStats.profiles2OverridesCount} profiles2 overrides) and ${result.shotStats.totalParsed} shots. Click "Apply to Library" to finish.`,
        });
      } else {
        setMigrationToast({
          type: "info",
          message: "All discovered profiles and shots already exist in your library (no duplicates added).",
        });
      }
    } catch (err: any) {
      setMigrationToast({
        type: "error",
        message: `Error processing files: ${err.message || "Unknown error"}`,
      });
    } finally {
      setIsProcessingMigrationFiles(false);
    }
  };

  const handleSyncMigrationGateway = async () => {
    setIsSyncingMigrationGateway(true);
    setMigrationToast(null);
    setIsMigrationDone(false);
    try {
      const gatewayUrl = `http://${decaid.getHost()}:${decaid.getPort()}`;
      const data = await syncFromDecaidGateway(gatewayUrl);
      const allProfiles = [...currentCustomProfiles];
      const mergedShots = mergeShots(shots, data.shots, "merge_deduplicate");
      const newShots = mergedShots.filter((s) => !shots.some((es) => es.id === s.id));
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
      setMigrationBatch(result);
      if (newProfs.length > 0 || newShots.length > 0) {
        setMigrationToast({
          type: "info",
          message: `Decaid Gateway: Found ${newProfs.length} new profiles and ${newShots.length} historical shots.`,
        });
      } else {
        setMigrationToast({
          type: "success",
          message: "Decaid Gateway queried: All profiles and shots are already in your library.",
        });
      }
    } catch (err: any) {
      setMigrationToast({
        type: "error",
        message: `Gateway sync failed: ${err.message || "Could not reach gateway"}`,
      });
    } finally {
      setIsSyncingMigrationGateway(false);
    }
  };

  const handleApplyMigrationBatch = () => {
    if (!migrationBatch) return;
    if (migrationBatch.importedProfiles.length > 0) {
      const existing = loadCustomProfilesFromStorage();
      const merged = mergeProfiles(existing, migrationBatch.importedProfiles, "merge_deduplicate");
      saveCustomProfilesToStorage(merged);
    }
    if (migrationBatch.importedShots.length > 0) {
      const merged = mergeShots(shots, migrationBatch.importedShots, "merge_deduplicate");
      saveShotHistoryToStorage(merged);
      if (onShotsChange) onShotsChange(merged);
    }
    setIsMigrationDone(true);
    setMigrationToast({
      type: "success",
      message: `Successfully added ${migrationBatch.importedProfiles.length} profiles and ${migrationBatch.importedShots.length} shots to your library!`,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-6 select-none animate-in fade-in duration-150">
      <div className="w-[860px] max-h-[92vh] rounded-3xl bg-decent-surface border border-decent-border shadow-2xl flex flex-col p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-decent-border/60">
          <div className="flex items-center space-x-2.5">
            <Sliders className="w-5 h-5 text-amber-500" />
            <div>
              <h2 className="text-base font-bold text-white">PantaRhei Settings</h2>
              <div className="text-xs text-decent-muted flex items-center space-x-2 mt-0.5">
                <span className="flex items-center space-x-1">
                  <span className={`w-2 h-2 rounded-full ${machineStatus === "connected" ? "bg-emerald-400" : "bg-rose-500"}`} />
                  <span>DE1: {machineStatus.toUpperCase()}</span>
                </span>
                <span>·</span>
                <span className="flex items-center space-x-1">
                  <span className={`w-2 h-2 rounded-full ${pairedScale ? "bg-emerald-400" : "bg-slate-500"}`} />
                  <span>Scale: {pairedScale ? pairedScale.name : "None"}</span>
                </span>
              </div>
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

        {/* 6 Main Settings Tabs */}
        <div className="grid grid-cols-6 gap-1 p-1 bg-decent-dark/80 rounded-xl border border-decent-border/60 my-3.5 shrink-0 text-xs">
          <button
            type="button"
            onClick={() => { setActiveTab("appearance"); setSelectedPluginConfigId(null); }}
            className={`py-2 px-1 rounded-lg font-semibold flex items-center justify-center space-x-1 transition-all cursor-pointer ${
              activeTab === "appearance"
                ? "bg-amber-500/30 text-amber-300 border border-amber-500/50 shadow-sm"
                : "text-decent-muted hover:text-white"
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            <span>Appearance</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab("screensaver"); setSelectedPluginConfigId(null); }}
            className={`py-2 px-1 rounded-lg font-semibold flex items-center justify-center space-x-1 transition-all cursor-pointer ${
              activeTab === "screensaver"
                ? "bg-amber-500/30 text-amber-300 border border-amber-500/50 shadow-sm"
                : "text-decent-muted hover:text-white"
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Screensaver</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab("pairing"); setSelectedPluginConfigId(null); }}
            className={`py-2 px-1 rounded-lg font-semibold flex items-center justify-center space-x-1 transition-all cursor-pointer ${
              activeTab === "pairing"
                ? "bg-sky-500/30 text-sky-300 border border-sky-500/50 shadow-sm"
                : "text-decent-muted hover:text-white"
            }`}
          >
            <Bluetooth className="w-3.5 h-3.5" />
            <span>Pairing</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab("equipment"); setSelectedPluginConfigId(null); }}
            className={`py-2 px-1 rounded-lg font-semibold flex items-center justify-center space-x-1 transition-all cursor-pointer ${
              activeTab === "equipment"
                ? "bg-amber-500/30 text-amber-300 border border-amber-500/50 shadow-sm"
                : "text-decent-muted hover:text-white"
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Equipment</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab("plugins"); setSelectedPluginConfigId(null); }}
            className={`py-2 px-1 rounded-lg font-semibold flex items-center justify-center space-x-1 transition-all cursor-pointer ${
              activeTab === "plugins"
                ? "bg-emerald-500/30 text-emerald-300 border border-emerald-500/50 shadow-sm"
                : "text-decent-muted hover:text-white"
            }`}
          >
            <Puzzle className="w-3.5 h-3.5" />
            <span>Plugins</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab("backup"); setSelectedPluginConfigId(null); }}
            className={`py-2 px-1 rounded-lg font-semibold flex items-center justify-center space-x-1 transition-all cursor-pointer ${
              activeTab === "backup"
                ? "bg-purple-500/30 text-purple-300 border border-purple-500/50 shadow-sm"
                : "text-decent-muted hover:text-white"
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Backup & Sync</span>
          </button>
        </div>

        {/* TAB 1: APPEARANCE (Home Cafe Header, Clock Palettes & Fluid Background) */}
        {activeTab === "appearance" && (
          <div className="flex-1 overflow-y-auto space-y-4 py-1 pr-1 text-xs">
            {/* Home Cafe Header */}
            <div className="p-4 rounded-2xl bg-decent-card border border-decent-border/60">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <Type className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Home Cafe Top Header
                  </h3>
                </div>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={headerConfig.enabled}
                    onChange={(e) =>
                      onHeaderConfigChange({ ...headerConfig, enabled: e.target.checked })
                    }
                    className="rounded bg-decent-dark border-decent-border text-amber-500"
                  />
                  <span className="text-xs text-decent-muted">Show in Ready Mode</span>
                </label>
              </div>

              {headerConfig.enabled && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-decent-muted block mb-1">Cafe Name</label>
                      <input
                        type="text"
                        value={headerConfig.text}
                        onChange={(e) =>
                          onHeaderConfigChange({ ...headerConfig, text: e.target.value })
                        }
                        placeholder="e.g. Caffè Panta Rhei, The Workshop"
                        className="w-full px-3 py-2 rounded-xl bg-decent-dark border border-decent-border text-xs text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-decent-muted block mb-1">Subtitle / Tagline</label>
                      <input
                        type="text"
                        value={headerConfig.subtitleText || ""}
                        onChange={(e) =>
                          onHeaderConfigChange({ ...headerConfig, subtitleText: e.target.value })
                        }
                        placeholder="e.g. Specialty Espresso Bar"
                        className="w-full px-3 py-2 rounded-xl bg-decent-dark border border-decent-border text-xs text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  {/* Font Family Selection */}
                  <div>
                    <label className="text-xs text-decent-muted block mb-1.5">Typographic Font Family</label>
                    <div className="grid grid-cols-5 gap-2">
                      {FONT_OPTIONS.map((f) => (
                        <button
                          key={f.label}
                          type="button"
                          onClick={() => onHeaderConfigChange({ ...headerConfig, fontFamily: f.value })}
                          className={`py-1.5 px-2 rounded-xl border text-[11px] font-semibold transition-all truncate text-center cursor-pointer ${
                            (headerConfig.fontFamily || FONT_OPTIONS[0].value) === f.value
                              ? "bg-amber-500/30 text-amber-300 border-amber-400 shadow-sm"
                              : "bg-decent-dark text-decent-muted border-decent-border hover:text-white"
                          }`}
                          style={{ fontFamily: f.value }}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Font Size & Letter Spacing Controls */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs text-decent-muted">Header Font Size</label>
                        <span className="font-mono text-xs font-bold text-white">{headerConfig.fontSize || 28}px</span>
                      </div>
                      <input
                        type="range"
                        min="16"
                        max="48"
                        step="1"
                        value={headerConfig.fontSize || 28}
                        onChange={(e) =>
                          onHeaderConfigChange({
                            ...headerConfig,
                            fontSize: parseInt(e.target.value, 10),
                          })
                        }
                        className="w-full accent-amber-500 h-1.5 rounded bg-decent-dark cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs text-decent-muted">Letter Spacing (Tracking)</label>
                        <span className="font-mono text-xs font-bold text-white">{headerConfig.letterSpacing ?? 2}px</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="8"
                        step="1"
                        value={headerConfig.letterSpacing ?? 2}
                        onChange={(e) =>
                          onHeaderConfigChange({
                            ...headerConfig,
                            letterSpacing: parseInt(e.target.value, 10),
                          })
                        }
                        className="w-full accent-amber-500 h-1.5 rounded bg-decent-dark cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Header Title & Subtitle Colors */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-2.5 rounded-xl bg-decent-dark border border-decent-border flex items-center justify-between">
                      <div>
                        <label className="text-[11px] font-semibold text-white block">Title Color</label>
                        <span className="text-[10px] text-decent-muted font-mono">{headerConfig.color || "#ffffff"}</span>
                      </div>
                      <input
                        type="color"
                        value={headerConfig.color || "#ffffff"}
                        onChange={(e) =>
                          onHeaderConfigChange({ ...headerConfig, color: e.target.value })
                        }
                        className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                      />
                    </div>

                    <div className="p-2.5 rounded-xl bg-decent-dark border border-decent-border flex items-center justify-between">
                      <div>
                        <label className="text-[11px] font-semibold text-white block">Subtitle Color</label>
                        <span className="text-[10px] text-decent-muted font-mono">{headerConfig.subtitleColor || "#94a3b8"}</span>
                      </div>
                      <input
                        type="color"
                        value={headerConfig.subtitleColor || "#94a3b8"}
                        onChange={(e) =>
                          onHeaderConfigChange({ ...headerConfig, subtitleColor: e.target.value })
                        }
                        className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                      />
                    </div>
                  </div>

                  {/* Live Typographic Preview */}
                  <div className="p-4 rounded-xl bg-decent-dark/90 border border-decent-border/60 flex flex-col items-center justify-center">
                    <div className="flex items-center space-x-1.5 text-[11px] text-decent-muted mb-2">
                      <Eye className="w-3.5 h-3.5 text-amber-400" />
                      <span>Live Header Preview ({headerFit.stripeHeight}px height allocated)</span>
                    </div>
                    <div className="flex flex-col items-center text-center">
                      <span
                        className="font-bold tracking-wider leading-tight"
                        style={{
                          fontFamily: headerConfig.fontFamily || "inherit",
                          fontSize: `${headerFit.actualFontSize}px`,
                          color: headerConfig.color || "#ffffff",
                          letterSpacing: `${headerConfig.letterSpacing || 2}px`,
                        }}
                      >
                        {headerConfig.text}
                      </span>
                      {headerConfig.subtitleText && (
                        <span
                          className="tracking-widest uppercase mt-0.5 font-medium"
                          style={{
                            fontSize: `${Math.max(10, Math.round(headerFit.actualFontSize * 0.52))}px`,
                            color: headerConfig.subtitleColor || "#94a3b8",
                          }}
                        >
                          {headerConfig.subtitleText}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Clock Palette */}
            <div className="p-4 rounded-2xl bg-decent-card border border-decent-border/60">
              <div className="flex items-center space-x-2 mb-3">
                <Clock className="w-4 h-4 text-sky-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Digital Clock Palette
                </h3>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {Object.values(CLOCK_PALETTES).map((pal) => (
                  <button
                    key={pal.id}
                    type="button"
                    onClick={() => onClockPaletteChange(pal.id)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      clockPaletteId === pal.id
                        ? "bg-sky-500/20 border-sky-400 shadow-md scale-[1.02]"
                        : "bg-decent-dark border-decent-border hover:border-slate-600"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-white">{pal.name}</span>
                    </div>
                    <div className="flex items-center space-x-1 font-mono text-sm font-bold">
                      <span style={{ color: pal.hours }}>12</span>
                      <span style={{ color: pal.separators }}>:</span>
                      <span style={{ color: pal.minutes }}>45</span>
                      <span style={{ color: pal.separators }}>:</span>
                      <span style={{ color: pal.seconds }}>08</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Fluid Dynamics Background */}
            <div className="p-4 rounded-2xl bg-decent-card border border-decent-border/60 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-sky-400" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Blue Aquatic Fluid Background
                  </h4>
                  <p className="text-[11px] text-decent-muted">
                    Interactive liquid waves and ripples confined to middle & right cockpit panes.
                  </p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={fluidEnabled}
                  onChange={(e) => onFluidEnabledChange(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-decent-dark peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500"></div>
              </label>
            </div>
          </div>
        )}

        {/* TAB 2: SCREENSAVER (Idle timeout, Images folder, Dimming, Moving Clock & Colors) */}
        {activeTab === "screensaver" && (
          <div className="flex-1 overflow-y-auto space-y-4 py-1 pr-1 text-xs">
            {/* Master Toggle & Idle Timeout */}
            <div className="p-4 rounded-2xl bg-decent-card border border-decent-border/60 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Monitor className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Ambient Screensaver
                  </h3>
                </div>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={screensaver.enabled}
                    onChange={(e) => updateScreensaver({ enabled: e.target.checked })}
                    className="rounded bg-decent-dark border-decent-border text-amber-500"
                  />
                  <span className="text-xs text-white font-semibold">Enable Screensaver</span>
                </label>
              </div>

              {screensaver.enabled && (
                <div className="space-y-3 pt-1">
                  {/* Idle Timeout Selector */}
                  <div>
                    <label className="text-xs text-decent-muted block mb-1">Idle Activation Timeout</label>
                    <div className="grid grid-cols-6 gap-2">
                      {[1, 2, 5, 10, 15, 30].map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => updateScreensaver({ idleTimeoutMinutes: mins })}
                          className={`py-1.5 rounded-xl border font-mono font-semibold text-xs transition-all cursor-pointer ${
                            screensaver.idleTimeoutMinutes === mins
                              ? "bg-amber-500/30 text-amber-300 border-amber-400 font-bold"
                              : "bg-decent-dark text-decent-muted border-decent-border hover:border-slate-500"
                          }`}
                        >
                          {mins} min
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Images Folder Picker & Pool Management */}
                  <div className="p-3 rounded-2xl bg-decent-dark border border-decent-border/70 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <FolderOpen className="w-4 h-4 text-amber-400" />
                        <div>
                          <span className="text-xs font-bold text-white uppercase tracking-wider block">
                            Screensaver Image Pool
                          </span>
                          <span className="text-[10.5px] text-decent-muted">
                            {customImagesCount > 0
                              ? `Loaded ${customImagesCount} custom images from "${screensaver.imageFolder}"`
                              : "Using default offline specialty coffee collection"}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <input
                          ref={folderInputRef}
                          type="file"
                          // @ts-ignore
                          webkitdirectory=""
                          directory=""
                          multiple
                          accept="image/*"
                          className="hidden"
                          onChange={handleFolderSelect}
                        />
                        <button
                          type="button"
                          onClick={() => folderInputRef.current?.click()}
                          disabled={isReadingFolder}
                          className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer active:scale-95"
                          title="Select a local folder on your tablet or computer containing screensaver images"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          <span>{isReadingFolder ? "Loading Folder..." : "Pick Image Folder"}</span>
                        </button>
                        {customImagesCount > 0 && (
                          <button
                            type="button"
                            onClick={handleClearImages}
                            className="px-2.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs transition-all cursor-pointer"
                            title="Reset to default specialty coffee collection"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Feedback message */}
                    {folderFeedback && (
                      <div className="text-[11px] px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono">
                        {folderFeedback}
                      </div>
                    )}

                    {/* Thumbnail Preview Strip */}
                    <div className="flex items-center space-x-2 overflow-x-auto pb-1 pt-0.5">
                      {imagePreviews.map((src, idx) => (
                        <div
                          key={idx}
                          className="w-14 h-10 rounded-lg overflow-hidden shrink-0 border border-decent-border/60 bg-black/40 relative shadow-sm"
                        >
                          <img
                            src={src}
                            alt={`Preview ${idx + 1}`}
                            className="w-full h-full object-cover block"
                          />
                        </div>
                      ))}
                      {imagePreviews.length === 0 && (
                        <span className="text-[11px] text-decent-muted italic py-1">
                          No images loaded. Click "Pick Image Folder" to select your photo folder.
                        </span>
                      )}
                    </div>

                    {/* Slideshow Interval Slider */}
                    <div className="pt-2 border-t border-decent-border/50 flex items-center justify-between">
                      <label className="text-xs text-decent-muted">
                        Slideshow Interval: <span className="font-mono text-amber-300 font-bold">{screensaver.slideshowIntervalSeconds}s</span>
                      </label>
                      <input
                        type="range"
                        min="5"
                        max="60"
                        step="5"
                        value={screensaver.slideshowIntervalSeconds}
                        onChange={(e) =>
                          updateScreensaver({ slideshowIntervalSeconds: parseInt(e.target.value, 10) })
                        }
                        className="w-48 accent-amber-400 h-1.5 rounded bg-decent-dark cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Image Dimming & Fit Mode */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="text-xs text-decent-muted block mb-1">
                        Image Brightness / Dimming ({Math.round(screensaver.dimmingLevel * 100)}%)
                      </label>
                      <input
                        type="range"
                        min="0.1"
                        max="1.0"
                        step="0.05"
                        value={screensaver.dimmingLevel}
                        onChange={(e) => updateScreensaver({ dimmingLevel: parseFloat(e.target.value) })}
                        className="w-full accent-amber-400 h-1.5 rounded bg-decent-dark mt-2 cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-decent-muted block mb-1">Image Presentation Fit</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => updateScreensaver({ imageFit: "contain_blur" })}
                          className={`py-1.5 px-2 rounded-xl border text-[11px] font-semibold transition-all cursor-pointer ${
                            screensaver.imageFit === "contain_blur"
                              ? "bg-amber-500/30 text-amber-300 border-amber-400"
                              : "bg-decent-dark text-decent-muted border-decent-border"
                          }`}
                        >
                          Ambient Blur
                        </button>
                        <button
                          type="button"
                          onClick={() => updateScreensaver({ imageFit: "cover" })}
                          className={`py-1.5 px-2 rounded-xl border text-[11px] font-semibold transition-all cursor-pointer ${
                            screensaver.imageFit === "cover"
                              ? "bg-amber-500/30 text-amber-300 border-amber-400"
                              : "bg-decent-dark text-decent-muted border-decent-border"
                          }`}
                        >
                          Fill / Cover
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Floating Anti-Burn-In Clock Customization */}
            {screensaver.enabled && (
              <div className="p-4 rounded-2xl bg-decent-card border border-decent-border/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-sky-400" />
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                      Floating Anti-Burn-In Clock
                    </h3>
                  </div>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={screensaver.antiBurnInDrift}
                      onChange={(e) => updateScreensaver({ antiBurnInDrift: e.target.checked })}
                      className="rounded bg-decent-dark border-decent-border text-sky-500"
                    />
                    <span className="text-xs text-white">Quadrant Drift</span>
                  </label>
                </div>

                {/* Per-Section Color Pickers */}
                <div>
                  <label className="text-xs text-decent-muted block mb-2">
                    Per-Section Color Customization
                  </label>
                  <div className="grid grid-cols-5 gap-2">
                    {/* Date Color */}
                    <div className="p-2.5 rounded-xl bg-decent-dark border border-decent-border flex flex-col items-center">
                      <span className="text-[10px] text-decent-muted uppercase mb-1">Date</span>
                      <input
                        type="color"
                        value={screensaver.dateColor}
                        onChange={(e) => updateScreensaver({ dateColor: e.target.value })}
                        className="w-7 h-7 rounded cursor-pointer bg-transparent border-0"
                      />
                    </div>

                    {/* Hours Color */}
                    <div className="p-2.5 rounded-xl bg-decent-dark border border-decent-border flex flex-col items-center">
                      <span className="text-[10px] text-decent-muted uppercase mb-1">Hours</span>
                      <input
                        type="color"
                        value={screensaver.hoursColor}
                        onChange={(e) => updateScreensaver({ hoursColor: e.target.value })}
                        className="w-7 h-7 rounded cursor-pointer bg-transparent border-0"
                      />
                    </div>

                    {/* Separators Color */}
                    <div className="p-2.5 rounded-xl bg-decent-dark border border-decent-border flex flex-col items-center">
                      <span className="text-[10px] text-decent-muted uppercase mb-1">Dots (:)</span>
                      <input
                        type="color"
                        value={screensaver.separatorsColor}
                        onChange={(e) => updateScreensaver({ separatorsColor: e.target.value })}
                        className="w-7 h-7 rounded cursor-pointer bg-transparent border-0"
                      />
                    </div>

                    {/* Minutes Color */}
                    <div className="p-2.5 rounded-xl bg-decent-dark border border-decent-border flex flex-col items-center">
                      <span className="text-[10px] text-decent-muted uppercase mb-1">Minutes</span>
                      <input
                        type="color"
                        value={screensaver.minutesColor}
                        onChange={(e) => updateScreensaver({ minutesColor: e.target.value })}
                        className="w-7 h-7 rounded cursor-pointer bg-transparent border-0"
                      />
                    </div>

                    {/* Seconds Color */}
                    <div className="p-2.5 rounded-xl bg-decent-dark border border-decent-border flex flex-col items-center">
                      <span className="text-[10px] text-decent-muted uppercase mb-1">Seconds</span>
                      <input
                        type="color"
                        value={screensaver.secondsColor}
                        onChange={(e) => updateScreensaver({ secondsColor: e.target.value })}
                        className="w-7 h-7 rounded cursor-pointer bg-transparent border-0"
                      />
                    </div>
                  </div>
                </div>

                {/* Clock Preview */}
                <div className="p-4 rounded-xl bg-black/90 border border-decent-border/60 flex flex-col items-center justify-center">
                  <div className="text-[11px] font-semibold tracking-wider uppercase mb-1" style={{ color: screensaver.dateColor }}>
                    Monday, Nov 16
                  </div>
                  <div className="text-3xl font-bold font-mono flex items-baseline space-x-1">
                    <span style={{ color: screensaver.hoursColor }}>14</span>
                    <span style={{ color: screensaver.separatorsColor }}>:</span>
                    <span style={{ color: screensaver.minutesColor }}>28</span>
                    <span style={{ color: screensaver.separatorsColor }}>:</span>
                    <span className="text-2xl" style={{ color: screensaver.secondsColor }}>42</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: PAIRING (DE1 Machine & Bluetooth Scale) */}
        {activeTab === "pairing" && (
          <div className="flex-1 overflow-y-auto space-y-4 py-1 pr-1 text-xs">
            {connectionMessage && (
              <div
                className={`p-3 rounded-xl border flex items-center space-x-2 animate-in fade-in duration-150 ${
                  connectionMessage.type === "success"
                    ? "bg-emerald-950/60 border-emerald-500/80 text-emerald-300"
                    : "bg-rose-950/60 border-rose-500/80 text-rose-300"
                }`}
              >
                {connectionMessage.type === "success" ? (
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span className="font-semibold">{connectionMessage.text}</span>
              </div>
            )}

            {/* Machine Section */}
            <div className="p-4 rounded-2xl bg-decent-card border border-decent-border/60 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Coffee className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Decent DE1 Connection
                  </h3>
                </div>
                <span
                  className={`text-[10px] px-2.5 py-0.5 rounded-full font-mono font-bold border ${
                    machineStatus === "connected"
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50"
                      : "bg-rose-500/20 text-rose-400 border-rose-500/50"
                  }`}
                >
                  {machineStatus.toUpperCase()}
                </span>
              </div>

              {/* Network Host & Port */}
              <div className="grid grid-cols-[1fr_120px_130px] gap-2 items-center">
                <div>
                  <label className="text-[10px] text-decent-muted block mb-0.5 uppercase tracking-wider">
                    Decaid Host / IP
                  </label>
                  <input
                    type="text"
                    value={hostInput}
                    onChange={(e) => setHostInput(e.target.value)}
                    placeholder="localhost or IP"
                    className="w-full px-3 py-1.5 rounded-xl bg-decent-dark border border-decent-border text-white text-xs font-mono focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-decent-muted block mb-0.5 uppercase tracking-wider">
                    Port
                  </label>
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
                    onClick={handleConnectMachine}
                    className="w-full py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center space-x-1 cursor-pointer transition-all shadow-md"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Connect</span>
                  </button>
                </div>
              </div>

              {/* Machine Specs: Model, Serial, Firmware & Software Versions */}
              <div className="grid grid-cols-4 gap-2.5 pt-1">
                <div className="p-2.5 rounded-xl bg-decent-dark border border-decent-border/60">
                  <span className="text-[10px] text-decent-muted uppercase">Model</span>
                  <div className="text-xs font-bold text-white font-mono mt-0.5">{machineInfo.model}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-decent-dark border border-decent-border/60">
                  <span className="text-[10px] text-decent-muted uppercase">Serial</span>
                  <div className="text-xs font-bold text-amber-400 font-mono mt-0.5">{machineInfo.serialNumber}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-decent-dark border border-decent-border/60">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-decent-muted uppercase">DE1 Firmware</span>
                    <div className="flex items-center space-x-1.5">
                      {renderChannelBadge(systemVersion.firmwareChannel)}
                      {systemVersion.firmwareUpdateAvailable && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">
                          v{systemVersion.latestFirmwareVersion}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs font-bold text-white font-mono mt-0.5">
                    v{machineInfo.firmwareVersion} <span className="text-[10px] text-decent-muted font-normal">(BLE {machineInfo.bleVersion})</span>
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-decent-dark border border-decent-border/60">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-decent-muted uppercase">Decaid Software</span>
                    <div className="flex items-center space-x-1.5">
                      {renderChannelBadge(systemVersion.softwareChannel)}
                      {systemVersion.softwareUpdateAvailable && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 font-bold">
                          v{systemVersion.latestSoftwareVersion}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs font-bold text-cyan-300 font-mono mt-0.5">
                    v{systemVersion.softwareVersion}
                  </div>
                </div>
              </div>

              {/* DEDICATED FIRMWARE & SOFTWARE UPDATE PANEL */}
              <div className="p-3.5 rounded-2xl bg-decent-dark/70 border border-decent-border/70 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                      <Download className="w-4 h-4 text-amber-400" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-white">System Updates (DE1 & Decaid)</span>
                        <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-slate-800 text-decent-muted font-mono">
                          REST /api/v1/system
                        </span>
                      </div>
                      <div className="text-[10px] text-decent-muted mt-0.5">
                        Query Decaid Gateway for software releases and flash DE1 machine firmware via BLE
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {/* Release Channel Selector Segmented Toggle */}
                    <div className="flex items-center bg-slate-900/90 p-0.5 rounded-xl border border-decent-border/60">
                      {(["stable", "beta", "nightly"] as ReleaseChannel[]).map((ch) => {
                        const isActive = (systemVersion.targetChannel || "stable") === ch;
                        return (
                          <button
                            key={ch}
                            type="button"
                            onClick={() => handleChannelChange(ch)}
                            disabled={isCheckingUpdates || isUpdatingFirmware || isUpdatingSoftware}
                            className={`px-2 py-1 rounded-lg text-[9.5px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                              isActive
                                ? ch === "stable"
                                  ? "bg-emerald-500/25 text-emerald-300 border border-emerald-500/50 shadow-sm"
                                  : ch === "beta"
                                  ? "bg-amber-500/25 text-amber-300 border border-amber-500/50 shadow-sm"
                                  : "bg-purple-500/25 text-purple-300 border border-purple-500/50 shadow-sm"
                                : "text-decent-muted hover:text-white"
                            }`}
                            title={`Switch update channel to ${ch.toUpperCase()}`}
                          >
                            {ch}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={handleCheckUpdates}
                      disabled={isCheckingUpdates || isUpdatingFirmware || isUpdatingSoftware}
                      className="px-3 py-1.5 rounded-xl bg-decent-surface hover:bg-slate-800 border border-decent-border text-xs font-semibold text-white flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 transition-all active:scale-95 shadow-sm"
                      title="Check Decaid REST endpoint /api/v1/system/version for updates"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isCheckingUpdates ? "animate-spin text-amber-400" : "text-decent-muted"}`} />
                      <span>{isCheckingUpdates ? "Checking..." : "Check"}</span>
                    </button>
                  </div>
                </div>

                {/* Update Action Buttons (Strictly active only when an update is available) */}
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={handleUpdateFirmware}
                    disabled={!systemVersion.firmwareUpdateAvailable || isUpdatingFirmware || isCheckingUpdates || isUpdatingSoftware}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      systemVersion.firmwareUpdateAvailable
                        ? "bg-amber-500/15 border-amber-500/60 hover:bg-amber-500/25 shadow-sm cursor-pointer"
                        : "bg-decent-dark/40 border-decent-border/40 opacity-40 cursor-not-allowed"
                    } ${isUpdatingFirmware ? "opacity-75 cursor-wait" : ""}`}
                    title={systemVersion.firmwareUpdateAvailable ? "Flash new firmware" : "Machine firmware is up to date"}
                  >
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <Cpu className={`w-3.5 h-3.5 ${systemVersion.firmwareUpdateAvailable ? "text-amber-400" : "text-decent-muted"}`} />
                        <span className="text-xs font-bold text-white">Update DE1 Firmware</span>
                        {systemVersion.firmwareUpdateAvailable && (
                          <span className="text-[9.5px] px-1.5 py-0.2 rounded-full bg-amber-500/30 text-amber-300 font-mono font-bold">
                            v{systemVersion.latestFirmwareVersion}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-decent-muted mt-0.5 font-mono">
                        POST /api/v1/firmware/update · OTA BLE Flash
                      </div>
                    </div>
                    <div className="shrink-0 ml-2">
                      {isUpdatingFirmware ? (
                        <RefreshCw className="w-4 h-4 text-amber-400 animate-spin" />
                      ) : (
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                          systemVersion.firmwareUpdateAvailable
                            ? "bg-amber-400 text-slate-950 shadow-sm"
                            : "bg-slate-800 text-decent-muted"
                        }`}>
                          {systemVersion.firmwareUpdateAvailable ? "Flash Firmware" : "Up to Date"}
                        </span>
                      )}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={handleUpdateSoftware}
                    disabled={!systemVersion.softwareUpdateAvailable || isUpdatingSoftware || isCheckingUpdates || isUpdatingFirmware}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      systemVersion.softwareUpdateAvailable
                        ? "bg-sky-500/15 border-sky-500/60 hover:bg-sky-500/25 shadow-sm cursor-pointer"
                        : "bg-decent-dark/40 border-decent-border/40 opacity-40 cursor-not-allowed"
                    } ${isUpdatingSoftware ? "opacity-75 cursor-wait" : ""}`}
                    title={systemVersion.softwareUpdateAvailable ? "Install Decaid software update" : "Decaid software is up to date"}
                  >
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <Layers className={`w-3.5 h-3.5 ${systemVersion.softwareUpdateAvailable ? "text-sky-400" : "text-decent-muted"}`} />
                        <span className="text-xs font-bold text-white">Update Decaid Software</span>
                        {systemVersion.softwareUpdateAvailable && (
                          <span className="text-[9.5px] px-1.5 py-0.2 rounded-full bg-sky-500/30 text-sky-300 font-mono font-bold">
                            v{systemVersion.latestSoftwareVersion}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-decent-muted mt-0.5 font-mono">
                        POST /api/v1/system/update · Tablet Gateway
                      </div>
                    </div>
                    <div className="shrink-0 ml-2">
                      {isUpdatingSoftware ? (
                        <RefreshCw className="w-4 h-4 text-sky-400 animate-spin" />
                      ) : (
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                          systemVersion.softwareUpdateAvailable
                            ? "bg-sky-400 text-slate-950 shadow-sm"
                            : "bg-slate-800 text-decent-muted"
                        }`}>
                          {systemVersion.softwareUpdateAvailable ? "Update Decaid" : "Up to Date"}
                        </span>
                      )}
                    </div>
                  </button>
                </div>

                {/* Feedback & Status Message Banner */}
                {updateFeedback && (
                  <div className={`p-2.5 rounded-xl text-xs flex items-center space-x-2 border animate-in fade-in duration-150 ${
                    updateFeedback.type === "success"
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                      : updateFeedback.type === "error"
                      ? "bg-rose-500/15 border-rose-500/40 text-rose-300"
                      : "bg-amber-500/15 border-amber-500/40 text-amber-200"
                  }`}>
                    {updateFeedback.type === "success" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : updateFeedback.type === "error" ? (
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    ) : (
                      <RefreshCw className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
                    )}
                    <span className="flex-1 font-medium">{updateFeedback.message}</span>
                  </div>
                )}
              </div>

              {/* Power Controls & Machine Scan */}
              <div className="flex items-center justify-between pt-2 border-t border-decent-border/40">
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => decaid.wakeMachine()}
                    className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center space-x-1 cursor-pointer"
                  >
                    <Sun className="w-3 h-3" />
                    <span>Wake</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => decaid.sleepMachine()}
                    className="px-3 py-1 rounded-lg bg-decent-dark hover:bg-slate-800 text-decent-muted hover:text-white border border-decent-border font-semibold flex items-center space-x-1 cursor-pointer"
                  >
                    <Moon className="w-3 h-3" />
                    <span>Sleep</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleScanMachines}
                  disabled={isScanningMachines}
                  className="px-3 py-1 rounded-lg bg-decent-dark border border-decent-border text-slate-300 hover:text-white flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${isScanningMachines ? "animate-spin text-amber-400" : ""}`} />
                  <span>Scan Machines</span>
                </button>
              </div>

              {discoveredMachines.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {discoveredMachines.map((m) => (
                    <div
                      key={m.id}
                      className="p-2.5 rounded-xl bg-decent-dark/80 border border-decent-border/60 flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-2">
                        {m.connectionType === "ble" ? (
                          <Bluetooth className="w-4 h-4 text-cyan-400" />
                        ) : (
                          <Wifi className="w-4 h-4 text-amber-400" />
                        )}
                        <div>
                          <span className="text-xs font-bold text-white">{m.name}</span>
                          <span className="text-[10px] text-decent-muted ml-2 font-mono">{m.model} · {m.address}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          if (m.connectionType === "network") {
                            const [h, p] = m.address.split(":");
                            await decaid.connectLiveMachine(h, p ? parseInt(p, 10) : 8080);
                          } else {
                            await decaid.connectLiveMachine();
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold cursor-pointer"
                      >
                        Connect
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Machine Maintenance Section */}
            <div className="p-4 rounded-2xl bg-decent-card border border-decent-border/60 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Wrench className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Machine Maintenance
                  </h3>
                </div>
                <span
                  className={`text-[10px] px-2.5 py-0.5 rounded-full font-mono font-bold border ${
                    maintStatus.primaryActionType === "none"
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50"
                      : "bg-amber-500/20 text-amber-300 border-amber-500/50"
                  }`}
                >
                  {maintStatus.primaryActionType === "none" ? "ALL GOOD" : "ATTENTION NEEDED"}
                </span>
              </div>

              {/* Group Head Cleaning Reminder */}
              <div className="p-3.5 rounded-xl bg-decent-dark/60 border border-decent-border/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span className="font-bold text-white text-xs">Group Head Cleaning</span>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                      maintStatus.isCleaningDue
                        ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                        : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    }`}
                  >
                    {maintStatus.isCleaningDue
                      ? `Due now (${maintStatus.cleaningDaysPassed}d elapsed)`
                      : `Good (${maintStatus.cleaningDaysRemaining}d remaining)`}
                  </span>
                </div>
                <p className="text-[11px] text-decent-muted leading-tight">
                  Running a cleaning profile with a blind basket and a cleaning agent.
                </p>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center space-x-2">
                    <label className="text-[10px] text-decent-muted uppercase tracking-wider">
                      Interval:
                    </label>
                    <div className="flex items-center space-x-1.5">
                      <input
                        type="range"
                        min="1"
                        max="30"
                        value={maintCfg.cleaningIntervalDays}
                        onChange={(e) => handleUpdateCleaningInterval(Number(e.target.value))}
                        className="w-24 accent-amber-500 cursor-pointer"
                      />
                      <span className="font-mono font-bold text-amber-400 text-xs w-14">
                        {maintCfg.cleaningIntervalDays} {maintCfg.cleaningIntervalDays === 1 ? "day" : "days"}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Last: {formatTimeAgo(maintCfg.lastCleaningTimestamp)}
                  </span>
                </div>

                <div className="flex items-center space-x-2 pt-1 border-t border-decent-border/40">
                  <button
                    type="button"
                    onClick={handleMarkCleanedToday}
                    className="flex-1 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-semibold text-xs transition-colors cursor-pointer text-center"
                  >
                    Mark Cleaned Today
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigateToMaintenanceContext?.("cleaning");
                    }}
                    className="flex-1 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-semibold text-xs transition-colors cursor-pointer text-center flex items-center justify-center space-x-1"
                  >
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span>Run Cleaning Profile</span>
                  </button>
                </div>
              </div>

              {/* Descale Reminder */}
              <div className="p-3.5 rounded-xl bg-decent-dark/60 border border-decent-border/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <Droplets className="w-3.5 h-3.5 text-sky-400" />
                    <span className="font-bold text-white text-xs">Machine Descale</span>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                      maintStatus.isDescaleDue
                        ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                        : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    }`}
                  >
                    {maintStatus.isDescaleDue
                      ? `Due now (${maintStatus.descaleMonthsPassed}m elapsed)`
                      : `Good (${maintStatus.descaleMonthsRemaining}m remaining)`}
                  </span>
                </div>
                <p className="text-[11px] text-decent-muted leading-tight">
                  Boiler and hydraulic circuit descaling reminder.
                </p>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center space-x-2">
                    <label className="text-[10px] text-decent-muted uppercase tracking-wider">
                      Interval:
                    </label>
                    <div className="flex items-center space-x-1.5">
                      <input
                        type="range"
                        min="1"
                        max="12"
                        value={maintCfg.descaleIntervalMonths}
                        onChange={(e) => handleUpdateDescaleInterval(Number(e.target.value))}
                        className="w-24 accent-sky-500 cursor-pointer"
                      />
                      <span className="font-mono font-bold text-sky-400 text-xs w-18">
                        {maintCfg.descaleIntervalMonths} {maintCfg.descaleIntervalMonths === 1 ? "month" : "months"}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Last: {formatTimeAgo(maintCfg.lastDescaleTimestamp)}
                  </span>
                </div>

                <div className="flex items-center space-x-2 pt-1 border-t border-decent-border/40">
                  <button
                    type="button"
                    onClick={handleMarkDescaledToday}
                    className="flex-1 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-semibold text-xs transition-colors cursor-pointer text-center"
                  >
                    Mark Descaled Today
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigateToMaintenanceContext?.("descale");
                    }}
                    className="flex-1 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 font-semibold text-xs transition-colors cursor-pointer text-center flex items-center justify-center space-x-1"
                  >
                    <Droplets className="w-3 h-3 text-sky-400" />
                    <span>Run Descale Context</span>
                  </button>
                </div>
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-decent-card border border-decent-border/60 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Scale className="w-4 h-4 text-sky-400" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Bluetooth Scale Pairing
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={handleScanScales}
                  disabled={isScanningScales}
                  className="px-2.5 py-1 rounded-lg bg-decent-dark border border-decent-border text-xs text-slate-300 hover:text-white flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${isScanningScales ? "animate-spin text-sky-400" : ""}`} />
                  <span>Scan Scales</span>
                </button>
              </div>

              {pairedScale ? (
                <div className="p-3 rounded-xl bg-decent-dark border border-decent-border/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-white">{pairedScale.name}</div>
                      <div className="text-[10px] text-decent-muted font-mono">{pairedScale.address}</div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-mono text-emerald-400 flex items-center space-x-1">
                        <Battery className="w-4 h-4" />
                        <span>{pairedScale.batteryPercentage}%</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => decaid.tareScale()}
                        className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer"
                      >
                        Tare (0.0g)
                      </button>
                      <button
                        type="button"
                        onClick={() => decaid.disconnectScale()}
                        className="px-2.5 py-1 rounded-lg bg-rose-950/40 hover:bg-rose-900/40 text-rose-300 border border-rose-800/40 text-xs font-semibold cursor-pointer"
                      >
                        Unpair
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-decent-dark/60 border border-decent-border/60 text-center py-3 text-decent-muted">
                  No scale is currently paired. Pair a Bluetooth scale below for live gravimetric control.
                </div>
              )}

              {discoveredScales.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {discoveredScales.map((s) => (
                    <div
                      key={s.id}
                      className="p-2.5 rounded-xl bg-decent-dark/80 border border-decent-border/60 flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-2">
                        <Scale className="w-4 h-4 text-sky-400" />
                        <div>
                          <div className="text-xs font-bold text-white">{s.name}</div>
                          <div className="text-[10px] text-decent-muted font-mono">{s.address} · {s.rssi} dBm</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handlePairScale(s)}
                        className="px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 text-xs font-bold cursor-pointer"
                      >
                        Pair Scale
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Auto-Tare Options */}
              <div className="space-y-2 pt-2 border-t border-decent-border/40">
                <label className="flex items-center justify-between cursor-pointer py-1">
                  <div>
                    <div className="text-xs font-semibold text-white">Auto-tare when shot starts</div>
                    <div className="text-[11px] text-decent-muted">Automatically zeroes scale weight upon pre-infusion.</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoTareShot}
                    onChange={(e) => {
                      setAutoTareShot(e.target.checked);
                      try {
                        localStorage.setItem("pantarhei_scale_autotare_shot", e.target.checked.toString());
                      } catch {}
                    }}
                    className="rounded bg-decent-dark border-decent-border text-amber-500"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer py-1">
                  <div>
                    <div className="text-xs font-semibold text-white">Auto-tare on cup placed</div>
                    <div className="text-[11px] text-decent-muted">Tares automatically when cup weight stabilizes on the tray.</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoTareCup}
                    onChange={(e) => {
                      setAutoTareCup(e.target.checked);
                      try {
                        localStorage.setItem("pantarhei_scale_autotare_cup", e.target.checked.toString());
                      } catch {}
                    }}
                    className="rounded bg-decent-dark border-decent-border text-amber-500"
                  />
                </label>
              </div>

              {/* Supported Bluetooth Scale Models */}
              <div className="pt-2 border-t border-decent-border/40 space-y-1.5">
                <span className="text-[10px] text-decent-muted block uppercase tracking-wider font-semibold">
                  Supported Scale Protocols
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
          </div>
        )}

        {/* TAB 4: EQUIPMENT (Hardware Gear Inventory, Puck Prep & Shot Assignment Catalog) */}
        {activeTab === "equipment" && (
          <div className="flex-1 overflow-y-auto space-y-4 py-1 pr-1 text-xs">
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Wrench className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Equipment & Puck Prep Catalog
                  </h3>
                  <div className="text-[11px] text-decent-muted mt-0.5">
                    Manage coffee gear inventory: Grinders, Burrs, Baskets, Scales, Tampers, Distributors, WDT, and RDT.
                  </div>
                </div>
              </div>
              <span className="text-[10px] px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 font-mono font-semibold border border-amber-500/30">
                9 Categories Active (Gear & Cold Storage)
              </span>
            </div>

            {/* Cold Storage & Freezers Section */}
            <div className="p-4 rounded-2xl bg-cyan-950/20 border border-cyan-500/40 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-cyan-500/30">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center">
                    <Snowflake className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                      <span>Cold Storage & Freezers</span>
                      <span className="text-[10px] px-2 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 font-mono">
                        {(equipmentInv.freezers || []).length} Freezers
                      </span>
                    </h4>
                    <div className="text-[11px] text-cyan-200/70 mt-0.5">
                      Physics-based aging slowdown: -18°C slows aging by 12× (12d freezer = 1d room temp); -40°C slows aging by 50× (50d freezer = 1d room temp).
                    </div>
                  </div>
                </div>
              </div>

              {/* Freezers Grid */}
              <div className="grid grid-cols-2 gap-3">
                {(equipmentInv.freezers || []).map((f) => {
                  const factor = getFreezerSlowdownFactor(f.temperatureC);
                  return (
                    <div
                      key={f.id}
                      className="p-3 rounded-xl bg-decent-dark/80 border border-cyan-500/30 flex items-center justify-between"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center space-x-1.5 font-bold text-white text-xs">
                          <Snowflake className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          <span className="truncate">{f.name}</span>
                        </div>
                        <div className="text-[10px] text-cyan-300/80 font-mono mt-0.5">
                          {factor}× slowdown ({factor}d = 1d room)
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        <div className="flex items-center space-x-1">
                          <input
                            type="number"
                            step="1"
                            max="0"
                            min="-100"
                            value={f.temperatureC}
                            onChange={(e) => handleUpdateFreezerTemp(f.id, Number(e.target.value) || -18)}
                            className="w-14 px-1.5 py-1 rounded bg-black/60 border border-cyan-500/50 text-xs font-mono text-cyan-300 text-center focus:outline-none focus:border-cyan-400"
                            title="Set cabin temperature (°C)"
                          />
                          <span className="text-xs text-decent-muted">°C</span>
                        </div>
                        {(equipmentInv.freezers || []).length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveFreezer(f.id)}
                            className="p-1 rounded text-decent-muted hover:text-rose-400 cursor-pointer transition-colors"
                            title={`Remove ${f.name}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add New Freezer Row */}
              <div className="flex items-center space-x-2 pt-2 border-t border-cyan-500/30">
                <input
                  type="text"
                  value={newFreezerName}
                  onChange={(e) => setNewFreezerName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddFreezer();
                    }
                  }}
                  placeholder="e.g. Lab Ultra-Deep Freezer, Chest Freezer..."
                  className="flex-1 px-3 py-1.5 rounded-xl bg-decent-dark border border-cyan-500/40 text-xs text-white placeholder:text-decent-muted/60 focus:outline-none focus:border-cyan-400"
                />
                <div className="flex items-center space-x-1 shrink-0">
                  <input
                    type="number"
                    step="1"
                    max="0"
                    min="-100"
                    value={newFreezerTemp}
                    onChange={(e) => setNewFreezerTemp(Number(e.target.value) || -18)}
                    placeholder="-18"
                    className="w-16 px-2 py-1.5 rounded-xl bg-decent-dark border border-cyan-500/40 text-xs font-mono text-cyan-300 text-center focus:outline-none focus:border-cyan-400"
                  />
                  <span className="text-xs text-decent-muted">°C</span>
                </div>
                <button
                  type="button"
                  onClick={handleAddFreezer}
                  className="px-3.5 py-1.5 rounded-xl bg-cyan-500/25 hover:bg-cyan-500/35 text-cyan-300 border border-cyan-500/50 text-xs font-semibold flex items-center space-x-1 transition-all cursor-pointer active:scale-95 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Freezer</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              {[
                { key: "grinders" as const, title: "Grinder(s)", subtitle: "Single-choice per shot", placeholder: "e.g. Lagom P64, Niche Zero...", singleSelectRule: true },
                { key: "burrs" as const, title: "Burr Set(s)", subtitle: "Single-choice per shot", placeholder: "e.g. SSP 64mm Cast, Shuriken LM...", singleSelectRule: true },
                { key: "baskets" as const, title: "Basket(s)", subtitle: "Single-choice per shot", placeholder: "e.g. Decent CB 18g, Wafo Spirit...", singleSelectRule: true },
                { key: "scales" as const, title: "Scale(s)", subtitle: "Single-choice per shot", placeholder: "e.g. Decent Scale DS-104, Lunar...", singleSelectRule: true },
                { key: "tampers" as const, title: "Tamper(s)", subtitle: "Multi-choice puck prep", placeholder: "e.g. Normcore V4 58.5mm, Force Tamper...", singleSelectRule: false },
                { key: "distributors" as const, title: "Distributor(s)", subtitle: "Multi-choice puck prep", placeholder: "e.g. Wedge 58.5mm, Jack Leveler...", singleSelectRule: false },
                { key: "wdt" as const, title: "WDT Tool(s)", subtitle: "Multi-choice puck prep", placeholder: "e.g. AutoComb, 0.25mm Needle...", singleSelectRule: false },
                { key: "rdt" as const, title: "RDT Preparation(s)", subtitle: "Multi-choice puck prep", placeholder: "e.g. 2 Sprays Distilled Mist...", singleSelectRule: false },
              ].map((cat) => {
                const items = equipmentInv[cat.key];
                return (
                  <div
                    key={cat.key}
                    className="p-3.5 rounded-2xl bg-decent-card border border-decent-border/60 flex flex-col justify-between space-y-2.5"
                  >
                    <div>
                      <div className="flex items-center justify-between pb-1.5 border-b border-decent-border/40">
                        <div>
                          <div className="flex items-center space-x-1.5 font-bold text-white text-xs">
                            <span>{cat.title}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-decent-muted font-mono">
                              {items.length}
                            </span>
                          </div>
                          <div className="text-[10px] text-decent-muted">{cat.subtitle}</div>
                        </div>
                        <span
                          className={`text-[9.5px] px-2 py-0.5 rounded-full font-mono ${
                            cat.singleSelectRule
                              ? "bg-amber-500/15 text-amber-300"
                              : "bg-sky-500/15 text-sky-300"
                          }`}
                        >
                          {cat.singleSelectRule ? "Single Choice" : "Multi-Tool"}
                        </span>
                      </div>

                      {/* Badges list */}
                      <div className="flex flex-wrap gap-1.5 pt-2 min-h-[46px] max-h-[110px] overflow-y-auto">
                        {items.map((item) => (
                          <span
                            key={item}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl bg-decent-dark border border-decent-border/80 text-white text-[11px] group hover:border-amber-500/50 transition-colors"
                          >
                            <span className="truncate max-w-[140px]" title={item}>
                              {item}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveEquipmentItem(cat.key, item)}
                              className="text-decent-muted hover:text-rose-400 p-0.5 rounded cursor-pointer transition-colors"
                              title={`Remove ${item}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                        {items.length === 0 && (
                          <span className="text-[11px] text-decent-muted italic py-1">
                            No items yet. Type below to add.
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Free text input + Add button */}
                    <div className="flex items-center space-x-1.5 pt-1 border-t border-decent-border/40">
                      <input
                        type="text"
                        value={newEquipInput[cat.key] || ""}
                        onChange={(e) =>
                          setNewEquipInput({ ...newEquipInput, [cat.key]: e.target.value })
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddEquipmentItem(cat.key);
                          }
                        }}
                        placeholder={cat.placeholder}
                        className="flex-1 px-2.5 py-1.5 rounded-xl bg-decent-dark border border-decent-border text-xs text-white placeholder:text-decent-muted/60 focus:outline-none focus:border-amber-400"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddEquipmentItem(cat.key)}
                        className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-semibold flex items-center space-x-1 transition-all cursor-pointer active:scale-95 shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 5: PLUGINS (Decaid Extension Discovery & Management) */}
        {activeTab === "plugins" && (
          <div className="flex-1 overflow-y-auto space-y-4 py-1 pr-1 text-xs">
            {selectedPluginConfigId === "visualizer" ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-decent-border/40">
                  <button
                    type="button"
                    onClick={() => setSelectedPluginConfigId(null)}
                    className="flex items-center space-x-1.5 text-xs text-amber-400 hover:text-amber-300 font-semibold cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to Plugins List</span>
                  </button>
                  <span className="text-xs font-mono text-decent-muted">Decaid Extension: visualizer</span>
                </div>

                <div className="p-4 rounded-2xl bg-decent-card border border-decent-border/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center space-x-2">
                        <span>Visualizer.coffee Account & Settings</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 font-mono">v1.8.0</span>
                      </h4>
                      <p className="text-[11px] text-decent-muted mt-0.5">
                        Configure your user token to automatically synchronize extraction curves and telemetry to the cloud.
                      </p>
                    </div>
                    <a
                      href="https://visualizer.coffee/settings"
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-decent-dark border border-decent-border hover:border-slate-500 text-sky-400 hover:text-sky-300 text-[11px] flex items-center space-x-1"
                    >
                      <span>Get API Token</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  {/* Token input */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-decent-muted block uppercase tracking-wider font-semibold">
                      Private User Token (Bearer Authentication)
                    </label>
                    <div className="flex items-center space-x-2">
                      <div className="relative flex-1">
                        <input
                          type={showToken ? "text" : "password"}
                          value={visualizerConfig.userToken}
                          onChange={(e) => setVisualizerConfig({ ...visualizerConfig, userToken: e.target.value })}
                          placeholder="Paste user token from visualizer.coffee/settings"
                          className="w-full px-3 py-2 rounded-xl bg-decent-dark border border-decent-border text-white text-xs font-mono focus:outline-none focus:border-amber-400 pr-9"
                        />
                        <button
                          type="button"
                          onClick={() => setShowToken(!showToken)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-decent-muted hover:text-white text-xs cursor-pointer"
                        >
                          {showToken ? <Eye className="w-3.5 h-3.5 text-amber-400" /> : <Eye className="w-3.5 h-3.5 opacity-60" />}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={handleTestVisualizer}
                        disabled={isTestingVisualizer || !visualizerConfig.userToken.trim()}
                        className="px-3 py-2 rounded-xl bg-decent-dark hover:bg-slate-800 border border-decent-border text-slate-300 hover:text-white font-semibold text-xs cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        {isTestingVisualizer ? "Testing..." : "Test Connection"}
                      </button>
                    </div>
                    {visualizerTestResult && (
                      <div className={`p-2.5 rounded-xl border text-xs flex items-center space-x-2 mt-2 ${
                        visualizerTestResult.success ? "bg-emerald-950/40 border-emerald-500/60 text-emerald-300" : "bg-rose-950/40 border-rose-500/60 text-rose-300"
                      }`}>
                        {visualizerTestResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />}
                        <span>{visualizerTestResult.message}</span>
                      </div>
                    )}
                  </div>

                  {/* Options */}
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-decent-border/40">
                    <label className="flex items-center justify-between p-2.5 rounded-xl bg-decent-dark/60 border border-decent-border/40 cursor-pointer">
                      <div>
                        <div className="font-semibold text-white">Auto-Upload Completed Shots</div>
                        <div className="text-[10px] text-decent-muted">Uploads curves automatically when shot completes.</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={visualizerConfig.autoUpload}
                        onChange={(e) => setVisualizerConfig({ ...visualizerConfig, autoUpload: e.target.checked })}
                        className="rounded bg-decent-dark border-decent-border text-amber-500 ml-2"
                      />
                    </label>

                    <div className="p-2.5 rounded-xl bg-decent-dark/60 border border-decent-border/40 space-y-1">
                      <label className="text-[10px] text-decent-muted block uppercase tracking-wider font-semibold">
                        Default Shot Visibility
                      </label>
                      <select
                        value={visualizerConfig.visibility}
                        onChange={(e) => setVisualizerConfig({ ...visualizerConfig, visibility: e.target.value as any })}
                        className="w-full px-2.5 py-1 rounded-lg bg-decent-dark border border-decent-border text-white text-xs font-semibold focus:outline-none focus:border-amber-400"
                      >
                        <option value="private">Private (Only You)</option>
                        <option value="unlisted">Unlisted (Shareable Link)</option>
                        <option value="public">Public (Community Feed)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="text-[10px] text-decent-muted block mb-1 uppercase tracking-wider">
                        Default Grinder
                      </label>
                      <input
                        type="text"
                        value={visualizerConfig.defaultGrinder}
                        onChange={(e) => setVisualizerConfig({ ...visualizerConfig, defaultGrinder: e.target.value })}
                        placeholder="e.g. KafaTek Monolith Flat MAX"
                        className="w-full px-3 py-1.5 rounded-xl bg-decent-dark border border-decent-border text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-decent-muted block mb-1 uppercase tracking-wider">
                        Default Burrs
                      </label>
                      <input
                        type="text"
                        value={visualizerConfig.defaultBurrs}
                        onChange={(e) => setVisualizerConfig({ ...visualizerConfig, defaultBurrs: e.target.value })}
                        placeholder="e.g. Shuriken LM, SSP Cast Red"
                        className="w-full px-3 py-1.5 rounded-xl bg-decent-dark border border-decent-border text-white text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-decent-border/40">
                    <span className="text-[11px] text-emerald-400 font-semibold">
                      {visualizerSavedFeedback ? "✓ Settings saved and synced with Decaid!" : ""}
                    </span>
                    <button
                      type="button"
                      onClick={handleSaveVisualizer}
                      className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-md cursor-pointer transition-all"
                    >
                      Save Visualizer Settings
                    </button>
                  </div>
                </div>
              </div>
            ) : selectedPluginConfigId === "dye2" ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-decent-border/40">
                  <button
                    type="button"
                    onClick={() => setSelectedPluginConfigId(null)}
                    className="flex items-center space-x-1.5 text-xs text-amber-400 hover:text-amber-300 font-semibold cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to Plugins List</span>
                  </button>
                  <span className="text-xs font-mono text-decent-muted">Decaid Extension: dye2.reaplugin</span>
                </div>

                <div className="p-4 rounded-2xl bg-decent-card border border-decent-border/80 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center space-x-2">
                        <span>Describe Your Espresso (DYE2) Integration</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">v2.4.1</span>
                      </h4>
                      <p className="text-[11px] text-decent-muted mt-0.5">
                        Sensory profiling, interactive flavor wheel annotations, and taste descriptors for pulled shots.
                      </p>
                    </div>
                  </div>

                  {/* Settings toggles */}
                  <div className="space-y-2 pt-1">
                    <label className="flex items-center justify-between p-2.5 rounded-xl bg-decent-dark/60 border border-decent-border/40 cursor-pointer">
                      <div>
                        <div className="font-semibold text-white">Auto-Sync Completed Shots</div>
                        <div className="text-[10px] text-decent-muted">Automatically forwards new extractions to DYE2 sensory log upon shot finish.</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={dyeConfig.autoSyncActiveShots}
                        onChange={(e) => handleSaveDyeConfig({ autoSyncActiveShots: e.target.checked })}
                        className="rounded bg-decent-dark border-decent-border text-amber-500 ml-2"
                      />
                    </label>

                    <label className="flex items-center justify-between p-2.5 rounded-xl bg-decent-dark/60 border border-decent-border/40 cursor-pointer">
                      <div>
                        <div className="font-semibold text-white">Include Telemetry Curve Samples</div>
                        <div className="text-[10px] text-decent-muted">Packages full pressure/flow/weight series for curve inspection inside DYE2.</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={dyeConfig.includeTelemetrySamples}
                        onChange={(e) => handleSaveDyeConfig({ includeTelemetrySamples: e.target.checked })}
                        className="rounded bg-decent-dark border-decent-border text-amber-500 ml-2"
                      />
                    </label>
                  </div>

                  {/* Sync Past History to DYE2 Section */}
                  <div className="p-3.5 rounded-xl bg-decent-dark/90 border border-decent-border/60 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-white flex items-center space-x-1.5">
                          <Layers className="w-3.5 h-3.5 text-amber-400" />
                          <span>Sync Historical Shots to DYE2</span>
                        </div>
                        <p className="text-[11px] text-decent-muted mt-0.5">
                          Pushes all {shots.length} past shot records from PantaRhei history into DYE2 per Decaid standards.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleSyncAllShotsToDye}
                        disabled={isSyncingDye || shots.length === 0}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm cursor-pointer disabled:opacity-50 transition-all shrink-0"
                      >
                        {isSyncingDye ? "Syncing..." : `Sync All ${shots.length} Shots`}
                      </button>
                    </div>

                    {dyeSyncProgress && (
                      <div className="space-y-1 pt-1">
                        <div className="flex items-center justify-between text-[11px] font-mono text-slate-300">
                          <span>Processing records...</span>
                          <span>{dyeSyncProgress.synced} / {dyeSyncProgress.total}</span>
                        </div>
                        <div className="w-full h-1.5 bg-decent-dark rounded-full overflow-hidden border border-decent-border">
                          <div
                            className="h-full bg-emerald-500 transition-all duration-150"
                            style={{ width: `${(dyeSyncProgress.synced / dyeSyncProgress.total) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {dyeSyncResult && (
                      <div className={`p-2 rounded-lg text-xs flex items-center space-x-2 ${
                        dyeSyncResult.success ? "bg-emerald-950/40 text-emerald-300 border border-emerald-500/50" : "bg-rose-950/40 text-rose-300 border border-rose-500/50"
                      }`}>
                        {dyeSyncResult.success ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                        <span>{dyeSyncResult.message}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between pb-2 border-b border-decent-border/40">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center space-x-1.5">
                      <Puzzle className="w-4 h-4 text-emerald-400" />
                      <span>Decaid Community Plugins</span>
                    </h3>
                    <p className="text-[11px] text-decent-muted mt-0.5">
                      Official extension discovery via Decaid REST endpoint: <code className="text-amber-400 font-mono">/api/v1/plugins</code>
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleRefreshPlugins}
                    disabled={isRefreshingPlugins}
                    className="px-3 py-1.5 rounded-xl bg-decent-dark hover:bg-slate-800 border border-decent-border text-slate-300 hover:text-white flex items-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingPlugins ? "animate-spin text-emerald-400" : ""}`} />
                    <span>{isRefreshingPlugins ? "Discovering..." : "Scan & Discover"}</span>
                  </button>
                </div>

                {/* Plugin Cards List */}
                <div className="space-y-3">
                  {plugins.map((plugin) => (
                    <div
                      key={plugin.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        plugin.enabled
                          ? "bg-decent-card border-decent-border/80 shadow-sm"
                          : "bg-decent-dark/60 border-decent-border/40 opacity-75"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0 pr-3">
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-bold text-white">{plugin.name}</span>
                            <span className="text-[9.5px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono border border-slate-700">
                              v{plugin.version}
                            </span>
                            {plugin.category && (
                              <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
                                {plugin.category}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-decent-muted mt-1 leading-relaxed">
                            {plugin.description}
                          </p>
                          <div className="text-[10.5px] text-decent-muted/80 mt-1.5 font-mono">
                            Author: <span className="text-slate-300">{plugin.author}</span> · ID: <span className="text-amber-400">{plugin.id}</span>
                          </div>
                        </div>

                        {/* Controls */}
                        <div className="flex flex-col items-end space-y-2 shrink-0">
                          <div className="flex items-center space-x-2">
                            {plugin.hasSettings && (
                              <button
                                type="button"
                                onClick={() => setSelectedPluginConfigId(plugin.id === "visualizer" ? "visualizer" : plugin.id === "dye2" ? "dye2" : null)}
                                className="px-2.5 py-1 rounded-lg bg-decent-dark hover:bg-slate-800 text-slate-300 hover:text-white border border-decent-border flex items-center space-x-1 text-[11px] font-semibold cursor-pointer transition-colors"
                              >
                                <SettingsIcon className="w-3 h-3 text-amber-400" />
                                <span>Settings</span>
                              </button>
                            )}

                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={plugin.enabled}
                                onChange={() => handleTogglePlugin(plugin.id, plugin.enabled)}
                                className="sr-only peer"
                              />
                              <div className="w-10 h-5 bg-decent-dark peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                            </label>
                          </div>

                          {plugin.homepageUrl && (
                            <a
                              href={plugin.homepageUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] text-decent-muted hover:text-white flex items-center space-x-1"
                            >
                              <span>Docs</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 5: BACKUP & SYNC */}
        {activeTab === "backup" && (
          <div className="flex-1 overflow-y-auto space-y-4 py-1 pr-1 text-xs">
            {/* Header / Intro */}
            <div className="flex items-center justify-between pb-2 border-b border-decent-border/40">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center space-x-1.5">
                  <Database className="w-4 h-4 text-purple-400" />
                  <span>Backup, Sync & Migration Suite</span>
                </h3>
                <p className="text-[11px] text-decent-muted mt-0.5">
                  Automated rolling backups, full data export, local network device transfer, and deduplicating recovery.
                </p>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Auto-Backup Active</span>
              </span>
            </div>

            {/* 1. Export Backups */}
            <div className="p-4 rounded-2xl bg-decent-card border border-decent-border/80 space-y-3">
              <div className="flex items-center space-x-2">
                <Download className="w-4 h-4 text-amber-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Save & Download Backups
                </h4>
              </div>
              <p className="text-[11px] text-decent-muted">
                Export files directly to your device or external drive for safekeeping or migration to another machine.
              </p>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleExportSettingsBackup}
                  className="p-3 rounded-xl bg-decent-dark hover:bg-slate-800 border border-decent-border hover:border-amber-500/60 text-left transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-white group-hover:text-amber-300">Settings & Preferences</span>
                    <Download className="w-3.5 h-3.5 text-decent-muted group-hover:text-amber-400" />
                  </div>
                  <div className="text-[10px] text-decent-muted leading-relaxed">
                    Theme styling, screensaver variables, clock palettes, tab limit presets, and machine/scale configurations.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleExportFullBackup}
                  className="p-3 rounded-xl bg-purple-950/20 hover:bg-purple-950/40 border border-purple-500/40 hover:border-purple-400 text-left transition-all cursor-pointer group shadow-sm"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-white group-hover:text-purple-300">Complete Archive (Full Backup)</span>
                    <Download className="w-3.5 h-3.5 text-purple-400" />
                  </div>
                  <div className="text-[10px] text-decent-muted leading-relaxed">
                    Everything in Settings plus all custom profiles ({currentCustomProfiles.length}), bean inventory ({beans.length} coffees), and shot history ({shots.length} records).
                  </div>
                </button>
              </div>
            </div>

            {/* 2. Transfer to Another Device on Local Network */}
            <div className="p-4 rounded-2xl bg-decent-card border border-decent-border/80 space-y-3">
              <div className="flex items-center space-x-2">
                <Send className="w-4 h-4 text-sky-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Transfer to Device on Network
                </h4>
              </div>
              <p className="text-[11px] text-decent-muted">
                Pushes a full backup snapshot directly to another DE1 tablet running Decaid on your local Wi-Fi.
              </p>

              <div className="grid grid-cols-[1fr_90px_140px] gap-2 items-center">
                <div>
                  <label className="text-[10px] text-decent-muted block mb-0.5 uppercase tracking-wider">
                    Target Device IP Address
                  </label>
                  <input
                    type="text"
                    value={networkTargetHost}
                    onChange={(e) => setNetworkTargetHost(e.target.value)}
                    placeholder="192.168.1.X"
                    className="w-full px-3 py-1.5 rounded-xl bg-decent-dark border border-decent-border text-white text-xs font-mono focus:outline-none focus:border-sky-400"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-decent-muted block mb-0.5 uppercase tracking-wider">
                    Port
                  </label>
                  <input
                    type="number"
                    value={networkTargetPort}
                    onChange={(e) => setNetworkTargetPort(parseInt(e.target.value, 10) || 8080)}
                    className="w-full px-2.5 py-1.5 rounded-xl bg-decent-dark border border-decent-border text-white text-xs font-mono focus:outline-none focus:border-sky-400"
                  />
                </div>
                <div className="pt-3.5">
                  <button
                    type="button"
                    onClick={handlePushBackupToNetwork}
                    disabled={isPushingNetwork}
                    className="w-full py-1.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-md flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isPushingNetwork ? "Pushing..." : "Push to Device"}</span>
                  </button>
                </div>
              </div>

              {networkPushResult && (
                <div className={`p-2.5 rounded-xl text-xs flex items-center space-x-2 ${
                  networkPushResult.success ? "bg-emerald-950/40 text-emerald-300 border border-emerald-500/50" : "bg-rose-950/40 text-rose-300 border border-rose-500/50"
                }`}>
                  {networkPushResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />}
                  <span>{networkPushResult.message}</span>
                </div>
              )}
            </div>

            {/* 3. Import & Recovery Tool (with Deduplication) */}
            <div className="p-4 rounded-2xl bg-decent-card border border-decent-border/80 space-y-3">
              <div className="flex items-center space-x-2">
                <Upload className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Import & Restore (Deduplicating Migration Tool)
                </h4>
              </div>
              <p className="text-[11px] text-decent-muted">
                Import a backup file to recover data or migrate from an older DE1. Intelligent deduplication prevents creating duplicate profiles, coffee cards, or past shots.
              </p>

              {/* File picker */}
              <div className="flex items-center space-x-3">
                <label className="px-3.5 py-2 rounded-xl bg-decent-dark hover:bg-slate-800 border border-decent-border text-white font-semibold text-xs flex items-center space-x-2 cursor-pointer transition-all">
                  <Folder className="w-3.5 h-3.5 text-amber-400" />
                  <span>Choose Backup File (.json)</span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleFileSelected}
                    className="hidden"
                  />
                </label>
                <span className="text-[11px] text-decent-muted">
                  {parsedImportEnvelope ? `Selected: ${parsedImportEnvelope.id}` : "No file chosen"}
                </span>
              </div>

              {isImportFileError && (
                <div className="p-2.5 rounded-xl bg-rose-950/50 border border-rose-500/60 text-rose-300 text-xs flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{isImportFileError}</span>
                </div>
              )}

              {/* Import Preview Diff */}
              {importPreview && importPreview.isValid && (
                <div className="p-3.5 rounded-xl bg-decent-dark/90 border border-decent-border/80 space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between pb-2 border-b border-decent-border/40">
                    <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>Backup Validated: {importPreview.type.toUpperCase()} ARCHIVE</span>
                    </span>
                    <span className="text-[10px] text-decent-muted font-mono">
                      {new Date(importPreview.createdAt).toLocaleString()}
                    </span>
                  </div>

                  {/* Diff metrics */}
                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <div className="p-2.5 rounded-lg bg-decent-surface/60 border border-decent-border/40">
                      <div className="text-decent-muted font-semibold uppercase text-[9.5px]">Profiles</div>
                      <div className="text-white font-bold mt-0.5">
                        +{importPreview.profilesDiff.newCount} new
                      </div>
                      <div className="text-[9.5px] text-decent-muted">
                        {importPreview.profilesDiff.existingCount} already present
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-decent-surface/60 border border-decent-border/40">
                      <div className="text-decent-muted font-semibold uppercase text-[9.5px]">Coffee Beans</div>
                      <div className="text-white font-bold mt-0.5">
                        +{importPreview.beansDiff.newCount} new
                      </div>
                      <div className="text-[9.5px] text-decent-muted">
                        {importPreview.beansDiff.existingCount} already present
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-decent-surface/60 border border-decent-border/40">
                      <div className="text-decent-muted font-semibold uppercase text-[9.5px]">Shot Records</div>
                      <div className="text-white font-bold mt-0.5">
                        +{importPreview.shotsDiff.newCount} new
                      </div>
                      <div className="text-[9.5px] text-amber-400/90">
                        {importPreview.shotsDiff.duplicateCount} duplicates skipped
                      </div>
                    </div>
                  </div>

                  {/* Strategy Choice */}
                  <div className="space-y-1.5 pt-1">
                    <label className="text-[10px] text-decent-muted block uppercase tracking-wider font-semibold">
                      Import Mode
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setImportStrategy("merge_deduplicate")}
                        className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                          importStrategy === "merge_deduplicate"
                            ? "bg-emerald-500/20 border-emerald-400 text-white shadow-sm"
                            : "bg-decent-dark border-decent-border text-decent-muted hover:text-white"
                        }`}
                      >
                        <div className="font-bold text-xs flex items-center space-x-1.5">
                          <span>Merge & Deduplicate</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/30 text-emerald-300">Recommended</span>
                        </div>
                        <div className="text-[10px] text-decent-muted mt-0.5">
                          Inserts new records and updates modified items without duplicating existing cards.
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setImportStrategy("replace_all")}
                        className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                          importStrategy === "replace_all"
                            ? "bg-rose-500/20 border-rose-400 text-white shadow-sm"
                            : "bg-decent-dark border-decent-border text-decent-muted hover:text-white"
                        }`}
                      >
                        <div className="font-bold text-xs text-rose-300">
                          Replace All (Clean Restore)
                        </div>
                        <div className="text-[10px] text-decent-muted mt-0.5">
                          Clears existing library and restores exclusively from the backup file.
                        </div>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-end pt-2">
                    <button
                      type="button"
                      onClick={handleExecuteImport}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md cursor-pointer transition-all flex items-center space-x-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Execute Import</span>
                    </button>
                  </div>
                </div>
              )}

              {importToast && (
                <div className={`p-3 rounded-xl text-xs flex items-center space-x-2 ${
                  importToast.success ? "bg-emerald-950/40 text-emerald-300 border border-emerald-500/60" : "bg-rose-950/40 text-rose-300 border border-rose-500/60"
                }`}>
                  {importToast.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />}
                  <span>{importToast.message}</span>
                </div>
              )}
            </div>

            {/* 3.5. Sync Past History & Profiles from de1app and Decaid Folders */}
            <div className="p-4 rounded-2xl bg-decent-card border border-decent-border/80 space-y-3">
              {/* Hidden File Inputs */}
              <input
                ref={migrationHistoryInputRef}
                type="file"
                // @ts-ignore
                webkitdirectory=""
                directory=""
                multiple
                className="hidden"
                onChange={(e) => handleProcessFolderFiles(e.target.files)}
              />
              <input
                ref={migrationProfilesInputRef}
                type="file"
                // @ts-ignore
                webkitdirectory=""
                directory=""
                multiple
                className="hidden"
                onChange={(e) => handleProcessFolderFiles(e.target.files)}
              />
              <input
                ref={migrationAllFolderInputRef}
                type="file"
                // @ts-ignore
                webkitdirectory=""
                directory=""
                multiple
                className="hidden"
                onChange={(e) => handleProcessFolderFiles(e.target.files)}
              />

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <FolderOpen className="w-4 h-4 text-purple-400" />
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Sync Past History & Profiles (de1app / Decaid Folders)
                  </h4>
                </div>
                <span className="text-[10px] text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded-full font-mono font-semibold">
                  profiles2/ Precedence Active
                </span>
              </div>

              <p className="text-[11px] text-decent-muted">
                Import past shots (<span className="font-mono text-amber-300">history/</span>) and custom profiles (<span className="font-mono text-purple-300">profiles/</span> & <span className="font-mono text-purple-300">profiles2/</span>) from your previous setup. If profiles exist in both folders, <span className="font-mono text-amber-300 font-semibold">profiles2/</span> takes precedence and duplicates are omitted.
              </p>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => migrationHistoryInputRef.current?.click()}
                  disabled={isProcessingMigrationFiles}
                  className="p-2.5 rounded-xl bg-decent-dark hover:bg-slate-800 border border-decent-border text-white text-xs font-semibold flex items-center justify-center space-x-1.5 cursor-pointer transition-all active:scale-95 shadow-sm"
                >
                  <History className="w-3.5 h-3.5 text-amber-400" />
                  <span>Browse History Folder</span>
                </button>

                <button
                  type="button"
                  onClick={() => migrationProfilesInputRef.current?.click()}
                  disabled={isProcessingMigrationFiles}
                  className="p-2.5 rounded-xl bg-decent-dark hover:bg-slate-800 border border-decent-border text-white text-xs font-semibold flex items-center justify-center space-x-1.5 cursor-pointer transition-all active:scale-95 shadow-sm"
                >
                  <Layers className="w-3.5 h-3.5 text-purple-400" />
                  <span>Browse Profiles Folder</span>
                </button>

                <button
                  type="button"
                  onClick={handleSyncMigrationGateway}
                  disabled={isSyncingMigrationGateway}
                  className="p-2.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 text-xs font-bold flex items-center justify-center space-x-1.5 cursor-pointer transition-all active:scale-95 shadow-sm"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingMigrationGateway ? "animate-spin" : ""}`} />
                  <span>{isSyncingMigrationGateway ? "Syncing..." : "Sync via Decaid Gateway"}</span>
                </button>
              </div>

              {migrationToast && (
                <div className={`p-2.5 rounded-xl text-xs flex items-center space-x-2 ${
                  migrationToast.type === "success"
                    ? "bg-emerald-950/40 text-emerald-300 border border-emerald-500/60"
                    : migrationToast.type === "error"
                    ? "bg-rose-950/40 text-rose-300 border border-rose-500/60"
                    : "bg-purple-950/40 text-purple-200 border border-purple-500/50"
                }`}>
                  {migrationToast.type === "success" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : migrationToast.type === "error" ? (
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  ) : (
                    <RefreshCw className="w-4 h-4 text-purple-400 animate-spin shrink-0" />
                  )}
                  <span>{migrationToast.message}</span>
                </div>
              )}

              {migrationBatch && (
                <div className="p-3 rounded-xl bg-decent-dark/90 border border-decent-border space-y-2.5 animate-in fade-in duration-150">
                  <div className="grid grid-cols-2 gap-2 text-center text-xs">
                    <div className="p-2 rounded-lg bg-decent-surface border border-decent-border/60">
                      <div className="text-[10px] text-decent-muted">Profiles to Add</div>
                      <div className="text-sm font-bold text-white font-mono">{migrationBatch.profileStats.uniqueAdded}</div>
                      <div className="text-[9.5px] text-emerald-400">
                        {migrationBatch.profileStats.duplicateCount} duplicates eliminated ({migrationBatch.profileStats.profiles2OverridesCount} profiles2 overrides)
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-decent-surface border border-decent-border/60">
                      <div className="text-[10px] text-decent-muted">Shots to Add</div>
                      <div className="text-sm font-bold text-white font-mono">{migrationBatch.shotStats.uniqueAdded}</div>
                      <div className="text-[9.5px] text-slate-400">{migrationBatch.shotStats.duplicateCount} duplicate shots skipped</div>
                    </div>
                  </div>

                  {!isMigrationDone ? (
                    <button
                      type="button"
                      onClick={handleApplyMigrationBatch}
                      disabled={migrationBatch.importedProfiles.length === 0 && migrationBatch.importedShots.length === 0}
                      className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center space-x-1.5 shadow-md active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Apply to Library</span>
                    </button>
                  ) : (
                    <div className="p-2 rounded-xl bg-emerald-950/40 text-emerald-300 border border-emerald-500/50 text-xs font-bold text-center flex items-center justify-center space-x-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Applied to Library Successfully</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 4. Rolling Auto-Backups List */}
            {autoBackups.length > 0 && (
              <div className="p-4 rounded-2xl bg-decent-card border border-decent-border/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-purple-400" />
                    <span>Recent Rolling Auto-Backups</span>
                  </span>
                  <span className="text-[10px] text-decent-muted font-mono">
                    Max 5 snapshots retained
                  </span>
                </div>

                <div className="space-y-1.5">
                  {autoBackups.map((b) => (
                    <div
                      key={b.id}
                      className="p-2.5 rounded-xl bg-decent-dark border border-decent-border/40 flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-semibold text-white font-mono flex items-center space-x-2">
                          <span>{b.id}</span>
                          <span className="text-[9.5px] uppercase px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-sans">
                            {b.type}
                          </span>
                        </div>
                        <div className="text-[10px] text-decent-muted mt-0.5">
                          {new Date(b.createdAt).toLocaleString()} · {b.itemCounts.profiles} profiles, {b.itemCounts.beans} coffees, {b.itemCounts.shots} shots
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setParsedImportEnvelope(b.envelope);
                          setImportPreview(previewBackupImport(b.envelope, { profiles: currentCustomProfiles, beans, shots }));
                        }}
                        className="px-2.5 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 text-[11px] font-bold cursor-pointer"
                      >
                        Inspect & Restore
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
