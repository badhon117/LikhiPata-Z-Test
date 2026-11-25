/* ============================================================
   লিখিপাতা — IndexedDB Storage (localStorage-এর বদলে)
   
   ✅ ৫০ MB - কয়েক GB পর্যন্ত জায়গা
   ✅ হাজারো এন্ট্রি মসৃণভাবে সামলাতে পারে
   ✅ পুরোনো localStorage ডেটা অটো মাইগ্রেশন
   ✅ ফাংশন নাম একই → অন্য ফাইল বদলাতে হবে না
   ============================================================ */

const DB_NAME = (window.APP_CONFIG && window.APP_CONFIG.dbName) || 'LikhipataDB';
const DB_VERSION = (window.APP_CONFIG && window.APP_CONFIG.dbVersion) || 1;

let dbInstance = null;
let dbReady = false;
let dbInitPromise = null;

/* ============ DB ইনিশিয়ালাইজ ============ */
function initDB() {
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;

      // Books store
      if (!db.objectStoreNames.contains('books')) {
        db.createObjectStore('books', { keyPath: 'id' });
      }

      // Entries store (bookId দিয়ে index)
      if (!db.objectStoreNames.contains('entries')) {
        const store = db.createObjectStore('entries', { keyPath: 'id' });
        store.createIndex('byBook', 'bookId', { unique: false });
      }

      // Metadata store (theme, counters, tombstones)
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };

    request.onsuccess = (e) => {
      dbInstance = e.target.result;
      dbReady = true;
      console.log('✅ IndexedDB প্রস্তুত');
      resolve(dbInstance);
    };

    request.onerror = (e) => {
      console.error('❌ IndexedDB খুলতে ব্যর্থ:', e.target.error);
      reject(e.target.error);
    };
  });

  return dbInitPromise;
}

/* ============ Book Normalizer (পুরোনো ব্যাকআপ compatibility) ============ */
function normalizeBookRecord(book) {
  if (!book || typeof book !== 'object') return book;

  // Arrays
  if (!Array.isArray(book.fields)) book.fields = [];
  if (!Array.isArray(book.summaryCards)) book.summaryCards = [];
  if (!Array.isArray(book.dashboardCards)) book.dashboardCards = [];
  if (!Array.isArray(book.chartSections)) book.chartSections = [];

  // Nested dashboard cards-এ id না থাকলে যোগ করি
  book.dashboardCards.forEach((card, i) => {
    if (!card.id) {
      card.id = 'dcard_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2, 6);
    }
    if (!card.color) card.color = '#10B981';
  });

  // Nested chart sections-এ id না থাকলে যোগ করি
  book.chartSections.forEach((sec, i) => {
    if (!sec.id) {
      sec.id = 'csec_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2, 6);
    }
    if (!Array.isArray(sec.fields)) sec.fields = [];
  });

  // প্রাথমিক ফিল্ড
  if (book.parentId === undefined || book.parentId === '') book.parentId = null;
  if (!book.type) book.type = 'normal';
  if (!book.order && book.order !== 0) book.order = 999999;
  if (!book.createdAt) book.createdAt = Date.now();
  if (!book.updatedAt) book.updatedAt = book.createdAt;

  return book;
}

/* ============ সাধারণ হেল্পার ============ */
function dbGet(storeName, key) {
  return new Promise((resolve, reject) => {
    if (!dbInstance) { resolve(null); return; }
    try {
      const tx = dbInstance.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    } catch (e) { resolve(null); }
  });
}

function dbPut(storeName, value) {
  return new Promise((resolve, reject) => {
    if (!dbInstance) { resolve(false); return; }
    try {
      const tx = dbInstance.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).put(value);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    } catch (e) { resolve(false); }
  });
}

function dbDelete(storeName, key) {
  return new Promise((resolve, reject) => {
    if (!dbInstance) { resolve(false); return; }
    try {
      const tx = dbInstance.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    } catch (e) { resolve(false); }
  });
}

