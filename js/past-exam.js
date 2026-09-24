/* ▼▼▼ 新規追加：過去問ログ機能（既存の変数・関数名と一切重複しない名前空間で実装） ▼▼▼
   既存の entries / studyLog / manualLog / renderStudyTable などには一切触れていません。
   保存先も専用のキー 'ronshoPastExamLogs_v1' のみを使用します。 */
const PAST_EXAM_LOG_KEY = 'ronshoPastExamLogs_v1';
// 「過去問ログ」タブを開いたときに最初から選ばれている種別を、設定画面
// (js/settings.js)から変更できるようにする（drive-sync.jsで同期対象）
const PAST_EXAM_DEFAULT_TYPE_KEY = 'ronshoPastExamDefaultTypeV1';
const PAST_EXAM_TYPE_OPTIONS = ['予備試験', '新司法試験'];
function loadPastExamDefaultType() {
  const raw = localStorage.getItem(PAST_EXAM_DEFAULT_TYPE_KEY);
  return PAST_EXAM_TYPE_OPTIONS.includes(raw) ? raw : '予備試験';
}
function savePastExamDefaultType(v) {
  localStorage.setItem(PAST_EXAM_DEFAULT_TYPE_KEY, v);
}
// 保存自体は既存の互換性のためYYYY-MM-DDのまま行うが、画面表示は年度欄
// （令和◯年）に合わせて和暦で統一する
const PAST_EXAM_ERAS = [
  { name: '令和', start: new Date(2019, 4, 1) },
  { name: '平成', start: new Date(1989, 0, 8) },
  { name: '昭和', start: new Date(1926, 11, 25) },
  { name: '大正', start: new Date(1912, 6, 30) },
  { name: '明治', start: new Date(1868, 0, 25) }
];
function formatPastExamDateWareki(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  const era = PAST_EXAM_ERAS.find(e => d >= e.start);
  if (!era) return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  const eraYear = d.getFullYear() - era.start.getFullYear() + 1;
  return era.name + (eraYear === 1 ? '元' : eraYear) + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
}
(() => {
  const sel = document.getElementById('pastExamTypeSelect');
  if (sel) sel.value = loadPastExamDefaultType();
})();

function loadPastExamLogs() {
  let logs;
  try {
    const raw = localStorage.getItem(PAST_EXAM_LOG_KEY);
    logs = raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('過去問ログの読み込みに失敗しました:', e);
    return [];
  }
  let migrated = false;
  logs = logs.map(l => {
    const examType = l.examType || '予備試験';
    // 以前は 種別+科目+年度+回数 のみをキーにしていたため、同じ回数のまま
    // 解答日だけ変えて記録すると上書きされてしまっていた。解答日もキーに
    // 含めることで、日付が違えば別のログとして残せるようにする
    const key = examType + '|' + l.subject + '|' + l.year + '|' + l.round + '|' + (l.date || '');
    if (l.examType && l.key === key) return l;
    migrated = true;
    return { ...l, examType: examType, key: key };
  });
  if (migrated) savePastExamLogs(logs);
  return logs;
}

function savePastExamLogs(logs) {
  try {
    localStorage.setItem(PAST_EXAM_LOG_KEY, JSON.stringify(logs));
    if (typeof window !== 'undefined' && typeof window.ronshoSyncNotifyChange === 'function') window.ronshoSyncNotifyChange();
  } catch (e) {
    console.error('過去問ログの保存に失敗しました:', e);
  }
}

// 詳細ログの表は件数が増えると縦に伸び続けてしまうため、既定では解答日が
// 新しい順に直近5件だけを表示し、残りはテーブル下部のチップボタンで
// 展開できるようにする
const PAST_LOG_DISPLAY_LIMIT = 5;
let pastLogExpanded = false;

