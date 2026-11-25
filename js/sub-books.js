/* ============================================================
   লিখিপাতা — Sub-Books Manager Logic
   ============================================================ */

let currentParentBook = null;
let editingSubBookId = null;

document.addEventListener('DOMContentLoaded', async () => {
  // ১. IndexedDB লোড
  if (typeof initStorage === 'function') {
    try { await initStorage(); } catch (e) { console.error(e); }
  }
  
  applyTheme(getTheme());
  
  // ২. URL থেকে প্যারেন্ট বুক আইডি নাও
  const params = new URLSearchParams(window.location.search);
  const parentId = params.get('parent');

  if (!parentId) {
    showToast('মূল বই পাওয়া যায়নি', 'error');
    setTimeout(() => goBackToHome(), 1500);
    return;
  }

  currentParentBook = getBook(parentId);
  if (!currentParentBook) {
    showToast('মূল বই পাওয়া যায়নি', 'error');
    setTimeout(() => goBackToHome(), 1500);
    return;
  }

  // ৩. হেডার রেন্ডার করি
  renderParentHeader();
  
  // ৪. সাব-বুক লিস্ট রেন্ডার করি
  renderSubBooks();

  // ৫. সিঙ্ক স্ট্যাটাস বার
  if (typeof initSyncStatusBar === 'function') {
    setTimeout(() => initSyncStatusBar(), 500);
  }
});

function goBackToHome() {
  window.location.href = 'index.html';
}

/* ============ Render Parent Header ============ */
function renderParentHeader() {
  const header = document.getElementById('parentBookHeader');
  if (!header || !currentParentBook) return;
  const iconDisplay = currentParentBook.icon || '📘';
  const colorDisplay = currentParentBook.color || 'linear-gradient(135deg,#DBEAFE,#BFDBFE)';
  
  header.innerHTML = `
    <div class="sub-books-header-icon" style="background: ${colorDisplay}; color: white;">
      ${iconDisplay}
    </div>
    <div class="sub-books-header-info">
      <h2>${escapeHtml(currentParentBook.name)}</h2>
      <p>এই মূল বইয়ের অধীনে থাকা সাব-বুকগুলো</p>
    </div>
  `;
}

