/* ============================================================
   লিখিপাতা — Dashboard Book Logic (Full)
   ============================================================ */

// ড্যাশবোর্ড বুকের ভিউ রেন্ডার করা
function renderDashboardBookView() {
  const appScreen = document.querySelector('.screen');
  if (!appScreen) return;

  document.getElementById('formView').style.display = 'none';
  document.getElementById('tableView').style.display = 'none';
  document.querySelector('.view-tabs').style.display = 'none';
  const fab = document.getElementById('fabAddEntry');
  if (fab) fab.style.display = 'none';

  let dashContainer = document.getElementById('dashboardBookContainer');
  if (!dashContainer) {
    dashContainer = document.createElement('div');
    dashContainer.id = 'dashboardBookContainer';
    dashContainer.style.padding = '10px 0';
    appScreen.appendChild(dashContainer);
  }

  const cards = currentBook.dashboardCards || [];
  
  if (cards.length === 0) {
    dashContainer.innerHTML = `
      <div class="empty-state">
        <div class="icon">📊</div>
        <h3>কোনো ড্যাশবোর্ড কার্ড নেই</h3>
        <p>বিল্ডারে গিয়ে অন্য বুকের সামারি কার্ড যোগ করুন।</p>
        <button class="btn btn-primary" onclick="openBuilder()" style="margin-top:15px; width:auto;">কার্ড যোগ করুন</button>
      </div>
    `;
    return;
  }

  let html = '<div class="dashboard-book-grid">';
  // 👇 Premium Grand Total Card (Adaptive Theme)
  let grandTotal = 0;
  let validCardCount = 0;

  cards.forEach(cardConfig => {
    const srcBook = getBook(cardConfig.sourceBookId);
    if (!srcBook) return;

    const srcSummary = (srcBook.summaryCards || []).find(
      sc => sc.id === cardConfig.summaryId
    );
    if (!srcSummary) return;

    const entries = getEntries(srcBook.id);
    let val = 0;

    if (srcSummary.calcType === 'count') {
      val = entries.length;
    } else {
      const nums = entries
        .map(e => Number(e[srcSummary.fieldKey]))
        .filter(v => !isNaN(v));

      if (srcSummary.calcType === 'sum') {
        val = nums.reduce((a, b) => a + b, 0);
      } else if (srcSummary.calcType === 'avg') {
        val = nums.length
          ? nums.reduce((a, b) => a + b, 0) / nums.length
          : 0;
      } else if (srcSummary.calcType === 'max') {
        val = nums.length ? Math.max(...nums) : 0;
      } else if (srcSummary.calcType === 'min') {
        val = nums.length ? Math.min(...nums) : 0;
      }
    }

    if (srcSummary.calcType !== 'count') {
      grandTotal += val;
    }
    validCardCount++;
  });

  html += `
    <div class="dash-book-card grand-total-card">

      <div class="grand-total-top">
        <div class="grand-total-icon">
          <span>∑</span>
        </div>

        <div class="grand-total-heading">
          <span class="grand-total-subtitle">OVERVIEW</span>
          <h4>সর্বমোট হিসাব</h4>
          <p>সকল ড্যাশবোর্ড কার্ডের সম্মিলিত পরিমাণ</p>
        </div>

        <div class="grand-total-badge">
          <span class="grand-total-badge-dot"></span>
          TOTAL
        </div>
      </div>

      <div class="grand-total-divider"></div>

      <div class="grand-total-bottom">
        <div class="grand-total-amount">
          <span class="grand-total-currency">৳</span>
          <span class="grand-total-number">${formatTaka(grandTotal).replace(/^৳\s*/, '')}</span>
        </div>

        <div class="grand-total-count">
          <span class="grand-total-count-number">${toBn(validCardCount)}</span>
          <span class="grand-total-count-label">টি কার্ড যুক্ত</span>
        </div>
      </div>

      <div class="grand-total-decoration"></div>

    </div>
  `;

  // 👇 এরপর আগের মতোই প্রতিটি সামারি কার্ড যোগ হবে


  cards.forEach(cardConfig => {
    const sourceBook = getBook(cardConfig.sourceBookId);
    if (!sourceBook) return;

    const sourceSummary = (sourceBook.summaryCards || []).find(sc => sc.id === cardConfig.summaryId);
    if (!sourceSummary) return;

    const entries = getEntries(sourceBook.id);
    let resultVal = 0;
    
    if (sourceSummary.calcType === 'count') {
      resultVal = entries.length;
    } else {
      let values = entries.map(e => Number(e[sourceSummary.fieldKey])).filter(v => !isNaN(v));
      if (sourceSummary.calcType === 'sum') resultVal = values.reduce((a,b)=>a+b, 0);
      else if (sourceSummary.calcType === 'avg') resultVal = values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;
      else if (sourceSummary.calcType === 'max') resultVal = values.length ? Math.max(...values) : 0;
      else if (sourceSummary.calcType === 'min') resultVal = values.length ? Math.min(...values) : 0;
    }

    let displayVal = sourceSummary.calcType === 'count' ? toBn(resultVal) + 'টি' : formatTaka(resultVal);
    const bgColor = cardConfig.color || 'linear-gradient(135deg, #10B981, #059669)';
    
    html += `
      <div class="dash-book-card" style="background: ${bgColor};" onclick="window.location.href='view.html?book=${sourceBook.id}'">
        <div class="dash-card-icon">${sourceBook.icon || '📘'}</div>
        <div class="dash-card-info">
          <h4>${escapeHtml(sourceBook.name)}</h4>
          <p>${escapeHtml(sourceSummary.label)}</p>
        </div>
        <div class="dash-card-value">${displayVal}</div>
      </div>
    `;
  });

  html += '</div>';
  dashContainer.innerHTML = html;
}