function renderPastLogs() {
  const table = document.getElementById('pastLogTable');
  if (!table) return;

  const logs = loadPastExamLogs();
  const tbody = table.querySelector('tbody');
  tbody.innerHTML = '';

  // 直近の記録が一目で分かるよう、解答日が新しい順に並べる
  logs.sort((a, b) => {
    if ((a.date || '') !== (b.date || '')) return (b.date || '').localeCompare(a.date || '');
    const typeA = a.examType || '予備試験';
    const typeB = b.examType || '予備試験';
    if (typeA !== typeB) return typeA.localeCompare(typeB, 'ja');
    const subjA = a.subject || '';
    const subjB = b.subject || '';
    if (subjA !== subjB) return subjA.localeCompare(subjB, 'ja');
    const yearA = a.year || '';
    const yearB = b.year || '';
    if (yearA !== yearB) return yearA.localeCompare(yearB, 'ja');
    return (a.round || 0) - (b.round || 0);
  });

  const total = logs.length;
  const visibleLogs = pastLogExpanded ? logs : logs.slice(0, PAST_LOG_DISPLAY_LIMIT);

  visibleLogs.forEach((log) => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td>' + escapeHtml(log.examType || '予備試験') + '</td>'
      + '<td>' + escapeHtml(log.subject || '') + '</td>'
      + '<td>' + escapeHtml(log.year || '') + '</td>'
      + '<td>' + log.round + '回目</td>'
      + '<td>' + escapeHtml(formatPastExamDateWareki(log.date)) + '</td>'
      + '<td contenteditable="true" data-key="' + escapeHtml(log.key) + '" class="pastMemoCell">' + escapeHtml(log.memo || '') + '</td>'
      + '<td><button type="button" data-key="' + escapeHtml(log.key) + '" class="pastDelBtn">削除</button></td>';
    tbody.appendChild(tr);
  });

  if (total > PAST_LOG_DISPLAY_LIMIT) {
    const trFoot = document.createElement('tr');
    trFoot.className = 'pastLogExpandRow';
    const remaining = total - PAST_LOG_DISPLAY_LIMIT;
    const label = pastLogExpanded ? ('直近' + PAST_LOG_DISPLAY_LIMIT + '件だけ表示 ▲') : ('+ 残り' + remaining + '件を表示 ▼');
    trFoot.innerHTML = '<td colspan="7"><button type="button" id="pastLogExpandBtn" class="pastLogExpandChip">' + label + '</button></td>';
    tbody.appendChild(trFoot);
  }
}

/* ▼▼▼ 新規追加：過去問ログ「年度×科目 一覧」マトリクス
   専用のデータは持たず、上の詳細ログ（loadPastExamLogs/savePastExamLogs）を
   そのまま読み書きすることで、一覧のマスと詳細ログを常に連動させています。
   ・詳細ログを記録/削除する → このマスの色が自動的に変わる
   ・このマスをクリックする → 詳細ログに新しい行が自動的に追加される
   色は js/core.js の STUDY_COUNT_COLORS（ホーム画面の学習回数の色）を
   そのまま流用します。 */
