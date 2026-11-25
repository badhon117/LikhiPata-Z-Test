/* ============================================================
   লিখিপাতা — CSV Import Engine v1
   - RFC 4180 compliant parser
   - Auto-detect columns by label match
   - Type conversion per field
   - Formula/Lookup recompute
   - Preview + validation + rollback-safe
   ============================================================ */

/* ============ CSV Parser (RFC 4180) ============ */
function parseCSV(text) {
  // BOM strip
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }

    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') {
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = []; i++; continue;
    }
    field += c; i++;
  }

  // শেষ লাইন
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }

  return rows;
}

/* ============ CSV → Object array ============ */
function csvRowsToObjects(rows) {
  if (!rows || rows.length < 2) return { headers: [], data: [] };

  const headers = rows[0].map(h => String(h).trim());
  const data = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.every(c => String(c).trim() === '')) continue; // খালি লাইন skip
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx] !== undefined ? String(row[idx]).trim() : '';
    });
    data.push(obj);
  }

  return { headers, data };
}

/* ============ Type Converter ============ */
function convertValueForField(rawValue, field) {
  const raw = String(rawValue == null ? '' : rawValue).trim();

  if (field.type === 'checkbox') {
    const v = raw.toLowerCase();
    if (['true', '১', '1', 'yes', 'y', 'হ্যাঁ', 'হা', '✔', '✓'].includes(v)) return true;
    if (['false', '০', '0', 'no', 'n', 'না', '✘', '✗'].includes(v)) return false;
    if (raw === '') return false;
    return !!raw;
  }

  if (field.type === 'number') {
    // বাংলা সংখ্যা → ইংরেজি, তারপর parse
    const en = bnToEn(raw).replace(/[^0-9.\-]/g, '');
    if (en === '' || en === '-' || en === '.') return 0;
    const n = parseFloat(en);
    return isNaN(n) ? 0 : n;
  }

  if (field.type === 'date') {
    if (!raw) return '';
    // ISO already?
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    // DD/MM/YYYY বা DD-MM-YYYY
    const m1 = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m1) {
      let [_, d, m, y] = m1;
      if (y.length === 2) y = '20' + y;
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    // YYYY/MM/DD
    const m2 = raw.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (m2) {
      const [_, y, m, d] = m2;
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    // Date.parse fallback
    const t = Date.parse(raw);
    if (!isNaN(t)) {
      const d = new Date(t);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    return '';
  }

  if (field.type === 'dropdown') {
    const opts = field.options || [];
    if (opts.includes(raw)) return raw;
    // case-insensitive match
    const found = opts.find(o => o.toLowerCase() === raw.toLowerCase());
    return found || raw || '';
  }

  // text, lookup, formula → raw string
  return raw;
}

/* ============ Auto-detect header → field mapping ============ */
function autoDetectMapping(csvHeaders, bookFields) {
  const mapping = {}; // csvHeader → fieldKey
  const used = new Set();

  const norm = (s) => String(s || '').trim().toLowerCase();

  // ১. Exact label match
  csvHeaders.forEach(h => {
    const target = bookFields.find(f => !used.has(f.key) && norm(f.label) === norm(h));
    if (target) {
      mapping[h] = target.key;
      used.add(target.key);
    }
  });

  // ২. Key match
  csvHeaders.forEach(h => {
    if (mapping[h]) return;
    const target = bookFields.find(f => !used.has(f.key) && norm(f.key) === norm(h));
    if (target) {
      mapping[h] = target.key;
      used.add(target.key);
    }
  });

  return mapping;
}

/* ============ Public API ============ */
function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const rows = parseCSV(String(e.target.result));
        const { headers, data } = csvRowsToObjects(rows);
        resolve({ headers, data });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('ফাইল পড়া যায়নি'));
    reader.readAsText(file, 'UTF-8');
  });
}

window.parseCsvFile = parseCsvFile;
window.parseCSV = parseCSV;
window.convertValueForField = convertValueForField;
window.autoDetectMapping = autoDetectMapping;