/**
 * IndexedDB Wrapper for Cookie Reject Screenshots
 * Stores large image data URLs locally without hitting chrome.storage memory limits.
 */

const DB_NAME = 'CookieRejectDB';
const DB_VERSION = 1;
const STORE_NAME = 'screenshots';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => reject(event.target.error);

        request.onsuccess = (event) => resolve(event.target.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('timestamp', 'timestamp', { unique: false });
                store.createIndex('sourceUrl', 'sourceUrl', { unique: false });
            }
        };
    });
}

const db = {
    async saveScreenshot(screenshot) {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            // Expected screenshot object: { id, dataUrl, sourceUrl, width, height, sizeBytes, timestamp }
            const request = store.put(screenshot);

            request.onsuccess = () => resolve(screenshot.id);
            request.onerror = (e) => reject(e.target.error);
        });
    },

    async getScreenshot(id) {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    },

    async getAllScreenshots() {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => {
                // Return sorted by timestamp descending
                const results = request.result || [];
                results.sort((a, b) => b.timestamp - a.timestamp);
                resolve(results);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    },

    async deleteScreenshot(id) {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(id);

            request.onsuccess = () => resolve(true);
            request.onerror = (e) => reject(e.target.error);
        });
    },

    async deleteAll() {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();

            request.onsuccess = () => resolve(true);
            request.onerror = (e) => reject(e.target.error);
        });
    }
};

window.screenshotDB = db;
