/**
 * PantaRhei Persistent Screensaver Image Store
 *
 * Uses IndexedDB to store custom user-selected folder images (data URLs / Blobs)
 * without hitting localStorage's 5MB size quota.
 * Includes elegant, fully offline default specialty coffee artwork.
 */

const DB_NAME = "pantarhei_screensaver_db";
const DB_VERSION = 1;
const STORE_NAME = "images";

export interface StoredScreensaverImage {
  id: string;
  name: string;
  dataUrl: string;
  addedAt: number;
}

// High-resolution offline specialty coffee & terroir artwork (100% offline, zero network required)
export const DEFAULT_OFFLINE_SCREENSAVER_IMAGES: string[] = [
  // 1. Warm espresso extraction & golden crema in ceramic demitasse
  `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000">
      <defs>
        <radialGradient id="bg" cx="50%" cy="50%" r="75%">
          <stop offset="0%" stop-color="#1c1917"/>
          <stop offset="60%" stop-color="#0c0a09"/>
          <stop offset="100%" stop-color="#050505"/>
        </radialGradient>
        <radialGradient id="crema" cx="45%" cy="40%" r="55%">
          <stop offset="0%" stop-color="#f59e0b"/>
          <stop offset="35%" stop-color="#d97706"/>
          <stop offset="70%" stop-color="#92400e"/>
          <stop offset="100%" stop-color="#451a03"/>
        </radialGradient>
        <linearGradient id="cup" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#292524"/>
          <stop offset="50%" stop-color="#1c1917"/>
          <stop offset="100%" stop-color="#0f0e0d"/>
        </linearGradient>
      </defs>
      <rect width="1600" height="1000" fill="url(#bg)"/>
      <ellipse cx="800" cy="560" rx="380" ry="190" fill="url(#cup)" stroke="#44403c" stroke-width="6"/>
      <ellipse cx="800" cy="540" rx="320" ry="145" fill="url(#crema)" opacity="0.95"/>
      <path d="M 680 500 Q 750 470 820 520 Q 890 560 920 520" fill="none" stroke="#fef3c7" stroke-width="12" opacity="0.6" stroke-linecap="round"/>
      <path d="M 720 530 Q 800 510 880 545" fill="none" stroke="#fbbf24" stroke-width="8" opacity="0.7" stroke-linecap="round"/>
      <text x="800" y="860" font-family="system-ui, -apple-system, sans-serif" font-size="28" fill="#a8a29e" text-anchor="middle" letter-spacing="8" font-weight="600">PANTA RHEI · ESPRESSO EXTRACTION</text>
      <text x="800" y="900" font-family="monospace" font-size="16" fill="#78716c" text-anchor="middle" letter-spacing="4">9.0 BAR · 93.0°C · 1:2.0</text>
    </svg>
  `)}`,

  // 2. Specialty Coffee Terroir & Single Origin Highlands
  `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000">
      <defs>
        <linearGradient id="sky" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#0f172a"/>
          <stop offset="60%" stop-color="#1e293b"/>
          <stop offset="100%" stop-color="#334155"/>
        </linearGradient>
        <linearGradient id="m1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1e1b4b"/>
          <stop offset="100%" stop-color="#0f172a"/>
        </linearGradient>
        <linearGradient id="m2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#064e3b"/>
          <stop offset="100%" stop-color="#022c22"/>
        </linearGradient>
      </defs>
      <rect width="1600" height="1000" fill="url(#sky)"/>
      <polygon points="100,1000 500,450 900,1000" fill="url(#m1)" opacity="0.7"/>
      <polygon points="600,1000 1050,380 1500,1000" fill="url(#m1)" opacity="0.6"/>
      <polygon points="300,1000 750,520 1200,1000" fill="url(#m2)" opacity="0.85"/>
      <polygon points="850,1000 1250,560 1650,1000" fill="url(#m2)" opacity="0.9"/>
      <circle cx="1280" cy="280" r="45" fill="#fef08a" opacity="0.3" filter="blur(20px)"/>
      <circle cx="1280" cy="280" r="30" fill="#fef08a" opacity="0.7"/>
      <text x="800" y="860" font-family="system-ui, -apple-system, sans-serif" font-size="28" fill="#94a3b8" text-anchor="middle" letter-spacing="8" font-weight="600">SPECIALTY ORIGIN · YIRGACHEFFE HIGHLANDS</text>
      <text x="800" y="900" font-family="monospace" font-size="16" fill="#64748b" text-anchor="middle" letter-spacing="4">ALTITUDE: 2150 MASL · HEIRLOOM LOT</text>
    </svg>
  `)}`,

  // 3. Coffee Botany & Ripe Arabica Cherries
  `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000">
      <defs>
        <radialGradient id="cherry" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stop-color="#f87171"/>
          <stop offset="50%" stop-color="#dc2626"/>
          <stop offset="85%" stop-color="#991b1b"/>
          <stop offset="100%" stop-color="#450a0a"/>
        </radialGradient>
        <linearGradient id="leaf" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#15803d"/>
          <stop offset="100%" stop-color="#14532d"/>
        </linearGradient>
      </defs>
      <rect width="1600" height="1000" fill="#090a0f"/>
      <path d="M 500 500 Q 700 450 900 550 T 1300 500" stroke="#78350f" stroke-width="14" fill="none" stroke-linecap="round"/>
      <path d="M 680 480 Q 750 350 820 490" fill="url(#leaf)" stroke="#166534" stroke-width="3"/>
      <path d="M 880 540 Q 980 420 1020 540" fill="url(#leaf)" stroke="#166534" stroke-width="3"/>
      <circle cx="760" cy="500" r="48" fill="url(#cherry)"/>
      <circle cx="830" cy="520" r="44" fill="url(#cherry)"/>
      <circle cx="790" cy="560" r="46" fill="url(#cherry)"/>
      <circle cx="940" cy="530" r="46" fill="url(#cherry)"/>
      <circle cx="990" cy="560" r="42" fill="url(#cherry)"/>
      <text x="800" y="860" font-family="system-ui, -apple-system, sans-serif" font-size="28" fill="#e2e8f0" text-anchor="middle" letter-spacing="8" font-weight="600">ARABICA BOTANICAL · HARVEST PEAK</text>
      <text x="800" y="900" font-family="monospace" font-size="16" fill="#94a3b8" text-anchor="middle" letter-spacing="4">SELECTIVE HAND-PICKED · WASHED PROCESS</text>
    </svg>
  `)}`,

  // 4. Barista Dial-in & Kinetic Extraction Flow
  `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000">
      <defs>
        <linearGradient id="flow" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#f59e0b"/>
          <stop offset="40%" stop-color="#b45309"/>
          <stop offset="100%" stop-color="#78350f"/>
        </linearGradient>
      </defs>
      <rect width="1600" height="1000" fill="#080808"/>
      <rect x="700" y="150" width="200" height="120" rx="16" fill="#262626" stroke="#404040" stroke-width="4"/>
      <path d="M 770 270 Q 790 550 798 800" stroke="url(#flow)" stroke-width="16" fill="none" stroke-linecap="round"/>
      <path d="M 830 270 Q 810 550 802 800" stroke="url(#flow)" stroke-width="16" fill="none" stroke-linecap="round"/>
      <text x="800" y="880" font-family="system-ui, -apple-system, sans-serif" font-size="28" fill="#f59e0b" text-anchor="middle" letter-spacing="8" font-weight="600">FLOW STABILIZATION · DECAID TELEMETRY</text>
      <text x="800" y="920" font-family="monospace" font-size="16" fill="#a8a29e" text-anchor="middle" letter-spacing="4">REAL-TIME FLOW: 2.2 ML/S · CONSTANT INFUSION</text>
    </svg>
  `)}`
];

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not available in this environment"));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Saves a list of images into IndexedDB as the screensaver image pool
 */