/* ============ Render Sub-Books List ============ */
function renderSubBooks() {
  const list = document.getElementById('subBooksList');
  const empty = document.getElementById('emptyState');
  const countBadge = document.getElementById('subBookCount');
  
  // প্যারেন্ট আইডি ম্যাচ করে সাব-বুকগুলো বের করি
  const allBooks = getBooks();
  const subBooks = allBooks.filter(b => b.parentId === currentParentBook.id);
  
  if (countBadge) countBadge.textContent = toBn(subBooks.length) + 'টি';

  if (subBooks.length === 0) {
    list.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  // সাজানোর লজিক (order অনুযায়ী)
  subBooks.sort((a, b) => {
    const orderA = a.order !== undefined ? a.order : 999999;
    const orderB = b.order !== undefined ? b.order : 999999;
    if (orderA !== orderB) return orderA - orderB;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  list.innerHTML = subBooks.map((book) => {
    const entryCount = getEntries(book.id).length;
    const isDashboard = book.type === 'dashboard';
    const iconDisplay = isDashboard ? '📊' : (book.icon || '📁');
    const metaDisplay = isDashboard 
      ? `📊 ড্যাশবোর্ড • ${toBn((book.dashboardCards || []).length)}টি কার্ড`
      : `${toBn(entryCount)}টি এন্ট্রি • ${Array.isArray(book.fields) ? toBn(book.fields.length) + 'টি ফিল্ড' : 'শূন্য ফিল্ড'}`;

    return `
      <div class="book-card" onclick="openSubBook('${book.id}')">
        <div class="book-icon" style="background:${book.color || 'linear-gradient(135deg,#DBEAFE,#BFDBFE)'}">
          ${iconDisplay}
        </div>
        <div class="book-info">
          <h3>${escapeHtml(book.name)}</h3>
          <p>${metaDisplay}</p>
        </div>
        <div class="book-actions" onclick="event.stopPropagation()">
          <button class="book-action-btn" onclick="openEditSubBookModal('${book.id}')" title="এডিট">✏️</button>
          <button class="book-action-btn" onclick="deleteSubBookConfirm('${book.id}')" title="ডিলিট">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

/* ============ Navigation ============ */
function openSubBook(bookId) {
  const book = getBook(bookId);
  if (!book) return;

  if (book.type === 'dashboard') {
    window.location.href = 'view.html?book=' + bookId;
    return;
  }

  const allBooks = getBooks();
  const hasNested = allBooks.some(b => b.parentId === bookId);

  if (hasNested) {
    window.location.href = 'sub-books.html?parent=' + bookId;
  } else {
    window.location.href = 'view.html?book=' + bookId;
  }
}

/* ============ Create / Edit Sub-Book ============ */
function openCreateSubBookModal() {
  editingSubBookId = null;
  document.getElementById('subBookModalTitle').textContent = 'নতুন সাব-বুক তৈরি করুন';
  document.getElementById('subBookNameInput').value = '';
  document.getElementById('subBookIconInput').value = '📁';
  selectSubBookColor('linear-gradient(135deg,#DBEAFE,#BFDBFE)');
  // 👇 type রিসেট করি
  const typeInput = document.getElementById('subBookTypeInput');
  if (typeInput) typeInput.value = 'normal';
  document.getElementById('subBookModal').classList.add('open');
  setTimeout(() => document.getElementById('subBookNameInput').focus(), 200);
}

function closeSubBookModal() {
  document.getElementById('subBookModal').classList.remove('open');
  editingSubBookId = null;
}

function selectSubBookColor(color) {
  document.getElementById('subBookColorInput').value = color;
  document.querySelectorAll('#subBookModal .color-option').forEach(el => {
    el.classList.toggle('active', el.dataset.color === color);
  });
}

async function saveSubBook() {
  const name = document.getElementById('subBookNameInput').value.trim();
  const icon = document.getElementById('subBookIconInput').value.trim() || '📁';
  const color = document.getElementById('subBookColorInput').value;

  if (!name) {
    showToast('সাব-বুকের নাম লিখুন', 'error');
    return;
  }

  const typeEl = document.getElementById('subBookTypeInput');
  const type = (typeEl && typeEl.value) ? typeEl.value : 'normal';

  if (editingSubBookId) {
    const ok = await updateBook(editingSubBookId, { name, icon, color, type });
    if (!ok) {
      showToast('আপডেট ব্যর্থ', 'error');
      return;
    }
    showToast('সাব-বুক আপডেট হয়েছে', 'success');
  } else {
    const siblings = getBooks().filter(b => b.parentId === currentParentBook.id);
    const maxOrder = siblings.reduce((max, b) => {
      const o = typeof b.order === 'number' ? b.order : -1;
      return o > max ? o : max;
    }, -1);

    const newBook = {
      id: generateId('book'),
      parentId: currentParentBook.id,
      name: name,
      icon: icon,
      color: color,
      type: type,
      fields: [],
      summaryCards: [],
      dashboardCards: [],
      order: maxOrder + 1,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const ok = await addBook(newBook);
    if (!ok) {
      showToast('তৈরি ব্যর্থ', 'error');
      return;
    }
    showToast('নতুন সাব-বুক তৈরি হয়েছে', 'success');
  }

  closeSubBookModal();
  renderSubBooks();
}

/* ============ Delete Sub-Book ============ */
async function deleteSubBookConfirm(bookId) {
  const book = getBook(bookId);
  if (!book) return;
  
  const entries = getEntries(bookId);
  let msg = `"${book.name}" সাব-বুকটি রিসাইকেল বিনে পাঠাবেন?`;
  if (entries.length > 0) {
    msg += ` এই সাব-বুকের ${toBn(entries.length)}টি এন্ট্রিও একসাথে যাবে!`;
  }
  
  const ok = await askConfirm(msg, {
    title: 'সাব-বুক ডিলিট',
    icon: '🗑️',
    confirmLabel: 'হ্যাঁ, ডিলিট',
    danger: true
  });
  if (!ok) return;

  // নিচের সব নেস্টেড সাব-বুক খুঁজে বের করে একসাথে ডিলিট
  const allBooks = getBooks();
  const collectDescendants = (pid) => {
    const children = allBooks.filter(b => b.parentId === pid);
    let ids = [];
    children.forEach(c => {
      ids.push(c.id, ...collectDescendants(c.id));
    });
    return ids;
  };
  const descendantIds = collectDescendants(bookId);

  // 👇 প্রথমে সব ডিসেন্ডেন্ট ডিলিট করি, তারপর মূল বুক
  let allDeleted = true;
  for (const id of descendantIds) {
    const d = await deleteBook(id);
    if (!d) allDeleted = false;
  }
  const deleted = await deleteBook(bookId);
  if (deleted && allDeleted) {
    showToast('সাব-বুক ডিলিট হয়েছে', 'success');
    renderSubBooks();
  } else if (deleted) {
    showToast('সাব-বুক ডিলিট হয়েছে (কিছু নেস্টেড বুক ডিলিট হয়নি)', 'warning');
    renderSubBooks();
  } else {
    showToast('ডিলিট ব্যর্থ', 'error');
  }
}

function openEditSubBookModal(bookId) {
  const book = getBook(bookId);
  if (!book) return;
  editingSubBookId = bookId;
  document.getElementById('subBookModalTitle').textContent = 'সাব-বুক এডিট করুন';
  document.getElementById('subBookNameInput').value = book.name;
  document.getElementById('subBookIconInput').value = book.icon || '📁';
  selectSubBookColor(book.color || 'linear-gradient(135deg,#DBEAFE,#BFDBFE)');
  const typeInput = document.getElementById('subBookTypeInput');
  if (typeInput) typeInput.value = book.type || 'normal';
  document.getElementById('subBookModal').classList.add('open');
  setTimeout(() => document.getElementById('subBookNameInput').focus(), 200);
}