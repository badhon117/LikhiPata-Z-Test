/* ============================================================
   CSV + Excel Import UI — Unified
   ============================================================ */

let csvImportState = null;

/* ============ Open flow ============ */
function openCsvImportFlow() {
  if (!currentBook) {
    showToast('বুক পাওয়া যায়নি', 'error');
    return;
  }
  if (!currentBook.fields || currentBook.fields.length === 0) {
    showToast('আগে ফিল্ড তৈরি করুন — তারপর ইমপোর্ট করুন', 'error');
    return;
  }

  const input = document.getElementById('csvImportFileInput');
  if (!input) return;
  input.value = '';
  input.click();
}

/* ============ File select ============ */
async function handleCsvFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const isXlsx = /\.xlsx$/i.test(file.name);
  const isCsv = /\.csv$/i.test(file.name);

  if (!isXlsx && !isCsv) {
    showToast('শুধু .csv বা .xlsx ফাইল দিন', 'error');
    return;
  }

  if (file.size > 25 * 1024 * 1024) {
    showToast('ফাইল বড় (২৫ MB-র নিচে দিন)', 'error');
    return;
  }

  showLoading(isXlsx ? 'Excel পড়া হচ্ছে...' : 'CSV পড়া হচ্ছে...');

  try {
    let parsed;

    if (isXlsx) {
      parsed = await parseXlsxWithIds(file);
      // parsed: { headers, data, sheets, currentSheet, hasIds, idKey }
    } else {
      const { headers, data } = await parseCsvFile(file);
      const idKey = headers.find(h => h.toLowerCase() === '_id');
      if (idKey) {
        parsed = { headers, data, hasIds: true, idKey, sheets: [] };
      } else {
        parsed = { headers, data, hasIds: false, sheets: [] };
      }
    }

    hideLoading();

    if (parsed.headers.length === 0) {
      showToast('ফাইল ফাঁকা বা ভুল ফরম্যাট', 'error');
      return;
    }
    if (parsed.data.length === 0) {
      showToast('ফাইলে কোনো ডেটা সারি নেই', 'error');
      return;
    }

    // _id কলাম mapping-এ দেখাব না
    const mappingHeaders = parsed.hasIds
      ? parsed.headers.filter(h => h !== parsed.idKey)
      : parsed.headers;

    const mapping = autoDetectMapping(mappingHeaders, currentBook.fields);

    csvImportState = {
      fileName: file.name,
      fileRef: file,
      isXlsx,
      headers: parsed.headers,          // সব headers (id সহ)
      mappingHeaders,                   // id বাদ দিয়ে
      data: parsed.data,
      sheets: parsed.sheets || [],
      currentSheet: parsed.currentSheet || null,
      hasIds: !!parsed.hasIds,
      idKey: parsed.idKey || null,
      mapping,
    };

    renderCsvImportModal();

  } catch (err) {
    hideLoading();
    console.error(err);
    showToast('পার্স ব্যর্থ: ' + err.message, 'error');
  }
}

/* ============ Sheet switch (Excel only) ============ */
async function onCsvSheetChange(newSheet) {
  if (!csvImportState || !csvImportState.isXlsx || !csvImportState.fileRef) return;

  showLoading('শিট বদলানো হচ্ছে...');
  try {
    const parsed = await parseXlsxWithIds(csvImportState.fileRef, newSheet);
    hideLoading();

    const mappingHeaders = parsed.hasIds
      ? parsed.headers.filter(h => h !== parsed.idKey)
      : parsed.headers;

    const mapping = autoDetectMapping(mappingHeaders, currentBook.fields);

    csvImportState.headers = parsed.headers;
    csvImportState.mappingHeaders = mappingHeaders;
    csvImportState.data = parsed.data;
    csvImportState.currentSheet = newSheet;
    csvImportState.hasIds = !!parsed.hasIds;
    csvImportState.idKey = parsed.idKey || null;
    csvImportState.mapping = mapping;

    renderCsvImportModal();
  } catch (err) {
    hideLoading();
    showToast('শিট পড়া যায়নি: ' + err.message, 'error');
  }
}