const PAST_EXAM_MATRIX_SUBJECTS = [
  { name: '憲法',         abbr: '憲' },
  { name: '民法',         abbr: '民' },
  { name: '刑法',         abbr: '刑' },
  { name: '行政法',       abbr: '行' },
  { name: '商法',         abbr: '商' },
  { name: '民事訴訟法',   abbr: '民訴' },
  { name: '刑事訴訟法',   abbr: '刑訴' },
  { name: '労働法',       abbr: '労' },
  { name: '実務基礎民事', abbr: '実民' },
  { name: '実務基礎刑事', abbr: '実刑' }
];
const PAST_EXAM_MATRIX_HEISEI_MIN = 18; // 新司法試験の開始年（2006年＝平成18年）
const PAST_EXAM_MATRIX_HEISEI_MAX = 31;
// 令和の最終年は当年から自動算出する（2026年＝令和8年。以降も追加対応なしで伸びる）。
// ただし最低でも8（令和8年）までは表示する
function pastMatrixMaxReiwaYear() {
  return Math.max(8, new Date().getFullYear() - 2018);
}
function pastMatrixBuildYears() {
  // 新しい年が上に来るよう、降順で並べる
  const years = [];
  for (let y = pastMatrixMaxReiwaYear(); y >= 1; y--) years.push({ era: 'R', num: y });
  for (let y = PAST_EXAM_MATRIX_HEISEI_MAX; y >= PAST_EXAM_MATRIX_HEISEI_MIN; y--) years.push({ era: 'H', num: y });
  return years;
}
const PAST_EXAM_MATRIX_YEARS = pastMatrixBuildYears();
function pastMatrixYearKey(y) { return y.era + y.num; }
function pastMatrixYearFullLabel(y) {
  if (y.era === 'H') return '平成' + y.num + '年';
  return y.num === 1 ? '令和元年' : '令和' + y.num + '年';
}
function pastMatrixYearShortLabel(y) { return y.era + y.num; }
// 列構成は常に全10科目分（科目数が最も多い予備試験を基準とした幅）で統一し、
// タブを切り替えても表の幅・右側の詳細ログの位置が左右にずれないようにする。
// 新司法試験には無い科目（実務基礎）は、列は残したまま中身だけ空欄にする
function pastMatrixSubjectsFor(examType) {
  return PAST_EXAM_MATRIX_SUBJECTS;
}
function pastMatrixColumnApplicable(examType, subjName) {
  if ((subjName === '実務基礎民事' || subjName === '実務基礎刑事') && examType !== '予備試験') return false;
  return true;
}
function pastMatrixApplicable(examType, subjName, year) {
  if (!pastMatrixColumnApplicable(examType, subjName)) return false;
  // 労働法が予備試験の選択科目になったのは令和4年から。平成分・令和3年以前は対象外
  if (subjName === '労働法' && examType === '予備試験') return year.era === 'R' && year.num >= 4;
  return true;
}
// 詳細ログの年度欄は自由入力（例：「令和7年（2025）」「H30」）なので、そこから
// 「何 era の何年か」だけを緩く読み取ってマスの年度と対応付ける
function pastMatrixToHalfWidthDigits(s) {
  return String(s || '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}
function pastMatrixNormalizeYear(era, num) {
  if (era === 'R' && num >= 1 && num <= pastMatrixMaxReiwaYear()) return { era: era, num: num };
  if (era === 'H' && num >= PAST_EXAM_MATRIX_HEISEI_MIN && num <= PAST_EXAM_MATRIX_HEISEI_MAX) return { era: era, num: num };
  return null;
}
function pastMatrixParseYear(yearText) {
  const t = pastMatrixToHalfWidthDigits(yearText);
  let m = t.match(/令和\s*(元|[0-9]+)\s*年/);
  if (m) return pastMatrixNormalizeYear('R', m[1] === '元' ? 1 : Number(m[1]));
  m = t.match(/平成\s*(元|[0-9]+)\s*年/);
  if (m) return pastMatrixNormalizeYear('H', m[1] === '元' ? 1 : Number(m[1]));
  m = t.match(/[RＲ]\s*([0-9]{1,2})/);
  if (m) return pastMatrixNormalizeYear('R', Number(m[1]));
  m = t.match(/[HＨ]\s*([0-9]{1,2})/);
  if (m) return pastMatrixNormalizeYear('H', Number(m[1]));
  return null;
}
// 詳細ログ一覧から「種別＋科目＋年度」ごとの最大回数を集計する
function computePastMatrixRounds(examType) {
  const map = {};
  loadPastExamLogs().forEach(l => {
    if ((l.examType || '予備試験') !== examType) return;
    const year = pastMatrixParseYear(l.year);
    if (!year) return;
    const subj = (l.subject || '').trim();
    const k = subj + '|' + pastMatrixYearKey(year);
    const r = Number(l.round) || 0;
    if (!map[k] || map[k] < r) map[k] = r;
  });
  return map;
}
function pastMatrixBucket(round) { return round >= 4 ? '4+' : String(round); }
function pastMatrixCellHtml(round) {
  const bucket = pastMatrixBucket(round);
  if (round === 0) return '<span class="pastMatrixCellInner pastMatrixCellEmpty"></span>';
  return '<span class="pastMatrixCellInner" style="background:' + STUDY_COUNT_COLORS[bucket] + ';">' + (round >= 4 ? '4+' : round) + '</span>';
}
// 過去問ログ保存フォーム（保存ボタン）とマスのクリックの両方から使う、
// 共通の「1件追加/上書き」処理
function upsertPastExamLogEntry(examType, subject, year, round, date) {
  const logs = loadPastExamLogs();
  const key = examType + '|' + subject + '|' + year + '|' + round + '|' + date;
  const existingIdx = logs.findIndex(l => l.key === key);
  const isNewLog = existingIdx === -1;
  const newItem = {
    key: key,
    examType: examType,
    subject: subject,
    year: year,
    round: round,
    date: date,
    memo: existingIdx >= 0 ? (logs[existingIdx].memo || '') : ''
  };
  if (existingIdx >= 0) logs[existingIdx] = newItem; else logs.push(newItem);
  savePastExamLogs(logs);
  // 既存の記録を上書き（メモ変更など）しただけの場合は加算しない。
  // 新しく1回分のログが増えたとき（＝過去問を1回解いたとき）だけXPを付与する
  if (isNewLog && typeof awardPastExamXp === 'function') awardPastExamXp();
}

let pastMatrixCurrentType = loadPastExamDefaultType();
// 元号の表示切替（令和／平成）。全22行を一度に表示すると縦に長いため、
// ボタンでどちらか一方に絞り込む。初期表示は令和。選択はこの端末の表示設定
// としてlocalStorageに記憶する（見た目だけの切替であり同期対象には含めない）
const PAST_MATRIX_ERA_KEY = 'ronshoPastMatrixEraV1';
const PAST_MATRIX_ERAS = [{ id: 'R', label: '令和' }, { id: 'H', label: '平成' }];
let pastMatrixCurrentEra = localStorage.getItem(PAST_MATRIX_ERA_KEY) === 'H' ? 'H' : 'R';
function pastMatrixVisibleYears() {
  return PAST_EXAM_MATRIX_YEARS.filter(y => y.era === pastMatrixCurrentEra);
}
// 平成は14行と縦に長いため、H26以降だけを初期表示し、それ以前（H18〜H25）は
// 詳細ログと同じ「＋残りを表示」形式で展開する。令和は8行なので常に全表示
const PAST_MATRIX_HEISEI_VISIBLE_FROM = 26;
let pastMatrixExpanded = false;
function pastMatrixSplitYears() {
  const years = pastMatrixVisibleYears();
  if (pastMatrixCurrentEra !== 'H' || pastMatrixExpanded) {
    return { visible: years, hidden: [] };
  }
  return {
    visible: years.filter(y => y.num >= PAST_MATRIX_HEISEI_VISIBLE_FROM),
    hidden: years.filter(y => y.num < PAST_MATRIX_HEISEI_VISIBLE_FROM)
  };
}

function renderPastMatrixLegend() {
  const legendEl = document.getElementById('pastMatrixLegend');
  if (!legendEl) return;
  legendEl.innerHTML = STUDY_COUNT_BUCKETS.map(b => {
    return '<span class="pastMatrixLegendDot"><span class="pastMatrixLegendSwatch" style="background:' + STUDY_COUNT_COLORS[b] + ';"></span>' + STUDY_COUNT_LABELS[b] + '</span>';
  }).join('');
}

function renderPastMatrixTable() {
  const wrap = document.getElementById('pastMatrixTableWrap');
  if (!wrap) return;
  const examType = pastMatrixCurrentType;
  const subjects = pastMatrixSubjectsFor(examType);
  const roundMap = computePastMatrixRounds(examType);

  let html = '<table class="pastMatrixTable"><thead><tr><th></th>'
    + subjects.map(s => {
      if (!pastMatrixColumnApplicable(examType, s.name)) return '<th class="pastMatrixSubjHead pastMatrixBlankCol"></th>';
      return '<th class="pastMatrixSubjHead" title="' + escapeHtml(s.name) + '">' + escapeHtml(s.abbr) + '</th>';
    }).join('')
    + '</tr></thead><tbody>';

  const split = pastMatrixSplitYears();
  split.visible.forEach(y => {
    html += '<tr><th class="pastMatrixYearHead" title="' + pastMatrixYearFullLabel(y) + '">' + pastMatrixYearShortLabel(y) + '</th>';
    subjects.forEach(s => {
      if (!pastMatrixColumnApplicable(examType, s.name)) {
        html += '<td class="pastMatrixBlankCol"></td>';
        return;
      }
      const applicable = pastMatrixApplicable(examType, s.name, y);
      if (!applicable) {
        html += '<td class="pastMatrixCell pastMatrixNa"><span class="pastMatrixNaMark">・</span></td>';
        return;
      }
      const round = roundMap[s.name + '|' + pastMatrixYearKey(y)] || 0;
      const bucket = pastMatrixBucket(round);
      const title = s.name + ' ' + pastMatrixYearFullLabel(y) + '：' + STUDY_COUNT_LABELS[bucket];
      html += '<td class="pastMatrixCell" data-subj="' + escapeHtml(s.name) + '" data-year-era="' + y.era + '" data-year-num="' + y.num + '" title="' + escapeHtml(title) + '">' + pastMatrixCellHtml(round) + '</td>';
    });
    html += '</tr>';
  });
  if (split.hidden.length > 0) {
    // hiddenは古い年側のまとまり。降順表示のため先頭が最大年になるので、
    // ラベルは小さい年〜大きい年の順に組み立てる
    const nums = split.hidden.map(y => y.num);
    const era = split.hidden[0].era;
    const first = pastMatrixYearShortLabel({ era: era, num: Math.min(...nums) });
    const last = pastMatrixYearShortLabel({ era: era, num: Math.max(...nums) });
    html += '<tr class="pastMatrixExpandRow"><td colspan="' + (subjects.length + 1) + '">'
      + '<button type="button" id="pastMatrixExpandBtn" class="pastLogExpandChip">＋ ' + first + '〜' + last + 'を表示 ▼</button>'
      + '</td></tr>';
  } else if (pastMatrixCurrentEra === 'H' && pastMatrixExpanded) {
    html += '<tr class="pastMatrixExpandRow"><td colspan="' + (subjects.length + 1) + '">'
      + '<button type="button" id="pastMatrixExpandBtn" class="pastLogExpandChip">▲ 折りたたむ</button>'
      + '</td></tr>';
  }
  html += '</tbody></table>';
  wrap.innerHTML = html;
}

function initPastExamMatrixFeature() {
  const tabsEl = document.getElementById('pastMatrixTabs');
  const wrap = document.getElementById('pastMatrixTableWrap');
  if (!tabsEl || !wrap) return;

  PAST_EXAM_TYPE_OPTIONS.forEach(t => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pastMatrixTabBtn' + (t === pastMatrixCurrentType ? ' active' : '');
    btn.textContent = t;
    btn.addEventListener('click', () => {
      pastMatrixCurrentType = t;
      pastMatrixExpanded = false;
      tabsEl.querySelectorAll('.pastMatrixTabBtn:not(.pastMatrixEraBtn)').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderPastMatrixTable();
    });
    tabsEl.appendChild(btn);
  });

  const sep = document.createElement('span');
  sep.className = 'pastMatrixTabSep';
  tabsEl.appendChild(sep);

  PAST_MATRIX_ERAS.forEach(e => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pastMatrixTabBtn pastMatrixEraBtn' + (e.id === pastMatrixCurrentEra ? ' active' : '');
    btn.textContent = e.label;
    btn.addEventListener('click', () => {
      pastMatrixCurrentEra = e.id;
      pastMatrixExpanded = false;
      try { localStorage.setItem(PAST_MATRIX_ERA_KEY, e.id); } catch (_) {}
      tabsEl.querySelectorAll('.pastMatrixEraBtn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderPastMatrixTable();
    });
    tabsEl.appendChild(btn);
  });

  // マスをクリックすると、その回の演習を今日の日付で詳細ログに1件追加し
  // （既に記録済みなら回数を1つ増やして追加）、一覧の色も詳細ログの表も
  // その場で更新する。回数を減らしたい／間違えて増やした場合は、下の詳細
  // ログ側から該当の行を削除すれば、このマスにも自動的に反映される
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('#pastMatrixExpandBtn')) {
      pastMatrixExpanded = !pastMatrixExpanded;
      renderPastMatrixTable();
      return;
    }
    const td = e.target.closest('td.pastMatrixCell:not(.pastMatrixNa)');
    if (!td) return;
    const examType = pastMatrixCurrentType;
    const subject = td.dataset.subj;
    const year = { era: td.dataset.yearEra, num: Number(td.dataset.yearNum) };
    const currentRound = computePastMatrixRounds(examType)[subject + '|' + pastMatrixYearKey(year)] || 0;
    const nextRound = currentRound + 1;
    const today = new Date();
    const dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    upsertPastExamLogEntry(examType, subject, pastMatrixYearFullLabel(year), nextRound, dateStr);
    renderPastMatrixTable();
    renderPastLogs();
  });

  renderPastMatrixLegend();
  renderPastMatrixTable();
}
initPastExamMatrixFeature();
/* ▲▲▲ 新規追加：過去問ログ「年度×科目 一覧」マトリクス ここまで ▲▲▲ */

