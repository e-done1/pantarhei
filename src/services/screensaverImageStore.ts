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

// Monochromatic screensaver collection contributed by Jeremy Clark (16 default wallpapers)
export const DEFAULT_OFFLINE_SCREENSAVER_IMAGES: string[] = [
  "assets/screensaver/code_crema.jpg",
  "assets/screensaver/curvature.jpg",
  "assets/screensaver/diagram_isometric.jpg",
  "assets/screensaver/diagram_top.jpg",
  "assets/screensaver/isometric_logo.jpg",
  "assets/screensaver/latte_art_stripe.jpg",
  "assets/screensaver/latte_love.jpg",
  "assets/screensaver/latteart_ripples.jpg",
  "assets/screensaver/logo_pattern_diag.jpg",
  "assets/screensaver/machine_morph.jpg",
  "assets/screensaver/noise_logo.jpg",
  "assets/screensaver/splash_diagram.jpg",
  "assets/screensaver/steamer.jpg",
  "assets/screensaver/tulip_geometric.jpg",
  "assets/screensaver/tulip_spiral.jpg",
  "assets/screensaver/vector_decent.jpg",
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
