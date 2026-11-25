/* ============================================================
   লিখিপাতা — Excel (.xlsx) Engine v1
   - Lazy-load SheetJS
   - Multi-sheet parse
   - Formula value read (calculated)
   - Round-trip export with hidden _id
   ============================================================ */

// লোকাল ফাইল আগে, না পেলে CDN fallback
const XLSX_LOCAL = 'js/xlsx.full.min.js';
const XLSX_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
let _xlsxLoading = null;

function _loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('লোড হয়নি: ' + src));
    document.head.appendChild(s);
  });
}

function loadXlsxLib() {
  if (window.XLSX) return Promise.resolve();
  if (_xlsxLoading) return _xlsxLoading;

  _xlsxLoading = (async () => {
    // ১. প্রথমে লোকাল
    try {
      await _loadScript(XLSX_LOCAL);
      if (window.XLSX) return;
    } catch (e) {
      console.warn('লোকাল SheetJS পাওয়া যায়নি, CDN চেষ্টা করা হচ্ছে...');
    }

    // ২. লোকাল না পেলে CDN
    try {
      await _loadScript(XLSX_CDN);
      if (window.XLSX) return;
      throw new Error('Excel লাইব্রেরি লোড হয়নি');
    } catch (e) {
      _xlsxLoading = null;
      throw new Error('Excel লাইব্রেরি লোড হয়নি — ইন্টারনেট চেক করুন');
    }
  })();

  return _xlsxLoading;
}

/* ============ Sheet-এ এক শিটের রো পড়ো ============ */
function _sheetToRows(ws) {
  // header:1 → array of arrays
  const raw = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: false,        // formatted string (date → "2026-10-31")
    defval: '',
    blankrows: false,
    dateNF: 'yyyy-mm-dd'
  });

  if (!raw || raw.length === 0) return { headers: [], data: [] };

  // প্রথম non-empty রো → header
  let headerRowIdx = -1;
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    if (r && r.some(c => String(c || '').trim() !== '')) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx < 0) return { headers: [], data: [] };

  const headers = raw[headerRowIdx].map(h => String(h == null ? '' : h).trim());

  // Duplicate header → "Name (2)" ইত্যাদি
  const seen = {};
  const cleanHeaders = headers.map((h, i) => {
    let name = h || ('Column' + (i + 1));
    if (seen[name]) {
      seen[name]++;
      name = name + ' (' + seen[name] + ')';
    } else {
      seen[name] = 1;
    }
    return name;
  });

  const data = [];
  for (let i = headerRowIdx + 1; i < raw.length; i++) {
    const r = raw[i];
    if (!r) continue;
    const isEmpty = r.every(c => String(c == null ? '' : c).trim() === '');
    if (isEmpty) continue;

    const obj = {};
    cleanHeaders.forEach((h, idx) => {
      const v = r[idx];
      obj[h] = v == null ? '' : String(v).trim();
    });
    data.push(obj);
  }

  return { headers: cleanHeaders, data };
}

/* ============ Public: XLSX ফাইল পার্স ============ */
/**
 * @param {File} file
 * @param {string|null} sheetName — null হলে প্রথম শিট
 * @returns {Promise<{headers, data, sheets, currentSheet}>}
 */
async function parseXlsxFile(file, sheetName = null) {
  await loadXlsxLib();

  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });

  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    throw new Error('ফাইলে কোনো শিট নেই');
  }

  const sheets = wb.SheetNames.slice();
  const target = sheetName && sheets.includes(sheetName) ? sheetName : sheets[0];
  const ws = wb.Sheets[target];

  const { headers, data } = _sheetToRows(ws);

  return { headers, data, sheets, currentSheet: target };
}

/* ============ Public: XLSX এক্সপোর্ট ============ */
/**
 * @param {object} opts
 *   - fileName: string
 *   - sheetName: string
 *   - headers: string[]  (প্রদর্শিত লেবেল)
 *   - rows: any[][]      (প্রতিটি সেল ডেটা)
 *   - idColumn: string|null  (ঐচ্ছিক hidden _id header)
 */
async function exportXlsx(opts) {
  await loadXlsxLib();

  const {
    fileName = 'export.xlsx',
    sheetName = 'Data',
    headers = [],
    rows = [],
    idColumn = null
  } = opts || {};

  const aoa = [];
  if (idColumn) {
    aoa.push([idColumn].concat(headers));
  } else {
    aoa.push(headers.slice());
  }

  rows.forEach((row, rIdx) => {
    const line = idColumn ? [String(row._id || '')] : [];
    row.forEach((v, cIdx) => {
      // number হলে number রাখি → Excel-এ নাম্বার হিসেবে দেখাবে
      const fieldType = row._types && row._types[cIdx];
      if (fieldType === 'number' || fieldType === 'formula') {
        const n = Number(v);
        line.push(isNaN(n) ? '' : n);
      } else {
        line.push(v == null ? '' : String(v));
      }
    });
    aoa.push(line);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // কলাম প্রস্থ auto
  const colWidths = aoa[0].map((_, c) => {
    let max = 10;
    aoa.forEach(r => {
      const v = r[c] == null ? '' : String(r[c]);
      if (v.length > max) max = Math.min(50, v.length);
    });
    return { wch: max };
  });
  ws['!cols'] = colWidths;

  // _id কলাম hide
  if (idColumn) {
    ws['!cols'][0].hidden = true;
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Data');

  XLSX.writeFile(wb, fileName);
}

/* ============ Public: XLSX থেকে পড়া (id + value সহ) ============ */
// রি-ইমপোর্টে `_id` কলাম আগের id খুঁজে পেলে আপডেট করবে
async function parseXlsxWithIds(file, sheetName = null) {
  const parsed = await parseXlsxFile(file, sheetName);
  // headers-এ "_id" থাকলে সেটাকে আলাদা করি
  const idKey = parsed.headers.find(h => h.toLowerCase() === '_id');
  if (!idKey) return { ...parsed, hasIds: false };

  const nonIdHeaders = parsed.headers.filter(h => h !== idKey);

  // id গুলো extract
  const idMap = new Map();
  parsed.data.forEach((row, idx) => {
    const id = row[idKey];
    if (id) idMap.set(idx, id);
  });

  return { ...parsed, hasIds: true, idKey, idMap };
}

window.loadXlsxLib = loadXlsxLib;
window.parseXlsxFile = parseXlsxFile;
window.parseXlsxWithIds = parseXlsxWithIds;
window.exportXlsx = exportXlsx;