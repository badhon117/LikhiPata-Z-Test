/* ============================================================
   লিখিপাতা — Google Drive Sync v4 (Fixed & Stable)
   ============================================================ */

const GOOGLE_CLIENT_ID = '950893673069-fqdltvr9q7svc1gvo7p9if0q50a90dm3.apps.googleusercontent.com';
const DRIVE_SCOPES = 'https://www.googleapis.com/auth/drive.appdata';
const BACKUP_FILE_NAME = 'likhipata-backup.json';
const CONNECTED_KEY = 'likhipata_drive_connected';
const LAST_SYNC_KEY = 'likhipata_last_sync';
const FIRST_LOGIN_KEY = 'likhipata_first_login_done';
const PENDING_SYNC_KEY = 'likhipata_pending_sync';
const SYNC_DEBOUNCE_MS = 3000;
const MAX_UPLOAD_RETRIES = 2;
const TOKEN_SAFETY_MS = 60 * 1000; // ১ মিনিটের বাফার

let tokenClient = null;
let accessToken = localStorage.getItem('likhipata_access_token') || null;
let tokenExpiry = parseInt(localStorage.getItem('likhipata_token_expiry') || '0');

let isSyncing = false;
let syncTimeout = null;
let pendingSync = false;
let googleApiLoaded = false;
let googleApiLoadPromise = null;
let isSilentRefresh = false;
let findFileDepth = 0;

/* ============================================================
   SECTION 0: TOKEN HELPERS
   ============================================================ */
function saveToken(token, expiry) {
  accessToken = token || null;
  tokenExpiry = expiry || 0;
  if (token && expiry) {
    localStorage.setItem('likhipata_access_token', token);
    localStorage.setItem('likhipata_token_expiry', String(expiry));
  }
}

function clearToken() {
  accessToken = null;
  tokenExpiry = 0;
  localStorage.removeItem('likhipata_access_token');
  localStorage.removeItem('likhipata_token_expiry');
}

function hasLocalValidToken() {
  const exp = tokenExpiry || parseInt(localStorage.getItem('likhipata_token_expiry') || '0');
  const tok = accessToken || localStorage.getItem('likhipata_access_token');
  return !!(tok && exp > Date.now() + TOKEN_SAFETY_MS);
}

/* ============================================================
   SECTION 1: GOOGLE API LOADING
   ============================================================ */
function loadGoogleAPI() {
  if (googleApiLoadPromise) return googleApiLoadPromise;

  googleApiLoadPromise = new Promise((resolve, reject) => {
    if (window.google && window.google.accounts && tokenClient) {
      googleApiLoaded = true;
      resolve();
      return;
    }
    const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => {
        initTokenClient();
        googleApiLoaded = true;
        resolve();
      });
      existing.addEventListener('error', () => reject(new Error('Google API লোড হয়নি')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      initTokenClient();
      googleApiLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error('Google API লোড হয়নি'));
    document.head.appendChild(script);
  });

  // ব্যর্থ হলে পরেরবার আবার চেষ্টা করার সুযোগ রাখি
  googleApiLoadPromise = googleApiLoadPromise.catch((err) => {
    googleApiLoadPromise = null;
    throw err;
  });

  return googleApiLoadPromise;
}

function initTokenClient() {
  if (!window.google || !google.accounts || !google.accounts.oauth2) return;
  if (tokenClient) return;

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_SCOPES,
    callback: (tokenResponse) => {
      const wasSilent = isSilentRefresh;
      isSilentRefresh = false;

      if (tokenResponse && tokenResponse.access_token) {
        saveToken(
          tokenResponse.access_token,
          Date.now() + ((tokenResponse.expires_in || 3600) * 1000)
        );
        saveConnectionState(true);
        updateSyncUI(true);

        // সাইলেন্ট রিফ্রেশ হলে চুপচাপ শেষ — টোস্ট/মার্জ নয়
        if (wasSilent) return;

        // ম্যানুয়াল সাইন-ইন
        showToast('✅ গুগল ড্রাইভে সংযুক্ত হয়েছে', 'success');
        if (typeof hideSplash === 'function') hideSplash();

        // প্রথম-লগইন শুধু একবার
        if (!localStorage.getItem(FIRST_LOGIN_KEY)) {
          localStorage.setItem(FIRST_LOGIN_KEY, 'true');
          handleFirstLogin().catch(e => console.warn('first login failed:', e));
        }
      } else if (tokenResponse && tokenResponse.error) {
        saveConnectionState(false); // এটাই clearToken() ডাকে
        updateSyncUI(false);
        if (!wasSilent) {
          showToast('সাইন ইন বাতিল হয়েছে', 'error');
        }
      }
    }
  });
}