function dbGetAll(storeName) {
  return new Promise((resolve, reject) => {
    if (!dbInstance) { resolve([]); return; }
    try {
      const tx = dbInstance.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    } catch (e) { resolve([]); }
  });
}

function dbGetAllByIndex(storeName, indexName, value) {
  return new Promise((resolve, reject) => {
    if (!dbInstance) { resolve([]); return; }
    try {
      const tx = dbInstance.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      if (!store.indexNames.contains(indexName)) {
        resolve([]);
        return;
      }
      const index = store.index(indexName);
      const req = index.getAll(value);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
}

function dbClear(storeName) {
  return new Promise((resolve) => {
    if (!dbInstance) { resolve(false); return; }
    try {
      const tx = dbInstance.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch (e) { resolve(false); }
  });
}

/* ============ Metadata হেল্পার ============ */
async function getMeta(key, fallback = null) {
  const row = await dbGet('meta', key);
  return row ? row.value : fallback;
}

async function setMeta(key, value) {
  return await dbPut('meta', { key, value });
}

/* ============================================================
   PUBLIC API — storage.js-এর মতোই (sync/async mix)
   
   ⚠️ IndexedDB async, কিন্তু পুরোনো কোড sync আশা করে।
   সমাধান: ইন-মেমরি ক্যাশ ব্যবহার করব।
   ============================================================ */

/* ============ ইন-মেমরি ক্যাশ ============ */
let booksCache = [];
let entriesCache = {};      // { bookId: [entries] }
let tombstonesCache = { books: {}, entries: {} };
let themeCache = 'light';
let cacheLoaded = false;

/* ============ ক্যাশ লোড ============ */
async function loadAllToCache(forceReload = false) {
  if (cacheLoaded && !forceReload) return;
  
  booksCache = await dbGetAll('books');
  booksCache = booksCache.map(normalizeBookRecord);   // 👈 এই লাইন যোগ করুন
  const allEntries = await dbGetAll('entries');
  
  // Book দিয়ে গ্রুপ করি
  entriesCache = {};
  allEntries.forEach(e => {
    const bid = e.bookId;
    if (!entriesCache[bid]) entriesCache[bid] = [];
    const { bookId, ...entryData } = e;
    entriesCache[bid].push(entryData);
  });
  
  tombstonesCache = await getMeta('tombstones', { books: {}, entries: {} });
  themeCache = await getMeta('theme', 'light');
  
  cacheLoaded = true;
}

/* ============ Books API ============ */
function getBooks() {
  return booksCache.map(b => ({ ...b }));
}

async function saveBooksAsync(books) {
  const newIds = new Set(books.map(b => b.id));
  const oldBooks = await dbGetAll('books');
  for (const old of oldBooks) {
    if (!newIds.has(old.id)) {
      // 👇 বুক ডিলিট করার আগে তার সব এন্ট্রিও ডিলিট করি
      const oldEntries = await dbGetAllByIndex('entries', 'byBook', old.id);
      for (const e of oldEntries) {
        await dbDelete('entries', e.id);
      }
      delete entriesCache[old.id];
      await dbDelete('books', old.id);
    }
  }
  for (const b of books) {
    await dbPut('books', b);
  }
  booksCache = books.map(b => ({ ...b }));
  if (typeof notifyDataChanged === 'function') notifyDataChanged();
  return true;
}

// sync ফাংশন হিসেবে wrapper (অন্য ফাইলের জন্য)
async function saveBooks(books) {
  try {
    return await saveBooksAsync(books);
  } catch (e) {
    console.error('saveBooks failed:', e);
    return false;
  }
}

function getBook(bookId) {
  return booksCache.find(b => b.id === bookId) || null;
}




/* ============ Entries API ============ */
function getEntries(bookId) {
  const list = entriesCache[bookId] || [];
  return list.map(e => ({ ...e }));
}

async function saveEntriesAsync(bookId, entries) {
  const newIds = new Set(entries.map(e => e.id));
  const oldEntries = await dbGetAllByIndex('entries', 'byBook', bookId);
  for (const old of oldEntries) {
    if (!newIds.has(old.id)) {
      await dbDelete('entries', old.id);
    }
  }
  for (const entry of entries) {
    await dbPut('entries', { ...entry, bookId });
  }
  entriesCache[bookId] = entries.map(e => ({ ...e }));
  if (typeof notifyDataChanged === 'function') notifyDataChanged();
  return true;
}

async function saveEntries(bookId, entries) {
  try {
    return await saveEntriesAsync(bookId, entries);
  } catch (e) {
    console.error('saveEntries failed:', e);
    return false;
  }
}

/* ============ Tombstone API ============ */
function getTombstones() {
  return { 
    books: { ...tombstonesCache.books }, 
    entries: { ...tombstonesCache.entries } 
  };
}

function saveTombstones(tombstones) {
  tombstonesCache = { 
    books: tombstones.books || {}, 
    entries: tombstones.entries || {} 
  };
  setMeta('tombstones', tombstonesCache);
  return true;
}

function recordTombstone(type, id) {
  if (!id) return;
  const ts = Date.now();
  if (type === 'book') tombstonesCache.books[id] = ts;
  else if (type === 'entry') tombstonesCache.entries[id] = ts;
  else return;
  setMeta('tombstones', tombstonesCache);
}

function clearTombstone(type, id) {
  if (!id) return;
  let changed = false;
  if (type === 'book' && tombstonesCache.books[id]) {
    delete tombstonesCache.books[id];
    changed = true;
  } else if (type === 'entry' && tombstonesCache.entries[id]) {
    delete tombstonesCache.entries[id];
    changed = true;
  }
  if (changed) setMeta('tombstones', tombstonesCache);
}

function cleanOldTombstones() {
  const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
  let changed = false;
  Object.keys(tombstonesCache.books).forEach(id => {
    if (tombstonesCache.books[id] < cutoff) {
      delete tombstonesCache.books[id];
      changed = true;
    }
  });
  Object.keys(tombstonesCache.entries).forEach(id => {
    if (tombstonesCache.entries[id] < cutoff) {
      delete tombstonesCache.entries[id];
      changed = true;
    }
  });
  if (changed) setMeta('tombstones', tombstonesCache);
}

function applyTheme(theme) {
  document.body.classList.remove('dark-mode', 'amoled-mode');
  if (theme === 'dark') document.body.classList.add('dark-mode');
  else if (theme === 'amoled') document.body.classList.add('amoled-mode');
}

/* ============ Draft (অটো-সেভ) ============ */
function saveDraft(bookId, data) {
  if (!bookId) return;
  try {
    localStorage.setItem('likhipata_draft_' + bookId, JSON.stringify(data));
  } catch (e) { /* ignore */ }
}

function loadDraft(bookId) {
  if (!bookId) return null;
  try {
    const raw = localStorage.getItem('likhipata_draft_' + bookId);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function clearDraft(bookId) {
  if (!bookId) return;
  localStorage.removeItem('likhipata_draft_' + bookId);
}


/* ============ Theme ============ */
function getTheme() {
  return themeCache;
}

function saveTheme(theme) {
  themeCache = theme;
  setMeta('theme', theme);
  applyTheme(theme);
}

/* ============ Backup counters ============ */
function getEntriesSinceBackup() {
  const val = localStorage.getItem('likhipata_entries_since_backup');
  return val ? parseInt(val) : 0;
}

function incrementEntriesSinceBackup(count = 1) {
  const current = getEntriesSinceBackup();
  const newVal = current + count;
  localStorage.setItem('likhipata_entries_since_backup', String(newVal));
  return newVal;
}

function resetEntriesSinceBackup() {
  localStorage.setItem('likhipata_entries_since_backup', '0');
}

function getLastBackupTime() {
  const val = localStorage.getItem('likhipata_last_backup_time');
  return val ? parseInt(val) : 0;
}

function setLastBackupTime(ts = Date.now()) {
  localStorage.setItem('likhipata_last_backup_time', String(ts));
}

/* ============ Trash (Recycle Bin) ============ */
function getTrashedBooks() {
  return loadFromStorage('likhipata_trash_books', []);
}

function getTrashedEntries() {
  return loadFromStorage('likhipata_trash_entries', []);
}

/* ============ Delete / Restore ============ */


async function addBook(book) {
  if (!book.createdAt) book.createdAt = Date.now();
  if (!book.updatedAt) book.updatedAt = Date.now();
  if (book.parentId === undefined) book.parentId = null;
  booksCache.push(book);
  await dbPut('books', book);
  if (typeof notifyDataChanged === 'function') notifyDataChanged();
  return true;
}

async function updateBook(bookId, updates) {
  const idx = booksCache.findIndex(b => b.id === bookId);
  if (idx < 0) return false;
  booksCache[idx] = { ...booksCache[idx], ...updates, updatedAt: Date.now() };
  await dbPut('books', booksCache[idx]);
  if (typeof notifyDataChanged === 'function') notifyDataChanged();
  return true;
}

async function deleteBook(bookId) {
  const bookToDelete = booksCache.find(b => b.id === bookId);
  if (!bookToDelete) return false;

  const entries = entriesCache[bookId] || [];
  const trashed = loadFromStorage('likhipata_trash_books', []);
  trashed.push({ ...bookToDelete, entries: [...entries], deletedAt: Date.now() });
  const savedTrash = saveToStorage('likhipata_trash_books', trashed);
  if (!savedTrash) return false;

  recordTombstone('book', bookId);
  entries.forEach(e => recordTombstone('entry', e.id));

  // সাব-বুকগুলোর parentId ক্লিয়ার করে মূল বুক হিসেবে রেখে দিই যাতে হারিয়ে না যায়
  const childBooks = booksCache.filter(b => b.parentId === bookId);
  for (const child of childBooks) {
    child.parentId = null;
    child.updatedAt = Date.now();
    await dbPut('books', child);
    // 👇 ক্যাশেও আপডেট করি
    const idx = booksCache.findIndex(b => b.id === child.id);
    if (idx >= 0) booksCache[idx] = { ...booksCache[idx], parentId: null, updatedAt: child.updatedAt };
  }

  booksCache = booksCache.filter(b => b.id !== bookId);
  await dbDelete('books', bookId);

  for (const e of entries) {
    await dbDelete('entries', e.id);
  }
  delete entriesCache[bookId];

  if (typeof notifyDataChanged === 'function') notifyDataChanged();
  return true;
}

async function restoreBookFromTrash(bookId) {
  const trashed = loadFromStorage('likhipata_trash_books', []);
  const idx = trashed.findIndex(b => b.id === bookId);
  if (idx < 0) return false;

  const book = { ...trashed[idx] };
  const entries = book.entries || [];
  delete book.entries;
  delete book.deletedAt;

  clearTombstone('book', bookId);

  if (booksCache.find(b => b.id === book.id)) {
    book.id = generateId('book');
    // 👇 এন্ট্রিগুলোর bookId আপডেট করি
    entries.forEach(e => { e.bookId = book.id; });
  } else {
    // 👇 যদি book.id পরিবর্তন না হয়, তবুও এন্ট্রিগুলোর bookId ঠিক করি
    entries.forEach(e => { e.bookId = book.id; });
  }

  booksCache.push(book);
  await dbPut('books', book);
  // 👇 saveEntries কল করার আগে entriesCache সেট করি
  entriesCache[book.id] = entries.map(e => ({ ...e }));
  await saveEntries(book.id, entries);

  entries.forEach(e => clearTombstone('entry', e.id));

  trashed.splice(idx, 1);
  saveToStorage('likhipata_trash_books', trashed);

  const trashedEntries = loadFromStorage('likhipata_trash_entries', []);
  const filtered = trashedEntries.filter(e => e.bookId !== bookId);
  if (filtered.length !== trashedEntries.length) {
    saveToStorage('likhipata_trash_entries', filtered);
  }

  if (typeof notifyDataChanged === 'function') notifyDataChanged();
  return true;
}

function permanentlyDeleteBook(bookId) {
  const trashed = loadFromStorage('likhipata_trash_books', []);
  const newTrash = trashed.filter(b => b.id !== bookId);
  return saveToStorage('likhipata_trash_books', newTrash);
}

async function trashEntries(bookId, entryIds) {
  if (!Array.isArray(entryIds) || entryIds.length === 0) return false;
  const entries = entriesCache[bookId] || [];
  const trashed = loadFromStorage('likhipata_trash_entries', []);

  const entriesToDelete = entries.filter(e => entryIds.includes(e.id));
  if (entriesToDelete.length === 0) return false;

  const updatedTrash = [
    ...trashed,
    ...entriesToDelete.map(e => ({ ...e, bookId, deletedAt: Date.now() }))
  ];
  const savedTrash = saveToStorage('likhipata_trash_entries', updatedTrash);
  if (!savedTrash) return false;

  entryIds.forEach(id => recordTombstone('entry', id));

  for (const e of entriesToDelete) {
    await dbDelete('entries', e.id);
  }

  // 👇 ক্যাশ থেকে সরাসরি ফিল্টার করে আপডেট করি
  if (entriesCache[bookId]) {
    entriesCache[bookId] = entriesCache[bookId].filter(e => !entryIds.includes(e.id));
  }
  if (typeof notifyDataChanged === 'function') notifyDataChanged();
  return true;
}

async function restoreEntryFromTrash(entryId) {
  const trashed = loadFromStorage('likhipata_trash_entries', []);
  const idx = trashed.findIndex(e => e.id === entryId);
  if (idx < 0) return false;

  const entry = { ...trashed[idx] };
  const bookId = entry.bookId;
  delete entry.bookId;
  delete entry.deletedAt;

  if (!booksCache.find(b => b.id === bookId)) return false;

  clearTombstone('entry', entryId);

  if (!entriesCache[bookId]) entriesCache[bookId] = [];
  const existingIdx = entriesCache[bookId].findIndex(e => e.id === entry.id);
  if (existingIdx >= 0) {
    // 👇 আগে থেকে থাকলে আপডেট করি
    entriesCache[bookId][existingIdx] = { ...entry };
  } else {
    entriesCache[bookId].push(entry);
  }
  await dbPut('entries', { ...entry, bookId });

  trashed.splice(idx, 1);
  saveToStorage('likhipata_trash_entries', trashed);
  if (typeof notifyDataChanged === 'function') notifyDataChanged();
  return true;
}

function permanentlyDeleteEntry(entryId) {
  const trashed = loadFromStorage('likhipata_trash_entries', []);
  const newTrash = trashed.filter(e => e.id !== entryId);
  return saveToStorage('likhipata_trash_entries', newTrash);
}


function emptyRecycleBin() {
  saveToStorage('likhipata_trash_books', []);
  saveToStorage('likhipata_trash_entries', []);
  if (typeof notifyDataChanged === 'function') notifyDataChanged();
}

async function wipeAllAppDataPermanently() {
  await dbClear('books');
  await dbClear('entries');

  // থিম বাদে বাকি meta রেকর্ড মুছি
  const allMeta = await dbGetAll('meta');
  for (const row of allMeta) {
    if (row.key !== 'theme') {
      await dbDelete('meta', row.key);
    }
  }

  booksCache = [];
  entriesCache = {};
  tombstonesCache = { books: {}, entries: {} };

  saveToStorage('likhipata_trash_books', []);
  saveToStorage('likhipata_trash_entries', []);
  localStorage.removeItem('likhipata_entries_since_backup');
  localStorage.removeItem('likhipata_last_backup_time');

  // পুরোনো localStorage বুক/এন্ট্রি থাকলে তাও পরিষ্কার করি
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && (k === 'likhipata_books' || k.startsWith('likhipata_entries_') || k.startsWith('likhipata_draft_'))) {
      keysToRemove.push(k);
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));

  if (typeof notifyDataChanged === 'function') notifyDataChanged();
  return true;
}



/* ============ ID Generator ============ */
function generateId(prefix = 'id') {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

/* ============ Export / Import ============ */
function exportAllData() {
  return {
    app: 'লিখিপাতা',
    version: 2,
    exportedAt: new Date().toISOString(),
    theme: themeCache,
    books: booksCache.map(b => ({
  ...b,
  parentId: b.parentId || null,
  summaryCards: b.summaryCards || [],
  dashboardCards: b.dashboardCards || [],
  chartSections: b.chartSections || [],
  entries: getEntries(b.id).map(e => ({ ...e }))
})),
    
    trashBooks: loadFromStorage('likhipata_trash_books', []),
    trashEntries: loadFromStorage('likhipata_trash_entries', []),
    tombstones: getTombstones(),
    lastSyncAt: parseInt(localStorage.getItem('likhipata_last_sync') || '0'),
    entriesSinceBackup: getEntriesSinceBackup(),
    lastBackupTime: getLastBackupTime()
  };
}

async function importAllData(data, mergeMode = false) {
  if (!data || !Array.isArray(data.books)) {
    throw new Error('ভুল ব্যাকআপ ফাইল');
  }

  // 👇 যদি মার্জ মোড না হয়, তবে আগের মতো সব মুছে ফেলবে
  if (!mergeMode) {
    await dbClear('books');
    await dbClear('entries');
    await dbClear('meta'); // 👈 ট্র্যাশ ও টম্বস্টোন মেটাও ক্লিয়ার করি
    booksCache = [];
    entriesCache = {};
    tombstonesCache = { books: {}, entries: {} };
    themeCache = 'light';
    
    // Trash ও খালি করে দিই (রিপ্লেস মোডে)
    saveToStorage('likhipata_trash_books', []);
    saveToStorage('likhipata_trash_entries', []);
  }

  // নতুন books লুপ
    for (const b of data.books) {
  const { entries, ...bookMeta } = b;
      normalizeBookRecord(bookMeta);   // 👈 
  if (!bookMeta.summaryCards) bookMeta.summaryCards = [];
  if (!bookMeta.dashboardCards) bookMeta.dashboardCards = [];
  if (!Array.isArray(bookMeta.fields)) bookMeta.fields = [];
  if (!bookMeta.createdAt) bookMeta.createdAt = Date.now();
  if (!bookMeta.updatedAt) bookMeta.updatedAt = bookMeta.createdAt;
  
  // 👇 নতুন লজিক: parentId না থাকলে null সেট করি (পুরোনো ব্যাকআপের জন্য)
  if (bookMeta.parentId === undefined || bookMeta.parentId === '') {
    bookMeta.parentId = null;
  }
  
    const existingBook = booksCache.find(x => x.id === bookMeta.id);
    const incomingEntries = Array.isArray(entries) ? entries : [];

    if (existingBook) {
      // 👇 যদি বুক আগে থেকেই থাকে (মার্জ মোডে)
      
      // ১. ফিল্ড মার্জ (পুরোনো ফিল্ডের সাথে নতুন ফিল্ড যোগ)
      const existingFields = existingBook.fields || [];
      const mergedFields = [...existingFields];
      bookMeta.fields.forEach(newField => {
        const exists = mergedFields.find(f => f.key === newField.key || f.label === newField.label);
        if (!exists) mergedFields.push(newField);
      });
      existingBook.fields = mergedFields;

      // ২. সামারি কার্ড মার্জ
const existingCards = existingBook.summaryCards || [];
const mergedCards = [...existingCards];
(bookMeta.summaryCards || []).forEach(newCard => {
  if (!mergedCards.find(c => c.id === newCard.id || c.label === newCard.label)) {
    mergedCards.push(newCard);
  }
});
existingBook.summaryCards = mergedCards;

// ২.১ ড্যাশবোর্ড কার্ড মার্জ 👈 নতুন
const existingDash = existingBook.dashboardCards || [];
const mergedDash = [...existingDash];
(bookMeta.dashboardCards || []).forEach(newDash => {
  if (!mergedDash.find(d => 
    d.sourceBookId === newDash.sourceBookId && 
    d.summaryId === newDash.summaryId
  )) {
    mergedDash.push(newDash);
  }
});
existingBook.dashboardCards = mergedDash;
      
      // ৩. বুক মেটাডেটা আপডেট
      existingBook.name = bookMeta.name || existingBook.name;
      existingBook.icon = bookMeta.icon || existingBook.icon;
      existingBook.color = bookMeta.color || existingBook.color;
      existingBook.updatedAt = Math.max(existingBook.updatedAt, bookMeta.updatedAt);
      
      await dbPut('books', existingBook);

      // ৪. এন্ট্রি মার্জ
      if (!entriesCache[existingBook.id]) entriesCache[existingBook.id] = [];
      for (const entry of incomingEntries) {
        const idx = entriesCache[existingBook.id].findIndex(e => e.id === entry.id);
        if (idx >= 0) {
  // এন্ট্রি আগে থাকলে চেক করি কোনটা নতুন
  const oldEntry = entriesCache[existingBook.id][idx];
  const oldTime = oldEntry.updatedAt || oldEntry.createdAt || 0;
  const newTime = entry.updatedAt || entry.createdAt || 0;
  
  // 👇 যদি ব্যাকআপের এন্ট্রি বর্তমান এন্ট্রি থেকে নতুন হয়, তবেই আপডেট করব
  if (newTime >= oldTime) {
    entriesCache[existingBook.id][idx] = { 
      ...oldEntry, 
      ...entry, 
      updatedAt: newTime
    };
    await dbPut('entries', { ...entriesCache[existingBook.id][idx], bookId: existingBook.id });
  }
    } else {
          // নতুন এন্ট্রি যোগ
          const newEntry = { ...entry, bookId: existingBook.id };
          entriesCache[existingBook.id].push(newEntry);
          await dbPut('entries', newEntry);
        }
      }

    } else {
      // 👇 যদি নতুন বুক হয়
      booksCache.push(bookMeta);
      await dbPut('books', bookMeta);
      
      if (incomingEntries.length > 0) {
        entriesCache[bookMeta.id] = incomingEntries.map(e => ({ ...e }));
        for (const entry of incomingEntries) {
          await dbPut('entries', { ...entry, bookId: bookMeta.id });
        }
      }
    }
  }

  // Trash মার্জ (শুধু মার্জ মোডে)
  if (mergeMode) {
    if (Array.isArray(data.trashBooks)) {
      const existingTrash = loadFromStorage('likhipata_trash_books', []);
      const newTrash = [...existingTrash];
      data.trashBooks.forEach(tb => {
        if (!newTrash.find(x => x.id === tb.id)) newTrash.push(tb);
      });
      saveToStorage('likhipata_trash_books', newTrash);
    }
    if (Array.isArray(data.trashEntries)) {
      const existingTrash = loadFromStorage('likhipata_trash_entries', []);
      const newTrash = [...existingTrash];
      data.trashEntries.forEach(te => {
        if (!newTrash.find(x => x.id === te.id)) newTrash.push(te);
      });
      saveToStorage('likhipata_trash_entries', newTrash);
    }
  } else {
    // রিপ্লেস মোডে সরাসরি বসিয়ে দিই
    if (Array.isArray(data.trashBooks)) saveToStorage('likhipata_trash_books', data.trashBooks);
    if (Array.isArray(data.trashEntries)) saveToStorage('likhipata_trash_entries', data.trashEntries);
  }

  // Tombstones (মার্জ)
  if (data.tombstones) {
    const existing = getTombstones();
    Object.keys(data.tombstones.books || {}).forEach(id => {
      const ts = data.tombstones.books[id];
      if (!existing.books[id] || existing.books[id] < ts) existing.books[id] = ts;
    });
    Object.keys(data.tombstones.entries || {}).forEach(id => {
      const ts = data.tombstones.entries[id];
      if (!existing.entries[id] || existing.entries[id] < ts) existing.entries[id] = ts;
    });
    saveTombstones(existing);
  }

    // 👇 নতুন লজিক: রিস্টোরের পর ক্যাশ ফোর্স রিফ্রেশ করি
  await loadAllToCache(true);

  if (data.lastSyncAt) localStorage.setItem('likhipata_last_sync', String(data.lastSyncAt));
  if (data.entriesSinceBackup !== undefined) {
    localStorage.setItem('likhipata_entries_since_backup', String(data.entriesSinceBackup));
  }
  if (data.lastBackupTime) setLastBackupTime(data.lastBackupTime);
  if (data.theme) saveTheme(data.theme);

  return true;
}


/* ============================================================
   মাইগ্রেশন: localStorage → IndexedDB
   ============================================================ */
async function migrateFromLocalStorage() {
  const migrated = localStorage.getItem('likhipata_migrated_to_idb');
  if (migrated === 'true') return;

  try {
    // পুরোনো ডেটা পড়ি
    const oldBooks = loadFromStorage('likhipata_books', []);
    const oldTheme = localStorage.getItem('likhipata_theme') || 'light';
    const oldTombstones = loadFromStorage('likhipata_tombstones', { books: {}, entries: {} });
    const oldTrashBooks = loadFromStorage('likhipata_trash_books', []);
    const oldTrashEntries = loadFromStorage('likhipata_trash_entries', []);

    if (oldBooks.length === 0) {
      // কিছু নেই, শুধু ফ্ল্যাগ সেট করি
      localStorage.setItem('likhipata_migrated_to_idb', 'true');
      return;
    }

    console.log('🔄 পুরোনো localStorage ডেটা পাওয়া গেছে, মাইগ্রেট করছি...');

    // Books মাইগ্রেট
    for (const book of oldBooks) {
      normalizeBookRecord(book);
      await dbPut('books', book);
      // 👇 ক্যাশে আগে থেকে থাকলে পুশ করি না
      if (!booksCache.find(b => b.id === book.id)) {
        booksCache.push(book);
      }

      // Entries
      const entries = loadFromStorage('likhipata_entries_' + book.id, []);
      // 👇 আগের ক্যাশের সাথে মার্জ করি
      if (!entriesCache[book.id]) entriesCache[book.id] = [];
      entries.forEach(e => {
        if (!entriesCache[book.id].find(x => x.id === e.id)) {
          entriesCache[book.id].push(e);
        }
      });
      for (const entry of entries) {
        await dbPut('entries', { ...entry, bookId: book.id });
      }
    }

    // Theme
    themeCache = oldTheme;
    await setMeta('theme', oldTheme);

    // Tombstones
    tombstonesCache = oldTombstones;
    await setMeta('tombstones', oldTombstones);

    // Trash
    if (oldTrashBooks.length) saveToStorage('likhipata_trash_books', oldTrashBooks);
    if (oldTrashEntries.length) saveToStorage('likhipata_trash_entries', oldTrashEntries);

    localStorage.setItem('likhipata_migrated_to_idb', 'true');
    console.log('✅ মাইগ্রেশন সম্পন্ন। মোট বুক:', oldBooks.length);

    // পুরোনো ডেটা মুছি (স্থান খালি করতে)
    localStorage.removeItem('likhipata_books');
    oldBooks.forEach(b => localStorage.removeItem('likhipata_entries_' + b.id));
    
  } catch (e) {
    console.error('মাইগ্রেশন ব্যর্থ:', e);
    // মাইগ্রেশন ব্যর্থ হলে আবার চেষ্টা করার জন্য ফ্ল্যাগ মুছি না
  }
}

/* ============ Init ============ */
async function initStorage() {
  await initDB();
  await loadAllToCache();
  
  if (window.APP_CONFIG && window.APP_CONFIG.autoMigrate) {
    await migrateFromLocalStorage();
    // মাইগ্রেশনের পর ক্যাশ ফোর্স রিফ্রেশ
    await loadAllToCache(true);
  }
  
  return true;
}

// এক্সপোজ
window.initStorage = initStorage;

window.recordBookTombstone = function(bookId) {
  recordTombstone('book', bookId);
};

window.recordEntryTombstone = function(entryId) {
  recordTombstone('entry', entryId);
};