// বিল্ডারে ড্যাশবোর্ড কার্ড কনফিগারেশন UI রেন্ডার করা
function renderDashboardConfigUI() {
  // হাইড সাধারণ বিল্ডার সেকশন
  document.querySelectorAll('.fields-section-title').forEach(el => el.style.display = 'none');
  document.getElementById('fieldsList').style.display = 'none';
  document.querySelector('.btn-add-field').style.display = 'none';
  document.getElementById('fieldsEmpty').style.display = 'none';
  document.getElementById('summaryList').style.display = 'none';
  document.getElementById('chartSectionsList').style.display = 'none';
  document.querySelectorAll('.btn-add-field').forEach(el => el.style.display = 'none');

  // তৈরি ড্যাশবোর্ড কনফিগারেশন UI
  let dashConfig = document.getElementById('dashConfigUI');
  if (!dashConfig) {
    dashConfig = document.createElement('div');
    dashConfig.id = 'dashConfigUI';
    dashConfig.innerHTML = `
      <div class="builder-intro" style="background: rgba(16, 185, 129, 0.08); border-color: rgba(16, 185, 129, 0.3); margin-bottom: 20px;">
        <p><strong>📊 ড্যাশবোর্ড বুক:</strong> এখানে আপনি অন্য বুকের সামারি কার্ডগুলোকে নিজের ড্যাশবোর্ডে দেখাতে পারবেন।</p>
      </div>
      <div class="fields-section-title" style="display:flex;"><span>ড্যাশবোর্ড কার্ড সমূহ</span><span class="count-badge" id="dashCardCount">০টি</span></div>
      <div class="fields-list" id="dashCardsList"></div>
      <button class="btn-add-field" onclick="openDashboardCardModal()" style="border-color: #A7F3D0; color: #047857; display:flex;">
        <span>➕</span> নতুন ড্যাশবোর্ড কার্ড যোগ করুন
      </button>
    `;
    document.querySelector('.builder-intro').after(dashConfig);
  } else {
    dashConfig.style.display = 'block';
    dashConfig.querySelector('.fields-section-title').style.display = 'flex';
    dashConfig.querySelector('.btn-add-field').style.display = 'flex';
  }

  renderDashboardCardsList();
}