/* ============================================================
   SECTION 2: TOKEN REFRESH
   ============================================================ */
function refreshAccessToken() {
  return new Promise((resolve) => {
    if (!tokenClient) { resolve(false); return; }

    const origCallback = tokenClient.callback;
    let resolved = false;

    const finish = (ok) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      tokenClient.callback = origCallback;
      isSilentRefresh = false;
      if (!ok) clearToken();
      resolve(ok);
    };

    const timeout = setTimeout(() => finish(false), 10000);

    tokenClient.callback = (resp) => {
      if (resolved) return;
      if (resp && resp.access_token) {
        saveToken(
          resp.access_token,
          Date.now() + ((resp.expires_in || 3600) * 1000)
        );
        saveConnectionState(true);
        updateSyncUI(true);
        finish(true);
      } else {
        finish(false);
      }
    };

    try {
      tokenClient.requestAccessToken({ prompt: '' });
    } catch (e) {
      finish(false);
    }
  });
}

async function ensureValidToken() {
  // লোকাল স্টোরেজ থেকে ফিরিয়ে আনি (রিলোড হলে)
  if (!accessToken) {
    const stored = localStorage.getItem('likhipata_access_token');
    const storedExp = parseInt(localStorage.getItem('likhipata_token_expiry') || '0');
    if (stored && storedExp > Date.now() + TOKEN_SAFETY_MS) {
      accessToken = stored;
      tokenExpiry = storedExp;
      return true;
    }
  }

  if (accessToken && Date.now() < tokenExpiry - 5 * 60 * 1000) return true;

  return await refreshAccessToken();
}

/* ============================================================
   SECTION 3: SIGN IN / OUT & STATE
   ============================================================ */
async function signInToGoogle() {
  try {
    await loadGoogleAPI();
    if (!tokenClient) {
      showToast('Google API লোড হচ্ছে... আবার চেষ্টা করুন', 'error');
      return;
    }
    isSilentRefresh = false;
    tokenClient.requestAccessToken({ prompt: 'consent' });
  } catch (err) {
    console.error(err);
    showToast('সাইন ইন ব্যর্থ হয়েছে', 'error');
  }
}

function signOutFromGoogle() {
  if (accessToken && window.google && google.accounts && google.accounts.oauth2) {
    try {
      google.accounts.oauth2.revoke(accessToken, () => {
        console.log('Token revoked');
      });
    } catch (e) {
      console.warn('Revoke failed:', e);
    }
  }
  saveConnectionState(false); // এটাই clearToken() ডাকে
  localStorage.removeItem(FIRST_LOGIN_KEY);
  updateSyncUI(false);
  showToast('সাইন আউট হয়েছে (ড্রাইভ সিঙ্ক বন্ধ)', 'success');
}

function saveConnectionState(isConnected) {
  if (isConnected) {
    localStorage.setItem(CONNECTED_KEY, 'true');
  } else {
    localStorage.removeItem(CONNECTED_KEY);
    clearToken();
  }
}

function getConnectionState() {
  return localStorage.getItem(CONNECTED_KEY) === 'true';
}

function getLastSyncTime() {
  return parseInt(localStorage.getItem(LAST_SYNC_KEY) || '0');
}

function setLastSyncTime() {
  localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
}

/* ============================================================
   SECTION 4: UI UPDATE
   ============================================================ */
