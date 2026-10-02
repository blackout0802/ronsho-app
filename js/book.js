/* ▼▼▼ 新規追加：書籍管理機能（既存の変数・関数名と一切重複しない名前空間で実装）
   既存の entries / studyLog / manualLog などには一切触れていません。
   保存先は専用のキー 'ronshoBooksV1' のみを使用します。
   表紙画像はJPEGに縮小してdataURLで書籍データ内に保持します（同期・
   バックアップの対象に含めるため、drive-sync.js・js/backup.jsにも登録）。 */
const BOOKS_KEY = 'ronshoBooksV1';
// 表紙画像の上限目安（dataURL文字列長）。localStorage全体の容量（約5MB）や
// 同期ペイロードを圧迫しないよう、このサイズに収まるまで段階的に縮小する
const BOOK_COVER_MAX_LENGTH = 350 * 1024;
let books = [];
let bookSubjectFilter = 'all';
let bookEditingId = null;
// 保存確定前の表紙画像の状態。未選択時はnull、新しい画像を選んだらdataURL、
// 編集中の既存画像を「削除」したら空文字列（＝保存時にcoverを消す合図）
let bookPendingCover = null;

function loadBooks() {
  try {
    const raw = localStorage.getItem(BOOKS_KEY);
    books = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(books)) books = [];
  } catch (e) {
    console.error('書籍の読み込みに失敗しました:', e);
    books = [];
  }
}
function saveBooks(list) {
  if (Array.isArray(list)) books = list;
  try {
    localStorage.setItem(BOOKS_KEY, JSON.stringify(books));
    if (typeof window !== 'undefined' && typeof window.ronshoSyncNotifyChange === 'function') window.ronshoSyncNotifyChange();
  } catch (e) {
    console.error('書籍の保存に失敗しました:', e);
    alert('書籍の保存に失敗しました。表紙画像が大きすぎる場合は、画像を削除してお試しください。');
  }
}
loadBooks();

// 画像ファイルを読み込み、JPEGのdataURLに縮小する（最大長辺px・品質q）。
// 端末の容量・同期サイズに配慮し、BOOK_COVER_MAX_LENGTHに収まるまで
// 400px→256px→160pxと段階的に縮小する
function processBookCoverFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('画像ファイルを選択してください。'));
      return;
    }
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      const steps = [
        { maxDim: 400, quality: 0.8 },
        { maxDim: 256, quality: 0.65 },
        { maxDim: 160, quality: 0.6 }
      ];
      try {
        for (const step of steps) {
          const scale = Math.min(1, step.maxDim / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', step.quality);
          if (dataUrl.length <= BOOK_COVER_MAX_LENGTH || step === steps[steps.length - 1]) {
            resolve(dataUrl);
            return;
          }
        }
      } catch (e) {
        reject(new Error('画像の変換に失敗しました。'));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      reject(new Error('画像の読み込みに失敗しました。'));
    };
    img.src = objUrl;
  });
}

// 総ページ数・現在ページの両方が入っていればそこから進捗率を算出する。
// ページ数が無い書籍は、手動の進捗率スライダーの値をそのまま使う
function bookEffectiveProgress(b) {
  const cur = Number(b.currentPage);
  const total = Number(b.totalPages);
  if (Number.isFinite(cur) && Number.isFinite(total) && total > 0 && cur >= 0) {
    return Math.max(0, Math.min(100, Math.round((cur / total) * 100)));
  }
  const p = Number(b.progress);
  return Number.isFinite(p) ? Math.max(0, Math.min(100, Math.round(p))) : 0;
}
function bookStudyMinutesLabel(b) {
  const m = Math.max(0, Math.round(Number(b.studyMinutes) || 0));
  if (m <= 0) return '';
  const h = Math.floor(m / 60);
  const r = m % 60;
  return (h > 0 ? h + '時間' : '') + (r > 0 || h === 0 ? r + '分' : '');
}
function updateBookRangeFill(range) {
  if (range) range.style.setProperty('--pct', range.value + '%');
}
function bookPeriodLabel(b) {
  const s = b.startDate || '';
  const e = b.endDate || '';
  if (!s && !e) return '';
  const fmt = d => String(d).replace(/-/g, '/');
  let label = (s ? fmt(s) : '―') + ' 〜 ' + (e ? fmt(e) : '―');
  if (e) {
    const diff = Math.round((new Date(e + 'T00:00:00') - new Date(todayStr() + 'T00:00:00')) / 86400000);
    label += diff >= 0 ? '（あと' + diff + '日）' : '（終了）';
  }
  return label;
}
function bookDisplayTitle(b) {
  return (b.title || '').trim() || '(タイトル未入力)';
}

