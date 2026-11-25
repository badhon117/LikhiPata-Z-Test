/* ============================================================
   লিখিপাতা — Dashboard Logic v3 (IndexedDB ready)
   ============================================================ */

let editingBookId = null;

document.addEventListener('DOMContentLoaded', async () => {
  // ১. প্রথমে IndexedDB লোড হওয়া পর্যন্ত অপেক্ষা করি
  if (typeof initStorage === 'function') {
    try {
      await initStorage();
      console.log('✅ Storage initialized');
    } catch (e) {
      console.error('Storage init failed:', e);
    }
  }

  // ২. এরপর থিম ও UI রেন্ডার করি
  applyTheme(getTheme());

  if (typeof initSyncStatusBar === 'function') {
    setTimeout(() => initSyncStatusBar(), 500);
  }
  if (typeof initBackupManager === 'function') {
    setTimeout(() => initBackupManager(), 1500);
  }

  // 👇 স্প্ল্যাশ কন্ট্রোল: শুধু অ্যাপ প্রথমবার খোলার সময় দেখাবে
  // window.name ব্যবহার করছি — একই ট্যাবে নেভিগেশনে বজায় থাকে,
  // নতুন ট্যাব বা অ্যাপ নতুন করে খুললে রিসেট হয়
  const splash = document.getElementById('splashScreen');
  
  if (window.name === 'likhipata_session_active') {
    // 👈 এই ট্যাবে অ্যাপ আগেই খোলা হয়েছে → স্প্ল্যাশ দেখাবে না
    if (splash) splash.classList.add('hidden');
  } else {
    // 👈 নতুন সেশন → স্প্ল্যাশ দেখাবে
    window.name = 'likhipata_session_active';
    
    // ড্রাইভ কানেক্টেড থাকলে ২ সেকেন্ড পর অটো-হাইড
    if (localStorage.getItem('likhipata_drive_connected') === 'true') {
      setTimeout(() => {
        if (splash && !splash.classList.contains('hidden')) {
          splash.classList.add('hidden');
        }
      }, 2000);
    }
  }

  // 👇 প্রথমবার ইনস্টল হলে ইউজারকে জানাই
if (!localStorage.getItem('likhipata_offline_tip_shown')) {
  setTimeout(() => {
    if (typeof showToast === 'function') {
      showToast(
        '💡 হোম স্ক্রিনে অ্যাড করে রাখলে ইন্টারনেট ছাড়াই ব্যবহার করতে পারবেন',
        'info',
        {
          label: 'ঠিক আছে',
          onClick: () => localStorage.setItem('likhipata_offline_tip_shown', 'true')
        }
      );
    }
  }, 3000);
}

  await checkWipeVaultExpiry();
  initWipeCountdownUI();
  renderBooks();
  attachEvents();
});





function hideSplash() {
  const splash = document.getElementById('splashScreen');
  if (splash) splash.classList.add('hidden');
}

function skipSplash() {
  hideSplash();
}


