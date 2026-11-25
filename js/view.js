/* ============================================================
   লিখিপাতা — View Logic (Fully Fixed)
   ============================================================ */

let currentBook = null;
let currentEntries = [];
let currentEditId = null;
let isSelectMode = false;
let selectedIds = new Set();
let currentViewTab = 'form';
let pendingDeleteId = null;
let pendingDeleteBulk = false;

document.addEventListener('DOMContentLoaded', async () => {
  // ১. IndexedDB লোড হওয়া পর্যন্ত অপেক্ষা
  if (typeof initStorage === 'function') {
    try { await initStorage(); } catch (e) { console.error(e); }
  }
  applyTheme(getTheme());
  const params = new URLSearchParams(window.location.search);
  const bookId = params.get('book');

  if (!bookId) {
    showToast('বুক পাওয়া যায়নি', 'error');
    setTimeout(() => goBack(), 1500);
    return;
  }

  currentBook = getBook(bookId);

// 👇 প্রথমে null চেক করি
if (!currentBook) {
  showToast('বুক পাওয়া যায়নি', 'error');
  setTimeout(() => goBack(), 1500);
  return;
}

// 👇 এরপর dashboard টাইপ চেক করি
if (currentBook.type === 'dashboard') {
  document.getElementById('pageTitle').textContent = '📊 ' + currentBook.name;
  renderDashboardBookView();
  return; // ফর্ম, টেবিল, সামারি রেন্ডার হবে না
}

  if (!Array.isArray(currentBook.fields)) currentBook.fields = [];
  currentEntries = getEntries(bookId);
  if (!Array.isArray(currentEntries)) currentEntries = [];

  document.getElementById('pageTitle').textContent = (currentBook.icon || '📘') + ' ' + currentBook.name;

// 👇 নতুন লজিক: সাব-বুক হলে "মূল বই" বাটন দেখাই 
if (currentBook.parentId) {
  const backBtn = document.querySelector('.back-btn');
  if (backBtn) {
    backBtn.onclick = () => {
      window.location.href = 'sub-books.html?parent=' + currentBook.parentId;
    };
    backBtn.title = 'মূল বইতে ফিরে যান';
  }
}
  document.getElementById('printTitle').textContent = currentBook.name;
  document.getElementById('printDate').textContent = 'প্রিন্টের তারিখ: ' + formatDateLongBn(todayISO());

  renderForm();
  renderTable();
  renderSummary();

// 👇 নতুন: সর্ট ফিল্ড সিলেক্টর প্রাথমিকভাবে পপুলেট
if (typeof populateSortFieldOptions === 'function') {
  populateSortFieldOptions(document.getElementById('sortBy')?.value || 'newest');
}

  // 👇 কপি করা ডেটা থাকলে পেস্ট বাটন দেখাও
  updatePasteButtonVisibility();
});

// 📋 ক্লিপবোর্ড সাজেশন দেখাও / লুকাও
function updatePasteButtonVisibility() {
  const card = document.getElementById('clipboardSuggestion');
  if (!card) return;

  // ইউজার যদি ✕ চেপে ডিসমিস করে থাকে → এই সেশনে আর দেখাব না
  if (sessionStorage.getItem('likhipata_clip_suggestion_dismissed') === 'true') {
    card.style.display = 'none';
    return;
  }

  if (!hasClipboardData()) {
    card.style.display = 'none';
    return;
  }

  const raw = localStorage.getItem('likhipata_entry_clipboard');
  let sourceBookName = '';
  let fieldCount = 0;
  try {
    const c = JSON.parse(raw);
    sourceBookName = c.bookName || '';
    fieldCount = c.data ? Object.keys(c.data).length : 0;
  } catch (_) {}

  const titleEl = document.getElementById('clipboardTitle');
  const subtitleEl = document.getElementById('clipboardSubtitle');

  if (titleEl) {
    if (sourceBookName && sourceBookName !== currentBook.name) {
      titleEl.textContent = `"${sourceBookName}" থেকে কপি করা ডেটা`;
    } else {
      titleEl.textContent = 'কপি করা ডেটা আছে';
    }
  }

  if (subtitleEl) {
    if (fieldCount > 0) {
      subtitleEl.textContent = `${toBn(fieldCount)}টি ফিল্ড এই ফর্মে পেস্ট করা যাবে`;
    } else {
      subtitleEl.textContent = 'চাইলে এই ফর্মে বসাতে পারেন';
    }
  }

  card.style.display = 'flex';
}

// 📋 সাজেশন বন্ধ করো (এই সেশনের জন্য)
function dismissClipboardSuggestion() {
  const card = document.getElementById('clipboardSuggestion');
  if (card) card.style.display = 'none';
  sessionStorage.setItem('likhipata_clip_suggestion_dismissed', 'true');
}



function goBack() {
  // 👇 নতুন লজিক: সাব-বুক হলে প্যারেন্টের কাছে ফিরে যাবে
  if (currentBook && currentBook.parentId) {
    window.location.href = 'sub-books.html?parent=' + currentBook.parentId;
  } else {
    window.location.href = 'index.html';
  }
}

function openBuilder() {
  if (!currentBook) return;
  window.location.href = 'builder.html?book=' + currentBook.id;
}

function switchViewTab(tab) {
  currentViewTab = tab;
  document.getElementById('tabForm').classList.toggle('active', tab === 'form');
  document.getElementById('tabTable').classList.toggle('active', tab === 'table');
  document.getElementById('formView').style.display = tab === 'form' ? 'block' : 'none';
  document.getElementById('tableView').style.display = tab === 'table' ? 'block' : 'none';

  const fab = document.getElementById('fabAddEntry');
  if (fab) fab.style.display = (tab === 'table') ? 'flex' : 'none';

  if (tab === 'table') {
    renderTable();
    renderSummary();
    // 👇 চার্ট মডাল খোলা থাকলেই চার্ট রেন্ডার করি
    if (document.getElementById('chartModal')?.classList.contains('open')) {
      renderChart();
    }
    if (isSelectMode) exitSelectMode();
  }

  // 👇 নতুন: ফর্ম ট্যাবে গেলে পেস্ট বাটন আপডেট করুন
  if (tab === 'form') {
    updatePasteButtonVisibility();
  }
}

/* ============ Summary ============ */
function renderSummary() {
  const summaryStrip = document.getElementById('summaryStrip');
  if (!summaryStrip) return;

  if (!currentBook.summaryCards || currentBook.summaryCards.length === 0) {
    summaryStrip.innerHTML = '';
    return;
  }

    let entriesToSum = [];
if (isSelectMode && selectedIds.size > 0) {
  // যদি কিছু সিলেক্ট করা থাকে, শুধু সেগুলোই নিবে
  entriesToSum = currentEntries.filter(e => e && selectedIds.has(e.id));
} else {
  // না থাকলে টেবিলে যা ফিল্টার হয়ে দেখা যাচ্ছে, সেটাই নিবে
  entriesToSum = getFilteredEntries().filter(e => e);
}

  let html = '';

  currentBook.summaryCards.forEach(card => {
    // ফিল্ডটা এখনো আছে কিনা চেক
    const fieldExists = currentBook.fields.find(f => f.key === card.fieldKey);
    if (!fieldExists) {
      // ভাঙা রেফারেন্স — স্কিপ
      return;
    }

    let resultVal = 0;
    let displayVal = '০';

    if (card.calcType === 'count') {
      resultVal = entriesToSum.length;
      displayVal = toBn(resultVal) + 'টি';
    } else {
      let values = entriesToSum
        .map(e => Number(e[card.fieldKey]))
        .filter(v => !isNaN(v));

      if (card.calcType === 'sum') {
        resultVal = values.reduce((a, b) => a + b, 0);
      } else if (card.calcType === 'avg') {
        resultVal = values.length ? (values.reduce((a, b) => a + b, 0) / values.length) : 0;
      } else if (card.calcType === 'max') {
        resultVal = values.length ? Math.max(...values) : 0;
      } else if (card.calcType === 'min') {
        resultVal = values.length ? Math.min(...values) : 0;
      }
      displayVal = formatTaka(resultVal);
    }

    html += `
      <div class="summary-chip" style="background: ${card.color};">
        <div class="lbl">${escapeHtml(card.label)}</div>
        <div class="val">${displayVal}</div>
      </div>
    `;
  });

  summaryStrip.innerHTML = html;
}

