/* ============================================================
   লিখিপাতা — Sync Status Bar + Header Sync Button (Fixed)
   ============================================================ */

function updateHeaderSyncBtn() {
  const btn = document.getElementById('headerSyncBtn');
  if (!btn) return;

  const connected = (typeof getConnectionState === 'function') && getConnectionState();
  const lastSync = (typeof getLastSyncTime === 'function') ? getLastSyncTime() : 0;

  let icon, text;
  if (!connected) {
    icon = '☁️';
    text = 'সাইন ইন';
  } else if (lastSync > 0) {
    icon = '✅';
    text = 'সিঙ্কড';
  } else {
    icon = '✅';
    text = 'সংযুক্ত';
  }

  const iconEl = btn.querySelector('.sync-icon');
  const textEl = btn.querySelector('.sync-text');
  if (iconEl) iconEl.textContent = icon;
  if (textEl) textEl.textContent = text;
  btn.classList.toggle('connected', connected);
}

/* ============ হেডার সিঙ্ক বাটনে ক্লিক ============ */
function handleHeaderSyncClick() {
  // 👇 নতুন: অফলাইন হলে আগে চেক
  if (!navigator.onLine) {
    showToast('📴 অফলাইনে আছেন — ইন্টারনেট এলে আবার চেষ্টা করুন', 'warning');
    return;
  }

  const connected = (typeof getConnectionState === 'function') && getConnectionState();

  if (!connected) {
    if (typeof signInToGoogle === 'function') {
      signInToGoogle();
    } else {
      showToast('Google API লোড হচ্ছে... আবার চেষ্টা করুন', 'error');
    }
  } else {
    if (typeof isSyncing !== 'undefined' && isSyncing) {
      showToast('সিঙ্ক ইতিমধ্যে চলছে, অপেক্ষা করুন...', 'info');
      return;
    }

    if (typeof forceSyncNow === 'function') {
      forceSyncNow();
    } else {
      showToast('সিঙ্ক ফাংশন লোড হয়নি', 'error');
    }
  }
}

/* ============ স্ক্রিনের ভেতরের সিঙ্ক বার ============ */
function renderSyncStatusBar() {
  const container = document.getElementById('syncStatusBar');
  if (!container) return;

  const connected = (typeof getConnectionState === 'function') && getConnectionState();
  const lastSync = (typeof getLastSyncTime === 'function') ? getLastSyncTime() : 0;
  const pending = (typeof getEntriesSinceBackup === 'function') ? getEntriesSinceBackup() : 0;
  const online = navigator.onLine;  // 👈 নতুন

  let icon, text, btnText, btnAction, extraClass;

  if (!online) {
    // 👇 নতুন: অফলাইন স্ট্যাটাস সবার আগে
    icon = '📴';
    text = connected ? 'অফলাইন • ডেটা লোকালি সেভ হচ্ছে' : 'অফলাইন মোড';
    btnText = '📴 অফলাইন';
    btnAction = 'showToast(\'ইন্টারনেট এলে আবার চেষ্টা করুন\', \'info\')';
    extraClass = 'sync-bar-pending';
  } else if (!connected) {
    icon = '☁️';
    text = 'গুগল ড্রাইভ সিঙ্ক বন্ধ';
    btnText = '🔗 কানেক্ট করুন';
    btnAction = 'signInToGoogle()';
    extraClass = 'sync-bar-disconnected';
  } else if (pending > 0) {
    icon = '⚠️';
    text = `${toBn(pending)}টি এন্ট্রি সিঙ্ক হয়নি`;
    btnText = '🔄 এখনই সিঙ্ক';
    btnAction = 'handleHeaderSyncClick()';
    extraClass = 'sync-bar-pending';
  } else if (lastSync > 0) {
    icon = '✅';
    text = 'শেষ সিঙ্ক: ' + formatRelativeTime(lastSync);
    btnText = '🔄 সিঙ্ক';
    btnAction = 'handleHeaderSyncClick()';
    extraClass = 'sync-bar-connected';
  } else {
    icon = '✅';
    text = 'ড্রাইভ সংযুক্ত';
    btnText = '🔄 সিঙ্ক করুন';
    btnAction = 'handleHeaderSyncClick()';
    extraClass = 'sync-bar-connected';
  }

  container.className = 'sync-status-bar ' + extraClass;
  container.innerHTML = `
    <div class="sync-bar-left">
      <span class="sync-bar-icon">${icon}</span>
      <span class="sync-bar-text">${text}</span>
    </div>
    <button type="button" class="sync-bar-btn">${btnText}</button>
  `;

  const actionBtn = container.querySelector('.sync-bar-btn');
  if (actionBtn) {
    if (!online) {
      actionBtn.onclick = () => showToast('ইন্টারনেট এলে আবার চেষ্টা করুন', 'info');
    } else if (!connected) {
      actionBtn.onclick = () => signInToGoogle();
    } else {
      actionBtn.onclick = () => handleHeaderSyncClick();
    }
  }

  updateHeaderSyncBtn();
}

function formatRelativeTime(ts) {
  if (!ts) return 'কখনো না';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'এইমাত্র';
  if (mins < 60) return toBn(mins) + ' মিনিট আগে';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return toBn(hours) + ' ঘণ্টা আগে';
  const days = Math.floor(hours / 24);
  if (days < 7) return toBn(days) + ' দিন আগে';
  return toBn(Math.floor(days / 7)) + ' সপ্তাহ আগে';
}

let _syncInterval = null;

function initSyncStatusBar() {
  renderSyncStatusBar();
  if (_syncInterval) clearInterval(_syncInterval); 
  _syncInterval = setInterval(renderSyncStatusBar, 30000);
}

// 👇 নতুন: অনলাইন/অফলাইন হলে সিঙ্ক বার আপডেট
window.addEventListener('online', () => {
  if (typeof renderSyncStatusBar === 'function') renderSyncStatusBar();
  if (typeof showToast === 'function') showToast('✅ ইন্টারনেট ফিরে এসেছে', 'success');
});

window.addEventListener('offline', () => {
  if (typeof renderSyncStatusBar === 'function') renderSyncStatusBar();
  if (typeof showToast === 'function') showToast('📴 আপনি এখন অফলাইনে', 'warning');
});

window.renderSyncStatusBar = renderSyncStatusBar;
window.initSyncStatusBar = initSyncStatusBar;
window.formatRelativeTime = formatRelativeTime;
window.handleHeaderSyncClick = handleHeaderSyncClick;
window.updateHeaderSyncBtn = updateHeaderSyncBtn;