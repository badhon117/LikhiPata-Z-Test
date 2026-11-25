/* ============================================================
   লিখিপাতা — Smart Backup Notification Manager
   
   ✅ এন্ট্রি-ভিত্তিক নোটিফিকেশন (কোনো অটো-ডাউনলোড নেই)
   ✅ Snooze সিস্টেম
   ✅ ইউজার-ফ্রেন্ডলি বার্তা
   ✅ config.js না থাকলে ডিফল্ট ৫০ ব্যবহার করবে
   ============================================================ */

const BACKUP_KEY_SNOOZE = 'likhipata_backup_snoozed_until';
const BACKUP_KEY_LAST_NOTIFIED = 'likhipata_last_notified_count';

/* ============ স্নুজ চেক ============ */
function isSnoozed() {
  const until = parseInt(localStorage.getItem(BACKUP_KEY_SNOOZE) || '0');
  return Date.now() < until;
}

function snoozeNotifications() {
  const hours = (window.APP_CONFIG && window.APP_CONFIG.snoozeHours) || 24;
  const until = Date.now() + (hours * 60 * 60 * 1000);
  localStorage.setItem(BACKUP_KEY_SNOOZE, String(until));
}

/* ============ নোটিফিকেশন চেক ============ */
function shouldShowBackupNotification() {
  if (isSnoozed()) return false;

  const config = window.APP_CONFIG || {};
  const threshold = config.notifyEntries || 50;
  const entriesSince = getEntriesSinceBackup();

  if (entriesSince < threshold) return false;

  // আগে একই কাউন্টে নোটিফাই করেছি কিনা
  const lastNotified = parseInt(localStorage.getItem(BACKUP_KEY_LAST_NOTIFIED) || '0');
  if (lastNotified === entriesSince) return false;

  localStorage.setItem(BACKUP_KEY_LAST_NOTIFIED, String(entriesSince));
  return true;
}

/* ============ নোটিফিকেশন দেখাও ============ */
function showBackupNotification() {
  if (!shouldShowBackupNotification()) return;

  const entriesSince = getEntriesSinceBackup();
  const strip = document.getElementById('backupAlertStrip');
  if (!strip) return;

  // বার্তা তৈরি
  let title, message;
  
  if (entriesSince >= 100) {
    title = `🔔 আপনার ${toBn(entriesSince)}টি এন্ট্রি অরক্ষিত!`;
    message = 'ফোন হারালে বা ব্রাউজার ক্লিয়ার করলে সব মুছে যাবে। এখনই ব্যাকআপ নিন।';
  } else {
    title = `🔔 ${toBn(entriesSince)}টি নতুন এন্ট্রি যোগ হয়েছে!`;
    message = 'ব্যাকআপ না নিলে দুর্ঘটনায় সব ডেটা মুছে যেতে পারে।';
  }

  strip.innerHTML = `
    <div class="backup-alert-content">
      <div class="backup-alert-text">
        <strong>${title}</strong>
        <p>${message}</p>
      </div>
      <div class="backup-alert-actions">
        <button class="backup-alert-btn-primary" onclick="manualBackupFromAlert()">
          💾 এখনই ব্যাকআপ
        </button>
        <button class="backup-alert-btn-secondary" onclick="dismissBackupAlert()">
          পরে
        </button>
      </div>
    </div>
  `;
  strip.style.display = 'block';
}

function dismissBackupAlert() {
  snoozeNotifications();
  const strip = document.getElementById('backupAlertStrip');
  if (strip) strip.style.display = 'none';
}

function manualBackupFromAlert() {
  downloadBackupFromNotification();
  dismissBackupAlert();
}

/* ============ ব্যাকআপ ডাউনলোড (ইউজার ক্লিকে) ============ */
function downloadBackupFromNotification() {
  const data = exportAllData();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const now = new Date();
  const dateStr = now.getFullYear() + '-' + 
                  String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                  String(now.getDate()).padStart(2, '0');
  const timeStr = String(now.getHours()).padStart(2, '0') + 
                  String(now.getMinutes()).padStart(2, '0');
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `likhipata-backup-${dateStr}-${timeStr}.json`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);

  resetEntriesSinceBackup();
  setLastBackupTime();

  if (typeof showToast === 'function') {
    showToast('✅ ব্যাকআপ ডাউনলোড হয়েছে', 'success');
  }
}

/* ============ মোট এন্ট্রি কাউন্ট ============ */
function getAllEntriesCount() {
  const books = getBooks();
  let total = 0;
  books.forEach(b => {
    total += getEntries(b.id).length;
  });
  return total;
}

/* ============ হুক: এন্ট্রি সেভ হলে কল হবে ============ */
function onEntryAdded() {
  incrementEntriesSinceBackup(1);
  showBackupNotification();
}

/* ============ Init (পেজ লোডে) ============ */
function initBackupManager() {
  // পেজ লোডে একবার চেক (যদি আগের এন্ট্রি থেকে নোটিফিকেশন বাকি থাকে)
  setTimeout(() => {
    showBackupNotification();
  }, 1000);
}

window.onEntryAdded = onEntryAdded;
window.downloadBackupFromNotification = downloadBackupFromNotification;
window.showBackupNotification = showBackupNotification;
window.initBackupManager = initBackupManager;
window.manualBackupFromAlert = manualBackupFromAlert;
window.dismissBackupAlert = dismissBackupAlert;