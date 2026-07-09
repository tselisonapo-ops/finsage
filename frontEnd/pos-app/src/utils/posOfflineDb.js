const DB_NAME = "finsage_pos_offline";
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains("offline_sales")) {
        const store = db.createObjectStore("offline_sales", {
          keyPath: "offline_local_id",
        });

        store.createIndex("sync_status", "sync_status");
        store.createIndex("company_id", "company_id");
        store.createIndex("created_at", "created_at");
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveOfflineSale(payload) {
  const db = await openDb();

  const sale = {
    offline_local_id: crypto.randomUUID(),
    company_id: payload.company_id,
    payload,
    sync_status: "offline_pending",
    sync_error: null,
    created_at: new Date().toISOString(),
    synced_at: null,
    server_sale_id: null,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction("offline_sales", "readwrite");
    tx.objectStore("offline_sales").put(sale);

    tx.oncomplete = () => resolve(sale);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingOfflineSales() {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction("offline_sales", "readonly");
    const index = tx.objectStore("offline_sales").index("sync_status");
    const req = index.getAll("offline_pending");

    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function updateOfflineSale(sale) {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction("offline_sales", "readwrite");
    tx.objectStore("offline_sales").put(sale);

    tx.oncomplete = () => resolve(sale);
    tx.onerror = () => reject(tx.error);
  });
}