/* ============ Render ============ */
function renderBooks() {
  // 👇 নতুন লজিক: শুধু মূল বইগুলো (যাদের parentId নেই বা null/খালি) দেখাব
  let books = getBooks().filter(b => !b.parentId || b.parentId === null || b.parentId === '');

  const list = document.getElementById('booksList');
  const empty = document.getElementById('emptyState');
  const countBadge = document.getElementById('bookCount');
  const statBooks = document.getElementById('statBooks');
  const statEntries = document.getElementById('statEntries');

  
  // 👇 নতুন লজিক: order অনুযায়ী সাজানো (যার order ছোট, সে আগে থাকবে)
books.sort((a, b) => {
  const orderA = a.order !== undefined ? a.order : 999999; // পুরোনো বুকের জন্য ডিফল্ট
  const orderB = b.order !== undefined ? b.order : 999999;
  
  if (orderA !== orderB) return orderA - orderB;
  return (b.createdAt || 0) - (a.createdAt || 0); // order সমান হলে নতুন আগে
});

  let totalEntries = 0;
  books.forEach(b => { totalEntries += getEntries(b.id).length; });
  if (statBooks) statBooks.textContent = toBn(books.length);
  if (statEntries) statEntries.textContent = toBn(totalEntries);
  if (countBadge) countBadge.textContent = toBn(books.length) + 'টি';

  if (books.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';


    list.innerHTML = books.map((book, index) => {
  const entryCount = getEntries(book.id).length;
      
const isDashboard = book.type === 'dashboard';
const iconDisplay = isDashboard ? '📊' : (book.icon || '📘');

// 👇 নতুন লজিক: সাব-বুকের সংখ্যা যোগ করি (আগেই লোড করা books থেকে)
const subBookCount = books.filter(b => b.parentId === book.id).length;
const subBookText = subBookCount > 0 ? ` • ${toBn(subBookCount)}টি সাব-বুক` : '';

const metaDisplay = isDashboard 
? `📊 ড্যাশবোর্ড বুক • ${toBn((book.dashboardCards || []).length)}টি কার্ড`
: `${toBn(entryCount)}টি এন্ট্রি • ${Array.isArray(book.fields) ? toBn(book.fields.length) + 'টি ফিল্ড' : 'শূন্য ফিল্ড'}${subBookText}`;

return `
  <div class="book-card-wrapper" id="book-wrapper-${book.id}">
    <!-- মূল বুক কার্ড -->
    <div class="book-card" onclick="openBook('${book.id}')">
      <div class="book-icon" style="background:${book.color || 'linear-gradient(135deg,#DBEAFE,#BFDBFE)'}">
        ${iconDisplay}
      </div>
      <div class="book-info">
          <h3>${escapeHtml(book.name)}</h3>
            <p>${metaDisplay}</p>
        </div>
        <div class="book-actions" onclick="event.stopPropagation()">
          <button class="book-action-btn" onclick="toggleBookMenu('${book.id}')" title="মেনু">⋮</button>
        </div>
      </div>
      
      <!-- এক্সপ্যান্ডেবল মেনু (প্রথমে হাইড থাকবে) -->
      <div class="book-menu-panel" id="book-menu-${book.id}">
        <button class="menu-icon-btn" onclick="moveBookOrder('${book.id}', -1)" title="উপরে তুলুন" ${index === 0 ? 'disabled style="opacity:0.3;"' : ''}>↑</button>
        <button class="menu-icon-btn" onclick="moveBookOrder('${book.id}', 1)" title="নিচে নামান" ${index === books.length - 1 ? 'disabled style="opacity:0.3;"' : ''}>↓</button>
        <button class="menu-icon-btn copy-btn" onclick="duplicateBook('${book.id}')" title="ডুপ্লিকেট">📋</button>         
        <button class="menu-icon-btn edit-btn" onclick="openEditBookModal('${book.id}')" title="এডিট">✏️</button>
        <button class="menu-icon-btn del-btn" onclick="deleteBookConfirm('${book.id}')" title="ডিলিট">🗑️</button>
      </div>
    </div>
  `;
}).join('');
}

/* ============ Navigation ============ */

/* ============ Navigation ============ */
function openBook(bookId) {
  // book.type চেক করে সঠিক পেজে পাঠাই
  const book = getBook(bookId);
  if (!book) {
    showToast('বুক পাওয়া যায়নি', 'error');
    return;
  }
  
  // যদি বুকের type 'dashboard' হয়, তবে সরাসরি view.html-এ যাবে
  if (book.type === 'dashboard') {
    window.location.href = 'view.html?book=' + bookId;
    return;
  }
  
  // অন্যথায়, sub-books.html-এ পাঠাই
  window.location.href = 'sub-books.html?parent=' + bookId;
}

function openBuilder(bookId) { window.location.href = 'builder.html?book=' + bookId; }

/* ============ Book Create / Edit ============ */
function openCreateBookModal() {
  editingBookId = null;
  document.getElementById('bookModalTitle').textContent = 'নতুন বুক তৈরি করুন';
  document.getElementById('bookNameInput').value = '';
  document.getElementById('bookIconInput').value = '📘';
  selectColor('linear-gradient(135deg,#DBEAFE,#BFDBFE)');
  document.getElementById('bookTypeInput').value = 'normal'; // 👈 নতুন লাইন
  document.getElementById('bookModal').classList.add('open');
  setTimeout(() => document.getElementById('bookNameInput').focus(), 200);
}

function openEditBookModal(bookId) {
  // 👇 মেনু বন্ধ করে দাও
document.querySelectorAll('.book-menu-panel').forEach(m => m.classList.remove('open'));
  const book = getBook(bookId);
  if (!book) return;
  editingBookId = bookId;
  document.getElementById('bookModalTitle').textContent = 'বুক এডিট করুন';
  document.getElementById('bookNameInput').value = book.name;
  document.getElementById('bookIconInput').value = book.icon || '📘';
  selectColor(book.color || 'linear-gradient(135deg,#DBEAFE,#BFDBFE)');
  document.getElementById('bookTypeInput').value = book.type || 'normal'; // 👈 নতুন লাইন
  document.getElementById('bookModal').classList.add('open');
}

function closeBookModal() {
  document.getElementById('bookModal').classList.remove('open');
  editingBookId = null;
}

function selectColor(color) {
  document.getElementById('bookColorInput').value = color;
  
  // ফিক্সড কালার বাটনগুলোর active স্টেট আপডেট
  document.querySelectorAll('.color-option').forEach(el => {
    el.classList.toggle('active', el.dataset.color === color);
  });

  // আইকন ইনপুটের ব্যাকগ্রাউন্ড আপডেট
  const iconInput = document.getElementById('bookIconInput');
  if (iconInput) {
    iconInput.style.background = color;
    iconInput.style.borderColor = 'transparent';
    iconInput.style.textShadow = '0 2px 4px rgba(0,0,0,0.2)';
  }
}

// 👇 কাস্টম কালার সিলেক্ট করার ফাংশন
function applyCustomColor(hexColor) {
  if (!hexColor) return;
  // আমরা একটি সুন্দর গ্রেডিয়েন্ট তৈরি করি পছন্দের রঙ থেকে
  const gradient = `linear-gradient(135deg, ${hexColor}, ${adjustColorHex(hexColor, -20)})`;
  selectColor(gradient);
}

// হেল্পার ফাংশন: হেক্স কালার গাঢ় করার জন্য
function adjustColorHex(hex, percent) {
  try {
    let R = parseInt(hex.substring(1, 3), 16);
    let G = parseInt(hex.substring(3, 5), 16);
    let B = parseInt(hex.substring(5, 7), 16);
    R = Math.max(0, Math.min(255, parseInt(R * (100 + percent) / 100)));
    G = Math.max(0, Math.min(255, parseInt(G * (100 + percent) / 100)));
    B = Math.max(0, Math.min(255, parseInt(B * (100 + percent) / 100)));
    const RR = R.toString(16).padStart(2, '0');
    const GG = G.toString(16).padStart(2, '0');
    const BB = B.toString(16).padStart(2, '0');
    return '#' + RR + GG + BB;
  } catch (e) {
    return hex;
  }
}

async function saveBook() {
  const name = document.getElementById('bookNameInput').value.trim();
  const icon = document.getElementById('bookIconInput').value.trim() || '📘';
  const color = document.getElementById('bookColorInput').value;
  const type = document.getElementById('bookTypeInput').value;

  if (!name) {
    showToast('বুকের নাম লিখুন', 'error');
    return;
  }

  if (editingBookId) {
    const ok = await updateBook(editingBookId, { name, icon, color, type });
    if (!ok) { showToast('আপডেট ব্যর্থ', 'error'); return; }
    showToast('বুক আপডেট হয়েছে', 'success');
  } else {
    const newBook = {
      id: generateId('book'),
      name,
      icon,
      color,
      type: type,
      parentId: null,
      fields: [],
      summaryCards: [],
      dashboardCards: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    const ok = await addBook(newBook);
    if (!ok) { showToast('তৈরি ব্যর্থ', 'error'); return; }
    showToast('নতুন বুক তৈরি হয়েছে', 'success');
  }

  closeBookModal();
  renderBooks();
}

async function deleteBookConfirm(bookId) {
  // 👇 মেনু বন্ধ করে দাও
document.querySelectorAll('.book-menu-panel').forEach(m => m.classList.remove('open'));
  const book = getBook(bookId);
  if (!book) return;
  const entries = getEntries(bookId);
  let msg = `"${book.name}" বুকটি রিসাইকেল বিনে পাঠাবেন?`;
  if (entries.length > 0) {
    msg += ` এই বুকের ${toBn(entries.length)}টি এন্ট্রিও একসাথে যাবে!`;
  }
  const ok = await askConfirm(msg, {
    title: 'বুক ডিলিট',
    icon: '🗑️',
    confirmLabel: 'হ্যাঁ, ডিলিট',
    danger: true
  });
  if (!ok) return;

  const deleted = await deleteBook(bookId);
  if (deleted) {
    showToast('বুক রিসাইকেল বিনে পাঠানো হয়েছে', 'success');
    renderBooks();
  } else {
    showToast('ডিলিট ব্যর্থ', 'error');
  }
}

/* ============ Menu ============ */
function openMenu() {
  document.getElementById('menuOverlay').classList.add('open');
  document.getElementById('menuPanel').classList.add('open');
}
function closeMenu() {
  document.getElementById('menuOverlay').classList.remove('open');
  document.getElementById('menuPanel').classList.remove('open');
}

function openThemeModal() {
  closeMenu();
  document.getElementById('themeModal').classList.add('open');
  const current = getTheme();
  document.querySelectorAll('.theme-choice').forEach(el => {
    el.classList.toggle('active', el.dataset.theme === current);
  });
}
function closeThemeModal() { document.getElementById('themeModal').classList.remove('open'); }
function setThemeAndClose(theme) {
  saveTheme(theme);
  closeThemeModal();
  showToast('থিম পরিবর্তন হয়েছে', 'success');
}

/* ============ Backup ============ */
function downloadBackup() {
  const data = exportAllData();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'zara-app-backup-' + todayISO() + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('ব্যাকআপ ডাউনলোড হয়েছে', 'success');
  closeMenu();
}

async function triggerRestore() {
  closeMenu();
  
  // 👇 প্রথম পপআপ: শুধু রিস্টোর করার অনুমতি চাওয়া (ভয় দেখানো নেই)
  const ok = await askConfirm('আপনি কি ব্যাকআপ ফাইল থেকে ডেটা রিস্টোর করতে চান? ফাইলটি সিলেক্ট করার পর আপনাকে ডেটা একত্রিত করার অপশন দেওয়া হবে।', {
    title: 'ব্যাকআপ রিস্টোর',
    icon: '📂',
    confirmLabel: 'হ্যাঁ, ফাইল নির্বাচন করুন',
    danger: false // 👈 danger false করে দিলাম যাতে লাল বাটন না দেখায়
  });
  
  if (!ok) return;
  
  const input = document.getElementById('restoreFileInput');
  input.value = '';
  input.click();
}

function handleRestoreFile(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = async function (e) {
    try {
      const data = JSON.parse(e.target.result);
      
      // 👇 রিস্টোর করার আগে ইউজারকে জিজ্ঞাসা করি
      const isMerge = await askConfirm(
        'আপনার বর্তমান ডেটা এবং ব্যাকআপ ডেটা একসাথে করতে চান?',
        {
          title: 'ডেটা একত্রিত করবেন?',
          icon: '🔄',
          confirmLabel: 'হ্যাঁ, একত্রিত করুন (Merge)',
          cancelLabel: 'না, সব মুছে ফেলুন (Replace)',
          danger: false
        }
      );
      
      // isMerge = true হলে mergeMode = true, false হলে mergeMode = false
      await importAllData(data, isMerge);
      
      if (isMerge) {
        showToast('সফলভাবে ডেটা একত্রিত হয়েছে', 'success');
      } else {
        showToast('সফলভাবে রিস্টোর হয়েছে', 'success');
      }
      
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      console.error(err);
      showToast('ফাইল পড়া যায়নি: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

/* ============ Events ============ */
function attachEvents() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeBookModal();
      closeMenu();
      closeThemeModal();
    }
  });

  // 👇 নতুন লাইন: ফাঁকা জায়গায় ক্লিক করলে মেনু বন্ধ হবে
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.book-actions') && !e.target.closest('.book-menu-panel')) {
      document.querySelectorAll('.book-menu-panel').forEach(m => m.classList.remove('open'));
    }
  });
}