function updateSyncUI(isConnected) {
  const splashBtn = document.getElementById('splashDriveBtn');
  const menuStatus = document.getElementById('driveMenuStatus');
  const menuConnectBtn = document.getElementById('driveConnectBtn');
  const menuDisconnectBtn = document.getElementById('driveDisconnectBtn');
  const menuSyncNowBtn = document.getElementById('driveSyncNowBtn');
  const menuRestoreBtn = document.getElementById('driveRestoreBtn');

  if (splashBtn) splashBtn.style.display = isConnected ? 'none' : 'flex';

  if (menuStatus) {
    if (isConnected) {
      const lastSync = getLastSyncTime();
      if (lastSync > 0) {
        const mins = Math.floor((Date.now() - lastSync) / 60000);
        let syncText;
        if (mins < 1) syncText = 'এইমাত্র';
        else if (mins < 60) syncText = mins + ' মিনিট আগে';
        else if (mins < 1440) syncText = Math.floor(mins / 60) + ' ঘণ্টা আগে';
        else syncText = Math.floor(mins / 1440) + ' দিন আগে';
        menuStatus.textContent = '✅ সংযুক্ত • শেষ সিঙ্ক: ' + syncText;
      } else {
        menuStatus.textContent = '✅ সংযুক্ত (অটো সিঙ্ক চালু)';
      }
      menuStatus.style.color = '#059669';
    } else {
      menuStatus.textContent = '❌ সংযুক্ত নয়';
      menuStatus.style.color = '#DC2626';
    }
  }

  if (menuConnectBtn) menuConnectBtn.style.display = isConnected ? 'none' : 'flex';
  if (menuDisconnectBtn) menuDisconnectBtn.style.display = isConnected ? 'flex' : 'none';
  if (menuSyncNowBtn) menuSyncNowBtn.style.display = isConnected ? 'flex' : 'none';
  if (menuRestoreBtn) menuRestoreBtn.style.display = isConnected ? 'flex' : 'none';
}

/* ============================================================
   SECTION 5: SYNC TRIGGERS
   ============================================================ */
function triggerAutoSync() {
  if (!getConnectionState()) return;
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    syncTimeout = null;
    uploadToDrive(false, 0, true);
  }, SYNC_DEBOUNCE_MS);
}

function triggerForceSync() {
  if (!getConnectionState()) return;
  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }
  uploadToDrive(false, 0, true);
}

/* ============================================================
   SECTION 6: FIND BACKUP FILE
   ============================================================ */