/* ▼▼▼ 新規追加：頻出論点ランキング
   専用のデータは一切持たず、entries[].year（既存の「出題年」欄。既に
   出題頻度フィルタ／頻出順並び替えで使われているgetYearFrequency()と
   同じ形式）を集計するだけ。論証一覧側の出題年入力（主にWord読込で
   取り込まれる）を変えるだけで、ここのランキングも自動的に更新される */
let examTrendSubjectFilter = 'all';
function computeExamTrendRanking(subjectFilter) {
  const list = entries.filter(e => getYearFrequency(e) >= 2);
  const filtered = subjectFilter === 'all' ? list : list.filter(e => (e.subject || 'その他') === subjectFilter);
  return filtered.slice().sort((a, b) => getYearFrequency(b) - getYearFrequency(a));
}
function renderExamTrendSubjectFilter() {
  const sel = document.getElementById('examTrendSubjectFilter');
  if (!sel) return;
  const subjects = getUniqueSubjects();
  const prev = examTrendSubjectFilter;
  sel.innerHTML = '<option value="all">科目：すべて</option>'
    + subjects.map(s => '<option value="' + escapeHtml(s) + '">' + escapeHtml(s) + '</option>').join('');
  sel.value = subjects.includes(prev) || prev === 'all' ? prev : 'all';
  examTrendSubjectFilter = sel.value;
}
function renderExamTrendRanking() {
  renderExamTrendSubjectFilter();
  const body = document.getElementById('examTrendBody');
  if (!body) return;
  const ranked = computeExamTrendRanking(examTrendSubjectFilter).slice(0, 15);
  if (ranked.length === 0) {
    body.innerHTML = '<div class="examTrendEmpty">出題年が2回以上登録されている論点はまだありません。論証の「出題年」欄に複数の年度が入っていると、ここに頻出順で表示されます。</div>';
    return;
  }
  body.innerHTML = ranked.map((e, i) => {
    const freq = getYearFrequency(e);
    return '<div class="examTrendRow">'
      + '<span class="examTrendRank">' + (i + 1) + '</span>'
      + '<span class="examTrendSubject">' + escapeHtml(e.subject || 'その他') + '</span>'
      + '<span class="examTrendEntryTitle">' + escapeHtml(e.title) + '</span>'
      + '<span class="examTrendYears">' + buildYearHtml(e.year) + '</span>'
      + '<span class="examTrendCount">' + freq + '回</span>'
      + '</div>';
  }).join('');
}
(() => {
  const sel = document.getElementById('examTrendSubjectFilter');
  if (sel) sel.addEventListener('change', () => {
    examTrendSubjectFilter = sel.value;
    renderExamTrendRanking();
  });
})();
/* ▲▲▲ 新規追加：頻出論点ランキング ここまで ▲▲▲ */