/* ============ Book Menu & Ordering Logic ============ */

// মেনু ওপেন/ক্লোজ করা
function toggleBookMenu(bookId) {
  const menu = document.getElementById(`book-menu-${bookId}`);
  const allMenus = document.querySelectorAll('.book-menu-panel');
  
  // আগে খোলা থাকলে বন্ধ করে দিবে
  allMenus.forEach(m => {
    if (m.id !== `book-menu-${bookId}`) {
      m.classList.remove('open');
    }
  });

  // ক্লিক করা মেনুটাকে টগল করবে
  menu.classList.toggle('open');
}


/* ============ Book Duplicate ============ */
async function duplicateBook(bookId) {
  const sourceBook = getBook(bookId);
  if (!sourceBook) {
    showToast('বুক পাওয়া যায়নি', 'error');
    return;
  }

  const entryCount = getEntries(bookId).length;
  const msg = entryCount > 0
    ? `"${sourceBook.name}" বুকটি ডুপ্লিকেট করবেন? এর ${toBn(entryCount)}টি এন্ট্রিও কপি হবে।`
    : `"${sourceBook.name}" বুকটি ডুপ্লিকেট করবেন?`;
  const ok = await askConfirm(msg, {
    title: 'বুক ডুপ্লিকেট',
    icon: '📋',
    confirmLabel: 'হ্যাঁ, ডুপ্লিকেট',
    danger: false
  });
  if (!ok) return;

  try {
    // ফিল্ডের key হুবহু রাখি (বুকের ভেতরে unique, কনফ্লিক্ট নেই)
    const newFields = JSON.parse(JSON.stringify(sourceBook.fields || []));
    const newSummaryCards = JSON.parse(JSON.stringify(sourceBook.summaryCards || []));
    const newChartSections = JSON.parse(JSON.stringify(sourceBook.chartSections || []));
    const newDashboardCards = JSON.parse(JSON.stringify(sourceBook.dashboardCards || []));

    // সামারি কার্ডের id নতুন করি (id-ভিত্তিক রেফারেন্সের জন্য)
    const summaryIdMap = {};
    newSummaryCards.forEach(card => {
      const oldId = card.id;
      card.id = generateId('card');
      summaryIdMap[oldId] = card.id;
    });

    // চার্ট সেকশনের id নতুন করি
    newChartSections.forEach(sec => {
      sec.id = generateId('csec');
    });

    // dashboardCards-এ যদি নিজের বইয়ের summaryId থাকে, remap করি
    newDashboardCards.forEach(card => {
      if (summaryIdMap[card.summaryId]) {
        card.summaryId = summaryIdMap[card.summaryId];
      }
    });

    // নতুন বুক তৈরি — মূল বুকের ঠিক পরে বসাতে order + 0.001
    const baseOrder = sourceBook.order !== undefined ? sourceBook.order : 999999;
    const newBook = {
  id: generateId('book'),
  name: sourceBook.name + ' (কপি)',
  icon: sourceBook.icon || '📘',
  color: sourceBook.color || 'linear-gradient(135deg,#DBEAFE,#BFDBFE)',
  type: sourceBook.type || 'normal',
  parentId: sourceBook.parentId || null, // 👈 নতুন লাইন: parentId কপি হবে
  fields: newFields,
  summaryCards: newSummaryCards,
  chartSections: newChartSections,
  dashboardCards: newDashboardCards,
  order: baseOrder + 0.001,
  createdAt: Date.now(),
  updatedAt: Date.now()
};

    const added = await addBook(newBook);
    if (!added) {
      showToast('ডুপ্লিকেট ব্যর্থ', 'error');
      return;
    }

    // সব এন্ট্রি কপি করি (নতুন id সহ)
    if (entryCount > 0) {
      const sourceEntries = getEntries(bookId);
      const newEntries = sourceEntries.map(e => {
        const { id, ...rest } = e;
        return {
          ...JSON.parse(JSON.stringify(rest)),
          id: generateId('entry'),
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
      });
      await saveEntries(newBook.id, newEntries);
    }

    // Order fractional হয়ে গেলে reindex করি (০, ১, ২...)
    await reindexBookOrder();

    renderBooks();
    showToast(`"${newBook.name}" ডুপ্লিকেট হয়েছে ✅`, 'success');

  } catch (err) {
    console.error('Duplicate failed:', err);
    showToast('ডুপ্লিকেট ব্যর্থ: ' + err.message, 'error');
  }
}

async function reindexBookOrder(parentId = null) {
  let books = getBooks().filter(b => (b.parentId || null) === (parentId || null));
  books.sort((a, b) => {
    const oa = a.order !== undefined ? a.order : 999999;
    const ob = b.order !== undefined ? b.order : 999999;
    if (oa !== ob) return oa - ob;
    return (a.createdAt || 0) - (b.createdAt || 0);
  });
  for (let idx = 0; idx < books.length; idx++) {
    await updateBook(books[idx].id, { order: idx });
  }
}

async function moveBookOrder(bookId, direction) {
  let books = getBooks().filter(b => !b.parentId || b.parentId === null || b.parentId === '');
  books.sort((a, b) => {
    const orderA = a.order !== undefined ? a.order : 999999;
    const orderB = b.order !== undefined ? b.order : 999999;
    if (orderA !== orderB) return orderA - orderB;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  const currentIndex = books.findIndex(b => b.id === bookId);
  if (currentIndex === -1) return;

  const newIndex = currentIndex + direction;
  if (newIndex < 0 || newIndex >= books.length) return;

  const temp = books[currentIndex];
  books[currentIndex] = books[newIndex];
  books[newIndex] = temp;

  // 👇 reindexBookOrder ব্যবহার করি
  await reindexBookOrder();
  renderBooks();
}

/* ============ Global Search Logic ============ */
function performGlobalSearch(query) {
  const resultsContainer = document.getElementById('globalSearchResults');
  if (!resultsContainer) return;

  query = query.trim().toLowerCase();

  if (!query) {
    resultsContainer.style.display = 'none';
    resultsContainer.innerHTML = '';
    return;
  }

  // যদি কুয়েরি থাকে, তবে বুক কার্ডগুলো হাইড করি (অথবা আপনি চাইলে রেখে দিতে পারেন)
  // এখানে শুধু রেজাল্ট বক্স দেখাব
  const books = getBooks();
  let resultsHtml = '';
  let matchCount = 0;

  books.forEach(book => {
    // ১. বুকের নামের সাথে মিলে কি না চেক
    const bookNameMatch = book.name.toLowerCase().includes(query);

    // ২. বুকের ভেতরের এন্ট্রিগুলোর সাথে মিলে কি না চেক
    const entries = getEntries(book.id);
    const matchedEntries = entries.filter(entry => {
      if (!entry) return false; // 👈 null এন্ট্রি বাদ
      return (book.fields || []).some(f => {
        const val = entry[f.key];
        return val !== null && val !== undefined && String(val).toLowerCase().includes(query);
      });
    });

    // যদি বুকের নাম অথবা এন্ট্রি যেকোনোটা মিলে
    if (bookNameMatch || matchedEntries.length > 0) {
      matchCount++;
      let entryInfo = '';
      if (matchedEntries.length > 0) {
        entryInfo = `<div style="font-size:12px; color:var(--text-muted); margin-top:4px;">${toBn(matchedEntries.length)}টি এন্ট্রি মিলেছে</div>`;
      }

      resultsHtml += `
        <div class="book-card" style="margin-bottom: 8px; border-color: var(--primary-light);" onclick="openBook('${book.id}')">
          <div class="book-icon" style="background:${book.color || 'linear-gradient(135deg,#DBEAFE,#BFDBFE)'}">
            ${book.icon || '📘'}
          </div>
          <div class="book-info">
            <h3>${escapeHtml(book.name)}</h3>
            ${entryInfo}
          </div>
          <div class="menu-item-arrow">›</div>
        </div>
      `;
    }
  });

  if (matchCount > 0) {
    resultsContainer.style.display = 'block';
    resultsContainer.innerHTML = `
      <div style="font-size: 13px; font-weight: 700; color: var(--text-muted); margin-bottom: 10px;">
        🔍 "${escapeHtml(query)}" এর জন্য ${toBn(matchCount)}টি বুক পাওয়া গেছে
      </div>
      ${resultsHtml}
    `;
  } else {
    resultsContainer.style.display = 'block';
    resultsContainer.innerHTML = `
      <div style="text-align: center; padding: 20px; background: var(--bg-card); border-radius: var(--radius-md); border: 1px dashed var(--border-subtle);">
        <div style="font-size: 30px; margin-bottom: 8px; opacity: 0.5;">📭</div>
        <p style="font-size: 13.5px; color: var(--text-muted);">"${escapeHtml(query)}" নামে কোনো ডেটা বা বুক পাওয়া যায়নি।</p>
      </div>
    `;
  }
}

/* ============ Wipe All Data with 5-Min (HH:MM:SS) Countdown ============ */
const WIPE_VAULT_KEY = 'likhipata_wipe_vault_v1';
const WIPE_DURATION_MS = 60 * 60 * 1000; // ১ ঘন্টা (01:00:00)
let _wipeInterval = null;
let _wipePurging = false;

function getWipeVault() {
  try {
    const raw = localStorage.getItem(WIPE_VAULT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.expiresAt || !parsed.snapshot) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function setWipeVault(vaultObj) {
  if (!vaultObj) {
    localStorage.removeItem(WIPE_VAULT_KEY);
  } else {
    localStorage.setItem(WIPE_VAULT_KEY, JSON.stringify(vaultObj));
  }
}

function formatHMS(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hrs = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const mins = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const secs = String(totalSec % 60).padStart(2, '0');
  return toBn(`${hrs}:${mins}:${secs}`);
}

async function checkWipeVaultExpiry() {
  const vault = getWipeVault();
  if (!vault) return false;

  if (Date.now() >= vault.expiresAt) {
    await finalizeWipePermanent(true);
    return true;
  }
  return false;
}

async function finalizeWipePermanent(silent = false) {
  if (_wipePurging) return;
  _wipePurging = true;
  try {
    await wipeAllAppDataPermanently();
    setWipeVault(null);
    if (_wipeInterval) {
      clearInterval(_wipeInterval);
      _wipeInterval = null;
    }
    renderWipeVaultUI();
    renderBooks();
    if (!silent) {
      showToast('সব ডেটা স্থায়ীভাবে মুছে ফেলা হয়েছে', 'success');
    }
  } finally {
    _wipePurging = false;
  }
}

function renderWipeVaultUI() {
  const triggerBtn = document.getElementById('wipeAllTriggerBtn');
  const box = document.getElementById('wipeCountdownBox');
  const timerEl = document.getElementById('wipeCountdownTimer');
  if (!box) return;

  const vault = getWipeVault();
  if (!vault) {
    box.style.display = 'none';
    if (triggerBtn) triggerBtn.style.display = 'flex';
    return;
  }

  const remaining = vault.expiresAt - Date.now();
  if (remaining <= 0) {
    finalizeWipePermanent(true);
    return;
  }

  if (triggerBtn) triggerBtn.style.display = 'none';
  box.style.display = 'block';
  if (timerEl) timerEl.textContent = formatHMS(remaining);
}

function initWipeCountdownUI() {
  renderWipeVaultUI();
  if (_wipeInterval) clearInterval(_wipeInterval);
  _wipeInterval = setInterval(() => {
    const vault = getWipeVault();
    if (!vault) {
      renderWipeVaultUI();
      return;
    }
    if (Date.now() >= vault.expiresAt) {
      finalizeWipePermanent(true);
    } else {
      renderWipeVaultUI();
    }
  }, 1000);
}

async function deleteAllAppDataConfirm() {
  if (getWipeVault()) {
    openMenu();
    showToast('ইতিমধ্যে ১ ঘন্টার কাউন্টডাউন চলছে', 'warning');
    return;
  }

  const books = getBooks();
  let totalEntries = 0;
  books.forEach(b => { totalEntries += getEntries(b.id).length; });

  if (books.length === 0 && totalEntries === 0) {
    showToast('মুছে ফেলার মতো কোনো ডেটা নেই', 'info');
    return;
  }

  closeMenu();

  const ok = await askConfirm(
    `অ্যাপের সব ${toBn(books.length)}টি বুক ও ${toBn(totalEntries)}টি এন্ট্রি মুছে যাবে। ১ ঘন্টার মধ্যে ফেরত আনতে পারবেন, এরপর স্থায়ীভাবে মুছে যাবে।`,
    {
      title: 'সব ডেটা ডিলিট করবেন?',
      icon: '💣',
      confirmLabel: 'হ্যাঁ, ডিলিট করুন',
      danger: true
    }
  );
  if (!ok) return;

  const snapshot = exportAllData();
  const expiresAt = Date.now() + WIPE_DURATION_MS;

  await wipeAllAppDataPermanently();
  setWipeVault({
    expiresAt,
    createdAt: Date.now(),
    snapshot
  });

  renderBooks();
  initWipeCountdownUI();
  openMenu();
  showToast('সব ডেটা ডিলিট হয়েছে — ১ ঘন্টার মধ্যে ফেরত আনতে পারবেন', 'warning');
}

async function restoreDeletedAllAppData() {
  const vault = getWipeVault();
  if (!vault || !vault.snapshot) {
    renderWipeVaultUI();
    showToast('ফেরত আনার মতো কোনো ডেটা নেই', 'error');
    return;
  }

  if (Date.now() >= vault.expiresAt) {
    await finalizeWipePermanent(true);
    showToast('সময় শেষ হয়ে গেছে — ডেটা স্থায়ীভাবে মুছে গেছে', 'error');
    return;
  }

  try {
    await importAllData(vault.snapshot, false);
    setWipeVault(null);
    if (_wipeInterval) {
      clearInterval(_wipeInterval);
      _wipeInterval = null;
    }
    renderWipeVaultUI();
    renderBooks();
    if (typeof renderSyncStatusBar === 'function') renderSyncStatusBar();
    showToast('✅ সব ডেটা সফলভাবে ফেরত এসেছে', 'success');
  } catch (err) {
    console.error('Restore wipe vault failed:', err);
    showToast('ডেটা ফেরত আনা যায়নি', 'error');
  }
}

async function purgeDeletedAllAppDataNow() {
  const ok = await askConfirm(
    'আর অপেক্ষা না করে এখনই সব ডেটা স্থায়ীভাবে মুছে ফেলবেন? এরপর আর ফেরত আনা যাবে না।',
    {
      title: 'স্থায়ীভাবে মুছুন',
      icon: '🗑️',
      confirmLabel: 'হ্যাঁ, স্থায়ীভাবে মুছুন',
      danger: true
    }
  );
  if (!ok) return;
  await finalizeWipePermanent(false);
}