async function findBackupFile() {
  if (!accessToken) return null;
  if (findFileDepth > 2) { findFileDepth = 0; return null; }

  findFileDepth++;
  try {
    const q = encodeURIComponent(`name='${BACKUP_FILE_NAME}'`);
    const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,name,modifiedTime)`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      if (response.status === 401 && findFileDepth <= 2) {
        const isValid = await ensureValidToken();
        if (isValid) {
          return await findBackupFile();
        }
        saveConnectionState(false);
        updateSyncUI(false);
      }
      return null;
    }

    const data = await response.json();
    if (data.files && data.files.length > 0) {
      return { id: data.files[0].id, modifiedTime: data.files[0].modifiedTime };
    }
    return null;
  } catch (err) {
    console.warn('findBackupFile error:', err);
    return null;
  } finally {
    findFileDepth = Math.max(0, findFileDepth - 1);
  }
}

/* ============================================================
   SECTION 7: UPLOAD
   ============================================================ */
async function uploadToDrive(isManual = true, retryCount = 0, isBackground = false) {
  if (!getConnectionState()) return false;

  if (!navigator.onLine) {
    if (isManual) showToast('📴 ইন্টারনেট নেই — ইন্টারনেট এলে অটো সিঙ্ক হবে', 'warning');
    localStorage.setItem(PENDING_SYNC_KEY, 'true');
    return false;
  }

  // ব্যাকগ্রাউন্ড/অটো সিঙ্কে টোকেন না থাকলে পপআপ না খুলে চুপচাপ স্কিপ
  // (ম্যানুয়াল ছাড়া সাইলেন্ট রিফ্রেশও করব না)
  if ((!isManual || isBackground) && !hasLocalValidToken()) {
    localStorage.setItem(PENDING_SYNC_KEY, 'true');
    return false;
  }

  if (isSyncing) {
    pendingSync = true;
    return false;
  }

  let was401 = false;
  isSyncing = true;
  pendingSync = false;

  if (isManual) showToast('ব্যাকআপ আপলোড হচ্ছে...');

  let needsRetry = false;
  let retryDelay = 0;

  try {
    const tokenOk = await ensureValidToken();

    if (!tokenOk) {
      if (isManual && !isBackground) {
        showToast('সেশন শেষ — আবার সাইন ইন করুন', 'error');
      }
      saveConnectionState(false);
      updateSyncUI(false);
      return false;
    }

    if (typeof cleanOldTombstones === 'function') cleanOldTombstones();

    const backupData = exportAllData();
    backupData.tombstones = getTombstones();
    backupData.syncedAt = Date.now();

    const fileContent = JSON.stringify(backupData);
    const existing = await findBackupFile();

    if (!accessToken) return false;

    const metadata = { name: BACKUP_FILE_NAME, mimeType: 'application/json' };
    if (!existing) metadata.parents = ['appDataFolder'];

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([fileContent], { type: 'application/json' }));

    const url = existing
      ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    const method = existing ? 'PATCH' : 'POST';

    const response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });

    if (response.ok) {
      setLastSyncTime();
      updateSyncUI(true);
      localStorage.removeItem(PENDING_SYNC_KEY);

      if (typeof resetEntriesSinceBackup === 'function') resetEntriesSinceBackup();
      if (typeof setLastBackupTime === 'function') setLastBackupTime();
      if (typeof renderSyncStatusBar === 'function') renderSyncStatusBar();

      if (isManual) showToast('✅ গুগল ড্রাইভে সেভ হয়েছে', 'success');
    } else if (response.status === 401) {
      if (retryCount < MAX_UPLOAD_RETRIES) {
        needsRetry = true;
        retryDelay = 500;
        was401 = true;
      } else {
        saveConnectionState(false);
        updateSyncUI(false);
        if (isManual && !isBackground) {
          showToast('সেশন শেষ — আবার সাইন ইন করুন', 'error');
        }
      }
    } else if (response.status >= 500 && retryCount < MAX_UPLOAD_RETRIES) {
      needsRetry = true;
      retryDelay = 1000 * (retryCount + 1);
    } else if (isManual) {
      showToast('আপলোড ব্যর্থ (' + response.status + ')', 'error');
    }
  } catch (err) {
    console.error('Upload error:', err);
    if (isManual) showToast('আপলোড ব্যর্থ — ইন্টারনেট চেক করুন', 'error');
  } finally {
    isSyncing = false;
  }

  if (needsRetry) {
    if (retryDelay > 0) await new Promise(r => setTimeout(r, retryDelay));
    if (retryCount < MAX_UPLOAD_RETRIES) {
      if (was401) await refreshAccessToken();
      return uploadToDrive(isManual, retryCount + 1, isBackground);
    }
  }

  if (pendingSync) {
    pendingSync = false;
    setTimeout(() => uploadToDrive(false, 0, true), 500);
  }

  return true;
}

/* ============================================================
   SECTION 8: DOWNLOAD
   ============================================================ */
async function downloadFromDrive() {
  if (!getConnectionState()) {
    showToast('প্রথমে গুগলে সাইন ইন করুন', 'error');
    return;
  }

  const ok = await askConfirm(
    'ড্রাইভ থেকে ব্যাকআপ আনলে বর্তমান সব ডেটা মুছে যাবে। আপনি কি নিশ্চিত?',
    { title: 'ড্রাইভ থেকে রিস্টোর', icon: '📥', confirmLabel: 'হ্যাঁ, রিস্টোর', danger: true }
  );
  if (!ok) return;

  showLoading('ড্রাইভ থেকে ডেটা নামছে...');

  try {
    const tokenOk = await ensureValidToken();
    if (!tokenOk) {
      hideLoading();
      saveConnectionState(false);
      updateSyncUI(false);
      showToast('সেশন শেষ — আবার সাইন ইন করুন', 'error');
      return;
    }

    const existing = await findBackupFile();
    if (!existing) {
      hideLoading();
      showToast('ড্রাইভে কোনো ব্যাকআপ পাওয়া যায়নি', 'error');
      return;
    }

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${existing.id}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) throw new Error('Download failed: ' + response.status);

    const data = await response.json();
    await importAllData(data, false); // স্পষ্ট replace মোড
    setLastSyncTime();
    hideLoading();
    showToast('✅ রিস্টোর সফল হয়েছে', 'success');
    setTimeout(() => window.location.reload(), 1500);
  } catch (err) {
    hideLoading();
    console.error(err);
    showToast('ডাউনলোড ব্যর্থ হয়েছে', 'error');
  }
}

/* ============================================================
   SECTION 9: FORCE SYNC
   ============================================================ */
async function forceSyncNow() {
  if (!getConnectionState()) {
    showToast('প্রথমে গুগলে সাইন ইন করুন', 'error');
    return;
  }

  showLoading('ড্রাইভের সাথে সিঙ্ক হচ্ছে...');

  try {
    const tokenOk = await ensureValidToken();
    if (!tokenOk) {
      hideLoading();
      saveConnectionState(false);
      updateSyncUI(false);
      showToast('সেশন শেষ — আবার সাইন ইন করুন', 'error');
      return;
    }

    const existing = await findBackupFile();

    if (existing) {
      try {
        const response = await fetch(
          `https://www.googleapis.com/drive/v3/files/${existing.id}?alt=media`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (response.ok) {
          const driveData = await response.json();
          await mergeLocalAndDriveData(driveData);
        }
      } catch (mergeErr) {
        console.warn('Merge failed, continuing with upload:', mergeErr);
      }
    }

    const uploaded = await uploadToDrive(false, 0, true);

    hideLoading();

    if (uploaded) {
      updateSyncUI(true);
      if (typeof renderSyncStatusBar === 'function') renderSyncStatusBar();
      showToast('✅ ড্রাইভের সাথে সিঙ্ক সম্পন্ন হয়েছে', 'success');
    } else {
      showToast('সিঙ্ক সম্পূর্ণ হয়নি — আবার চেষ্টা করুন', 'warning');
    }
  } catch (err) {
    hideLoading();
    console.error('forceSyncNow error:', err);
    showToast('সিঙ্ক ব্যর্থ — ইন্টারনেট চেক করুন', 'error');
  }
}