function initPastExamLogFeature() {
  const saveBtn = document.getElementById('pastSaveBtn');
  const table = document.getElementById('pastLogTable');
  if (!saveBtn || !table) return;

  // 記録フォームは普段は折りたたんでおき、「＋ 記録する」を押したときだけ
  // 開くようにして、詳細ログ一覧が主役の画面をコンパクトに保つ
  const addToggleBtn = document.getElementById('pastAddToggleBtn');
  const form = document.getElementById('pastLogForm');
  if (addToggleBtn && form) {
    addToggleBtn.addEventListener('click', () => {
      const open = form.classList.toggle('pastLogFormOpen');
      addToggleBtn.textContent = open ? '－ 閉じる' : '＋ 記録する';
    });
  }

  saveBtn.addEventListener('click', () => {
    const examType = document.getElementById('pastExamTypeSelect').value;
    const subject = document.getElementById('pastSubjectInput').value.trim();
    const year = document.getElementById('pastYearInput').value.trim();
    const round = Number(document.getElementById('pastRoundSelect').value || '1');
    const date = document.getElementById('pastDateInput').value;

    if (!subject || !year || !date) {
      alert('科目・年度・解答日を入力してください。');
      return;
    }

    // 種別＋科目＋年度＋回数＋解答日が全て一致する場合のみ上書きする
    // （同じ回数のまま予習・復習で日付を変えて記録した場合は別のログにする）
    upsertPastExamLogEntry(examType, subject, year, round, date);
    renderPastLogs();
    renderPastMatrixTable();
  });

  table.addEventListener('click', (e) => {
    const delBtn = e.target.closest('.pastDelBtn');
    if (delBtn) {
      const logs = loadPastExamLogs();
      const idx = logs.findIndex(l => l.key === delBtn.dataset.key);
      if (idx === -1) return;
      logs.splice(idx, 1);
      savePastExamLogs(logs);
      renderPastLogs();
      renderPastMatrixTable();
      return;
    }
    if (e.target.closest('#pastLogExpandBtn')) {
      pastLogExpanded = !pastLogExpanded;
      renderPastLogs();
    }
  });

  table.addEventListener('blur', (e) => {
    const cell = e.target.closest('.pastMemoCell');
    if (!cell) return;
    const logs = loadPastExamLogs();
    const idx = logs.findIndex(l => l.key === cell.dataset.key);
    if (idx === -1) return;
    logs[idx].memo = cell.textContent.trim();
    savePastExamLogs(logs);
  }, true);

  renderPastLogs();
}
initPastExamLogFeature();
/* ▲▲▲ 新規追加：過去問ログ機能 ここまで ▲▲▲ */