function renderDashboardCardsList() {
  const list = document.getElementById('dashCardsList');
  const badge = document.getElementById('dashCardCount');
  if (!list) return;

  if (!currentBook.dashboardCards) currentBook.dashboardCards = [];
  badge.textContent = toBn(currentBook.dashboardCards.length) + 'টি';

  if (currentBook.dashboardCards.length === 0) {
    list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:13px;">এখনো কোনো কার্ড নেই</div>';
    return;
  }

  list.innerHTML = currentBook.dashboardCards.map((card, i) => {
    const sourceBook = getBook(card.sourceBookId);
    const sourceSummary = sourceBook ? (sourceBook.summaryCards || []).find(sc => sc.id === card.summaryId) : null;
    
    return `
      <div class="field-card">
        <div style="display:flex; align-items:center; gap:14px; flex:1; cursor:pointer;" onclick="openDashboardCardModal(${i})">
          <div class="field-icon" style="background: ${card.color || '#D1FAE5'}; color: white;">📊</div>
          <div class="field-info">
            <h4>${escapeHtml(sourceBook ? sourceBook.name : '⚠️ অজানা বুক')}</h4>
            <p>${escapeHtml(sourceSummary ? sourceSummary.label : '⚠️ অজানা সামারি')}</p>
          </div>
        </div>
        <div class="field-actions" onclick="event.stopPropagation()">
          <button class="field-action-btn del" onclick="deleteDashboardCard(${i})" title="ডিলিট">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

function openDashboardCardModal(editIdx = -1) {
  let modal = document.getElementById('dashboardCardModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'dashboardCardModal';
    modal.className = 'modal-overlay';
    modal.onclick = (e) => { if (e.target === modal) closeDashboardCardModal(); };
    modal.innerHTML = `
      <div class="modal-content">
        <h3><span id="dashCardModalTitle">নতুন ড্যাশবোর্ড কার্ড</span><button class="close-x" onclick="closeDashboardCardModal()">✕</button></h3>
        <div class="form-group">
          <label>উৎস বুক <span class="req">*</span></label>
          <select id="dashSourceBook" onchange="onDashSourceBookChange()"></select>
        </div>
        <div class="form-group">
          <label>কোন সামারি দেখাবে? <span class="req">*</span></label>
          <select id="dashSourceSummary"></select>
        </div>
        <div class="form-group">
          <label>কার্ডের রঙ</label>
          <input type="color" id="dashCardColor" value="#10B981" style="width: 100%; height: 45px; padding: 4px; border-radius: 8px; border: 1.5px solid #CBD5E1; cursor: pointer;">
        </div>
        <div class="modal-actions">
          <button class="btn btn-cancel" onclick="closeDashboardCardModal()">বাতিল</button>
          <button class="btn btn-save" onclick="saveDashboardCard()">সেভ করুন</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const title = document.getElementById('dashCardModalTitle');
  const sourceBookSelect = document.getElementById('dashSourceBook');
  
  const otherBooks = getBooks().filter(b => b.id !== currentBook.id && b.type !== 'dashboard');
  sourceBookSelect.innerHTML = '<option value="">-- বুক নির্বাচন --</option>' + 
    otherBooks.map(b => `<option value="${b.id}">${b.icon || '📘'} ${escapeHtml(b.name)}</option>`).join('');

  if (editIdx >= 0) {
    title.textContent = 'ড্যাশবোর্ড কার্ড এডিট';
    const card = currentBook.dashboardCards[editIdx];
    sourceBookSelect.value = card.sourceBookId;
    onDashSourceBookChange();
    const summarySelect = document.getElementById('dashSourceSummary');
    if (summarySelect) summarySelect.value = card.summaryId;
    document.getElementById('dashCardColor').value = card.color || '#10B981';
    modal.dataset.editIdx = editIdx;
  } else {
    title.textContent = 'নতুন ড্যাশবোর্ড কার্ড';
    document.getElementById('dashSourceSummary').innerHTML = '';
    document.getElementById('dashCardColor').value = '#10B981';
    modal.dataset.editIdx = -1;
  }

  modal.classList.add('open');
}

function onDashSourceBookChange() {
  const bookId = document.getElementById('dashSourceBook').value;
  const summarySelect = document.getElementById('dashSourceSummary');
  
  if (!bookId) {
    summarySelect.innerHTML = '<option value="">-- আগে বুক সিলেক্ট করুন --</option>';
    return;
  }

  const book = getBook(bookId);
  const summaries = book.summaryCards || [];

  if (summaries.length === 0) {
    summarySelect.innerHTML = '<option value="">-- এই বুকে কোনো সামারি নেই --</option>';
    return;
  }

  summarySelect.innerHTML = summaries.map(s => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join('');
}

function closeDashboardCardModal() {
  document.getElementById('dashboardCardModal')?.classList.remove('open');
}

function saveDashboardCard() {
  const modal = document.getElementById('dashboardCardModal');
  const editIdx = parseInt(modal.dataset.editIdx);
  
  const sourceBookId = document.getElementById('dashSourceBook').value;
  const summaryId = document.getElementById('dashSourceSummary').value;
  const color = document.getElementById('dashCardColor').value;

  if (!sourceBookId || !summaryId) {
    showToast('বুক এবং সামারি সিলেক্ট করুন', 'error');
    return;
  }

  const newCard = { sourceBookId, summaryId, color };

  if (!currentBook.dashboardCards) currentBook.dashboardCards = [];

  if (editIdx >= 0) {
    currentBook.dashboardCards[editIdx] = newCard;
    showToast('কার্ড আপডেট হয়েছে', 'success');
  } else {
    currentBook.dashboardCards.push(newCard);
    showToast('নতুন কার্ড যোগ হয়েছে', 'success');
  }

    if (typeof markDirty === 'function') markDirty();
  closeDashboardCardModal();
  renderDashboardCardsList();
  
  // 👈 সরাসরি ডেটাবেসে সেভ করুন
  if (typeof saveBookFields === 'function') {
    saveBookFields(false);
  } else if (typeof saveBuilderState === 'function') {
    saveBuilderState();
  }
}



function deleteDashboardCard(idx) {
  askConfirm('এই ড্যাশবোর্ড কার্ডটি ডিলিট করবেন?', {
    title: 'কার্ড ডিলিট', icon: '🗑️', confirmLabel: 'হ্যাঁ, ডিলিট', danger: true
  }).then(ok => {
    if (!ok) return;
    currentBook.dashboardCards.splice(idx, 1);
        if (typeof markDirty === 'function') markDirty();
    renderDashboardCardsList();
    
    // 👈 ডিলিট করার পরও সরাসরি ডেটাবেসে সেভ করুন
    if (typeof saveBookFields === 'function') {
      saveBookFields(false);
    } else if (typeof saveBuilderState === 'function') {
      saveBuilderState();
    }
    showToast('কার্ড ডিলিট হয়েছে', 'success');
  });
}