window.forceSyncNow = forceSyncNow;

/* ============================================================
   SECTION 10: FIRST LOGIN HANDLING
   ============================================================ */
async function handleFirstLogin() {
  const lastSync = getLastSyncTime();

  // আগে কখনো সিঙ্ক না হলে তবেই ফুল প্রথম-লগইন লজিক
  if (lastSync > 0) return;

  const existing = await findBackupFile();

  if (!existing) {
    await uploadToDrive(true);
    return;
  }

  const hasLocalData = getBooks().length > 0;

  if (!hasLocalData) {
    await checkDriveBackupOnLogin();
    return;
  }

  const wantsMerge = await askConfirm(
    'আপনার ফোনে এবং গুগল ড্রাইভে ডেটা আছে। কী করতে চান?\n\n' +
    '✓ দুটো মিলিয়ে নিন (নিরাপদ — কিছুই হারাবে না)\n' +
    '✗ শুধু ড্রাইভ ব্যবহার করুন (ফোনের ডেটা মুছে যাবে)',
    {
      title: 'ডেটা কীভাবে একত্রিত করবেন?',
      icon: '🔄',
      confirmLabel: 'মিলিয়ে নিন',
      cancelLabel: 'ড্রাইভ দিয়ে প্রতিস্থাপন',
      danger: false
    }
  );

  if (wantsMerge) {
    await checkDriveBackupOnLogin();
  } else {
    // ইউজার "ড্রাইভ ব্যবহার" চাপল — এখন স্পষ্টভাবে জিজ্ঞেস করি
    // (আগে ডায়ালগে লেখা ছিল "ফোনের ডেটা মুছবে না", কিন্তু এখানে replace হয়)
    const replaceConfirm = await askConfirm(
      'সতর্কতা: ড্রাইভের ডেটা ব্যবহার করলে ফোনে থাকা বর্তমান সব বুক ও এন্ট্রি মুছে যাবে।\n\n' +
      'আপনি কি নিশ্চিত?',
      {
        title: 'ডেটা প্রতিস্থাপন',
        icon: '⚠️',
        confirmLabel: 'হ্যাঁ, ড্রাইভ দিয়ে প্রতিস্থাপন',
        cancelLabel: 'বাতিল',
        danger: true
      }
    );

    if (!replaceConfirm) return;

    const existingAgain = await findBackupFile();
    if (!existingAgain) {
      await uploadToDrive(true);
      return;
    }
    try {
      const resp = await fetch(
        `https://www.googleapis.com/drive/v3/files/${existingAgain.id}?alt=media`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (resp.ok) {
        const driveData = await resp.json();
        await importAllData(driveData, false); // replace মোড
        setLastSyncTime();
        showToast('✅ ড্রাইভের ডেটা ব্যবহার করা হয়েছে', 'success');
        setTimeout(() => window.location.reload(), 1200);
      } else {
        showToast('ড্রাইভ থেকে ডেটা আনা যায়নি', 'error');
      }
    } catch (e) {
      console.error(e);
      showToast('ড্রাইভ থেকে ডেটা আনা যায়নি', 'error');
    }
  }
}

/* ============================================================
   SECTION 11: MERGE LOGIC
   ============================================================ */
async function checkDriveBackupOnLogin() {
  if (!accessToken) return;

  const existing = await findBackupFile();

  if (!existing) {
    await uploadToDrive(true);
    return;
  }

  showLoading('ডেটা একত্রিত করা হচ্ছে...');

  try {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${existing.id}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) throw new Error('Download failed');

    const driveData = await response.json();
    await mergeLocalAndDriveData(driveData);

    hideLoading();
    await uploadToDrive(false);
    showToast('✅ ডেটা একত্রিত হয়েছে', 'success');
  } catch (err) {
    hideLoading();
    console.error(err);
    showToast('একত্রিত করা যায়নি — ফোনের ডেটা আপলোড হচ্ছে', 'warning');
    await uploadToDrive(true);
  }
}

