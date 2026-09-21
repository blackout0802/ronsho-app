const drop = document.getElementById('drop');
const fileInput = document.getElementById('fileInput');
const status = document.getElementById('status');
const tableWrap = document.getElementById('tableWrap');
const csvTableWrap = document.getElementById('csvTableWrap');
const csvSubjectFilter = document.getElementById('csvSubjectFilter');
const calendarWrap = document.getElementById('calendarWrap');
const trendWrap = document.getElementById('trendWrap');
const downloadBtn = document.getElementById('downloadBtn');
const downloadLogBtn = document.getElementById('downloadLogBtn');
const subjectTabsStudy = document.getElementById('subjectTabsStudy');
const subjectTabsQuiz = document.getElementById('subjectTabsQuiz');
const categoryTabsStudy = document.getElementById('categoryTabsStudy');
const categoryTabsQuiz = document.getElementById('categoryTabsQuiz');
const tagTabsStudy = document.getElementById('tagTabsStudy');
const tagTabsQuiz = document.getElementById('tagTabsQuiz');
const starTabsStudy = document.getElementById('starTabsStudy');
const starTabsQuiz = document.getElementById('starTabsQuiz');
const importanceTabsStudy = document.getElementById('importanceTabsStudy');
const importanceTabsQuiz = document.getElementById('importanceTabsQuiz');
const freqTabsStudy = document.getElementById('freqTabsStudy');
const searchInputStudy = document.getElementById('searchInputStudy');
const searchCountStudy = document.getElementById('searchCountStudy');
const quizArea = document.getElementById('quizArea');
const quizPriorityNote = document.getElementById('quizPriorityNote');
const quizOverdueOnlyChk = document.getElementById('quizOverdueOnlyChk');
const quizExcludeTodayChk = document.getElementById('quizExcludeTodayChk');
const quizSkippedOnlyChk = document.getElementById('quizSkippedOnlyChk');
const quizRandomChk = document.getElementById('quizRandomChk');
const ENTRIES_STORAGE_KEY = 'ronshoEntries';
const ENTRY_TABLE_COLGROUP = '<colgroup>'
  + '<col style="width:6%;">'
  + '<col style="width:5%;">'
  + '<col style="width:5%;">'
  + '<col style="width:19%;">'
  + '<col style="width:37%;">'
  + '<col style="width:10%;">'
  + '<col style="width:6%;">'
  + '<col style="width:6%;">'
  + '<col style="width:6%;">'
  + '</colgroup>';