function bookFilteredList() {
  const list = books.slice();
  const filtered = bookSubjectFilter === 'all' ? list : list.filter(b => (b.subject || '未設定') === bookSubjectFilter);
  // 全文検索（書籍名・科目・メモが対象）
  const q = (bookSearchQuery || '').trim().toLowerCase();
  const searched = q
    ? filtered.filter(b => [b.title, b.subject, b.memo].some(v => (v || '').toLowerCase().includes(q)))
    : filtered;
  searched.sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
  return searched;
}
let bookSearchQuery = '';
function renderBookSubjectFilter() {
  const sel = document.getElementById('bookSubjectFilter');
  if (!sel) return;
  const subjects = [...new Set(books.map(b => (b.subject || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'));
  const prev = bookSubjectFilter;
  sel.innerHTML = '<option value="all">科目：すべて（' + books.length + '件）</option>'
    + subjects.map(s => {
      const count = books.filter(b => (b.subject || '').trim() === s).length;
      return '<option value="' + escapeHtml(s) + '">' + escapeHtml(s) + '（' + count + '件）</option>';
    }).join('');
  sel.value = subjects.includes(prev) || prev === 'all' ? prev : 'all';
  bookSubjectFilter = sel.value;
}

// 関連論証ピッカー：書籍の科目に属する論証をチェックボックスで選ぶ。
// 表示が重くならないよう100件で打ち切る
const BOOK_ENTRY_PICKER_LIMIT = 100;
// チェック状態はDOMではなくこのSetで保持する（絞り込みで候補から
// 外れた論証の選択が、再描画で消えてしまわないようにするため）
let bookEntryPickerSelected = new Set();
function bookEntryPickerCandidates() {
  const subject = (document.getElementById('bookSubjectInput') || {}).value || '';
  const trimmed = subject.trim();
  const q = ((document.getElementById('bookEntrySearchInput') || {}).value || '').trim().toLowerCase();
  let list = entries.slice();
  if (trimmed) list = list.filter(e => (e.subject || '') === trimmed);
  if (q) list = list.filter(e => (e.title || '').toLowerCase().includes(q));
  return list;
}
function renderBookEntryPicker() {
  const listEl = document.getElementById('bookEntryPickerList');
  if (!listEl) return;
  const candidates = bookEntryPickerCandidates();
  const shown = candidates.slice(0, BOOK_ENTRY_PICKER_LIMIT);
  const hiddenSelected = [...bookEntryPickerSelected].filter(t => !candidates.some(e => e.title === t));
  listEl.innerHTML = shown.map(e =>
    '<label class="bookEntryCheckLabel"><input type="checkbox" class="bookEntryCheck" value="' + escapeHtml(e.title) + '"'
    + (bookEntryPickerSelected.has(e.title) ? ' checked' : '') + '> ' + escapeHtml(e.title) + '</label>'
  ).join('')
    + (candidates.length > shown.length
      ? '<div class="past-log-small-note">他' + (candidates.length - shown.length) + '件（タイトル検索で絞り込めます）</div>'
      : (candidates.length === 0 ? '<div class="past-log-small-note">該当する論証がありません。</div>' : ''))
    + (hiddenSelected.length > 0
      ? '<div class="past-log-small-note">🔗 他' + hiddenSelected.length + '件を選択中（絞り込みで非表示）</div>'
      : '');
}
function renderBookCoverPreview() {
  const preview = document.getElementById('bookCoverPreview');
  if (!preview) return;
  // 編集中で新しい画像も削除指示も無ければ、既存の表紙を表示する
  let dataUrl = bookPendingCover;
  if (dataUrl === null && bookEditingId) {
    const editing = books.find(b => b.id === bookEditingId);
    dataUrl = editing ? (editing.cover || null) : null;
  }
  if (dataUrl) {
    preview.innerHTML = '<img src="' + dataUrl + '" alt="表紙プレビュー">';
  } else {
    preview.innerHTML = '<span class="bookCoverPlaceholder">📖</span>';
  }
}

function renderBookPage() {
  renderBookSubjectFilter();
  renderBookCoverPreview();
  const progressEl = document.getElementById('bookProgress');
  const area = document.getElementById('bookArea');
  if (!area) return;
  const list = bookFilteredList();
  if (progressEl) progressEl.textContent = list.length > 0 ? list.length + '冊' : '';
  if (books.length === 0) {
    area.innerHTML = '<div class="quizEmpty">まだ書籍が登録されていません。「＋ 書籍を追加」から登録してください。</div>';
    return;
  }
  if (list.length === 0) {
    area.innerHTML = '<div class="quizEmpty">この科目に該当する書籍はありません。</div>';
    return;
  }
  area.innerHTML = list.map(b => {
    const pct = bookEffectiveProgress(b);
    const period = bookPeriodLabel(b);
    const cur = b.currentPage !== '' && b.currentPage != null ? b.currentPage : '';
    const total = b.totalPages !== '' && b.totalPages != null ? b.totalPages : '';
    const pagesLabel = (cur !== '' || total !== '') ? (cur === '' ? '―' : cur) + ' / ' + (total === '' ? '―' : total) + 'ページ' : '';
    return '<div class="bookCard" data-id="' + escapeHtml(b.id) + '">'
      + '<div class="bookCoverCell">' + (b.cover
        ? '<img src="' + b.cover + '" alt="' + escapeHtml(bookDisplayTitle(b)) + 'の表紙">'
        : '<span class="bookCoverPlaceholder">📖</span>') + '</div>'
      + '<div class="bookInfoCell">'
      + '<div class="bookTitleRow">' + escapeHtml(bookDisplayTitle(b)) + '</div>'
      + '<div class="bookMetaRow">' + escapeHtml(b.subject || '未設定') + '</div>'
      + (period ? '<div class="bookPeriodRow">🗓 ' + escapeHtml(period) + '</div>' : '')
      + (bookStudyMinutesLabel(b) ? '<div class="bookStudyTimeRow">⏱ 勉強時間 ' + bookStudyMinutesLabel(b) + '</div>' : '')
      + (pagesLabel ? '<div class="bookPagesRow">📄 ' + escapeHtml(pagesLabel) + '</div>' : '')
      + '<div class="bookProgressBarRow"><div class="gamiBarOuter"><div class="gamiBarInner" style="width:' + pct + '%;"></div></div>'
      + '<span class="bookProgressPct">' + pct + '%</span></div>'
      + (b.memo ? '<div class="bookMemoRow">' + escapeHtml(b.memo).replace(/\n/g, '<br>') + '</div>' : '')
      + (Array.isArray(b.entryTitles) && b.entryTitles.length > 0
        ? '<div class="bookLinkedRow">🔗 関連論証 ' + b.entryTitles.length + '件'
          + '（' + b.entryTitles.slice(0, 3).map(t => escapeHtml(t)).join('、') + (b.entryTitles.length > 3 ? '…ほか' : '') + '）</div>'
        : '')
      + '<div class="bookActionsRow">'
      + '<button type="button" class="bookEditBtn" data-id="' + escapeHtml(b.id) + '">✏️ 編集</button>'
      + '<button type="button" class="bookDeleteBtn" data-id="' + escapeHtml(b.id) + '">🗑️ 削除</button>'
      + (Array.isArray(b.entryTitles) && b.entryTitles.length > 0
        ? '<button type="button" class="bookQuizBtn" data-id="' + escapeHtml(b.id) + '">▶ 範囲で演習</button>'
        : '')
      + '</div>'
      + '</div>'
      + '</div>';
  }).join('');
}

function resetBookForm() {
  bookEditingId = null;
  bookPendingCover = null;
  const ids = ['bookTitleInput', 'bookSubjectInput', 'bookStartInput', 'bookEndInput',
    'bookCurrentPageInput', 'bookTotalPagesInput', 'bookStudyHoursInput', 'bookStudyMinsInput', 'bookMemoInput'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const range = document.getElementById('bookProgressRange');
  if (range) {
    range.value = '0';
    const label = document.getElementById('bookProgressLabel');
    if (label) label.textContent = '0%';
    updateBookRangeFill(range);
  }
  const coverInput = document.getElementById('bookCoverInput');
  if (coverInput) coverInput.value = '';
  const saveBtn = document.getElementById('bookSaveBtn');
  if (saveBtn) saveBtn.textContent = '保存する';
  const entrySearch = document.getElementById('bookEntrySearchInput');
  if (entrySearch) entrySearch.value = '';
  bookEntryPickerSelected = new Set();
  renderBookCoverPreview();
  renderBookEntryPicker();
}

function openBookFormForEdit(b) {
  bookEditingId = b.id;
  bookPendingCover = null;
  document.getElementById('bookTitleInput').value = b.title || '';
  document.getElementById('bookSubjectInput').value = b.subject || '';
  document.getElementById('bookStartInput').value = b.startDate || '';
  document.getElementById('bookEndInput').value = b.endDate || '';
  document.getElementById('bookCurrentPageInput').value = b.currentPage !== '' && b.currentPage != null ? b.currentPage : '';
  document.getElementById('bookTotalPagesInput').value = b.totalPages !== '' && b.totalPages != null ? b.totalPages : '';
  const studyMin = Math.max(0, Math.round(Number(b.studyMinutes) || 0));
  document.getElementById('bookStudyHoursInput').value = studyMin > 0 ? Math.floor(studyMin / 60) : '';
  document.getElementById('bookStudyMinsInput').value = studyMin > 0 ? studyMin % 60 : '';
  const range = document.getElementById('bookProgressRange');
  if (range) {
    range.value = String(bookEffectiveProgress(b));
    updateBookRangeFill(range);
    const label = document.getElementById('bookProgressLabel');
    if (label) label.textContent = range.value + '%';
  }
  document.getElementById('bookMemoInput').value = b.memo || '';
  const coverInput = document.getElementById('bookCoverInput');
  if (coverInput) coverInput.value = '';
  const saveBtn = document.getElementById('bookSaveBtn');
  if (saveBtn) saveBtn.textContent = '更新する';
  const entrySearch = document.getElementById('bookEntrySearchInput');
  if (entrySearch) entrySearch.value = '';
  bookEntryPickerSelected = new Set(b.entryTitles || []);
  renderBookEntryPicker();
  const form = document.getElementById('bookForm');
  if (form && !form.classList.contains('pastLogFormOpen')) {
    form.classList.add('pastLogFormOpen');
    const toggleBtn = document.getElementById('bookAddToggleBtn');
    if (toggleBtn) toggleBtn.textContent = '－ 閉じる';
  }
  renderBookCoverPreview();
  document.getElementById('bookPage').scrollIntoView();
}

function initBookFeature() {
  const addToggleBtn = document.getElementById('bookAddToggleBtn');
  const form = document.getElementById('bookForm');
  const saveBtn = document.getElementById('bookSaveBtn');
  const cancelEditBtn = document.getElementById('bookCancelEditBtn');
  const subjectFilterSel = document.getElementById('bookSubjectFilter');
  const coverInput = document.getElementById('bookCoverInput');
  const coverRemoveBtn = document.getElementById('bookCoverRemoveBtn');
  const range = document.getElementById('bookProgressRange');
  const area = document.getElementById('bookArea');
  if (!addToggleBtn || !form || !saveBtn) return;

  addToggleBtn.addEventListener('click', () => {
    const open = form.classList.toggle('pastLogFormOpen');
    addToggleBtn.textContent = open ? '－ 閉じる' : '＋ 書籍を追加';
    if (!open) resetBookForm();
  });

  if (range) range.addEventListener('input', () => {
    const label = document.getElementById('bookProgressLabel');
    if (label) label.textContent = range.value + '%';
    updateBookRangeFill(range);
  });
  updateBookRangeFill(range);

  if (coverInput) coverInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      status.textContent = '🖼 表紙画像を読み込み中…';
      bookPendingCover = await processBookCoverFile(file);
      renderBookCoverPreview();
      status.textContent = '🖼 表紙画像を読み込みました（保存するまで確定されません）。';
    } catch (err) {
      status.textContent = '表紙画像の読み込みに失敗しました：' + err.message;
      e.target.value = '';
    }
  });

  if (coverRemoveBtn) coverRemoveBtn.addEventListener('click', () => {
    bookPendingCover = '';
    if (coverInput) coverInput.value = '';
    renderBookCoverPreview();
  });

  saveBtn.addEventListener('click', () => {
    const title = document.getElementById('bookTitleInput').value.trim();
    const subject = document.getElementById('bookSubjectInput').value.trim();
    const startDate = document.getElementById('bookStartInput').value;
    const endDate = document.getElementById('bookEndInput').value;
    const currentPageRaw = document.getElementById('bookCurrentPageInput').value;
    const totalPagesRaw = document.getElementById('bookTotalPagesInput').value;
    const memo = document.getElementById('bookMemoInput').value.trim();
    const studyMinutes = Math.max(0, Math.round(Number(document.getElementById('bookStudyHoursInput').value) || 0)) * 60
      + Math.max(0, Math.round(Number(document.getElementById('bookStudyMinsInput').value) || 0));
    if (!title) {
      alert('書籍名を入力してください。');
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      alert('勉強期間の開始日が終了日より後になっています。');
      return;
    }
    const currentPage = currentPageRaw === '' ? '' : Math.max(0, Number(currentPageRaw));
    const totalPages = totalPagesRaw === '' ? '' : Math.max(0, Number(totalPagesRaw));
    let progress = Number(range ? range.value : 0);
    if (totalPages !== '' && totalPages > 0 && currentPage !== '') {
      progress = Math.max(0, Math.min(100, Math.round((currentPage / totalPages) * 100)));
    }
    const now = new Date().toISOString();
    const entryTitles = [...bookEntryPickerSelected];
    if (bookEditingId) {
      const idx = books.findIndex(b => b.id === bookEditingId);
      if (idx !== -1) {
        const prev = books[idx];
        books[idx] = {
          ...prev, title, subject, startDate, endDate, currentPage, totalPages, studyMinutes, progress, memo, entryTitles,
          cover: bookPendingCover === null ? (prev.cover || null) : (bookPendingCover || null),
          updatedAt: now
        };
      }
      status.textContent = '✏️ 書籍を更新しました。';
    } else {
      books.push({
        id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        title, subject, startDate, endDate, currentPage, totalPages, studyMinutes, progress, memo, entryTitles,
        cover: bookPendingCover || null,
        createdAt: now, updatedAt: now
      });
      status.textContent = '📖 書籍を追加しました。';
    }
    saveBooks();
    resetBookForm();
    form.classList.remove('pastLogFormOpen');
    addToggleBtn.textContent = '＋ 書籍を追加';
    renderBookPage();
  });

  if (cancelEditBtn) cancelEditBtn.addEventListener('click', () => {
    resetBookForm();
    form.classList.remove('pastLogFormOpen');
    addToggleBtn.textContent = '＋ 書籍を追加';
  });

  if (subjectFilterSel) subjectFilterSel.addEventListener('change', () => {
    bookSubjectFilter = subjectFilterSel.value;
    renderBookPage();
  });

  const bookSearchInput = document.getElementById('bookSearchInput');
  if (bookSearchInput) bookSearchInput.addEventListener('input', () => {
    bookSearchQuery = bookSearchInput.value;
    renderBookPage();
  });

  // 関連論証ピッカーの絞り込み（科目入力・タイトル検索で候補を更新）。
  // チェック状態は bookEntryPickerSelected（JS側）で保持する。
  // ピッカー内のチェック変更もここで集約する（再描画しても消えない）
  const bookSubjectInput = document.getElementById('bookSubjectInput');
  const bookEntrySearchInput = document.getElementById('bookEntrySearchInput');
  const bookEntryPickerList = document.getElementById('bookEntryPickerList');
  if (bookSubjectInput) bookSubjectInput.addEventListener('input', renderBookEntryPicker);
  if (bookEntrySearchInput) bookEntrySearchInput.addEventListener('input', renderBookEntryPicker);
  if (bookEntryPickerList) bookEntryPickerList.addEventListener('change', (e) => {
    const chk = e.target.closest('.bookEntryCheck');
    if (!chk) return;
    if (chk.checked) bookEntryPickerSelected.add(chk.value);
    else bookEntryPickerSelected.delete(chk.value);
  });

  if (area) area.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.bookEditBtn');
    if (editBtn) {
      const b = books.find(x => x.id === editBtn.dataset.id);
      if (b) openBookFormForEdit(b);
      return;
    }
    const delBtn = e.target.closest('.bookDeleteBtn');
    if (delBtn) {
      const b = books.find(x => x.id === delBtn.dataset.id);
      if (!b) return;
      if (!confirm('「' + bookDisplayTitle(b) + '」を削除しますか？（元に戻せません）')) return;
      books = books.filter(x => x.id !== b.id);
      if (bookEditingId === b.id) resetBookForm();
      saveBooks();
      renderBookPage();
      status.textContent = '🗑️ 「' + bookDisplayTitle(b) + '」を削除しました。';
      return;
    }
    const quizBtn = e.target.closest('.bookQuizBtn');
    if (quizBtn) {
      const b = books.find(x => x.id === quizBtn.dataset.id);
      if (!b || !Array.isArray(b.entryTitles) || b.entryTitles.length === 0) return;
      if (typeof startQuizWithTitles === 'function') startQuizWithTitles(b.entryTitles);
    }
  });

  renderBookPage();
}
initBookFeature();
/* ▲▲▲ 新規追加：書籍管理機能 ここまで ▲▲▲ */