/* ============ Render modal ============ */
function renderCsvImportModal() {
  const modal = document.getElementById('csvImportModal');
  if (!modal || !csvImportState) return;

  const { fileName, isXlsx, headers, mappingHeaders, data, mapping, sheets, currentSheet, hasIds } = csvImportState;

  const sheetInfo = (isXlsx && currentSheet) ? ` • শিট: ${currentSheet}` : '';
  const idInfo = hasIds ? ' • 🔄 _id আছে (আপডেট হবে)' : '';
  document.getElementById('csvImportFileInfo').textContent =
    `${fileName} • ${toBn(data.length)}টি সারি${sheetInfo}${idInfo}`;

  // Sheet selector
  const sheetWrap = document.getElementById('csvSheetSelectorWrap');
  const sheetSelect = document.getElementById('csvSheetSelector');
  if (sheetWrap && sheetSelect) {
    if (isXlsx && sheets.length > 1) {
      sheetWrap.style.display = 'block';
      sheetSelect.innerHTML = sheets.map(s =>
        `<option value="${escapeAttr(s)}" ${s === currentSheet ? 'selected' : ''}>${escapeHtml(s)}</option>`
      ).join('');
    } else {
      sheetWrap.style.display = 'none';
    }
  }

  // Mapping list
  const mappingList = document.getElementById('csvMappingList');
  const usableFields = currentBook.fields.filter(f => f.type !== 'formula');

  const reverse = {};
  Object.keys(mapping).forEach(h => { reverse[mapping[h]] = h; });

  mappingList.innerHTML = usableFields.map(f => {
    const selectedHeader = reverse[f.key] || '';
    // 👇 mappingHeaders না থাকলে খালি অ্যারে ধরি
    const safeMappingHeaders = Array.isArray(mappingHeaders) ? mappingHeaders : [];
    const opts = ['<option value="">— বাদ দিন —</option>']
      .concat(safeMappingHeaders.map(h => {
        const sel = h === selectedHeader ? 'selected' : '';
        const sample = (data[0] && data[0][h] != null) ? String(data[0][h]).slice(0, 25) : '';
        const safeSample = sample.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<option value="${escapeAttr(h)}" ${sel}>${escapeHtml(h)}${safeSample ? ' — ' + safeSample : ''}</option>`;
      }))
      .join('');
    return `
      <div class="csv-map-row">
        <div class="csv-map-left">
          <div class="csv-map-field-label">${escapeHtml(f.label)}</div>
          <div class="csv-map-field-type">${f.type}</div>
        </div>
        <div class="csv-map-right">
          <select class="csv-map-select" data-field-key="${escapeAttr(f.key)}" onchange="onCsvMappingChange()">
            ${opts}
          </select>
        </div>
      </div>
    `;
  }).join('');

  // Preview
  const previewEl = document.getElementById('csvPreviewTable');
  if (previewEl) {
    const previewRows = data.slice(0, 5);
    let html = '<table class="csv-preview-tbl"><thead><tr><th>#</th>';
    mappingHeaders.forEach(h => { html += `<th>${escapeHtml(h)}</th>`; });
    html += '</tr></thead><tbody>';
    previewRows.forEach((row, idx) => {
      html += `<tr><td>${toBn(idx + 1)}</td>`;
      mappingHeaders.forEach(h => {
        const v = row[h] == null ? '' : String(row[h]);
        html += `<td>${escapeHtml(v.slice(0, 40))}${v.length > 40 ? '…' : ''}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    if (data.length > 5) {
      html += `<div class="csv-preview-more">…আরও ${toBn(data.length - 5)}টি সারি</div>`;
    }
    previewEl.innerHTML = html;
  }

  updateCsvImportSummary();
  modal.classList.add('open');
}

function onCsvMappingChange() {
  if (!csvImportState) return;
  const mapping = {};
  document.querySelectorAll('#csvMappingList .csv-map-select').forEach(sel => {
    const fieldKey = sel.dataset.fieldKey;
    const csvHeader = sel.value;
    if (csvHeader) mapping[csvHeader] = fieldKey;
  });
  csvImportState.mapping = mapping;
  updateCsvImportSummary();
}

function updateCsvImportSummary() {
  const summary = document.getElementById('csvImportSummary');
  const importBtn = document.getElementById('csvImportConfirmBtn');
  if (!summary || !csvImportState) return;

  const { mapping, data } = csvImportState;
  const mappedFieldCount = Object.keys(mapping).length;

  if (mappedFieldCount === 0) {
    summary.textContent = '⚠️ অন্তত একটি কলাম ম্যাপ করুন';
    summary.style.color = '#DC2626';
    if (importBtn) importBtn.disabled = true;
    return;
  }

  const mappedKeys = new Set(Object.values(mapping));
  const requiredFields = currentBook.fields.filter(f =>
    f.type !== 'formula' && f.type === 'number'
  );
  const missingReq = requiredFields.filter(f => !mappedKeys.has(f.key));

  let msg = `✅ ${toBn(mappedFieldCount)}টি ফিল্ড ম্যাপড • ${toBn(data.length)}টি সারি`;
  if (csvImportState.hasIds) msg += ' • 🔄 পুরোনো id থাকলে আপডেট হবে';
  if (missingReq.length > 0) {
    msg += ` • ⚠️ ${toBn(missingReq.length)}টি নাম্বার ফিল্ড ০ হবে`;
  }

  summary.textContent = msg;
  summary.style.color = '#059669';
  if (importBtn) importBtn.disabled = false;
}

function closeCsvImportModal() {
  const modal = document.getElementById('csvImportModal');
  if (modal) modal.classList.remove('open');
  csvImportState = null;
}

/* ============ Confirm import ============ */
async function confirmCsvImport() {
  if (!csvImportState || !currentBook) return;

  const { mapping, data, hasIds, idKey } = csvImportState;
  const importBtn = document.getElementById('csvImportConfirmBtn');
  if (importBtn) importBtn.disabled = true;

  showLoading('ইমপোর্ট হচ্ছে...');

  try {
    const fieldKeyToHeader = {};
    Object.keys(mapping).forEach(csvHeader => {
      fieldKeyToHeader[mapping[csvHeader]] = csvHeader;
    });

    // পুরোনো id → entry map
    const existingById = new Map();
    currentEntries.forEach(e => existingById.set(e.id, e));

    const newEntries = [];
    const updatedEntries = [];
    const seenIds = new Set();

    let skipped = 0;
    let inserted = 0;
    let updated = 0;
    let errored = 0;

    for (let rowIdx = 0; rowIdx < data.length; rowIdx++) {
      const row = data[rowIdx];
      const rowId = hasIds ? String(row[idKey] || '').trim() : '';

      const entry = {};
      let hasAnyValue = false;

      currentBook.fields.forEach(f => {
        if (f.type === 'formula') {
          entry[f.key] = 0;
          return;
        }

        const csvHeader = fieldKeyToHeader[f.key];
        if (csvHeader === undefined) {
          entry[f.key] = (f.type === 'checkbox') ? false
                        : (f.type === 'number') ? 0
                        : '';
          return;
        }

        const rawVal = row[csvHeader];
        const convertedVal = convertValueForField(rawVal, f);
        entry[f.key] = convertedVal;

        if (convertedVal !== '' && convertedVal !== 0 && convertedVal !== false) {
          hasAnyValue = true;
        }
      });

      if (!hasAnyValue) { skipped++; continue; }

      // Formula recalc
      const context = {};
      currentBook.fields.forEach(f => {
        if (f.type === 'formula') return;
        context[f.key] = entry[f.key];
      });
      for (let pass = 0; pass < 5; pass++) {
        currentBook.fields.forEach(f => {
          if (f.type !== 'formula') return;
          const result = calcFormula(f.formula, context);
          const safe = isNaN(result) ? 0 : result;
          context[f.key] = safe;
          entry[f.key] = safe;
        });
      }

      // id থাকলে আপডেট, না হলে insert
      if (rowId && existingById.has(rowId) && !seenIds.has(rowId)) {
        const old = existingById.get(rowId);
        // 👇 পুরোনো __calc_ কী বাদ দিই
        const cleanOld = { ...old };
        Object.keys(cleanOld).forEach(k => {
          if (k.startsWith('__calc_')) delete cleanOld[k];
        });
        updatedEntries.push({
          ...cleanOld,
          ...entry,
          id: rowId,
          createdAt: old.createdAt || Date.now(),
          updatedAt: Date.now()
        });
        seenIds.add(rowId);
        updated++;
      } else if (rowId && !existingById.has(rowId)) {
        newEntries.push({
          id: rowId,
          ...entry,
          createdAt: Date.now() + rowIdx,
          updatedAt: Date.now() + rowIdx
        });
        seenIds.add(rowId);
        inserted++;
      } else {
        newEntries.push({
          id: generateId('entry'),
          ...entry,
          createdAt: Date.now() + rowIdx,
          updatedAt: Date.now() + rowIdx
        });
        inserted++;
      }
    }

    if (newEntries.length === 0 && updatedEntries.length === 0) {
      hideLoading();
      showToast('ইমপোর্টের মতো কোনো বৈধ সারি পাওয়া যায়নি', 'error');
      if (importBtn) importBtn.disabled = false;
      return;
    }

    // Merge
    const oldCount = currentEntries.length;

    // আপডেটগুলো আগে apply
    const updatedById = new Map();
    updatedEntries.forEach(e => updatedById.set(e.id, e));

    currentEntries = currentEntries.map(e =>
      updatedById.has(e.id) ? updatedById.get(e.id) : e
    );
    // 👇 নতুন এন্ট্রিতে __calc_ কী থাকলে বাদ দিই
    const cleanNewEntries = newEntries.map(e => {
      const clean = { ...e };
      Object.keys(clean).forEach(k => {
        if (k.startsWith('__calc_')) delete clean[k];
      });
      return clean;
    });
    currentEntries = currentEntries.concat(cleanNewEntries);

    const ok = await saveEntries(currentBook.id, currentEntries);
    if (!ok) {
      currentEntries = currentEntries.slice(0, oldCount);
      hideLoading();
      showToast('সেভ ব্যর্থ — ইমপোর্ট বাতিল', 'error');
      if (importBtn) importBtn.disabled = false;
      return;
    }

    hideLoading();
    closeCsvImportModal();

    let msg = `✅ ${toBn(inserted)}টি নতুন`;
    if (updated > 0) msg += ` • 🔄 ${toBn(updated)}টি আপডেট`;
    if (skipped > 0) msg += ` • ${toBn(skipped)}টি বাদ`;
    showToast(msg, 'success');

    // Backup counter
    if (typeof incrementEntriesSinceBackup === 'function') {
      incrementEntriesSinceBackup(inserted);
    }
    if (typeof showBackupNotification === 'function') {
      setTimeout(showBackupNotification, 500);
    }

    // UI refresh
    if (typeof renderTable === 'function') renderTable();
    if (typeof renderSummary === 'function') renderSummary();

  } catch (err) {
    hideLoading();
    console.error('Import failed:', err);
    showToast('ইমপোর্ট ব্যর্থ: ' + err.message, 'error');
    if (importBtn) importBtn.disabled = false;
  }
}

window.openCsvImportFlow = openCsvImportFlow;
window.handleCsvFileSelected = handleCsvFileSelected;
window.confirmCsvImport = confirmCsvImport;
window.closeCsvImportModal = closeCsvImportModal;
window.onCsvMappingChange = onCsvMappingChange;
window.onCsvSheetChange = onCsvSheetChange;