let entries = [];
let studyLog = {};
let manualLog = {};
let selectedDay = null;
let selectedSubject = 'all';
let selectedCsvSubject = 'all';
let selectedCategory = 'all';
let selectedTag = 'all';
// 「すべて表示」「😰苦手のみ」「🙈暗記済みを除く」「✅暗記済みのみ」「🔖ブックマークのみ」は
// 互いに排他的な5択。この端末のデフォルト（STAR_FILTER_DEFAULT_KEY）から初期化する
const STAR_FILTER_MODES = ['all', 'weak', 'hideMemorized', 'memorizedOnly', 'bookmarked'];
const STAR_FILTER_DEFAULT_KEY = 'ronshoStarFilterDefaultV1';
function loadStarFilterDefault() {
  const raw = localStorage.getItem(STAR_FILTER_DEFAULT_KEY);
  return STAR_FILTER_MODES.includes(raw) ? raw : 'all';
}
function saveStarFilterDefault(v) {
  localStorage.setItem(STAR_FILTER_DEFAULT_KEY, v);
}
let starFilterMode = loadStarFilterDefault();
// ホームの「📚 科目別 暗記完了率」を、科目別の一覧表示と重要度別（なし/⭐/⭐⭐）の
// マトリクス表示のどちらで見せるかのトグル。端末をまたいでも同じ見た目になるよう
// 同期対象のローカル設定として永続化する（他の既定値設定と同じ生の文字列形式）
const PROGRESS_VIEW_MODES = ['subject', 'importance'];
const PROGRESS_VIEW_MODE_KEY = 'ronshoProgressViewModeV1';
function loadProgressViewMode() {
  const raw = localStorage.getItem(PROGRESS_VIEW_MODE_KEY);
  return PROGRESS_VIEW_MODES.includes(raw) ? raw : 'subject';
}
function saveProgressViewMode(v) {
  localStorage.setItem(PROGRESS_VIEW_MODE_KEY, v);
}
let progressViewMode = loadProgressViewMode();
let minYearFrequency = 0;
let sortByFrequency = false;
let selectedImportance = 'all';
let expandedBodySet = new Set();
let searchQueryStudy = '';
let quizPool = [];
let quizIndex = 0;
let quizRevealed = false;
let quizStarted = false;
let quizMinCount = 0;
let quizOverdueMode = false;
let quizSequentialMode = true;
let quizComboCount = 0;
// カード右上の「⋮」メニュー（🔖🗒️⏭️✏️🗑️）の開閉状態。カードが切り替わったら
// 自動的に閉じるよう、どの論証で開いたかもあわせて保持する（永続化はしない）
let quizToolsMenuOpen = false;
let quizToolsMenuOpenTitle = null;
let trendMode = 'week';
// 「学習・暗記率の推移」グラフを、全体表示と科目別の学習回数の内訳表示の
// どちらで見せるか。trendMode（週次/月次）と同じく画面を離れると初期状態に
// 戻る、この画面だけの一時的な表示切替（永続化はしない）
let trendViewMode = 'overall';
// 位置(idx)ではなくタイトルで編集対象を保持する。同期でentries配列が
// 丸ごと入れ替わっても（applyRemoteData）、編集中の論証を見失わないため。
let editingEntryTitle = null;
let compareList = [];
let compareModalOpen = false;
function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}
function todayStr() {
  return formatLocalDate(new Date());
}
function heatmapLevelOf(count) {
  return count === 0 ? 0 : count <= 2 ? 1 : count <= 5 ? 2 : count <= 9 ? 3 : 4;
}
const SUBJECT_EMOJI = { '民法': '⚖️', '刑法': '🚨', '憲法': '📜', '商法': '💼', '民事訴訟法': '🧑\u200d⚖️', '刑事訴訟法': '🚓', '行政法': '🏛️', '労働法': '👷', '実務基礎民事': '📄', '実務基礎刑事': '🚔' };
function getSubjectEmoji(subject) {
  return SUBJECT_EMOJI[subject] || '📘';
}
const CATEGORY_TO_SUBJECT = { '団体的労使関係法': '労働法', '個別的労働関係法': '労働法', '労働組合法': '労働法' };
function inferSubjectFromCategory(category) {
  return CATEGORY_TO_SUBJECT[category] || '';
}
const STUDY_COUNT_BUCKETS = ['0', '1', '2', '3', '4+'];
const STUDY_COUNT_LABELS = { '0': '未学習', '1': '1回', '2': '2回', '3': '3回', '4+': '4回以上' };
const STUDY_COUNT_COLORS = { '0': '#94a3b8', '1': '#38bdf8', '2': '#34d399', '3': '#fbbf24', '4+': '#a855f7' };
function getStudyCount(title) {
  const log = studyLog[title];
  return (log && log.history) ? log.history.length : 0;
}
function getStudyCountBuckets(list) {
  const buckets = { '0': 0, '1': 0, '2': 0, '3': 0, '4+': 0 };
  list.forEach(e => {
    const cnt = getStudyCount(e.title);
    buckets[cnt >= 4 ? '4+' : String(cnt)]++;
  });
  return buckets;
}
function buildStudyCountBarHtml(list) {
  const buckets = getStudyCountBuckets(list);
  const total = list.length;
  const segHtml = STUDY_COUNT_BUCKETS.map(b => {
    const w = total > 0 ? (buckets[b] / total * 100) : 0;
    if (w <= 0) return '';
    return '<div class="studyCountSeg" style="width:' + w + '%;background:' + STUDY_COUNT_COLORS[b] + ';" title="' + STUDY_COUNT_LABELS[b] + '：' + buckets[b] + '件"></div>';
  }).join('');
  const legendHtml = STUDY_COUNT_BUCKETS.map(b => {
    return '<span class="studyCountLegendItem"><span class="studyCountDot" style="background:' + STUDY_COUNT_COLORS[b] + ';"></span>' + STUDY_COUNT_LABELS[b] + ' ' + buckets[b] + '件</span>';
  }).join('');
  return '<div class="studyCountBarOuter">' + segHtml + '</div>'
    + '<div class="studyCountLegend">' + legendHtml + '</div>';
}
// ▼▼▼ 新規追加：科目別 暗記完了率の「重要度別」マトリクス表示 ここから ▼▼▼
const IMPORTANCE_LEVELS_FOR_MATRIX = [2, 1, 0];
const IMPORTANCE_LEVEL_LABELS = { 2: '⭐⭐', 1: '⭐', 0: 'なし' };
function computeSubjectImportanceStats(subjectStats, subjectOrderList) {
  const result = {};
  subjectOrderList.forEach(s => {
    const levels = { 0: { total: 0, memorized: 0 }, 1: { total: 0, memorized: 0 }, 2: { total: 0, memorized: 0 } };
    const st = subjectStats[s];
    (st ? st.entries : []).forEach(e => {
      const imp = e.importance || 0;
      const lv = levels[imp] || (levels[imp] = { total: 0, memorized: 0 });
      lv.total++;
      if (studyLog[e.title] && studyLog[e.title].memorized) lv.memorized++;
    });
    result[s] = levels;
  });
  return result;
}
function buildImportanceMatrixHtml(subjectStats, subjectOrderList) {
  const impStats = computeSubjectImportanceStats(subjectStats, subjectOrderList);
  const headCells = IMPORTANCE_LEVELS_FOR_MATRIX.map(lv => '<th class="importanceMatrixHeadCell">' + IMPORTANCE_LEVEL_LABELS[lv] + '</th>').join('');
  const rowsHtml = subjectOrderList.map(s => {
    const st = subjectStats[s];
    const overallPct = st.total > 0 ? Math.round((st.memorized / st.total) * 100) : 0;
    const cellsHtml = IMPORTANCE_LEVELS_FOR_MATRIX.map(lv => {
      const l = impStats[s][lv];
      const pctLabel = l.total > 0 ? Math.round((l.memorized / l.total) * 100) + '%' : '―';
      return '<td class="importanceMatrixCell importanceMatrixCell-' + lv + '">' + pctLabel + '</td>';
    }).join('');
    return '<tr>'
      + '<td class="importanceMatrixSubjectCell">' + getSubjectEmoji(s) + ' ' + escapeHtml(s) + '</td>'
      + '<td class="importanceMatrixCell importanceMatrixOverallCol">' + overallPct + '%</td>'
      + cellsHtml
      + '</tr>';
  }).join('');
  return '<div class="importanceMatrixScroll"><table class="importanceMatrixTable">'
    + '<thead><tr><th class="importanceMatrixHeadCell importanceMatrixSubjectCell">科目</th><th class="importanceMatrixHeadCell importanceMatrixOverallCol">全体</th>' + headCells + '</tr></thead>'
    + '<tbody>' + rowsHtml + '</tbody>'
    + '</table></div>';
}
// ▲▲▲ 科目別 暗記完了率の「重要度別」マトリクス表示 ここまで ▲▲▲
let expandedProgressSubjects = new Set();
function getSubjectCategoryStats(st) {
  const order = [];
  const stats = {};
  st.entries.forEach(e => {
    const c = e.category || '未分類';
    if (!stats[c]) { stats[c] = { total: 0, memorized: 0, studied: 0 }; order.push(c); }
    stats[c].total++;
    const log = studyLog[e.title];
    if (log && log.memorized) stats[c].memorized++;
    if (log && log.history && log.history.length > 0) stats[c].studied++;
  });
  return order.map(c => ({ name: c, total: stats[c].total, memorized: stats[c].memorized, studied: stats[c].studied }));
}
function buildSubjectItemHtml(s, st, compact) {
  const p = st.total > 0 ? Math.round((st.memorized / st.total) * 100) : 0;
  const categories = getSubjectCategoryStats(st);
  const isExpanded = expandedProgressSubjects.has(s);
  const chipsHtml = categories.length > 1
    ? '<div class="subjectCatChips">' + categories.map(c => {
        const cp = c.total > 0 ? Math.round((c.memorized / c.total) * 100) : 0;
        const sp = c.total > 0 ? Math.round((c.studied / c.total) * 100) : 0;
        return '<span class="subjectCatChip"><span class="subjectCatChipName">' + escapeHtml(c.name) + '</span><span class="subjectCatChipPct">暗記' + cp + '%</span><span class="subjectCatChipStudyPct">学習' + sp + '%</span></span>';
      }).join('') + '</div>'
    : '';
  const detailHtml = categories.length > 1
    ? '<div class="subjectCatDetail">' + categories.map(c => {
        const cp = c.total > 0 ? Math.round((c.memorized / c.total) * 100) : 0;
        const sp = c.total > 0 ? Math.round((c.studied / c.total) * 100) : 0;
        return '<div class="subjectCatDetailRow">'
          + '<span class="subjectCatDetailName">' + escapeHtml(c.name) + '</span>'
          + '<span class="subjectCatDetailCounts">' + c.total + '件 ／ 暗記' + c.memorized + '件 ／ 学習' + c.studied + '件</span>'
          + '<div class="subjectCatDetailBarWrap"><div class="studyCountBarOuter thin"><div class="studyCountSeg" style="width:' + cp + '%;background:linear-gradient(135deg,#10b981,#00c2ff);"></div><div class="studyCountSeg" style="width:' + (100 - cp) + '%;background:#f1f5f9;"></div></div></div>'
          + '<span class="subjectCatDetailPct">暗記' + cp + '% ／ 学習' + sp + '%</span>'
          + '</div>';
      }).join('') + '</div>'
    : '';
  return '<div class="subjectProgressItem' + (compact ? ' compact' : '') + '">'
    + '<div class="subjectProgressHeader">'
    + '<div class="subjectProgressName' + (categories.length > 1 ? ' clickable' : '') + '" data-subject="' + escapeHtml(s) + '" title="' + (categories.length > 1 ? 'クリックで分野別の内訳を表示' : '') + '">' + getSubjectEmoji(s) + ' ' + escapeHtml(s) + (categories.length > 1 ? '<span class="subjectCatCaret">' + (isExpanded ? '▼' : '▶') + '</span>' : '') + '</div>'
    + '<div class="subjectProgressCounts">合計' + st.total + '件 ／ 暗記' + st.memorized + '件</div>'
    + '<div class="subjectProgressPct">' + p + '%</div>'
    + '</div>'
    + buildStudyCountBarHtml(st.entries)
    + (isExpanded ? detailHtml : chipsHtml)
    + '</div>';
}
function renderProgressSummary() {
  const el = document.getElementById('subjectProgressBody');
  const overallEl = document.getElementById('overallProgressCardWrap');
  const toggleEl = document.getElementById('progressViewToggle');
  if (!el) return;
  // 科目別の進捗を再描画するタイミングは、弱点診断の材料（暗記率・苦手フラグ・
  // 復習期限超過）が変わるタイミングとほぼ同じなので、ここにまとめて呼ぶ
  if (typeof renderWeaknessDiagnosis === 'function') renderWeaknessDiagnosis();
  const titleEl = document.getElementById('subjectProgressTitle');
  if (entries.length === 0) {
    el.innerHTML = '';
    if (titleEl) titleEl.textContent = '';
    if (overallEl) overallEl.innerHTML = '';
    if (toggleEl) toggleEl.innerHTML = '';
    return;
  }
  // ホーム上部の全体カードは、科目タブなどの絞り込みに関わらず常に全体の値を表示する
  const total = entries.length;
  const memorizedCount = entries.filter(e => studyLog[e.title] && studyLog[e.title].memorized).length;
  const pct = total > 0 ? Math.round((memorizedCount / total) * 100) : 0;

  const subjectStats = {};
  entries.forEach(e => {
    const s = e.subject || 'その他';
    if (!subjectStats[s]) {
      subjectStats[s] = { total: 0, memorized: 0, entries: [] };
    }
    subjectStats[s].total++;
    subjectStats[s].entries.push(e);
    if (studyLog[e.title] && studyLog[e.title].memorized) subjectStats[s].memorized++;
  });
  const subjectOrderList = getUniqueSubjects();
  const subjectRows = [];
  for (let i = 0; i < subjectOrderList.length; i += 2) {
    const pair = subjectOrderList.slice(i, i + 2);
    if (pair.length === 2) {
      subjectRows.push('<div class="subjectProgressGroupRow">' + pair.map(s => buildSubjectItemHtml(s, subjectStats[s], true)).join('') + '</div>');
    } else {
      subjectRows.push(buildSubjectItemHtml(pair[0], subjectStats[pair[0]], false));
    }
  }
  const subjectHtml = subjectRows.join('');
  if (toggleEl) {
    toggleEl.innerHTML = '<button type="button" class="progressViewToggleBtn' + (progressViewMode === 'subject' ? ' active' : '') + '" data-view="subject">科目別</button>'
      + '<button type="button" class="progressViewToggleBtn' + (progressViewMode === 'importance' ? ' active' : '') + '" data-view="importance">重要度別</button>';
  }
  if (overallEl) {
    overallEl.innerHTML = '<div class="progressCard">'
      + '<div class="progressBigPct">' + pct + '%</div>'
      + '<div class="progressBarSection">'
      + '<div class="progressLabel">合計' + total + '件 ／ 暗記済み' + memorizedCount + '件</div>'
      + buildStudyCountBarHtml(entries)
      + '</div>'
      + '</div>';
  }
  if (titleEl) titleEl.textContent = '📚 科目別 暗記完了率・学習回数';
  el.innerHTML = progressViewMode === 'importance' ? buildImportanceMatrixHtml(subjectStats, subjectOrderList) : subjectHtml;
}
// ▼▼▼ 新規追加：科目別の弱点自動診断
// 専用のデータは持たず、既存のstudyLog（暗記済みフラグ・苦手フラグ）と
// getNextReviewInfo()（復習期限超過の判定。問題演習の出題フィルタと同じ
// ロジック）だけから、科目ごとの「弱点度」を毎回その場で計算する。
// 判定材料が偏った1指標（暗記率だけ等）にならないよう、暗記率の低さ・
// 苦手フラグの多さ・復習期限超過の多さの3つを重み付けして合成している
const WEAKNESS_MIN_ENTRIES = 3; // 件数が少ない科目は数値がブレやすいので対象外にする
const WEAKNESS_SHOW_THRESHOLD = 20; // このスコア未満の科目しかなければ「弱点なし」表示にする
function computeSubjectWeakness(subjectEntries) {
  const total = subjectEntries.length;
  let memorized = 0, starred = 0, overdue = 0;
  subjectEntries.forEach(e => {
    const log = studyLog[e.title];
    const isMemorized = !!(log && log.memorized);
    if (isMemorized) memorized++;
    if (log && log.starred) starred++;
    if (!isMemorized) {
      const info = getNextReviewInfo(e.title);
      if (info && info.nextDateStr <= todayStr()) overdue++;
    }
  });
  const memorizedRate = memorized / total;
  const starredRate = starred / total;
  const overdueRate = overdue / total;
  const weaknessScore = Math.round((1 - memorizedRate) * 60 + starredRate * 25 + overdueRate * 15);
  return { total: total, memorized: memorized, starred: starred, overdue: overdue, memorizedRate: memorizedRate, weaknessScore: weaknessScore };
}
function renderWeaknessDiagnosis() {
  const el = document.getElementById('weaknessDiagnosisCard');
  if (!el) return;
  if (entries.length === 0) { el.innerHTML = ''; return; }
  const subjectEntryMap = {};
  entries.forEach(e => {
    const s = e.subject || 'その他';
    if (!subjectEntryMap[s]) subjectEntryMap[s] = [];
    subjectEntryMap[s].push(e);
  });
  const ranked = Object.keys(subjectEntryMap)
    .map(s => Object.assign({ subject: s }, computeSubjectWeakness(subjectEntryMap[s])))
    .filter(r => r.total >= WEAKNESS_MIN_ENTRIES)
    .sort((a, b) => b.weaknessScore - a.weaknessScore);
  if (ranked.length === 0) { el.innerHTML = ''; return; }
  const weakOnes = ranked.filter(r => r.weaknessScore >= WEAKNESS_SHOW_THRESHOLD).slice(0, 3);
  if (weakOnes.length === 0) {
    el.innerHTML = '<div class="weaknessCard"><div class="weaknessGood">🎉 現在、特に弱点となっている科目はありません。この調子で頑張りましょう！</div></div>';
    return;
  }
  el.innerHTML = '<div class="weaknessCard">'
    + '<div class="weaknessTitle">🎯 重点的に復習したい科目</div>'
    + weakOnes.map(r => {
      const statParts = ['暗記率' + Math.round(r.memorizedRate * 100) + '%'];
      if (r.starred > 0) statParts.push('😰苦手' + r.starred + '件');
      if (r.overdue > 0) statParts.push('⏰復習期限超過' + r.overdue + '件');
      return '<div class="weaknessRow">'
        + '<span class="weaknessSubject">' + getSubjectEmoji(r.subject) + ' ' + escapeHtml(r.subject) + '</span>'
        + '<span class="weaknessStats">' + statParts.join(' ／ ') + '</span>'
        + '</div>';
    }).join('')
    + '<div class="weaknessNote">暗記率・苦手フラグ・復習期限超過の状況から自動的に算出しています（対象は3件以上ある科目のみ）。</div>'
    + '</div>';
}
// ▲▲▲ 科目別の弱点自動診断 ここまで ▲▲▲
document.getElementById('progressSummary').addEventListener('click', (e) => {
  const toggleBtn = e.target.closest('.progressViewToggleBtn');
  if (toggleBtn) {
    const mode = toggleBtn.dataset.view;
    if (PROGRESS_VIEW_MODES.includes(mode) && mode !== progressViewMode) {
      progressViewMode = mode;
      saveProgressViewMode(mode);
      renderProgressSummary();
    }
    return;
  }
  const nameEl = e.target.closest('.subjectProgressName.clickable');
  if (!nameEl) return;
  const s = nameEl.dataset.subject;
  if (expandedProgressSubjects.has(s)) expandedProgressSubjects.delete(s);
  else expandedProgressSubjects.add(s);
  renderProgressSummary();
});
// --- 花火×LEVEL UP演出 ---
function triggerFireworkLevelUp(el) {
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const colors = ['#0057e7', '#00c2ff', '#54a0ff', '#7c3aed', '#22c55e', '#ff9ff3'];
  for (let i = 0; i < 24; i++) {
    const p = document.createElement('div');
    p.className = 'fwParticle';
    p.style.left = cx + 'px';
    p.style.top = cy + 'px';
    p.style.background = colors[i % colors.length];
    const angle = (Math.PI * 2 * i) / 24 + Math.random() * 0.3;
    const dist = 45 + Math.random() * 30;
    p.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
    p.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1050);
  }
  setTimeout(() => {
    const badge = document.createElement('div');
    badge.className = 'levelUpBadge';
    badge.textContent = '🎉 LEVEL UP!';
    badge.style.left = cx + 'px';
    badge.style.top = (cy - 20) + 'px';
    document.body.appendChild(badge);
    setTimeout(() => badge.remove(), 1150);
  }, 200);
}
function loadStudyLog() {
  try {
    const raw = localStorage.getItem('ronshoStudyLog');
    studyLog = raw ? JSON.parse(raw) : {};
  } catch (e) {
    studyLog = {};
  }
}
function saveStudyLog() {
  localStorage.setItem('ronshoStudyLog', JSON.stringify(studyLog));
  if (typeof window !== 'undefined' && typeof window.ronshoSyncNotifyChange === 'function') window.ronshoSyncNotifyChange();
}
function loadManualLog() {
  try {
    const raw = localStorage.getItem('ronshoManualLog');
    manualLog = raw ? JSON.parse(raw) : {};
  } catch (e) {
    manualLog = {};
  }
}
function saveManualLog() {
  localStorage.setItem('ronshoManualLog', JSON.stringify(manualLog));
  if (typeof window !== 'undefined' && typeof window.ronshoSyncNotifyChange === 'function') window.ronshoSyncNotifyChange();
}
function loadEntries() {
  try {
    const raw = localStorage.getItem(ENTRIES_STORAGE_KEY);
    entries = raw ? JSON.parse(raw) : [];
  } catch (e) {
    entries = [];
  }
  let migrated = false;
  entries = entries.map(e => {
    if (e.subject === '刑法総論' || e.subject === '刑法各論') {
      migrated = true;
      return { ...e, subject: '刑法', category: e.subject };
    }
    const resolvedCategory = resolveKeihoCategory(e.subject, e.category);
    if (resolvedCategory !== e.category) { migrated = true; return { ...e, category: resolvedCategory }; }
    if (!e.subject) {
      const inferred = inferSubjectFromCategory(e.category);
      if (inferred) { migrated = true; return { ...e, subject: inferred }; }
    }
    return e;
  });
  if (migrated) saveEntries();
}
function saveEntries() {
  try {
    localStorage.setItem(ENTRIES_STORAGE_KEY, JSON.stringify(entries));
    if (typeof window !== 'undefined' && typeof window.ronshoSyncNotifyChange === 'function') window.ronshoSyncNotifyChange();
  } catch (e) {
    console.error('読み込みデータの保存に失敗しました:', e);
  }
}
document.getElementById('clearEntriesBtn').addEventListener('click', () => {
  if (!confirm('読み込んだWordデータを削除しますか？（学習記録・暗記度・苦手フラグなどは削除されません）')) return;
  entries = [];
  saveEntries();
  selectedSubject = 'all';
  selectedCsvSubject = 'all';
  selectedCategory = 'all';
  starFilterMode = 'all';
  minYearFrequency = 0;
  sortByFrequency = false;
  selectedImportance = 'all';
  expandedBodySet = new Set();
  tableWrap.innerHTML = '';
  csvTableWrap.innerHTML = '';
  csvSubjectFilter.innerHTML = '';
  calendarWrap.innerHTML = '';
  trendWrap.innerHTML = '';
  document.getElementById('subjectProgressBody').innerHTML = '';
  downloadBtn.style.display = 'none';
  downloadLogBtn.style.display = 'none';
  status.textContent = '読み込みデータを削除しました。新しくWordファイルを読み込んでください。';
});
document.getElementById('exportLogBtn').addEventListener('click', () => {
  const payload = { studyLog: studyLog, manualLog: manualLog };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '学習記録_' + todayStr() + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});