/* ============ Render Form ============ */
function renderForm() {
  const container = document.getElementById('dynamicForm');
  const noFields = document.getElementById('noFieldsState');

  if (!currentBook.fields.length) {
    container.innerHTML = '';
    noFields.style.display = 'block';
    return;
  }
  noFields.style.display = 'none';

  container.innerHTML = currentBook.fields.map(f => renderFormField(f)).join('');

  // Event listeners
  currentBook.fields.forEach(f => {
    if (f.type === 'formula') return;

    const el = document.getElementById('field_' + f.key);
    if (!el) return;

    if (f.type === 'number') {
      el.addEventListener('keydown', (e) => {
        if (['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key)) return;
        if (e.ctrlKey || e.metaKey) return;
        const allowedChars = /[0-9+\-*/%().\s]/;
        const isBanglaDigit = /[\u09E6-\u09EF]/;
        if (e.key.length === 1 && !allowedChars.test(e.key) && !isBanglaDigit.test(e.key)) {
          e.preventDefault();
        }
      });

      el.addEventListener('input', () => {
        let val = el.value;
        val = bnToEn(val);
        val = val.replace(/[^0-9+\-*/%().\s]/g, '');
        el.value = val;
        recalcFormulas();
if (typeof attachAutoGrowTextareas === 'function') attachAutoGrowTextareas();
        saveDraftAuto();
      });

      el.addEventListener('change', () => {
        recalcFormulas();
if (typeof attachAutoGrowTextareas === 'function') attachAutoGrowTextareas();
        saveDraftAuto();
      });

      const eqBtn = el.parentElement.querySelector('.math-eq-btn');
      if (eqBtn) {
        eqBtn.addEventListener('click', (e) => {
          e.preventDefault();
          evaluateField(el);
        });
      }

    } else if (f.type === 'checkbox') {
      el.addEventListener('change', () => {
        recalcFormulas();
if (typeof attachAutoGrowTextareas === 'function') attachAutoGrowTextareas();
        saveDraftAuto();
      });
    } else if (f.type === 'lookup') {
      // Manual lookup → change-এ recalc (dynamic-এর জন্য)
      el.addEventListener('change', () => {
        recalcLookups();
        recalcFormulas();
if (typeof attachAutoGrowTextareas === 'function') attachAutoGrowTextareas();
        saveDraftAuto();
      });
      el.addEventListener('input', () => {
        // auto-match হলে এখান থেকে নয়, recalcLookups থেকে আসবে
        if (el.tagName === 'SELECT') {
          recalcLookups();
          recalcFormulas();
if (typeof attachAutoGrowTextareas === 'function') attachAutoGrowTextareas();
          saveDraftAuto();
        }
      });
    } else {
      el.addEventListener('input', () => {
        recalcLookups();  // 👈 অন্য ফিল্ড পরিবর্তনে auto-lookup আপডেট
        recalcFormulas();
if (typeof attachAutoGrowTextareas === 'function') attachAutoGrowTextareas();
        saveDraftAuto();
      });
      el.addEventListener('change', () => {
        recalcLookups();
        recalcFormulas();
if (typeof attachAutoGrowTextareas === 'function') attachAutoGrowTextareas();
        saveDraftAuto();
      });
    }
  });

   recalcLookups();
  recalcFormulas();
if (typeof attachAutoGrowTextareas === 'function') attachAutoGrowTextareas();
  
  // Draft লোড (শুধু নতুন এন্ট্রি মোডে, ডুপ্লিকেট কল বাদ দিয়ে)
  if (!currentEditId) {
    const draft = loadDraft(currentBook.id); // আপনার storage-indexeddb.js এর ফাংশন
    if (draft && draft.data) {
      let isEmpty = true;
      currentBook.fields.forEach(f => {
        if (f.type === 'formula') return;
        const el = document.getElementById('field_' + f.key);
        if (el && el.value && el.value !== (f.default || '')) isEmpty = false;
      });
      
      if (isEmpty) {
        currentBook.fields.forEach(f => {
          if (f.type === 'formula') return;
          const el = document.getElementById('field_' + f.key);
          if (!el) return;
          const v = draft.data[f.key];
          if (v === undefined || v === null) return;
          if (f.type === 'checkbox') el.checked = !!v;
          else el.value = v;
        });
        // ড্রাফট বসানোর পর লুকআপ ও ফর্মুলা রিফ্রেশ
        recalcLookups();
        recalcFormulas();
if (typeof attachAutoGrowTextareas === 'function') attachAutoGrowTextareas();
      }
    }
  }

  // 👇 textarea auto-grow চালু করি
  attachAutoGrowTextareas();

  setTimeout(() => {
    attachEnterNavigation();
  }, 50);

  // 👇 edit মোডে থাকলে সেভ করা হিসাব দেখাই
setTimeout(() => {
  refreshAllCalcHistoryIcons();
}, 120);

  // 👇 নতুন যোগ: প্রতি render-এ undo listener রিফ্রেশ
  setTimeout(() => {
    const formEl = document.getElementById('dynamicForm');
    if (formEl) {
      formEl.removeEventListener('input', saveFormStateDebounced);
      formEl.removeEventListener('change', saveFormStateDebounced);
      formEl.addEventListener('input', saveFormStateDebounced);
      formEl.addEventListener('change', saveFormStateDebounced);
    }
    // 👇 প্রথম স্টেট ক্যাপচার করে বাটন আপডেট
    if (typeof formUndoStack !== 'undefined' && typeof captureFormState === 'function') {
      if (formUndoStack.length === 0) {
        formUndoStack = [captureFormState()];
        formRedoStack = [];
      }
      if (typeof updateFormUndoUI === 'function') updateFormUndoUI();
    }
  }, 100);
}

/* ============ Textarea Auto-Grow ============ */
function attachAutoGrowTextareas() {
  const textareas = document.querySelectorAll('#dynamicForm textarea.auto-grow-textarea');
  textareas.forEach(ta => {
    const grow = () => {
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
    };
    // পুরোনো listener থাকলে সরাই
    if (ta._autoGrowHandler) {
      ta.removeEventListener('input', ta._autoGrowHandler);
    }
    ta.addEventListener('input', grow);
    ta._autoGrowHandler = grow;
    // প্রাথমিক height সেট (draft/edit-এ ভরা মান থাকলে)
    grow();
  });
}

function saveDraftAuto() {
  if (currentEditId) return;
  const data = {};
  currentBook.fields.forEach(f => {
    if (f.type === 'formula') return;
    const el = document.getElementById('field_' + f.key);
    if (!el) return;
    if (f.type === 'checkbox') data[f.key] = el.checked;
    else if (f.type === 'lookup') data[f.key] = el.value || '';
    else data[f.key] = el.value;
  });
  saveDraft(currentBook.id, { data, savedAt: Date.now() });
}


function renderFormField(f) {
  const id = 'field_' + f.key;
  let inputHtml = '';

  if (f.type === 'formula') {
    inputHtml = `<input type="text" id="${id}" class="formula-field" readonly placeholder="অটো হিসাব">`;
  } else if (f.type === 'text') {
    inputHtml = `<textarea id="${id}" class="auto-grow-textarea" rows="1" placeholder="লিখুন..." autocomplete="off">${escapeHtml(f.default || '')}</textarea>`;
  } else if (f.type === 'number') {
  inputHtml = `
    <div class="math-wrapper">
      <input type="text" inputmode="text" id="${id}" placeholder="সংখ্যা বা হিসাব লিখুন" autocomplete="off" value="${escapeHtml(f.default || '')}">
      <button type="button" class="math-eq-btn" onclick="evaluateField(document.getElementById('${id}'))">=</button>
    </div>
  `;
} else if (f.type === 'date') {
    inputHtml = `<input type="date" id="${id}" value="${f.default || todayISO()}">`;
  } else if (f.type === 'dropdown') {
    const options = f.options || [];
    let optHtml = `<option value="">-- নির্বাচন --</option>`;
    options.forEach(o => {
      const selected = (f.default && f.default === o) ? 'selected' : '';
      optHtml += `<option value="${escapeHtml(o)}" ${selected}>${escapeHtml(o)}</option>`;
    });
    inputHtml = `<select id="${id}">${optHtml}</select>`;
  } else if (f.type === 'lookup') {
    // Broken check
    if (f.broken) {
      inputHtml = `<div class="lookup-broken">⚠️ এই লুকআপের উৎস ফিল্ড ডিলিট হয়ে গেছে — বিল্ডার থেকে ঠিক করুন</div>`;
    } else if (f.lookup && f.lookup.matchMode === 'auto') {
      // Auto-match → readonly input, JS দিয়ে বসবে
      inputHtml = `<input type="text" id="${id}" class="lookup-field lookup-auto" readonly placeholder="অটো-ম্যাচ হবে..." data-lookup-key="${escapeAttr(f.key)}">`;
    } else {
      // Manual → dropdown
      const sourceEntries = f.lookup ? getEntries(f.lookup.sourceBookId) : [];
      const displayKey = f.lookup ? f.lookup.displayField : null;

      // Unique values
      const seen = new Set();
      const values = [];
      sourceEntries.forEach(entry => {
        const v = entry[displayKey];
        if (v === undefined || v === null || v === '') return;
        const s = String(v);
        if (seen.has(s)) return;
        seen.add(s);
        values.push(s);
      });

      let opts = '<option value="">-- নির্বাচন --</option>';
      values.forEach(v => {
        opts += `<option value="${escapeAttr(v)}">${escapeHtml(v)}</option>`;
      });

      inputHtml = `<select id="${id}" class="lookup-field" data-lookup-key="${escapeAttr(f.key)}">${opts}</select>`;
    }
  } else if (f.type === 'checkbox') {
    const checked = (f.default === 'true' || f.default === '1' || f.default === true) ? 'checked' : '';
    inputHtml = `
      <label class="checkbox-field">
        <input type="checkbox" id="${id}" ${checked}>
        <span>হ্যাঁ</span>
      </label>
    `;
  }

    const labelBadge = f.type === 'formula' ? `<span class="formula-badge">অটো</span>` : '';
  const optMark = (f.type === 'formula' || f.type === 'checkbox') ? '' : '<span class="opt">(ঐচ্ছিক)</span>';

  // 👇 হিস্ট্রি আইকন লেবেলের পাশে বসানোর জন্য
  const historyBtnHtml = f.type === 'number' 
    ? `<button type="button" class="math-history-btn" id="histBtn_${f.key}" onclick="showCalcHistory('${f.key}')" title="সর্বশেষ হিসাব দেখুন" style="visibility:hidden;">🕘</button>` 
    : '';

  return `
    <div class="form-field-group">
      <div class="label-wrapper" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
        <label for="${id}" style="margin: 0; display: flex; align-items: center; gap: 6px;">
          ${escapeHtml(f.label)} ${labelBadge} ${optMark}
        </label>
        ${historyBtnHtml}
      </div>
      ${inputHtml}
    </div>
  `;
}

/* ============ Lookup Auto-Match & Live Update ============ */
function recalcLookups() {
  if (!currentBook || !Array.isArray(currentBook.fields)) return;

  currentBook.fields.forEach(f => {
    if (f.type !== 'lookup') return;
    if (f.broken) return;
    if (!f.lookup) return;

    const el = document.getElementById('field_' + f.key);
    if (!el) return;

    // Auto-match: local field থেকে মান নিয়ে উৎসে খুঁজি
    if (f.lookup.matchMode === 'auto') {
      const localEl = document.getElementById('field_' + f.lookup.matchField);
      if (!localEl) return;

      const matchValue = String(localEl.value || '').trim();
      if (!matchValue) {
        el.value = '';
        return;
      }

      const sourceEntries = getEntries(f.lookup.sourceBookId);
      const matchFieldKey = f.lookup.matchField;

      // source বুকের কোন ফিল্ডে matchValue আছে খুঁজি
      // যেহেতু local field-এর key আর source field-এর key আলাদা হতে পারে,
      // আমরা source book-এ একই label-এর ফিল্ড খুঁজি
      const sourceBook = getBook(f.lookup.sourceBookId);
      if (!sourceBook || !Array.isArray(sourceBook.fields)) return;

      const localFieldDef = currentBook.fields.find(lf => lf.key === f.lookup.matchField);
      const targetSourceField = localFieldDef
        ? sourceBook.fields.find(sf => sf.label.trim().toLowerCase() === localFieldDef.label.trim().toLowerCase())
        : null;

      const matched = sourceEntries.find(e => {
        if (targetSourceField) {
          return String(e[targetSourceField.key] || '').trim().toLowerCase() === matchValue.toLowerCase();
        }
        return sourceBook.fields.some(sf =>
          sf.key !== f.lookup.displayField &&
          String(e[sf.key] || '').trim().toLowerCase() === matchValue.toLowerCase()
        );
      });

      el.value = matched ? (matched[f.lookup.displayField] || '') : '';
    }
  });
}

/* ============ Auto-Calculation ============ */
function recalcFormulas() {
  const context = {};

  currentBook.fields.forEach(f => {
    if (f.type === 'formula') return;
    const el = document.getElementById('field_' + f.key);
    if (!el) return;

    if (f.type === 'checkbox') {
      context[f.key] = el.checked ? 1 : 0;
    } else if (f.type === 'number') {
      const raw = String(el.value || '').trim();
      if (!raw) {
        context[f.key] = 0;
      } else if (/[+\-*/%]/.test(raw)) {
        try {
          let expr = raw
            .replace(/(\d+(?:\.\d+)?)\s*([+\-])\s*(\d+(?:\.\d+)?)\s*%/g,
              (_, base, op, pct) => `${base}${op}${base}*${pct}/100`)
            .replace(/%/g, '/100');
          if (/^[0-9+\-*/%().\s]+$/.test(expr)) {
            const res = Function('"use strict";return(' + expr + ')')();
            context[f.key] = isFinite(res) ? res : 0;
          } else {
            context[f.key] = 0;
          }
        } catch (e) { context[f.key] = 0; }
      } else {
        const num = parseFloat(raw);
        context[f.key] = isNaN(num) ? 0 : num;
      }
    } else {
      context[f.key] = el.value || '';
    }
  });

  // ফর্মুলা ৫ পাস (নেস্টিং ঠিকভাবে কাজ করার জন্য)
  for (let pass = 0; pass < 5; pass++) {
    currentBook.fields.forEach(f => {
      if (f.type !== 'formula') return;
      if (!f.formula) return;
      const result = calcFormula(f.formula, context);
      context[f.key] = result;
      const el = document.getElementById('field_' + f.key);
      if (el) {
        el.value = isNaN(result) ? 'ভুল ফর্মুলা' : result;
      }
    });
  }
}

function evaluateField(input) {
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;
  if (!/[+\-*/%]/.test(val)) return;

  if (!/^[0-9+\-*/%().\s]+$/.test(val)) {
    showToast('শুধু সংখ্যা ও + - * / % ব্যবহার করুন', 'error');
    return;
  }

  try {
    let expr = val
      .replace(/(\d+(?:\.\d+)?)\s*([+\-])\s*(\d+(?:\.\d+)?)\s*%/g,
        (_, base, op, pct) => `${base}${op}${base}*${pct}/100`)
      .replace(/%/g, '/100');

    const result = Function('"use strict";return(' + expr + ')')();
    if (typeof result === 'number' && isFinite(result)) {
      const rounded = Math.round(result * 100) / 100;

      // 👇 হিসাবের স্মৃতি সেভ করি
      const fieldKey = input.id ? input.id.replace('field_', '') : null;
      if (fieldKey) {
        saveCalcMemory(fieldKey, val, rounded);
      }

      input.value = rounded;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      recalcFormulas();
      if (typeof attachAutoGrowTextareas === 'function') attachAutoGrowTextareas();
    } else {
      showToast('হিসাব সঠিক নয়', 'error');
    }
  } catch (e) {
    showToast('হিসাব সঠিক নয়', 'error');
  }
}

/* ============================================================
   CALC HISTORY (Number field calculation memory)
   - শুধু সর্বশেষ হিসাব রাখা হয়
   - মান আগের মতোই থাকে, আলাদা কী-তে স্মৃতি জমা হয়
   - UI: = বাটনের পাশে 🕘 আইকন (শুধু হিসাব থাকলে দেখা যায়)
   ============================================================ */

/**
 * হিসাবের স্মৃতি সেভ করে
 * @param {string} fieldKey - ফিল্ডের key
 * @param {string} exprRaw - ইউজার যা টাইপ করেছিল (যেমন "50+50")
 * @param {number} result - হিসাবের ফলাফল
 */
function saveCalcMemory(fieldKey, exprRaw, result) {
  if (!fieldKey || !exprRaw) return;
  if (!currentBook) return;

  const expr = String(exprRaw).trim();
  if (!expr) return;

  // বর্তমান ফর্মের সব ফিল্ডের মান collect করি (draft-এ রাখার জন্য)
  const currentMemory = { expr, result, at: Date.now() };

  // ১. ফর্ম-লেভেলের মেমোরি (যাতে এডিটে ফেরার আগেই প্যানেল কাজ করে)
  if (!window._currentCalcMemory) window._currentCalcMemory = {};
  window._currentCalcMemory[fieldKey] = currentMemory;

  // ২. বর্তমান এন্ট্রির ডেটায় সেভ (যদি edit মোডে থাকি)
  if (currentEditId) {
    const entry = currentEntries.find(e => e.id === currentEditId);
    if (entry) {
      entry['__calc_' + fieldKey] = currentMemory;
      
    }
  }

  // ৩. আইকন আপডেট
  updateCalcHistoryIcon(fieldKey, currentMemory);
}

/**
 * আইকনের visibility আপডেট
 */
function updateCalcHistoryIcon(fieldKey, memory) {
  const btn = document.getElementById('histBtn_' + fieldKey);
  if (!btn) return;

  if (memory && memory.expr) {
    btn.style.visibility = 'visible';
    btn.dataset.hasHistory = '1';
    btn.title = 'সর্বশেষ হিসাব: ' + memory.expr + ' = ' + memory.result;
  } else {
    btn.style.visibility = 'hidden';
    btn.dataset.hasHistory = '0';
    btn.title = 'কোনো হিসাব নেই';
  }
}

/**
 * সব নাম্বার ফিল্ডের আইকন রিফ্রেশ (edit mode এ এন্ট্রি লোড হওয়ার পর)
 */
function refreshAllCalcHistoryIcons() {
  if (!currentBook || !currentBook.fields) return;

  const entry = currentEditId
    ? currentEntries.find(e => e.id === currentEditId)
    : null;

  currentBook.fields.forEach(f => {
    if (f.type !== 'number') return;
    const memKey = '__calc_' + f.key;

    // অগ্রাধিকার ১: বর্তমান এন্ট্রির সেভ করা মেমোরি
    let memory = entry ? entry[memKey] : null;

    // অগ্রাধিকার ২: ফর্মে এইমাত্র করা হিসাব
    if (!memory && window._currentCalcMemory && window._currentCalcMemory[f.key]) {
      memory = window._currentCalcMemory[f.key];
    }

    updateCalcHistoryIcon(f.key, memory);
  });
}

/**
 * 🕘 আইকনে ক্লিক করলে ইতিহাস দেখায়
 */
function showCalcHistory(fieldKey) {
  if (!currentBook) return;

  const field = currentBook.fields.find(f => f.key === fieldKey);
  if (!field) return;

  const entry = currentEditId
    ? currentEntries.find(e => e.id === currentEditId)
    : null;
  const memKey = '__calc_' + fieldKey;

  // মেমোরি খুঁজি: এন্ট্রি থেকে, নাহলে এইমাত্র করা হিসাব থেকে
  let memory = entry ? entry[memKey] : null;
  if (!memory && window._currentCalcMemory && window._currentCalcMemory[fieldKey]) {
    memory = window._currentCalcMemory[fieldKey];
  }

  // Title আপডেট
  const titleEl = document.getElementById('calcHistoryFieldLabel');
  if (titleEl) {
    titleEl.textContent = field.label;
  }

  // Body আপডেট
  const bodyEl = document.getElementById('calcHistoryBody');
  if (bodyEl) {
    if (!memory || !memory.expr) {
      bodyEl.innerHTML = `<div class="calc-history-empty">এই ফিল্ডে এখনো কোনো হিসাব করা হয়নি।</div>`;
    } else {
      const prettyExpr = prettyCalcExpr(memory.expr);
      bodyEl.innerHTML = `
        <div class="calc-history-expression">
          ${escapeHtml(prettyExpr)}
          <span class="calc-history-eq">=</span>
          <span class="calc-history-result">${escapeHtml(String(memory.result))}</span>
        </div>
      `;
    }
  }

  // Modal খুলি
  document.getElementById('calcHistoryModal')?.classList.add('open');
}

/**
 * মডাল বন্ধ
 */
function closeCalcHistory() {
  document.getElementById('calcHistoryModal')?.classList.remove('open');
}


/**
 * হিসাবের string-এ অপারেটরগুলোর চারপাশে স্পেস দিই (সুন্দর দেখানোর জন্য)
 * "50+50" → "50 + 50"
 */
function prettyCalcExpr(expr) {
  return String(expr)
    .replace(/\s+/g, '')
    .replace(/([+\-*/%()])/g, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cancelForm() {
  currentEditId = null;
  resetForm(true);
  showToast('ফর্ম খালি করা হয়েছে');
}

function resetForm(clearDraftToo = false) {
  currentEditId = null;
// 👇 নতুন ফর্মে পুরোনো হিসাবের স্মৃতি মুছে দিই
  window._currentCalcMemory = {};
  document.getElementById('formTitle').textContent = 'নতুন এন্ট্রি';
  document.getElementById('editBadge').style.display = 'none';
  document.getElementById('deleteBtn').style.display = 'none';

  currentBook.fields.forEach(f => {
    if (f.type === 'formula') return;
    const el = document.getElementById('field_' + f.key);
    if (!el) return;
    if (f.type === 'checkbox') el.checked = (f.default === 'true' || f.default === '1');
    else if (f.type === 'date') el.value = f.default || todayISO();
    else if (f.type === 'lookup') el.value = '';
    else el.value = f.default || '';
  });

  if (clearDraftToo) clearDraft(currentBook.id);

  recalcLookups();
  recalcFormulas();
if (typeof attachAutoGrowTextareas === 'function') attachAutoGrowTextareas();

// 👇 সব নাম্বার ফিল্ডের আইকন লুকিয়ে দিই
if (currentBook && currentBook.fields) {
  currentBook.fields.forEach(f => {
    if (f.type === 'number') updateCalcHistoryIcon(f.key, null);
  });
  }

  // 👇 সেভ/বাতিলের পর আবার সাজেশন চেক করি
  updatePasteButtonVisibility();
  renderChart();

  if (typeof formUndoStack !== 'undefined') {
    formUndoStack = [captureFormState()];
    formRedoStack = [];
    updateFormUndoUI();
  }
}

/* ============ Save Entry ============ */
let _savingEntry = false;

async function saveEntry() {
  if (_savingEntry) return;
  _savingEntry = true;

  try {
    const isEditing = currentEditId !== null;

    if (!currentBook.fields.length) {
      showToast('আগে ফিল্ড তৈরি করুন', 'error');
      return;
    }

    const data = {};
    const existingEntry = isEditing
      ? currentEntries.find(e => e.id === currentEditId)
      : null;

    currentBook.fields.forEach(f => {
      if (f.type === 'formula') return;
      const el = document.getElementById('field_' + f.key);
      if (!el) return;

      if (f.type === 'checkbox') {
        data[f.key] = el.checked;
      } else if (f.type === 'lookup') {
        data[f.key] = el.value || '';
      } else if (f.type === 'number') {
        const raw = String(el.value || '').trim();

        if (raw === '') {
          data[f.key] = 0;
        } else if (/[+\-*/%]/.test(raw)) {
          // 👇 ইনপুটে অপারেটর আছে → নিজে হিসাব করি এবং স্মৃতি সেভ করি
          try {
            let expr = raw
              .replace(/(\d+(?:\.\d+)?)\s*([+\-])\s*(\d+(?:\.\d+)?)\s*%/g,
                (_, base, op, pct) => `${base}${op}${base}*${pct}/100`)
              .replace(/%/g, '/100');
            if (/^[0-9+\-*/%().\s]+$/.test(expr)) {
              const calc = Function('"use strict";return(' + expr + ')')();
              const safe = isFinite(calc) ? Math.round(calc * 100) / 100 : 0;
              data[f.key] = safe;

              data['__calc_' + f.key] = {
                expr: raw,
                result: safe,
                at: Date.now()
              };
            } else {
              data[f.key] = 0;
            }
          } catch (e) { data[f.key] = 0; }
        } else {
          // 👇 ইনপুটে অপারেটর নেই (ইউজার হয়তো "=" চেপে ফেলেছে)
          const num = parseFloat(raw);
          data[f.key] = isNaN(num) ? 0 : num;

          // 👇 সমাধান: `=` চেপে হিসাব করা হলে স্মৃতিটা এখানে ধরা পড়বে
          if (window._currentCalcMemory && window._currentCalcMemory[f.key]) {
            data['__calc_' + f.key] = {
              expr: window._currentCalcMemory[f.key].expr,
              result: window._currentCalcMemory[f.key].result,
              at: window._currentCalcMemory[f.key].at || Date.now()
            };
          } else if (existingEntry && existingEntry['__calc_' + f.key]) {
            // এডিটে আগের সেভ করা স্মৃতি থাকলে সেটা রাখি
            data['__calc_' + f.key] = { ...existingEntry['__calc_' + f.key] };
          }
        }
      } else {
        data[f.key] = el.value || '';
      }
    });

    // ফর্মুলা (৫ পাস)
    const context = {};
    currentBook.fields.forEach(f => {
      if (f.type !== 'formula') {
        // 👇 data-তে না থাকলে ডিফল্ট 0 বা '' দিই
        context[f.key] = data[f.key] !== undefined ? data[f.key] : (f.type === 'number' || f.type === 'checkbox' ? 0 : '');
      }
    });

    for (let pass = 0; pass < 5; pass++) {
      currentBook.fields.forEach(f => {
        if (f.type !== 'formula') return;
        const result = calcFormula(f.formula, context);
        const safe = isNaN(result) ? 0 : result;
        context[f.key] = safe;
        data[f.key] = safe;
      });
    }

    if (currentEditId) {
      const idx = currentEntries.findIndex(e => e.id === currentEditId);
      if (idx >= 0) {
        // 👇 createdAt ও id সংরক্ষণ করি
        currentEntries[idx] = { 
          ...currentEntries[idx], 
          ...data, 
          id: currentEntries[idx].id,        // id অপরিবর্তিত
          createdAt: currentEntries[idx].createdAt || Date.now(),
          updatedAt: Date.now() 
        };
        showToast('আপডেট হয়েছে', 'success');
      }
    } else {
      currentEntries.push({
        id: generateId('entry'),
        ...data,
        createdAt: Date.now()
      });
      showToast('সেভ হয়েছে', 'success');
    }

    const ok = await saveEntries(currentBook.id, currentEntries);
    if (ok) {
      clearDraft(currentBook.id);
      resetForm(false);
      renderTable();
      renderSummary();

      if (!isEditing && typeof onEntryAdded === 'function') {
        onEntryAdded();
      }
    }
  } catch (err) {
    console.error('saveEntry failed:', err);
    showToast('সেভ ব্যর্থ হয়েছে', 'error');
  } finally {
    _savingEntry = false;
  }
}


function deleteCurrent() {
  if (currentEditId === null || currentEditId === undefined) return;
  pendingDeleteId = currentEditId;
  pendingDeleteBulk = false;
  document.getElementById('deleteMessage').textContent = 'এই এন্ট্রিটি ডিলিট করবেন? (রিসাইকেল বিনে যাবে)';
  document.getElementById('deleteModal').classList.add('open');
}

function closeDeleteModal() {
  const modal = document.getElementById('deleteModal');
  if (modal) modal.classList.remove('open');
  pendingDeleteId = null;
  pendingDeleteBulk = false;
}

async function confirmDelete() {
  const bulkMode = pendingDeleteBulk;
  const delId = pendingDeleteId;
  const idsToDelete = bulkMode ? Array.from(selectedIds) : (delId ? [delId] : []);

  if (idsToDelete.length === 0) {
    closeDeleteModal();
    return;
  }

  // 👇 ডিলিটের আগে ব্যাকআপ রাখি
  backupBeforeDelete(currentBook.id, idsToDelete);

  // 👇 প্রতিটা ধাপ আলাদা try/catch এ — কোনটা ফেল করছে সেটা জানা যাবে
  try {
    await trashEntries(currentBook.id, idsToDelete);
  } catch (err) {
    console.error('❌ trashEntries failed:', err);
    showToast('রিসাইকেল বিনে পাঠাতে সমস্যা', 'error');
    closeDeleteModal();
    return;
  }

  try {
    // 👇 currentEntries ফিল্টার করি এবং __calc_ কী বাদ দিই
    currentEntries = currentEntries
      .filter(e => !idsToDelete.includes(e.id))
      .map(e => {
        const clean = { ...e };
        Object.keys(clean).forEach(k => {
          if (k.startsWith('__calc_')) delete clean[k];
        });
        return clean;
      });
    await saveEntries(currentBook.id, currentEntries);
  } catch (err) {
    console.error('❌ saveEntries failed:', err);
    // save ব্যর্থ হলেও ডিলিট হয়েছে, তাই UI চালিয়ে যাই
  }

  // 👇 UI update আলাদা try/catch এ — modal সর্বদা বন্ধ হবে
  try {
    if (bulkMode) {
      
      /* showToast(toBn(idsToDelete.length) + 'টি এন্ট্রি রিসাইকেল বিনে পাঠানো হয়েছে', 'success'); */


      // (আপনার আগের showToast('এন্ট্রি রিসাইকেল বিনে পাঠানো হয়েছে', 'success'); এর জায়গায়)
  showUndoToast(toBn(idsToDelete.length) + 'টি এন্ট্রি ডিলিট হয়েছে');

      exitSelectMode();
      renderTable();
      renderSummary();
    } else {
      showToast('এন্ট্রি রিসাইকেল বিনে পাঠানো হয়েছে', 'success');
      resetForm(true);
      renderTable();
      renderSummary();
    }
  } catch (err) {
    console.error('❌ UI update failed:', err);
    // UI fail হলেও সফল মেসেজ দেখাই (কারণ ডিলিট হয়েছে)
    showToast('এন্ট্রি রিসাইকেল বিনে পাঠানো হয়েছে', 'success');
  } finally {
    closeDeleteModal();
  }
}

/* ============ Column Width Helper ============ */
function getColumnMinWidth(field) {
  const WIDTH_MAP = {
    small:  60,
    medium: 100,
    large:  180,
    xlarge: 300
  };
  return WIDTH_MAP[field.width] || 100; // পুরোনো ফিল্ডে default 100px
}

/* ============ Table ============ */
function renderTable() {
  const thead = document.getElementById('tableHead');
  const tbody = document.getElementById('tableBody');
  const empty = document.getElementById('tableEmpty');

  if (!currentBook.fields.length) {
    thead.innerHTML = '';
    tbody.innerHTML = '';
    empty.style.display = 'block';
    // 👇 p ট্যাগ না থাকলে ক্র্যাশ এড়াই
    const p = empty.querySelector('p');
    if (p) p.textContent = 'কোনো ফিল্ড নেই — আগে ফিল্ড তৈরি করুন';
    return;
  }
  
  let headHtml = '';
if (isSelectMode) headHtml += '<th style="width:40px;"></th>';
currentBook.fields.forEach(f => {
  const cls = f.type === 'formula' ? 'formula-th' : '';
  const minW = getColumnMinWidth(f);
  headHtml += `<th class="${cls}" style="min-width:${minW}px;">${escapeHtml(f.label)}</th>`;
});
if (!isSelectMode) headHtml += '<th style="width:50px;"></th>';
thead.innerHTML = headHtml;

  const list = getFilteredEntries();

  if (list.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    // 👇 p ট্যাগ না থাকলে ক্র্যাশ এড়াই
    const p = empty.querySelector('p');
    if (p) p.textContent = currentEntries.length === 0
      ? 'এখনো কোনো ডেটা যোগ করা হয়নি'
      : 'কোনো ফলাফল পাওয়া যায়নি';
    return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = list.map(e => {
    let rowHtml = `<tr onclick="${isSelectMode ? `toggleRowSelect('${e.id}')` : `editEntry('${e.id}')`}">`;

    if (isSelectMode) {
      const checked = selectedIds.has(e.id) ? 'checked' : '';
      rowHtml += `<td class="checkbox-td" onclick="event.stopPropagation();">
        <input type="checkbox" ${checked} onclick="event.stopPropagation(); toggleRowSelect('${e.id}')">
      </td>`;
    }

    currentBook.fields.forEach(f => {
  const val = e[f.key];
  const display = formatFieldValue(val, f);
  const cls = f.type === 'formula' ? 'formula-td' : '';
  const minW = getColumnMinWidth(f);
  rowHtml += `<td class="${cls}" style="min-width:${minW}px;">${display}</td>`;
 });

    if (!isSelectMode) {
  rowHtml += `<td class="action-td" onclick="event.stopPropagation();">
    <button class="row-action-btn copy-btn" onclick="event.stopPropagation(); copyEntryToClipboard('${e.id}')" title="কপি করুন">📋</button>
  </td>`;
}
    rowHtml += '</tr>';
    return rowHtml;
  }).join('');

  updateSelCount();
  // টেবিলে ফিল্টার করলে চার্টও আপডেট হবে (যদি চার্ট মডাল খোলা থাকে)
if (document.getElementById('chartModal')?.classList.contains('open')) {
  renderChart();
}
}
function formatFieldValue(val, field) {
  if (val === null || val === undefined || val === '') return '—';

  // 👇 Lookup: live link হলে উৎস থেকে fresh মান
  if (field.type === 'lookup' && field.lookup) {
    if (field.lookup.liveLink) {
      const resolved = resolveLiveLookupValue(field, val);
      if (resolved !== null) return escapeHtml(String(resolved));
    }
    return escapeHtml(String(val));
  }

  if (field.type === 'number' || field.type === 'formula') {
    const num = Number(val);
    if (!isNaN(num)) return formatNumberBn(num);
    return escapeHtml(String(val));
  }
  if (field.type === 'date') {
    try { return formatDateBn(val); } catch (e) { return escapeHtml(String(val)); }
  }
      if (field.type === 'checkbox') {
    return val ? '✓' : '—';
  }
  // 👇 মাল্টি-লাইন লেখায় newline → <br> (escape করার পরে, নিরাপদ)
  return escapeHtml(String(val)).replace(/\n/g, '<br>');
    }

/* ============ Live Lookup Resolve ============ */
function resolveLiveLookupValue(field, currentVal) {
  try {
    if (!field.lookup) return null;
    const sourceEntries = getEntries(field.lookup.sourceBookId);
    const displayKey = field.lookup.displayField;

    // Match: display field-এর মান অথবা (auto-mode হলে) matchField দিয়ে
    const matched = sourceEntries.find(e =>
      String(e[displayKey] || '') === String(currentVal)
    );

    if (matched) return matched[displayKey] || '';
    return null;
  } catch (e) {
    return null;
  }
}

function getFilteredEntries() {
  let list = currentEntries.slice();

  // 👇 এই ৬টি নতুন লাইন
  const searchEl = document.getElementById('tableSearch');
  const filterDateEl = document.getElementById('filterDate');
  const sortByEl = document.getElementById('sortBy');
  const search = (searchEl?.value || '').toLowerCase().trim();
  const dateFilter = filterDateEl?.value || '';
  const sortBy = sortByEl?.value || 'newest';

  if (search) {
    list = list.filter(e => {
      return currentBook.fields.some(f => {
        const v = e[f.key];
        return v !== null && v !== undefined && String(v).toLowerCase().includes(search);
      });
    });
  }

  if (dateFilter) {
    // ডেট ফিল্ড খুঁজি
    const dateField = currentBook.fields.find(f => f.type === 'date');
    const today = new Date();
    let fromDate = null;
    let toDate = null;

    if (dateFilter === 'today') {
      const iso = todayISO();
      fromDate = new Date(iso + 'T00:00:00');
      toDate = new Date(iso + 'T23:59:59');
    } else if (dateFilter === 'week') {
      fromDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (dateFilter === 'month') {
      fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
    } else if (dateFilter === 'year') {
      fromDate = new Date(today.getFullYear(), 0, 1);
    } else if (dateFilter === 'custom') {
      const startVal = document.getElementById('filterStartDate').value;
      const endVal = document.getElementById('filterEndDate').value;
      if (startVal) fromDate = new Date(startVal + 'T00:00:00');
      if (endVal) toDate = new Date(endVal + 'T23:59:59');
    }

    if (fromDate || toDate) {
      list = list.filter(e => {
        let ts;
        if (dateField && e[dateField.key]) {
          ts = new Date(e[dateField.key] + 'T00:00:00').getTime();
        } else {
          ts = e.createdAt || 0;
        }
        if (isNaN(ts)) return false;
        if (fromDate && ts < fromDate.getTime()) return false;
        if (toDate && ts > toDate.getTime()) return false;
        return true;
      });
    }
  }

  // ============================================================
// 🔄 নতুন সর্টিং লজিক (সব ধরনের সর্ট সাপোর্ট করে)
// ============================================================
list.sort((a, b) => {
  // ১. তৈরি অনুযায়ী
  if (sortBy === 'newest') return (b.createdAt || 0) - (a.createdAt || 0);
  if (sortBy === 'oldest') return (a.createdAt || 0) - (b.createdAt || 0);

  // ২. সর্বশেষ এডিট অনুযায়ী
  if (sortBy === 'updated_desc') return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
  if (sortBy === 'updated_asc')  return (a.updatedAt || a.createdAt || 0) - (b.updatedAt || b.createdAt || 0);

  // ৩. তারিখ ফিল্ড অনুযায়ী (বুকের প্রথম date ফিল্ড ব্যবহার)
  if (sortBy === 'date_newest' || sortBy === 'date_oldest') {
    const df = currentBook.fields.find(f => f.type === 'date');
    const getTs = (e) => {
      if (df && e[df.key]) {
        const t = new Date(e[df.key] + 'T00:00:00').getTime();
        if (!isNaN(t)) return t;
      }
      return e.createdAt || 0;
    };
    const ta = getTs(a), tb = getTs(b);
    return sortBy === 'date_newest' ? tb - ta : ta - tb;
  }

  // ৪. নির্দিষ্ট ফিল্ড দিয়ে সর্ট (সংখ্যা/টেক্সট)
  if (sortBy === 'field_desc' || sortBy === 'field_asc' || sortBy === 'az' || sortBy === 'za') {
    const fk = document.getElementById('sortFieldKey')?.value;
    if (!fk) return 0;

    const fieldDef = currentBook.fields.find(f => f.key === fk);
    if (!fieldDef) return 0;

    // সংখ্যা টাইপ হলে সংখ্যা হিসেবে তুলনা
    const isNumeric = (fieldDef.type === 'number' || fieldDef.type === 'formula');

    const getVal = (e) => e[fk];

    if (isNumeric) {
      const va = Number(getVal(a)) || 0;
      const vb = Number(getVal(b)) || 0;
      return (sortBy === 'field_desc') ? vb - va : va - vb;
    } else {
      // টেক্সট তুলনা (লোকেল তুলনা)
      const sa = String(getVal(a) ?? '').toLowerCase();
      const sb = String(getVal(b) ?? '').toLowerCase();
      const cmp = sa.localeCompare(sb, 'bn');
      return (sortBy === 'za') ? -cmp : cmp;
    }
  }

  return 0;
});

  return list;
}

function toggleFilterPanel() {
  const p = document.getElementById('filterPanel');
  const s = document.getElementById('sortPanel');
  s.classList.remove('open');
  p.classList.toggle('open');
  document.getElementById('filterBtn').classList.toggle('active', p.classList.contains('open'));
  document.getElementById('sortBtn').classList.remove('active');
}

/* ============ Sort Field Selector (নতুন) ============ */
function onSortByChange() {
  const val = document.getElementById('sortBy').value;
  const wrap = document.getElementById('sortFieldWrap');

  // শুধু field_desc / field_asc / az / za হলে ফিল্ড সিলেক্টর দেখাবে
  const needsField = ['field_desc', 'field_asc', 'az', 'za'].includes(val);

  if (needsField) {
    wrap.style.display = 'block';
    populateSortFieldOptions(val);
  } else {
    wrap.style.display = 'none';
  }

  updateTableAndSummaries();
}

function populateSortFieldOptions(sortVal) {
  const sel = document.getElementById('sortFieldKey');
  if (!sel) return;

  let allowedTypes;
  if (sortVal === 'field_desc' || sortVal === 'field_asc') {
    allowedTypes = ['number', 'formula'];
  } else {
    allowedTypes = ['text', 'dropdown', 'lookup', 'date', 'checkbox'];
  }

  const fields = currentBook.fields.filter(f => allowedTypes.includes(f.type));

  if (fields.length === 0) {
    sel.innerHTML = '<option value="">— কোনো উপযুক্ত ফিল্ড নেই —</option>';
    return;
  }

  const cur = sel.value;
  sel.innerHTML = fields.map(f =>
    `<option value="${escapeAttr(f.key)}">${escapeHtml(f.label)}</option>`
  ).join('');

  if (cur && fields.some(f => f.key === cur)) {
    sel.value = cur;
  }
}



function toggleSortPanel() {
  const p = document.getElementById('sortPanel');
  const f = document.getElementById('filterPanel');
  f.classList.remove('open');
  p.classList.toggle('open');
  document.getElementById('sortBtn').classList.toggle('active', p.classList.contains('open'));
  document.getElementById('filterBtn').classList.remove('active');
}

/* ============ Edit Entry ============ */
function editEntry(id) {
  const e = currentEntries.find(x => x.id === id);
  if (!e) return;

  switchViewTab('form');
  currentEditId = id;

  currentBook.fields.forEach(f => {
    if (f.type === 'formula') return;
    const el = document.getElementById('field_' + f.key);
    if (!el) return;

    const val = e[f.key];
    if (f.type === 'checkbox') {
      el.checked = (val === true || val === 1 || val === 'true' || val === '1');
    } else if (f.type === 'dropdown') {
      el.value = (val === undefined || val === null) ? '' : String(val);
    } else if (f.type === 'lookup') {
      // Manual: select-এ মান বসাও
      // Auto: readonly input-এ মান বসাও, পরে recalcLookups আপডেট করবে
      el.value = (val === undefined || val === null) ? '' : String(val);
    } else if (f.type === 'number') {
      el.value = (val === undefined || val === null || val === '') ? '' : val;
    } else {
      el.value = (val === undefined || val === null) ? '' : val;
    }
  });

  document.getElementById('formTitle').textContent = 'এন্ট্রি এডিট';
  document.getElementById('editBadge').style.display = 'inline-block';
  document.getElementById('deleteBtn').style.display = 'block';

  recalcFormulas();
if (typeof attachAutoGrowTextareas === 'function') attachAutoGrowTextareas();
setTimeout(() => {
  attachEnterNavigation();
}, 50);

  // 👇 হিসাবের স্মৃতি থেকে আইকন আপডেট করি
  window._currentCalcMemory = {};
  setTimeout(() => {
    refreshAllCalcHistoryIcons();
    if (typeof formUndoStack !== 'undefined') {
      formUndoStack = [captureFormState()];
      formRedoStack = [];
      updateFormUndoUI();
    }
  }, 100);

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ============ Selection ============ */
function enterSelectMode() {
  isSelectMode = true;
  selectedIds.clear();
  document.getElementById('selectionBar').classList.add('open');
  document.getElementById('selectModeBtn').classList.add('active');
  document.getElementById('selectModeBtn').textContent = '☑ Deselect';
  renderTable();
  renderSummary();
}

function exitSelectMode() {
  isSelectMode = false;
  selectedIds.clear();
  document.getElementById('selectionBar').classList.remove('open');
  document.getElementById('selectModeBtn').classList.remove('active');
  document.getElementById('selectModeBtn').textContent = '☑ Select';
  renderTable();
  renderSummary();
}

function toggleRowSelect(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  renderTable();
  renderSummary();

  if (document.getElementById('chartModal')?.classList.contains('open')) {
  renderChart();
}
}

function toggleSelectAll() {
  const list = getFilteredEntries();
  const allSel = list.length > 0 && list.every(e => selectedIds.has(e.id));
  if (allSel) list.forEach(e => selectedIds.delete(e.id));
  else list.forEach(e => selectedIds.add(e.id));
  renderTable();
  renderSummary();
}

function updateSelCount() {
  document.getElementById('selCount').textContent = toBn(selectedIds.size) + 'টি নির্বাচিত';
}

function deleteSelected() {
  if (selectedIds.size === 0) {
    showToast('কিছু নির্বাচন করুন', 'error');
    return;
  }
  pendingDeleteBulk = true;
  pendingDeleteId = null;
  document.getElementById('deleteMessage').textContent = toBn(selectedIds.size) + 'টি এন্ট্রি ডিলিট করবেন? (রিসাইকেল বিনে যাবে)';
  document.getElementById('deleteModal').classList.add('open');
}

/* ============ Export ============ */
function openExportSheet() {
  document.getElementById('exportOverlay').classList.add('open');
  document.getElementById('exportSheet').classList.add('open');
}

function closeExportSheet() {
  document.getElementById('exportOverlay').classList.remove('open');
  document.getElementById('exportSheet').classList.remove('open');
}

/* ============ Import Sheet ============ */
function openImportSheet() {
  document.getElementById('importOverlay').classList.add('open');
  document.getElementById('importSheet').classList.add('open');
}

function closeImportSheet() {
  document.getElementById('importOverlay').classList.remove('open');
  document.getElementById('importSheet').classList.remove('open');
}

function exportCSV() {
  closeExportSheet();
  const list = getFilteredEntries();
  if (list.length === 0) {
    showToast('এক্সপোর্ট করার ডেটা নেই', 'error');
    return;
  }

  const header = currentBook.fields.map(f => f.label);
  const rows = [header];
  list.forEach(e => {
    rows.push(currentBook.fields.map(f => {
      const v = e[f.key];
      if (v === null || v === undefined) return '';
      if (f.type === 'checkbox') return v ? 'হ্যাঁ' : 'না';
      if (f.type === 'date') return formatDateBn(v) || String(v);
      return String(v);
    }));
  });

  const csv = '\uFEFF' + rows.map(r =>
    r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')
  ).join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (currentBook.name || 'book') + '_' + todayISO() + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('CSV ডাউনলোড হয়েছে', 'success');
}

/* ============ Excel Export ============ */
async function exportXLSXFromView() {
  closeExportSheet();

  const list = getFilteredEntries();
  if (list.length === 0) {
    showToast('এক্সপোর্ট করার ডেটা নেই', 'error');
    return;
  }

  // ফিল্ড _id কলাম বাদ দিয়ে (formula ও থাকবে)
  const headers = currentBook.fields.map(f => f.label);
  const types = currentBook.fields.map(f => f.type);

  const rows = list.map(e => {
    const row = currentBook.fields.map(f => {
      const v = e[f.key];
      if (v === null || v === undefined) return '';
      if (f.type === 'checkbox') return v ? 'হ্যাঁ' : 'না';
      if (f.type === 'date') return v; // ISO রাখি → Excel date হিসেবে পড়বে
      return v;
    });
    row._id = e.id;        // 👈 hidden _id
    row._types = types;
    return row;
  });

  showLoading('Excel তৈরি হচ্ছে...');
  try {
    const safeName = (currentBook.name || 'book').replace(/[\\/:*?"<>|]/g, '_');
    await exportXlsx({
      fileName: `${safeName}_${todayISO()}.xlsx`,
      sheetName: (currentBook.name || 'Data').slice(0, 28).replace(/[\\/:*?"<>|\[\]]/g, '_'),
      headers,
      rows,
      idColumn: '_id'
    });
    hideLoading();
    showToast('Excel ডাউনলোড হয়েছে ✅', 'success');
  } catch (err) {
    hideLoading();
    console.error(err);
    showToast('Excel তৈরি ব্যর্থ: ' + err.message, 'error');
  }
}

window.exportXLSXFromView = exportXLSXFromView;

function exportPDF() {
  closeExportSheet();
  window.print();
}

function toggleDateRange() {
  const filterDate = document.getElementById('filterDate').value;
  const rangeInputs = document.getElementById('dateRangeInputs');
  rangeInputs.style.display = (filterDate === 'custom') ? 'block' : 'none';
}

/* ============ Copy / Paste Entry (Cross-Book) ============ */

const CLIPBOARD_KEY = 'likhipata_entry_clipboard';

// 📋 কপি বাটনে ক্লিক করলে এটা চালু হবে
function copyEntryToClipboard(id) {
  const entry = currentEntries.find(e => e.id === id);
  if (!entry) {
    showToast('এন্ট্রি পাওয়া যায়নি', 'error');
    return;
  }

  // শুধু ফিল্ডের মান (মেটাডেটা বাদ) কপি করি
  const data = {};
  currentBook.fields.forEach(f => {
    if (f.type === 'formula') return; // ফর্মুলা নতুন বুক নিজে হিসাব করবে
    if (entry[f.key] !== undefined) {
      data[f.key] = entry[f.key];
    }
  });

  const clipboard = {
    bookId: currentBook.id,
    bookName: currentBook.name,
    sourceLabels: currentBook.fields.reduce((acc, f) => {
      acc[f.key] = f.label;
      return acc;
    }, {}),
    data,
    copiedAt: Date.now()
  };

  try {
    localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(clipboard));
    // 👇 নতুন কপি হলে আগের ডিসমিস রিসেট
    sessionStorage.removeItem('likhipata_clip_suggestion_dismissed');
    showToast(
      `📋 "${currentBook.name}" থেকে কপি হয়েছে। ফর্ম ট্যাবে গেলে সাজেশন দেখাবে।`,
      'success'
    );
    updatePasteButtonVisibility();
  } catch (e) {
    console.error('Clipboard save failed:', e);
    showToast('কপি ব্যর্থ হয়েছে', 'error');
  }
}

// 📥 পেস্ট বাটনে ক্লিক করলে এটা চালু হবে
function pasteEntryFromClipboard() {
  const raw = localStorage.getItem(CLIPBOARD_KEY);
  if (!raw) {
    showToast('কিছু কপি করা হয়নি — আগে অন্য বুক থেকে 📋 কপি করুন', 'error');
    return;
  }

  let clipboard;
  try {
    clipboard = JSON.parse(raw);
  } catch (e) {
    showToast('কপি করা ডেটা নষ্ট হয়ে গেছে', 'error');
    return;
  }

  if (!clipboard || !clipboard.data) {
    showToast('কপি করা ডেটা পাওয়া যায়নি', 'error');
    return;
  }

  // ফর্ম রিসেট (নতুন এন্ট্রি মোড)
  currentEditId = null;
  document.getElementById('formTitle').textContent = 'নতুন এন্ট্রি (পেস্ট)';
  document.getElementById('editBadge').style.display = 'none';
  document.getElementById('deleteBtn').style.display = 'none';

  let matchedCount = 0;
  let skippedCount = 0;

  currentBook.fields.forEach(f => {
    if (f.type === 'formula') return;

    const el = document.getElementById('field_' + f.key);
    if (!el) return;

    // প্রথমে key দিয়ে চেষ্টা, না মিললে label দিয়ে চেষ্টা
    let srcVal = clipboard.data[f.key];

    if (srcVal === undefined && clipboard.sourceLabels) {
      // label ম্যাচিং
      const sourceKey = Object.keys(clipboard.sourceLabels).find(
        k => clipboard.sourceLabels[k] === f.label
      );
      if (sourceKey && clipboard.data[sourceKey] !== undefined) {
        srcVal = clipboard.data[sourceKey];
      }
    }

    if (srcVal === undefined) {
      skippedCount++;
      return;
    }

    // মান বসাও
    if (f.type === 'checkbox') {
      el.checked = (srcVal === true || srcVal === 1 || srcVal === 'true' || srcVal === '1');
    } else if (f.type === 'number') {
      el.value = (srcVal === null || srcVal === undefined || srcVal === '') ? '' : srcVal;
    } else {
      el.value = (srcVal === null || srcVal === undefined) ? '' : String(srcVal);
    }
    matchedCount++;
  });

  // লুকআপ ও ফর্মুলা রিফ্রেশ
  if (typeof recalcLookups === 'function') recalcLookups();
  if (typeof recalcFormulas === 'function') recalcFormulas();
if (typeof attachAutoGrowTextareas === 'function') attachAutoGrowTextareas();
  if (typeof saveDraftAuto === 'function') saveDraftAuto();

  // ফর্ম ট্যাবে সুইচ
  if (typeof switchViewTab === 'function') switchViewTab('form');

  // স্ক্রল উপরে
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // মেসেজ
  if (matchedCount === 0) {
    showToast('⚠️ কোনো ফিল্ড মেলেনি — দুই বুকের ফিল্ডের নাম এক হতে হবে', 'error');
  } else if (skippedCount > 0) {
    showToast(`${toBn(matchedCount)}টি ফিল্ড পেস্ট হয়েছে • ${toBn(skippedCount)}টি বাদ (নাম মেলেনি)`, 'success');
  } else {
    showToast(`${toBn(matchedCount)}টি ফিল্ড পেস্ট হয়েছে ✅`, 'success');
  }

  // পেস্টের পর সাজেশন বন্ধ করো
  const card = document.getElementById('clipboardSuggestion');
  if (card) card.style.display = 'none';
}

// 📋 পেস্ট বাটন দেখানোর জন্য চেক
function hasClipboardData() {
  const raw = localStorage.getItem(CLIPBOARD_KEY);
  if (!raw) return false;
  try {
    const c = JSON.parse(raw);
    return !!(c && c.data && Object.keys(c.data).length > 0);
  } catch (e) {
    return false;
  }
}

// 📋 ক্লিপবোর্ড পরিষ্কার
function clearClipboard() {
  localStorage.removeItem(CLIPBOARD_KEY);
}

/* ============ Duplicate ============ */
function duplicateEntry(id) {
  const entry = currentEntries.find(e => e.id === id);
  if (!entry) return;

  // নতুন এন্ট্রি হিসেবে ফর্মটি রিসেট করা
  resetForm(true);

  // পুরনো এন্ট্রির ডেটা ফর্মে বসানো (আইডি ছাড়া)
  currentBook.fields.forEach(f => {
    if (f.type === 'formula') return;
    const el = document.getElementById('field_' + f.key);
    if (!el) return;

    const val = entry[f.key];

    if (f.type === 'checkbox') {
      el.checked = (val === true || val === 1 || val === 'true' || val === '1');
    } else if (f.type === 'dropdown') {
      el.value = (val === undefined || val === null) ? '' : String(val);
    } else if (f.type === 'lookup') {
      el.value = (val === undefined || val === null) ? '' : String(val);
    } else if (f.type === 'number') {
      el.value = (val === undefined || val === null || val === '') ? '' : val;
    } else {
      el.value = (val === undefined || val === null) ? '' : val;
    }
  });

  const formTitleEl = document.getElementById('formTitle');
  const editBadgeEl = document.getElementById('editBadge');
  const deleteBtnEl = document.getElementById('deleteBtn');
  if (formTitleEl) formTitleEl.textContent = 'নতুন এন্ট্রি (কপি)';
  if (editBadgeEl) editBadgeEl.style.display = 'none';
  if (deleteBtnEl) deleteBtnEl.style.display = 'none';

  currentEditId = null;

  // ✅ সঠিক ফাংশন নাম (c সহ)
  if (typeof recalcLookups === 'function') recalcLookups();
  if (typeof recalcFormulas === 'function') recalcFormulas();
if (typeof attachAutoGrowTextareas === 'function') attachAutoGrowTextareas();

  if (typeof saveDraftAuto === 'function') saveDraftAuto();

  showToast('এন্ট্রি কপি করা হয়েছে। এখন সেভ করুন।', 'success');
}

/* ============ Enter Navigation (Mobile Safe) ============ */
function attachEnterNavigation() {
  const allInputs = Array.from(
    document.querySelectorAll(
      '#dynamicForm input, #dynamicForm select, #dynamicForm textarea'
    )
  ).filter(el => !el.readOnly && !el.disabled && el.type !== 'hidden' && el.tagName !== 'TEXTAREA');

  if (allInputs.length === 0) return;

  allInputs.forEach((el, index) => {
    // পুরোনো handler থাকলে সরাই
    if (el._enterHandler) {
      el.removeEventListener('keydown', el._enterHandler);
      el.removeEventListener('keypress', el._enterHandlerPress);
    }

    const goNext = () => {
      const next = allInputs[index + 1];
      if (next) {
        next.focus();
        // caret শেষে
        if (typeof next.setSelectionRange === 'function' && typeof next.value === 'string' && next.value.length > 0) {
          try { next.setSelectionRange(next.value.length, next.value.length); } catch (_) {}
        }
        try {
          next.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (_) {
          next.scrollIntoView();
        }
      } else {
        const saveBtn = document.querySelector('#formBtnRow .btn-save') || document.querySelector('.btn-save');
        if (saveBtn) {
          saveBtn.focus();
          try {
            saveBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } catch (_) {
            saveBtn.scrollIntoView();
          }
        }
      }
    };

    // keydown + keypress দুটোই handle — কিছু কিবোর্ডে keydown এ Enter আসে না
    const handler = (e) => {
      // mobile-এ Enter সনাক্ত: e.key, e.code, e.keyCode — তিনটাই চেক
      const isEnter = (
        e.key === 'Enter' ||
        e.code === 'Enter' ||
        e.code === 'NumpadEnter' ||
        e.keyCode === 13 ||
        e.which === 13
      );
      if (!isEnter) return;
      if (e.shiftKey) return; // Shift+Enter → newline
      if (e.isComposing) return; // IME composition শেষ হোক

      // textarea হলে Enter → newline
      if (el.tagName === 'TEXTAREA') {
        // এখানে চাইলে e.preventDefault(); দিয়ে "পরের ফিল্ডে যাও" করতে পারেন
        return;
      }

      e.preventDefault();
      goNext();
    };

    el.addEventListener('keydown', handler);
    el._enterHandler = handler;

    // কিছু Android কিবোর্ড keypress ইভেন্টে Enter পাঠায়
    const pressHandler = (e) => {
      const isEnter = (
        e.key === 'Enter' ||
        e.keyCode === 13 ||
        e.which === 13
      );
      if (!isEnter) return;
      if (el.tagName === 'TEXTAREA') return;
      e.preventDefault();
      goNext();
    };
    el.addEventListener('keypress', pressHandler);
    el._enterHandlerPress = pressHandler;
  });
}

/* ============================================================
   UNDO SYSTEM (For View Page - Delete & Edit)
   ============================================================ */
let lastDeletedEntries = [];
let lastDeletedBookId = null;
let viewUndoTimer = null;
let lastDeletedExpiresAt = 0;

// ডিলিটের আগে এন্ট্রি ব্যাকআপ রাখি
function backupBeforeDelete(bookId, entryIds) {
  const entries = getEntries(bookId);
  lastDeletedEntries = entries.filter(e => entryIds.includes(e.id));
  lastDeletedBookId = bookId;
}

// আনডু বাটন তৈরি করা
function showUndoToast(message) {
  if (viewUndoTimer) clearTimeout(viewUndoTimer);
  // 👇 টোস্টের নিজস্ব টাইমারও ক্লিয়ার করি
  if (typeof _toastTimer !== 'undefined' && _toastTimer) {
    clearTimeout(_toastTimer);
    window._toastTimer = null;
  }
  lastDeletedExpiresAt = Date.now() + 5000;

  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.innerHTML = `
    <span>${message}</span>
    <button class="toast-action" onclick="performUndo()">আনডু</button>
  `;

  toast.className = 'toast show';
  viewUndoTimer = setTimeout(() => {
    toast.classList.remove('show');
    lastDeletedEntries = [];
    lastDeletedBookId = null;
    lastDeletedExpiresAt = 0;
  }, 5000);
}

async function performUndo() {
  if (
    !lastDeletedEntries ||
    lastDeletedEntries.length === 0 ||
    !lastDeletedBookId ||
    Date.now() > lastDeletedExpiresAt
  ) {
    lastDeletedEntries = [];
    lastDeletedBookId = null;
    lastDeletedExpiresAt = 0;
    showToast('আনডু করার কোনো ডেটা নেই', 'error');
    return;
  }

  if (viewUndoTimer) clearTimeout(viewUndoTimer);

  const bookId = lastDeletedBookId;
  const entriesToRestore = [...lastDeletedEntries];

  const latestEntries = getEntries(bookId);
  entriesToRestore.forEach(e => {
    if (!latestEntries.find(x => x.id === e.id)) {
      // 👇 bookId বাদ দিয়ে পুশ করি
      const { bookId: _bid, ...entryData } = e;
      latestEntries.push(entryData);
    }
  });

  await saveEntries(bookId, latestEntries);

  currentEntries = getEntries(bookId);
  renderTable();
  renderSummary();

  showToast('ডেটা ফিরিয়ে আনা হয়েছে', 'success');

  lastDeletedEntries = [];
  lastDeletedBookId = null;
  lastDeletedExpiresAt = 0;
}

window.performUndo = performUndo;

/* ============================================================
   FORM UNDO / REDO SYSTEM (For View Page - Header Buttons)
   ============================================================ */
let formUndoStack = [];
let formRedoStack = [];

// ফর্মের বর্তমান স্টেট নেওয়া
function captureFormState() {
  const state = {};
  currentBook.fields.forEach(f => {
    const el = document.getElementById('field_' + f.key);
    if (!el) return;
    if (f.type === 'checkbox') state[f.key] = el.checked;
    else state[f.key] = el.value;
  });
  return state;
}

// ফর্মের স্টেট রিস্টোর করা
function restoreFormState(state) {
  currentBook.fields.forEach(f => {
    const el = document.getElementById('field_' + f.key);
    if (!el) return;
    if (state[f.key] !== undefined) {
      if (f.type === 'checkbox') el.checked = state[f.key];
      else el.value = state[f.key];
    }
  });
  recalcFormulas();
  recalcLookups();
  if (typeof attachAutoGrowTextareas === 'function') attachAutoGrowTextareas();
}

// ফর্ম স্টেট সেভ করা (ইনপুট চেঞ্জ হলে)
function saveFormStateDebounced() {
  if (window._formStateTimer) clearTimeout(window._formStateTimer);
  window._formStateTimer = setTimeout(() => {
    const state = captureFormState();
    const stateStr = JSON.stringify(state);
    
    if (formUndoStack.length > 0 && JSON.stringify(formUndoStack[formUndoStack.length - 1]) === stateStr) return;
    
    formUndoStack.push(state);
    formRedoStack = []; // নতুন টাইপ করলে রিডু ক্লিয়ার হবে
    
    if (formUndoStack.length > 50) formUndoStack.shift();
    
    updateFormUndoUI();
  }, 800); // ০.৮ সেকেন্ড পর সেভ করবে
}

// আনডু করা
function undoForm() {
  if (formUndoStack.length <= 1) {
    showToast('আর আনডু করার কিছু নেই', 'error');
    return;
  }
  
  const currentState = formUndoStack.pop();
  formRedoStack.push(currentState);
  
  const prevState = formUndoStack[formUndoStack.length - 1];
  restoreFormState(prevState);
  
  updateFormUndoUI();
  showToast('আনডু করা হয়েছে', 'success');
}

// রিডু করা
function redoForm() {
  if (formRedoStack.length === 0) {
    showToast('আর রিডু করার কিছু নেই', 'error');
    return;
  }
  
  const nextState = formRedoStack.pop();
  formUndoStack.push(nextState);
  restoreFormState(nextState);
  
  updateFormUndoUI();
  showToast('রিডু করা হয়েছে', 'success');
}

// হেডারের বাটনগুলোর স্টেট আপডেট করা
function updateFormUndoUI() {
  const undoBtn = document.getElementById('viewUndoBtn');
  const redoBtn = document.getElementById('viewRedoBtn');

  if (undoBtn) {
    undoBtn.style.opacity = formUndoStack.length > 1 ? '1' : '0.3';
    undoBtn.style.pointerEvents = formUndoStack.length > 1 ? 'auto' : 'none';
  }
  if (redoBtn) {
    redoBtn.style.opacity = formRedoStack.length > 0 ? '1' : '0.3';
    redoBtn.style.pointerEvents = formRedoStack.length > 0 ? 'auto' : 'none';
  }
}

// ফর্মে টাইপ করার সময় স্টেট সেভ করার ট্রিগার
function initFormUndoListener() {
  const formEl = document.getElementById('dynamicForm');
  if (!formEl) return;

  // প্রথম স্টেট সেভ করি
  setTimeout(() => {
    formUndoStack = [captureFormState()];
    formRedoStack = [];
    updateFormUndoUI();
  }, 500);

  // যেকোনো ইনপুট বা চেঞ্জে স্টেট সেভ করি
  formEl.addEventListener('input', saveFormStateDebounced);
  formEl.addEventListener('change', saveFormStateDebounced);
}

// DOM লোড হলে ইনিশিয়ালাইজ করি
// 👇 renderForm-এ ইতিমধ্যে লিসেনার যোগ করা হয়, তাই এখানে আর দরকার নেই
// document.addEventListener('DOMContentLoaded', () => {
//   setTimeout(initFormUndoListener, 1000);
// });



/* ============================================================
   CHART VISUALIZATION SYSTEM (Dynamic Section Based)
   ============================================================ */
let chartInstances = []; // একাধিক চার্টের ইনস্ট্যান্স রাখার জন্য

async function openChartModal() {
  const modal = document.getElementById('chartModal');
  if (!modal) return;

  if (!currentBook.chartSections || currentBook.chartSections.length === 0) {
    // যদি ইউজার বিল্ডার থেকে কোনো সেকশন না বানায়, তবে ডিফল্ট হিসেবে সব নাম্বার ফিল্ড নিয়ে একটা সেকশন বানায়
    const numericFields = currentBook.fields.filter(f => f.type === 'number' || f.type === 'formula');
    if (numericFields.length === 0) {
      showToast('চার্ট দেখার জন্য অন্তত একটি নাম্বার বা ফর্মুলা ফিল্ড থাকতে হবে', 'error');
      return;
    }
    // ডিফল্ট সেকশন তৈরি ও সেভ
    currentBook.chartSections = [{
      id: 'default',
      title: 'সব ফিল্ডের সারাংশ',
      fields: numericFields.map(f => ({ fieldKey: f.key }))
    }];
    if (typeof updateBook === 'function') {
      await updateBook(currentBook.id, { chartSections: currentBook.chartSections });
    }
  }

  modal.classList.add('open');
  
  setTimeout(() => {
    populateChartFilters();
    renderChart();
  }, 100);
}

function closeChartModal() {
  const modal = document.getElementById('chartModal');
  if (modal) modal.classList.remove('open');
}

// ফিল্টার (দিন, মাস, বছর) এর অপশন তৈরি করা
function populateChartFilters() {
  const daySelect = document.getElementById('chartDay');
  const monthSelect = document.getElementById('chartMonth');
  const yearSelect = document.getElementById('chartYear');
  if (!daySelect || !monthSelect || !yearSelect) return;

  const days = new Set();
  const months = new Set();
  const years = new Set();

  const dateField = currentBook.fields.find(f => f.type === 'date');

  currentEntries.forEach(e => {
    let dateStr = '';
    if (dateField && e[dateField.key]) {
      dateStr = e[dateField.key];
    } else if (e.createdAt) {
      const d = new Date(e.createdAt);
      dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    if (dateStr && dateStr.includes('-')) {
      const [y, m, d] = dateStr.split('-');
      if (y) years.add(y);
      if (m) months.add(m);
      if (d) days.add(d);
    }
  });

  const curDay = daySelect.value;
  const curMonth = monthSelect.value;
  const curYear = yearSelect.value;

  daySelect.innerHTML = '<option value="">সব দিন</option>' + 
    Array.from(days).sort((a,b) => parseInt(a) - parseInt(b)).map(d => 
      `<option value="${d}" ${d === curDay ? 'selected' : ''}>${toBn(parseInt(d))}</option>`
    ).join('');

  monthSelect.innerHTML = '<option value="">সব মাস</option>' + 
    Array.from(months).sort().map(m => 
      `<option value="${m}" ${m === curMonth ? 'selected' : ''}>${getBnMonth(parseInt(m))}</option>`
    ).join('');

  yearSelect.innerHTML = '<option value="">সব বছর</option>' + 
    Array.from(years).sort().reverse().map(y => 
      `<option value="${y}" ${y === curYear ? 'selected' : ''}>${toBn(y)}</option>`
    ).join('');
}

// মূল চার্ট রেন্ডারার
function renderChart() {
  const canvasContainer = document.getElementById('chartCanvasContainer'); // এটা আমাদের view.html এ তৈরি করতে হবে
  const summaryText = document.getElementById('chartSummaryText');
  const daySelect = document.getElementById('chartDay');
  const monthSelect = document.getElementById('chartMonth');
  const yearSelect = document.getElementById('chartYear');

  if (!canvasContainer) return;

  const filterDay = daySelect ? daySelect.value : '';
  const filterMonth = monthSelect ? monthSelect.value : '';
  const filterYear = yearSelect ? yearSelect.value : '';

  const dateField = currentBook.fields.find(f => f.type === 'date');

  // ১. ডেটা ফিল্টার (টেবিলের সার্চ, ফিল্টার ও সিলেক্টের সাথে সিঙ্ক)
  let filteredEntries = currentEntries;
  
  // যদি টেবিলে কিছু সিলেক্ট করা থাকে, তবে শুধু সেগুলোই নিবে
  if (isSelectMode && selectedIds.size > 0) {
    filteredEntries = currentEntries.filter(e => selectedIds.has(e.id));
  } else {
    // না থাকলে টেবিলের সার্চ ও ফিল্টার অনুযায়ী ডেটা নিবে
    filteredEntries = getFilteredEntries(); 
  }

  // এরপর চার্টের নিজস্ব ডেট ফিল্টার (দিন, মাস, বছর)
  const dateFilteredEntries = filteredEntries.filter(e => {
    if (!e) return false; // 👈 null এন্ট্রি বাদ
    let dateStr = '';
    if (dateField && e[dateField.key]) {
      dateStr = e[dateField.key];
    } else if (e.createdAt) {
      const d = new Date(e.createdAt);
      dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    if (!dateStr) return true;
    const [y, m, d] = dateStr.split('-');

    if (filterYear && y !== filterYear) return false;
    if (filterMonth && m !== filterMonth) return false;
    if (filterDay && d !== filterDay) return false;
    
    return true;
  });

  // পুরোনো চার্টগুলো ডিলিট করা
  chartInstances.forEach(c => c.destroy());
  chartInstances = [];
  canvasContainer.innerHTML = '';

  // থিম কালার
  const isDark = document.body.classList.contains('dark-mode');
  const isAmoled = document.body.classList.contains('amoled-mode');
  const textColor = (isDark || isAmoled) ? '#94A3B8' : '#64748B';
  const gridColor = (isDark || isAmoled) ? '#334155' : '#E2E8F0';

  let globalTotal = 0;

  // ২. প্রতিটি সেকশনের জন্য আলাদা চার্ট বানানো
  if (!currentBook.chartSections || currentBook.chartSections.length === 0) {
    canvasContainer.innerHTML = '<p style="text-align:center; color:var(--text-muted);">কোনো চার্ট সেকশন তৈরি করা হয়নি।</p>';
    return;
  }

  currentBook.chartSections.forEach((section, secIndex) => {
    // সেকশনের কন্টেইনার
    const secDiv = document.createElement('div');
    secDiv.style.marginBottom = '24px';
    
    const titleHtml = `<h4 style="font-size: 14px; color: var(--primary); font-weight: 700; margin-bottom: 10px; display:flex; align-items:center; gap:6px;">
      <span>📊</span> ${escapeHtml(section.title)}
    </h4>`;
    
    const chartCanvasId = `chart_canvas_${secIndex}`;
    const chartHtml = `<div style="position: relative; height: ${Math.max(150, section.fields.length * 40 + 50)}px; width: 100%;">
      <canvas id="${chartCanvasId}"></canvas>
    </div>`;
    
    secDiv.innerHTML = titleHtml + chartHtml;
    canvasContainer.appendChild(secDiv);

    // ডেটা প্রসেস করা
    const labels = [];
    const dataValues = [];
    const bgColors = [];
    
    // কিছু প্রিমিয়াম কালার প্যালেট
    const colors = ['#F59E0B', '#3B82F6', '#10B981', '#EF4444', '#8B5CF6', '#06B6D4', '#F43F5E', '#84CC16'];

    // 👇 fields না থাকলে খালি অ্যারে ধরি
    const sectionFields = Array.isArray(section.fields) ? section.fields : [];
    sectionFields.forEach((sf, fIdx) => {
      const fieldDef = currentBook.fields.find(f => f.key === sf.fieldKey);
      if (!fieldDef) return;

      const total = dateFilteredEntries.reduce((sum, entry) => sum + (Number(entry[sf.fieldKey]) || 0), 0);
      
      if (total !== 0) {
        labels.push(fieldDef.label);
        dataValues.push(total);
        bgColors.push(colors[fIdx % colors.length]);
        globalTotal += total;
      }
    });

    // চার্ট তৈরি
    const canvasEl = document.getElementById(chartCanvasId);
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          data: dataValues,
          backgroundColor: bgColors,
          borderRadius: 4,
          borderSkipped: false,
          barPercentage: 0.6
        }]
      },
      options: {
        indexAxis: 'y', // Horizontal Bar
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0F172A',
            padding: 10,
            callbacks: {
              label: function(context) { return ' ' + formatTaka(context.parsed.x); }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { color: textColor, font: { family: 'Noto Sans Bengali', size: 10 } },
            grid: { color: gridColor }
          },
          y: {
            ticks: { color: textColor, font: { family: 'Noto Sans Bengali', size: 11 } },
            grid: { display: false }
          }
        }
      }
    });
    
    chartInstances.push(chart);
  });

  if (summaryText) {
    if (globalTotal > 0) {
      summaryText.textContent = `সব সেকশনের সর্বমোট: ${formatTaka(globalTotal)}`;
    } else {
      summaryText.textContent = 'নির্বাচিত ফিল্টারে কোনো ডেটা নেই';
    }
  }
}

/* ============ Master UI Update (Table + Summary + Chart) ============ */
function updateTableAndSummaries() {
  renderTable();   // টেবিল আপডেট
  renderSummary(); // সারাংশ (Summary) আপডেট
  
  // চার্ট মডাল খোলা থাকলে চার্টও আপডেট হবে
  if (document.getElementById('chartModal')?.classList.contains('open')) {
    renderChart();
  }
}