async function mergeLocalAndDriveData(driveData) {
  if (!driveData || !Array.isArray(driveData.books)) return;

  const localBooks = getBooks();
  const tombstones = getTombstones();

  if (driveData.tombstones) {
    Object.keys(driveData.tombstones.books || {}).forEach(id => {
      if (!tombstones.books[id] || tombstones.books[id] < driveData.tombstones.books[id]) {
        tombstones.books[id] = driveData.tombstones.books[id];
      }
    });
    Object.keys(driveData.tombstones.entries || {}).forEach(id => {
      if (!tombstones.entries[id] || tombstones.entries[id] < driveData.tombstones.entries[id]) {
        tombstones.entries[id] = driveData.tombstones.entries[id];
      }
    });
    saveTombstones(tombstones);
  }

  const localBookMap = new Map(localBooks.map(b => [b.id, b]));

  for (const driveBook of driveData.books) {
    if (tombstones.books[driveBook.id]) continue;

    const localBook = localBookMap.get(driveBook.id);

    if (!localBook) {
      await addBook(driveBook);
      if (Array.isArray(driveBook.entries)) {
        const filtered = driveBook.entries.filter(e => !tombstones.entries[e.id]);
        await saveEntries(driveBook.id, filtered);
      }
    } else {
      const localUpdated = localBook.updatedAt || localBook.createdAt || 0;
      const driveUpdated = driveBook.updatedAt || driveBook.createdAt || 0;

      if (driveUpdated > localUpdated) {
        await updateBook(localBook.id, {
          name: driveBook.name,
          icon: driveBook.icon,
          color: driveBook.color,
          fields: driveBook.fields || localBook.fields,
          summaryCards: driveBook.summaryCards || localBook.summaryCards,
          type: driveBook.type || localBook.type || 'normal',
          parentId: driveBook.parentId !== undefined ? driveBook.parentId : (localBook.parentId || null),
          chartSections: driveBook.chartSections || localBook.chartSections || [],
          dashboardCards: driveBook.dashboardCards || localBook.dashboardCards || [],
          order: driveBook.order !== undefined ? driveBook.order : localBook.order,
          updatedAt: Date.now()
        });
      }

      const localEntries = getEntries(localBook.id);
      const driveEntries = driveBook.entries || [];
      const localEntryMap = new Map(localEntries.map(e => [e.id, e]));
      const mergedEntries = [...localEntries];

      driveEntries.forEach(driveEntry => {
        if (tombstones.entries[driveEntry.id]) return;

        const localEntry = localEntryMap.get(driveEntry.id);

        if (!localEntry) {
          // 👇 bookId বাদ দিয়ে পুশ করি
          const { bookId: _bid, ...entryData } = driveEntry;
          mergedEntries.push({
            ...entryData,
            updatedAt: driveEntry.updatedAt || driveEntry.createdAt || Date.now()
          });
        } else {
          const localTime = localEntry.updatedAt || localEntry.createdAt || 0;
          const driveTime = driveEntry.updatedAt || driveEntry.createdAt || 0;
          if (driveTime > localTime) {
            const idx = mergedEntries.findIndex(e => e.id === driveEntry.id);
            if (idx >= 0) {
              // 👇 bookId বাদ দিয়ে আপডেট করি
              const { bookId: _bid, ...entryData } = driveEntry;
              mergedEntries[idx] = {
                ...entryData,
                updatedAt: driveTime
              };
            }
          }
        }
      });

      await saveEntries(localBook.id, mergedEntries);
    }
  }
}