export async function saveScreensaverImages(
  items: { name: string; dataUrl: string }[]
): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    // Clear existing images first
    store.clear();

    items.forEach((item, index) => {
      const entry: StoredScreensaverImage = {
        id: `img_${Date.now()}_${index}`,
        name: item.name,
        dataUrl: item.dataUrl,
        addedAt: Date.now(),
      };
      store.add(entry);
    });

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/**
 * Loads all screensaver image URLs from IndexedDB.
 * Returns default offline specialty coffee imagery if the pool is empty.
 */
export async function loadScreensaverImages(): Promise<string[]> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        db.close();
        const records = request.result as StoredScreensaverImage[];
        if (records && records.length > 0) {
          resolve(records.map((r) => r.dataUrl));
        } else {
          resolve(DEFAULT_OFFLINE_SCREENSAVER_IMAGES);
        }
      };

      request.onerror = () => {
        db.close();
        resolve(DEFAULT_OFFLINE_SCREENSAVER_IMAGES);
      };
    });
  } catch {
    return DEFAULT_OFFLINE_SCREENSAVER_IMAGES;
  }
}

/**
 * Retrieves the count of user-added images in the screensaver pool
 */
export async function getScreensaverImageCount(): Promise<number> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.count();

      request.onsuccess = () => {
        db.close();
        resolve(request.result);
      };
      request.onerror = () => {
        db.close();
        resolve(0);
      };
    });
  } catch {
    return 0;
  }
}

/**
 * Clears all user-added images from the screensaver pool
 */
export async function clearScreensaverImages(): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.clear();

      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {}
}