document.getElementById('importLogBtn').addEventListener('click', () => {
  document.getElementById('importLogInput').click();
});
document.getElementById('importLogInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const imported = JSON.parse(text);
    let importedStudyLog, importedManualLog;
    if (imported && (imported.studyLog || imported.manualLog)) {
      importedStudyLog = imported.studyLog || {};
      importedManualLog = imported.manualLog || {};
    } else {
      importedStudyLog = imported || {};
      importedManualLog = {};
    }
    const merged = Object.assign({}, studyLog);
    Object.keys(importedStudyLog).forEach(title => {
      const incoming = importedStudyLog[title];
      if (!merged[title]) {
        merged[title] = incoming;
      } else {
        const existingHistory = merged[title].history || [];
        const incomingHistory = incoming.history || [];
        const mergedHistorySet = new Set([...existingHistory, ...incomingHistory]);
        merged[title].history = Array.from(mergedHistorySet).sort();
        merged[title].memorized = incoming.memorized || merged[title].memorized || false;
        merged[title].confidence = incoming.confidence || merged[title].confidence || null;
        merged[title].memo = merged[title].memo || incoming.memo || '';
        merged[title].starred = merged[title].starred || incoming.starred || false;
        merged[title].category = merged[title].category || incoming.category || '';
        merged[title].subject = merged[title].subject || incoming.subject || '';
      }
    });
    studyLog = merged;
    saveStudyLog();
    Object.keys(importedManualLog).forEach(dateStr => {
      if (!manualLog[dateStr]) manualLog[dateStr] = [];
      manualLog[dateStr] = manualLog[dateStr].concat(importedManualLog[dateStr]);
    });
    saveManualLog();
    renderAll();
    status.textContent = '学習記録を読み込み、既存の記録と統合しました。';
  } catch (err) {
    status.textContent = '学習記録の読み込みに失敗しました: ' + err.message;
  }
  e.target.value = '';
});
// ⚙️その他タブを開くたびに再描画が必要な設定UIの登録先。機能追加のたびに
// 「その他」タブのクリックへ個別にリスナーを足すのではなく、ここにまとめて
// 登録しておくことで、タブクリック時の処理を1箇所（下のタブ切り替え処理）に集約する
const settingsPageRenderers = [];
function registerSettingsPageRenderer(fn) {
  settingsPageRenderers.push(fn);
}
document.querySelectorAll('.tabBtn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabBtn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.page).classList.add('active');
    if (btn.dataset.page === 'calendarPage') { renderCalendar(); renderTrendChart(); }
    if (btn.dataset.page === 'quizPage') renderQuizPage();
    if (btn.dataset.page === 'precedentPage') renderPrecedentPage();
    if (btn.dataset.page === 'bookPage' && typeof renderBookPage === 'function') renderBookPage();
    if (btn.dataset.page === 'settingsPage') settingsPageRenderers.forEach(fn => fn());
    if (btn.dataset.page === 'speechPage') {
      renderSpeechSubjectSelect();
      speechQueue = buildSpeechQueue();
      speechIndex = 0;
      renderSpeechCurrentCard();
    } else if (speechIsPlaying) {
      stopSpeech();
    }
  });
});
// アプリ上部の📚見出しを押したらホームタブに戻る（iPad等での操作用）。
// .tabBtn[data-page="studyPage"]のクリック処理をそのまま流用する
const appHomeLink = document.getElementById('appHomeLink');
if (appHomeLink) {
  appHomeLink.style.cursor = 'pointer';
  appHomeLink.addEventListener('click', () => {
    const homeBtn = document.querySelector('.tabBtn[data-page="studyPage"]');
    if (homeBtn) homeBtn.click();
    window.scrollTo(0, 0);
  });
}
drop.addEventListener('click', () => fileInput.click());
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
drop.addEventListener('drop', e => {
  e.preventDefault();
  drop.classList.remove('dragover');
  if (e.dataTransfer.files.length) handleFiles(Array.from(e.dataTransfer.files));
});
fileInput.addEventListener('change', e => {
  if (e.target.files.length) handleFiles(Array.from(e.target.files));
});
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
const debouncedRenderStudyTable = debounce(() => renderStudyTable(entries), 200);
searchInputStudy.addEventListener('input', () => {
  searchQueryStudy = searchInputStudy.value.trim();
  debouncedRenderStudyTable();
});
document.getElementById('searchClearStudy').addEventListener('click', () => {
  searchInputStudy.value = '';
  searchQueryStudy = '';
  renderStudyTable(entries);
});
document.getElementById('quizStartBtn').addEventListener('click', () => {
  startQuiz();
});
csvSubjectFilter.addEventListener('change', () => {
  selectedCsvSubject = csvSubjectFilter.value;
  renderCsvTable(getCsvFilteredEntries());
});
function runListToText(runList) {
  return runList.map(r => r.text).join('');
}
function isTitleLine(runList) {
  return /^[★☆]+/.test(runListToText(runList).trim());
}
const SECTION_STOP_WORDS = ['サブ', '今後追加', '暗記'];
function escapeHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function buildBodyHtml(bodyRunLines) {
  return bodyRunLines.map(runList => {
    let lineHtml = '';
    let isFirstRun = true;
    for (const r of runList) {
      const text = isFirstRun ? r.text.replace(/^[\s\u3000]+/, '') : r.text;
      const escaped = escapeHtml(text);
      let content = (r.bold && r.color) ? '<b>' + escaped + '</b>' : escaped;
      if (r.color) {
        content = '<span style="color:' + r.color + ';">' + content + '</span>';
      }
      lineHtml += content;
      isFirstRun = false;
    }
    return lineHtml;
  }).join('<br>');
}
function buildYearHtml(yearStr) {
  if (!yearStr) return '';
  const tokens = yearStr.split(';').filter(Boolean);
  return tokens.map(tokStr => {
    const [text, color] = tokStr.split('|');
    const escaped = escapeHtml(text);
    return color ? '<span style="color:' + color + '; font-weight:bold;">' + escaped + '</span>' : escaped;
  }).join(', ');
}
function yearStrToPlainText(yearStr) {
  if (!yearStr) return '';
  return yearStr.split(';').filter(Boolean).map(tokStr => tokStr.split('|')[0]).join(',');
}
function getYearTokensPlain(yearStr) {
  if (!yearStr) return [];
  return yearStr.split(';').filter(Boolean).map(tokStr => tokStr.split('|')[0]).filter(Boolean);
}
function getYearFrequency(e) {
  return getYearTokensPlain(e.year).length;
}
function extractEntries(paraRuns) {
  const out = [];
  let i = 0;
  const n = paraRuns.length;
  let currentSubject = '';
  let currentCategory = '';
  while (i < n) {
    const lineText = runListToText(paraRuns[i]).trim();
    if (SECTION_STOP_WORDS.includes(lineText)) break;
    const combinedMatch = lineText.match(/^(.+?)[\s\u3000]*[<＜]([^>＞]+)[>＞]$/);
    if (combinedMatch) {
      const maybeSubject = combinedMatch[1].replace(/[\s\u3000]/g, '').trim();
      const maybeCategory = combinedMatch[2].replace(/[\s\u3000]/g, '').trim();
      if (isSubjectLine(maybeSubject)) currentSubject = normalizeSubjectName(maybeSubject);
      if (maybeCategory) currentCategory = maybeCategory;
      i++;
      continue;
    }
    if (/^[<＜](.+)[>＞]$/.test(lineText)) {
      const m = lineText.match(/^[<＜](.+)[>＞]$/);
      currentCategory = m[1].replace(/[\s\u3000]/g, '').trim();
      i++;
      continue;
    }
    if (isPlainCategoryLine(lineText)) {
      currentCategory = lineText.replace(/[\s\u3000]/g, '').trim();
      i++;
      continue;
    }
    if (isSubjectLine(lineText.replace(/[\s\u3000]/g, '').trim())) {
      currentSubject = normalizeSubjectName(lineText.replace(/[\s\u3000]/g, '').trim());
      i++;
      continue;
    }
    if (isTitleLine(paraRuns[i])) {
      const { title, yearTokensColored, importance } = parseTitleLineRuns(paraRuns[i]);
      const yearStr = buildFilteredYearStr(yearTokensColored);
      i++;
      let bodyLines = [];
      let bodyRunLines = [];
      while (i < n) {
        const nxtText = runListToText(paraRuns[i]).trim();
        if (nxtText === '') { i++; continue; }
        if (isTitleLine(paraRuns[i])) break;
        if (SECTION_STOP_WORDS.includes(nxtText)) break;
        if (/^[<＜].+[>＞]$/.test(nxtText)) break;
        if (isPlainCategoryLine(nxtText) || isSubjectLine(nxtText)) break;
        const cleaned = nxtText.replace(/^[\s\u3000]+/, '').trim();
        bodyLines.push(cleaned);
        bodyRunLines.push(paraRuns[i]);
        i++;
      }
      const body = bodyLines.join('\n');
      const bodyHtml = buildBodyHtml(bodyRunLines);
      const resolvedSubject = currentSubject || inferSubjectFromCategory(currentCategory);
      out.push({ title: title, body: body, bodyHtml: bodyHtml, year: yearStr, category: currentCategory, subject: resolvedSubject, importance: importance });
      continue;
    }
    i++;
  }
  return out;
}
const SUBJECT_LINE_ALIASES = {
  '民法': '民法',
  '刑法': '刑法',
  '憲法': '憲法',
  '商法': '商法',
  '民事訴訟法': '民事訴訟法',
  '民訴法': '民事訴訟法',
  '民訴': '民事訴訟法',
  '刑事訴訟法': '刑事訴訟法',
  '刑訴法': '刑事訴訟法',
  '刑訴': '刑事訴訟法',
  '行政法': '行政法',
  '労働法': '労働法',
  '実務基礎民事': '実務基礎民事',
  '実務基礎刑事': '実務基礎刑事'
};
function isSubjectLine(text) {
  if (!text || /[。、]/.test(text) || text.length > 10) return false;
  return Object.prototype.hasOwnProperty.call(SUBJECT_LINE_ALIASES, text);
}
function normalizeSubjectName(text) {
  return SUBJECT_LINE_ALIASES[text] || text;
}
function isPlainCategoryLine(text) {
  if (!text) return false;
  const t = text.replace(/[\s　]/g, '').trim();
  if (!t || /[。、]/.test(t) || t.length > 20) return false;
  const known = ['総則','物権','担保物権','債権総論','債権各論','親族','相続','人権','統治','総論','各論','財産犯','生命身体に対する罪','文書罪',
    '第一審','複雑訴訟','上訴','再審','民事執行','民事保全','当事者','訴訟要件','既判力','多数当事者訴訟',
    '会社法','商行為','手形小切手法','設立','株式','機関','計算','組織再編'];
  return known.includes(t);
}
function parseTitleLineRuns(runList) {
  const chars = [];
  for (const r of runList) {
    for (const ch of r.text) {
      chars.push({ ch: ch, color: r.color });
    }
  }
  while (chars.length && /[\s　]/.test(chars[0].ch)) chars.shift();
  let idx = 0;
  let importance = 0;
  while (idx < chars.length && (chars[idx].ch === '★' || chars[idx].ch === '☆')) { importance++; idx++; }
  const segments = [];
  let current = [];
  for (; idx < chars.length; idx++) {
    if (chars[idx].ch === '\u3000') {
      segments.push(current);
      current = [];
    } else {
      current.push(chars[idx]);
    }
  }
  if (current.length) segments.push(current);
  const title = segments.length > 0 ? segments[0].map(c => c.ch).join('').trim() : '';
  const yearTokensColored = [];
  for (let s = 1; s < segments.length; s++) {
    const seg = segments[s];
    const segText = seg.map(c => c.ch).join('').trim();
    const groupIsSu = segText.startsWith('ス');
    let tokChars = [];
    const flushToken = () => {
      if (tokChars.length === 0) return;
      const text = tokChars.map(c => c.ch).join('').trim();
      if (text === '') { tokChars = []; return; }
      const coloredChar = tokChars.find(c => c.color) || tokChars[0];
      yearTokensColored.push({ text: text, color: coloredChar.color || null, groupIsSu: groupIsSu });
      tokChars = [];
    };
    for (const c of seg) {
      if (c.ch === ',' || c.ch === '\uFF0C') {
        flushToken();
      } else {
        tokChars.push(c);
      }
    }
    flushToken();
  }
  return { title, yearTokensColored, importance };
}
function buildFilteredYearStr(yearTokensColored) {
  const kept = yearTokensColored.filter(t => {
    if (t.groupIsSu) return false;
    if (isOldBarExamColor(t.color)) return false;
    return true;
  });
  return kept.map(t => t.text + '|' + (t.color || '')).join(';');
}
function isOldBarExamColor(color) {
  if (!color) return false;
  const c = color.toLowerCase();
  return c === '#ff9900' || c === '#ff950e';
}
function isNewBarExamColor(color) {
  if (!color) return false;
  return color.toLowerCase() === '#2fff2e';
}
function isYobiShikenColor(color) {
  if (!color) return false;
  const c = color.toLowerCase();
  return c === '#00ccff' || c === '#00dcff';
}
function inferSubjectFromFilename(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('min-fa') || n.includes('民法')) return '民法';
  if (n.includes('kei-ho') || n.includes('刑法')) return '刑法';
  if (n.includes('ken-po') || n.includes('xian-fa') || n.includes('憲法')) return '憲法';
  if (n.includes('商法')) return '商法';
  if (n.includes('民事訴訟法') || n.includes('民訴')) return '民事訴訟法';
  if (n.includes('刑事訴訟法') || n.includes('刑訴')) return '刑事訴訟法';
  if (n.includes('行政法')) return '行政法';
  if (n.includes('労働法')) return '労働法';
  if (n.includes('実務基礎民事')) return '実務基礎民事';
  if (n.includes('実務基礎刑事')) return '実務基礎刑事';
  return '';
}
function resolveKeihoCategory(subject, category) {
  if (subject !== '刑法') return category;
  if (category === '総論') return '刑法総論';
  if (category === '各論' || category === '財産犯' || category === '生命身体に対する罪' || category === '文書罪') return '刑法各論';
  return category;
}
async function parseSingleFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const docXml = await zip.file('word/document.xml').async('string');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(docXml, 'application/xml');
  const paragraphs = xmlDoc.getElementsByTagName('w:p');
  const paraRuns = [];
  for (let p of paragraphs) {
    const runs = p.getElementsByTagName('w:r');
    const runList = [];
    for (let r of runs) {
      const texts = r.getElementsByTagName('w:t');
      let text = '';
      for (let t of texts) text += t.textContent;
      if (text === '') continue;
      let color = null;
      const colorEls = r.getElementsByTagName('w:color');
      if (colorEls.length > 0) {
        const v = colorEls[0].getAttribute('w:val');
        if (v && v.toLowerCase() !== '000000' && v.toLowerCase() !== 'auto') {
          color = '#' + v;
        }
      }
      const boldEls = r.getElementsByTagName('w:b');
      const bold = boldEls.length > 0 && boldEls[0].getAttribute('w:val') !== '0' && boldEls[0].getAttribute('w:val') !== 'false';
      runList.push({ text: text, color: color, bold: bold });
    }
    paraRuns.push(runList);
  }
  const subjectFromName = inferSubjectFromFilename(file.name);
  const parsed = extractEntries(paraRuns).map(e => {
    const subject = subjectFromName || e.subject || '';
    return { ...e, subject: subject, category: resolveKeihoCategory(subject, e.category) };
  });
  return parsed;
}
async function handleFiles(files) {
  status.textContent = '読み込み中...';
  tableWrap.innerHTML = '';
  csvTableWrap.innerHTML = '';
  calendarWrap.innerHTML = '';
  downloadBtn.style.display = 'none';
  downloadLogBtn.style.display = 'none';
  // 読み込み中に自動同期が走ると、確定前のデータで上書きされる恐れがあるため一時停止する
  const resumeSync = () => { if (typeof window.ronshoSuspendSync === 'function') window.ronshoSuspendSync(false); };
  if (typeof window.ronshoSuspendSync === 'function') window.ronshoSuspendSync(true);
  try {
    let newEntries = [];
    for (const file of files) {
      const parsed = await parseSingleFile(file);
      newEntries = newEntries.concat(parsed);
    }
    const importedAt = new Date().toISOString();
    newEntries.forEach(e => { e.importedAt = importedAt; });
    const touchedSubjects = new Set(newEntries.map(e => e.subject || 'その他'));
    // 再読み込みでタイトルや本文が少し変わった論証も学習記録が0件に
    // 戻らないよう、内容が近い論証を探して学習記録を引き継ぐ
    const oldTouchedEntries = entries.filter(e => touchedSubjects.has(e.subject || 'その他'));
    const carriedOverCount = (typeof carryOverStudyLogOnReimport === 'function')
      ? carryOverStudyLogOnReimport(oldTouchedEntries, newEntries)
      : 0;
    if (carriedOverCount > 0) saveStudyLog();
    // 同じく、直接編集機能で手動で色付け・太字にした文言も、
    // 同一ないし類似の論証として引き継ぐ
    const carriedOverHighlightCount = (typeof carryOverManualHighlightsOnReimport === 'function')
      ? carryOverManualHighlightsOnReimport(oldTouchedEntries, newEntries)
      : 0;
    const newBySubject = new Map();
    newEntries.forEach(e => {
      const s = e.subject || 'その他';
      if (!newBySubject.has(s)) newBySubject.set(s, []);
      newBySubject.get(s).push(e);
    });
    // 科目を再読み込みした際、その科目のブロックを配列の末尾に移動させず、
    // 元々その科目が出現していた位置に差し込むことで、科目の並び順を維持する
    const insertedSubjects = new Set();
    const merged = [];
    entries.forEach(e => {
      const s = e.subject || 'その他';
      if (touchedSubjects.has(s)) {
        if (!insertedSubjects.has(s)) {
          merged.push(...newBySubject.get(s));
          insertedSubjects.add(s);
        }
      } else {
        merged.push(e);
      }
    });
    newBySubject.forEach((list, s) => {
      if (!insertedSubjects.has(s)) merged.push(...list);
    });
    entries = merged;
    saveEntries();
    selectedSubject = 'all';
    selectedCategory = 'all';
    starFilterMode = 'all';
    minYearFrequency = 0;
    sortByFrequency = false;
    selectedImportance = 'all';
    expandedBodySet = new Set();
    searchQueryStudy = '';
    searchInputStudy.value = '';
    quizPool = [];
    quizStarted = false;
    renderAll();
    const touchedLabel = Array.from(touchedSubjects).map(s => s === 'その他' ? s : s).join('・');
    status.textContent = '✨ ' + newEntries.length + '件の論証を抽出しました（' + touchedLabel + 'を更新）。読み込みファイル数: ' + files.length + '件／全体 ' + entries.length + '件（次回起動時も自動で復元されます）'
      + (carriedOverCount > 0 ? '／内容が少し変わった' + carriedOverCount + '件の学習記録を引き継ぎました' : '')
      + (carriedOverHighlightCount > 0 ? '／手動で色付け・太字にした' + carriedOverHighlightCount + '件の文言を引き継ぎました' : '');
    downloadBtn.style.display = 'inline-block';
    downloadLogBtn.style.display = 'inline-block';
    if (typeof findDuplicatePairs === 'function') {
      const dupWrap = document.getElementById('duplicateResultsWrap');
      if (dupWrap) dupWrap.innerHTML = '<div class="dupCheckEmpty">🔍 自動で重複チェック中…</div>';
      setTimeout(() => {
        dupCheckPairs = findDuplicatePairs();
        if (typeof renderDuplicateResults === 'function') renderDuplicateResults();
        if (dupCheckPairs.length > 0) {
          status.textContent += '／⚠️重複候補 ' + dupCheckPairs.length + '件（「データ」タブでご確認ください）';
        }
        resumeSync();
      }, 30);
    } else {
      resumeSync();
    }
  } catch (err) {
    status.textContent = 'エラーが発生しました: ' + err.message;
    console.error(err);
    resumeSync();
  }
}
const SUBJECT_ORDER = ['憲法', '民法', '刑法', '行政法', '商法', '民事訴訟法', '刑事訴訟法'];
function getUniqueSubjects() {
  const seen = [];
  entries.forEach(e => {
    const s = e.subject || 'その他';
    if (!seen.includes(s)) seen.push(s);
  });
  seen.sort((a, b) => {
    const ia = SUBJECT_ORDER.indexOf(a);
    const ib = SUBJECT_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return seen;
}
function getUniqueCategories() {
  const scoped = selectedSubject === 'all' ? entries : entries.filter(e => (e.subject || 'その他') === selectedSubject);
  const seen = [];
  scoped.forEach(e => {
    const c = e.category || '未分類';
    if (!seen.includes(c)) seen.push(c);
  });
  return seen;
}
function renderSubjectTabsHtml() {
  const subjects = getUniqueSubjects();
  if (subjects.length <= 1) return '';
  let html = '<select class="subjectTabSelect">';
  html += '<option value="all"' + (selectedSubject === 'all' ? ' selected' : '') + '>📚 すべて</option>';
  subjects.forEach(s => {
    html += '<option value="' + escapeHtml(s) + '"' + (selectedSubject === s ? ' selected' : '') + '>' + getSubjectEmoji(s) + ' ' + escapeHtml(s) + '</option>';
  });
  html += '</select>';
  return html;
}
function renderCategoryTabsHtml() {
  const categories = getUniqueCategories();
  if (categories.length <= 1) return '';
  let html = '<select class="categoryTabSelect">';
  html += '<option value="all"' + (selectedCategory === 'all' ? ' selected' : '') + '>📁 すべての分野</option>';
  categories.forEach(c => {
    html += '<option value="' + escapeHtml(c) + '"' + (selectedCategory === c ? ' selected' : '') + '>' + escapeHtml(c) + '</option>';
  });
  html += '</select>';
  return html;
}
function renderStarTabsHtml() {
  // 「すべて表示」は文字通り暗記済みも含めて全件を表示する（デフォルト）。
  // 苦手のみ／暗記済みを除く／暗記済みのみ、は互いに排他的な4択。
  const modeLabels = { all: 'すべて表示', weak: '😰 苦手のみ', hideMemorized: '🙈 暗記済みを除く', memorizedOnly: '✅ 暗記済みのみ', bookmarked: '🔖 ブックマークのみ' };
  let html = '<select class="starTabSelect">';
  STAR_FILTER_MODES.forEach(m => {
    html += '<option value="' + m + '"' + (starFilterMode === m ? ' selected' : '') + '>' + modeLabels[m] + '</option>';
  });
  html += '</select>';
  return html;
}
function renderImportanceTabsHtml() {
  let html = '<select class="importanceTabSelect">';
  html += '<option value="all"' + (selectedImportance === 'all' ? ' selected' : '') + '>重要度すべて</option>';
  html += '<option value="2"' + (selectedImportance === 2 ? ' selected' : '') + '>⭐⭐</option>';
  html += '<option value="1"' + (selectedImportance === 1 ? ' selected' : '') + '>⭐</option>';
  html += '<option value="0"' + (selectedImportance === 0 ? ' selected' : '') + '>なし</option>';
  html += '</select>';
  return html;
}
function renderFreqTabsHtml() {
  let html = '<button type="button" class="starFilterBtn' + (minYearFrequency === 0 ? ' active' : '') + '" data-freq="0">出題頻度すべて</button>';
  html += '<button type="button" class="starFilterBtn' + (minYearFrequency === 2 ? ' active' : '') + '" data-freq="2">2回以上出題</button>';
  html += '<button type="button" class="starFilterBtn' + (minYearFrequency === 3 ? ' active' : '') + '" data-freq="3">3回以上出題</button>';
  html += '<button type="button" class="starFilterBtn' + (sortByFrequency ? ' active' : '') + '" id="freqSortBtn">🔥頻出順に並び替え</button>';
  return html;
}
function renderSubjectTabs() {
  const html = renderSubjectTabsHtml();
  subjectTabsStudy.innerHTML = html;
  subjectTabsQuiz.innerHTML = html;
  const catHtml = renderCategoryTabsHtml();
  categoryTabsStudy.innerHTML = catHtml;
  categoryTabsQuiz.innerHTML = catHtml;
  const starHtml = renderStarTabsHtml();
  starTabsStudy.innerHTML = starHtml;
  starTabsQuiz.innerHTML = starHtml;
  const importanceHtml = renderImportanceTabsHtml();
  importanceTabsStudy.innerHTML = importanceHtml;
  importanceTabsQuiz.innerHTML = importanceHtml;
  const freqHtml = renderFreqTabsHtml();
  freqTabsStudy.innerHTML = freqHtml;
  const tagHtml = renderTagTabsHtml();
  if (tagTabsStudy) tagTabsStudy.innerHTML = tagHtml;
  if (tagTabsQuiz) tagTabsQuiz.innerHTML = tagHtml;
}
// getUniqueCategories()と同じく、選択中の科目・分野に絞ってからタグを
// 集める。「準共有株主」のように特定の科目でしか使わないタグが、
// 無関係な科目を選んでいるときにも並んでしまうのを防ぐため
function getUniqueTags() {
  let scoped = selectedSubject === 'all' ? entries : entries.filter(e => (e.subject || 'その他') === selectedSubject);
  if (selectedCategory !== 'all') {
    scoped = scoped.filter(e => (e.category || '未分類') === selectedCategory);
  }
  const seen = [];
  scoped.forEach(e => {
    (e.tags || []).forEach(t => { if (t && !seen.includes(t)) seen.push(t); });
  });
  return seen.sort((a, b) => a.localeCompare(b, 'ja'));
}
function getRelatedEntries(e) {
  const tags = e.tags || [];
  if (tags.length === 0) return [];
  return entries.filter(other => other !== e && (other.tags || []).some(t => tags.includes(t)));
}
function jumpToEntryByTitle(title) {
  const tabBtn = document.querySelector('.tabBtn[data-page="entryListPage"]');
  if (tabBtn && !tabBtn.classList.contains('active')) tabBtn.click();
  selectedTag = 'all';
  searchQueryStudy = title;
  if (searchInputStudy) searchInputStudy.value = title;
  renderSubjectTabs();
  renderStudyTable(entries);
}
function renderTagTabsHtml() {
  const tags = getUniqueTags();
  if (tags.length === 0) return '';
  let html = '<select class="tagTabSelect">';
  html += '<option value="all"' + (selectedTag === 'all' ? ' selected' : '') + '>🏷 タグすべて</option>';
  tags.forEach(t => {
    html += '<option value="' + escapeHtml(t) + '"' + (selectedTag === t ? ' selected' : '') + '>' + escapeHtml(t) + '</option>';
  });
  html += '</select>';
  return html;
}
function filterEntries(data, searchQuery) {
  let result = data;
  if (selectedSubject !== 'all') {
    result = result.filter(e => (e.subject || 'その他') === selectedSubject);
  }
  if (selectedCategory !== 'all') {
    result = result.filter(e => (e.category || '未分類') === selectedCategory);
  }
  if (selectedTag !== 'all') {
    result = result.filter(e => (e.tags || []).includes(selectedTag));
  }
  if (starFilterMode === 'weak') {
    result = result.filter(e => studyLog[e.title] && studyLog[e.title].starred);
  } else if (starFilterMode === 'hideMemorized') {
    result = result.filter(e => !(studyLog[e.title] && studyLog[e.title].memorized));
  } else if (starFilterMode === 'memorizedOnly') {
    result = result.filter(e => studyLog[e.title] && studyLog[e.title].memorized);
  } else if (starFilterMode === 'bookmarked') {
    result = result.filter(e => studyLog[e.title] && studyLog[e.title].bookmarked);
  }
  if (selectedImportance !== 'all') {
    result = result.filter(e => (e.importance || 0) === selectedImportance);
  }
  if (minYearFrequency > 0) {
    result = result.filter(e => getYearFrequency(e) >= minYearFrequency);
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    result = result.filter(e => (e.title || '').toLowerCase().includes(q) || (e.body || '').toLowerCase().includes(q) || (e.source || '').toLowerCase().includes(q));
  }
  if (sortByFrequency) {
    result = result.slice().sort((a, b) => getYearFrequency(b) - getYearFrequency(a));
  }
  return result;
}
function highlightSearch(html, query) {
  if (!query) return html;
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(' + escapedQuery + ')', 'ig');
  // タグ内（<...>）や文字参照（&lt;等）の中に<mark>を挿入すると
  // マークアップが壊れるため、テキスト部分だけに適用する
  return String(html).split(/(<[^>]*>|&[A-Za-z0-9#]+;)/g).map(function (part, i) {
    if (i % 2 === 1) return part;
    return part.replace(re, '<mark class="searchHit">$1</mark>');
  }).join('');
}
function renderAll(preserveQuiz) {
  renderSubjectTabs();
  renderStudyTable(entries);
  renderCsvSubjectFilter();
  renderCsvTable(getCsvFilteredEntries());
  renderSpeechSubjectSelect();
  renderCalendar();
  renderTrendChart();
  renderProgressSummary();
  if (!preserveQuiz) {
    quizStarted = false;
  }
  renderQuizPage();
  renderPastLogs();
  if (typeof renderBookPage === 'function') renderBookPage();
  if (typeof renderExamTrendRanking === 'function') renderExamTrendRanking();
  renderCompareBar();
  renderSyncConflictBanner();
  if (typeof renderBackupReminderBanner === 'function') renderBackupReminderBanner();
  if (typeof renderGamificationPanel === 'function') renderGamificationPanel();
  if (typeof renderBadgesSection === 'function') renderBadgesSection();
  if (typeof renderSummarySection === 'function') renderSummarySection();
  if (typeof renderCountdownCard === 'function') renderCountdownCard();
  if (typeof renderQuoteCard === 'function') renderQuoteCard();
}
function getNextReviewInfo(title) {
  const log = studyLog[title] || {};
  const history = log.history || [];
  if (history.length === 0) return null;
  const lastDateStr = history[history.length - 1];
  const count = history.length;
  let intervalDays = 1;
  if (count === 1) intervalDays = 1;
  else if (count === 2) intervalDays = 3;
  else if (count === 3) intervalDays = 7;
  else if (count === 4) intervalDays = 14;
  else if (count === 5) intervalDays = 30;
  else intervalDays = 60;
  if (log.confidence === 'perfect') intervalDays = Math.round(intervalDays * 1.5);
  if (log.confidence === 'unsure') intervalDays = Math.max(1, Math.round(intervalDays / 2));
  if (log.confidence === 'bad') intervalDays = 1;
  const d = new Date(lastDateStr + 'T00:00:00');
  d.setDate(d.getDate() + intervalDays);
  const nextDateStr = formatLocalDate(d);
  return { lastDateStr, count, intervalDays, nextDateStr };
}
function buildImportanceStarsHtml(importance) {
  const n = importance || 0;
  if (n <= 0) return '';
  return '<span class="importanceStars">' + '⭐'.repeat(n) + '</span>';
}
const CONFIDENCE_TREND_COLORS = { perfect: '#22c55e', good: '#38bdf8', unsure: '#fbbf24', bad: '#f87171' };
const CONFIDENCE_TREND_LABELS = { perfect: '◎ 完璧', good: '○ できた', unsure: '△ あやしい', bad: '✕ ダメ' };
// 論証一覧の「学習回数」列に、暗記度の推移を小さな色付きドットで表示する
// （左が古く、右が新しい）。1論証1カードの詳細画面を新たに作らずとも、
// 一覧をざっと眺めるだけで定着度の変化に気づけるようにするための軽量表示
function buildConfidenceTrendHtml(title) {
  const log = studyLog[title];
  const hist = (log && log.confidenceHistory) || [];
  if (hist.length === 0) return '';
  const recent = hist.slice(-12);
  const dots = recent.map(h => '<span class="trendDot" style="background:' + (CONFIDENCE_TREND_COLORS[h.level] || '#cbd5e1') + ';" title="' + escapeHtml(h.date || '') + '：' + (CONFIDENCE_TREND_LABELS[h.level] || '') + '"></span>').join('');
  return '<div class="confidenceTrendRow" title="直近' + recent.length + '件の暗記度の推移（右が新しい）">' + dots + '</div>';
}
function buildConfidenceGroupHtml(idx, confidence) {
  return '<div class="confidenceGroup" data-idx="' + idx + '">'
    + '<span class="confBtn confPerfect' + (confidence === 'perfect' ? ' active' : '') + '" data-level="perfect" data-idx="' + idx + '" title="完璧">◎</span>'
    + '<span class="confBtn confGood' + (confidence === 'good' ? ' active' : '') + '" data-level="good" data-idx="' + idx + '" title="できた">○</span>'
    + '<span class="confBtn confUnsure' + (confidence === 'unsure' ? ' active' : '') + '" data-level="unsure" data-idx="' + idx + '" title="あやしい">△</span>'
    + '<span class="confBtn confBad' + (confidence === 'bad' ? ' active' : '') + '" data-level="bad" data-idx="' + idx + '" title="ダメ">✕</span>'
    + '</div>';
}