/* ============================================================
   SECTION 12: INIT & LIFECYCLE
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  updateSyncUI(getConnectionState());
  if (typeof cleanOldTombstones === 'function') cleanOldTombstones();

  if (!navigator.onLine) {
    console.log('📴 অফলাইন — Google API লোড করা হচ্ছে না');
    return;
  }

  try {
    await loadGoogleAPI();
  } catch (e) {
    console.warn('Google API not loaded:', e.message);
    return;
  }

  if (!getConnectionState()) return;

  // বৈধ লোকাল টোকেন থাকলে রিফ্রেশ দরকার নেই
  if (hasLocalValidToken()) {
    accessToken = localStorage.getItem('likhipata_access_token');
    tokenExpiry = parseInt(localStorage.getItem('likhipata_token_expiry') || '0');
    return;
  }

  // সাইলেন্ট রিফ্রেশ চেষ্টা
  if (tokenClient) {
    try {
      isSilentRefresh = true;
      tokenClient.requestAccessToken({ prompt: '' });
    } catch (e) {
      isSilentRefresh = false;
      console.warn('Silent refresh failed:', e);
      saveConnectionState(false);
      updateSyncUI(false);
    }
  }
});

function safeBackgroundUpload() {
  if (!getConnectionState() || !navigator.onLine) return;

  // ব্যাকগ্রাউন্ডে সাইলেন্ট রিফ্রেশ বা পপআপ একেবারেই চাই না।
  // টোকেন এখনই বৈধ না হলে শুধু পেন্ডিং ফ্ল্যাগ সেট করি।
  if (!hasLocalValidToken()) {
    localStorage.setItem(PENDING_SYNC_KEY, 'true');
    return;
  }

  if (!accessToken) {
    accessToken = localStorage.getItem('likhipata_access_token');
    tokenExpiry = parseInt(localStorage.getItem('likhipata_token_expiry') || '0');
  }

  // isBackground = true → টোকেন থাকলেই আপলোড, নাহলে স্কিপ
  uploadToDrive(false, 0, true);
}

window.addEventListener('pagehide', safeBackgroundUpload);
window.addEventListener('beforeunload', safeBackgroundUpload);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') safeBackgroundUpload();
});

// ইন্টারনেট ফিরলে পেন্ডিং সিঙ্ক চেষ্টা
window.addEventListener('online', () => {
  if (localStorage.getItem(PENDING_SYNC_KEY) === 'true' && getConnectionState()) {
    console.log('🔄 ইন্টারনেট ফিরেছে — পেন্ডিং সিঙ্ক চালাচ্ছি...');
    setTimeout(() => uploadToDrive(false, 0, true), 1500);
  }
});

// প্রতি ৫ মিনিটে অটো-সিঙ্ক (শুধু বৈধ টোকেন থাকলে, সাইলেন্ট রিফ্রেশ ছাড়া)
setInterval(() => {
  if (!getConnectionState() || !navigator.onLine) return;
  if (document.visibilityState !== 'visible') return;
  if (!hasLocalValidToken()) return;
  uploadToDrive(false, 0, true);
}, 5 * 60 * 1000);

window.recordBookTombstone = function(bookId) {
  if (typeof recordTombstone === 'function') recordTombstone('book', bookId);
};

window.recordEntryTombstone = function(entryId) {
  if (typeof recordTombstone === 'function') recordTombstone('entry', entryId);
};