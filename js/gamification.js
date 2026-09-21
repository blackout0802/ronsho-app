/* ▼▼▼ 新規追加：学習モチベーション向上機能（既存の変数・関数名と一切重複しない名前空間で実装） ▼▼▼
   レベル/XP・今日の目標リング・実績バッジ・学習ヒートマップ・今日の伸びしろ・週次月次サマリー。
   既存の entries / studyLog には一切書き込まず、既存データから導出するだけ。
   保存先は専用のキー 'ronshoDailyGoalV1'・'ronshoDailyStatsV1' のみを使用する。 */

const MOTIVATION_QUOTES = [
  { text: '継続は力なり。', by: '住岡夜晃' },
  { text: '為すことによって学ぶ。', by: 'アリストテレス' },
  { text: '千里の道も一歩から。', by: '老子' },
  { text: '塵も積もれば山となる。', by: 'ことわざ' },
  { text: '習慣は第二の天性なり。', by: 'キケロ' },
  { text: '今日為すべきことを明日に延ばすな。', by: 'ベンジャミン・フランクリン' },
  { text: '知は力なり。', by: 'フランシス・ベーコン' },
  { text: '法律を知らないことは、これを守る義務を免れさせない。', by: '法諺（法の不知は許さず）' },
  { text: '正義が行われないなら、その社会に安寧はない。', by: 'フレデリック・ダグラス' },
  { text: '思考は運命を決める。まず良い習慣を身につけよ。', by: 'ウィリアム・ジェームズ' },
  { text: '準備を怠る者は、失敗を準備しているのだ。', by: 'ベンジャミン・フランクリン' },
  { text: '一日一日を、人生最後の日だと思って生きよ。', by: 'スティーブ・ジョブズ' },
  { text: '天才とは1%のひらめきと99%の努力である。', by: 'トーマス・エジソン' },
  { text: '為せば成る、為さねば成らぬ何事も。', by: '上杉鷹山' },
  { text: '失敗は成功のもと。', by: 'ことわざ' },
  { text: '学びて時にこれを習う、亦説ばしからずや。', by: '孔子' },
  { text: '諦めたらそこで試合終了ですよ。', by: '安西先生（SLAM DUNK）' },
  { text: '正義の女神は、目隠しをしていても天秤は正しく量る。', by: '法諺' },
  { text: '雨垂れ石を穿つ。', by: 'ことわざ' },
  { text: '努力は必ず報われる。もし報われない努力があるのならそれはまだ努力とは呼べない。', by: 'イチロー' }
];
let currentQuoteIndex = null;
function renderQuoteCard(forceNew) {
  const wrap = document.getElementById('quoteCard');
  if (!wrap) return;
  if (entries.length === 0) {
    wrap.innerHTML = '';
    return;
  }
  if (currentQuoteIndex === null || forceNew) {
    let next = Math.floor(Math.random() * MOTIVATION_QUOTES.length);
    if (MOTIVATION_QUOTES.length > 1 && next === currentQuoteIndex) {
      next = (next + 1) % MOTIVATION_QUOTES.length;
    }
    currentQuoteIndex = next;
  }
  const q = MOTIVATION_QUOTES[currentQuoteIndex];
  wrap.innerHTML = '<span class="quoteText">💬 ' + escapeHtml(q.text) + '</span>'
    + '<span class="quoteBy">－ ' + escapeHtml(q.by) + '</span>'
    + '<span class="quoteRefreshBtn" id="quoteRefreshBtn" title="クリックでページを最新の状態に読み込み直します（名言も変わります）">🔄</span>';
}
document.getElementById('quoteCard') && document.getElementById('quoteCard').addEventListener('click', (e) => {
  if (!e.target.closest('#quoteRefreshBtn')) return;
  if (confirm('ページを読み込み直します。保存していない編集内容は失われますが、よろしいですか？')) location.reload();
});

const DAILY_GOAL_KEY = 'ronshoDailyGoalV1';
const DEFAULT_DAILY_GOAL = 10;
function loadDailyGoal() {
  const raw = localStorage.getItem(DAILY_GOAL_KEY);
  const n = Number(raw);
  return (raw && n > 0) ? n : DEFAULT_DAILY_GOAL;
}
function saveDailyGoal(n) {
  localStorage.setItem(DAILY_GOAL_KEY, String(n));
  if (typeof window !== 'undefined' && typeof window.ronshoSyncNotifyChange === 'function') window.ronshoSyncNotifyChange();
}

function computeTotalStudyCount() {
  let total = 0;
  Object.values(studyLog).forEach(log => { total += (log.history || []).length; });
  return total;
}
function computeMemorizedCount() {
  return entries.filter(e => studyLog[e.title] && studyLog[e.title].memorized).length;
}
// 経験値(XP)は、暗記度・暗記済み件数から毎回計算し直す値ではなく、
// 「問題を解くたびに加算されるだけ」の単純増加のカウンタとして持つ。
// 以前は合計学習回数×10＋暗記済み件数×50から都度算出していたが、
// 暗記済みフラグは学習し直して「ダメ」を選ぶと外れる（＝合計が減る）ため、
// 正直に「ダメ」を選んで復習した回でもXP・レベルが下がって見えてしまい、
// 「学習したのに進んでいないように見える」原因になっていた。
// 暗記度に応じてXPの量に差はつけつつ、どの暗記度で答えてもXPは必ず増える
// ようにする（暗記度別の重みは 完璧4:できた3:あやしい2:ダメ1 の比率）
const XP_KEY = 'ronshoXpV1';
const XP_BY_CONFIDENCE = { perfect: 40, good: 30, unsure: 20, bad: 10 };
const XP_MEMORIZED_BONUS = 50;
// 前回より良い暗記度を選んだときのランクアップボーナス（1段階につき+20）。
// 通常XP（XP_BY_CONFIDENCE）に上乗せする。例：bad→unsureは通常20＋ bonus20、
// bad→goodは通常30＋bonus40。初回（前回なし）・維持・低下時は0
const CONFIDENCE_RANK = { bad: 0, unsure: 1, good: 2, perfect: 3 };
const XP_IMPROVEMENT_BONUS_PER_RANK = 20;
function calcImprovementBonusXp(oldLevel, newLevel) {
  const oldRank = CONFIDENCE_RANK[oldLevel];
  const newRank = CONFIDENCE_RANK[newLevel];
  if (oldRank === undefined || newRank === undefined) return 0;
  const steps = newRank - oldRank;
  return steps > 0 ? steps * XP_IMPROVEMENT_BONUS_PER_RANK : 0;
}
function awardImprovementBonusXp(oldLevel, newLevel) {
  const bonus = calcImprovementBonusXp(oldLevel, newLevel);
  if (bonus > 0) saveXp(loadXp() + bonus);
  return bonus;
}
function loadXp() {
  const n = Number(localStorage.getItem(XP_KEY));
  return (Number.isFinite(n) && n >= 0) ? n : 0;
}
function saveXp(n) {
  localStorage.setItem(XP_KEY, String(Math.max(0, Math.round(n))));
  if (typeof window !== 'undefined' && typeof window.ronshoSyncNotifyChange === 'function') window.ronshoSyncNotifyChange();
}
// 問題を解いて暗記度を選ぶたびに呼ぶ。暗記度がどれであってもXPは必ず増える
function awardXp(level) {
  const amount = XP_BY_CONFIDENCE[level];
  if (!amount) return;
  saveXp(loadXp() + amount);
}
// 新たに「暗記済み」になった瞬間（初めて／再び）にだけ呼ぶボーナス
function awardMemorizedBonusXp() {
  saveXp(loadXp() + XP_MEMORIZED_BONUS);
}
// 過去問を1回解く（過去問ログに新しい記録を1件追加する）たびに呼ぶ、固定量のXP
const XP_PAST_EXAM = 100;
function awardPastExamXp() {
  saveXp(loadXp() + XP_PAST_EXAM);
}
function computeXp() {
  return loadXp();
}
// v21.83でXPを単純増加カウンタ方式に切り替えた際、旧方式（合計学習回数×10＋
// 暗記済み件数×50を毎回算出）で積み上がっていたXP・レベルが、新方式では
// 0から始まってしまい、これまでの進捗が消えたように見えてしまっていた。
// 初回起動時に一度だけ、旧方式の計算結果をXPカウンタの初期値として
// 引き継ぐ（studyLog・entriesは同期後の最新状態のため、これまでの学習は
// もちろん、この移行より前に今日すでに学習した分も含めて反映される）。
// 一度移行した後は、二重に加算されないよう二度と実行しない
const XP_MIGRATED_KEY = 'ronshoXpMigratedFromLegacyV1';
function migrateLegacyXpIfNeeded() {
  if (localStorage.getItem(XP_MIGRATED_KEY)) return;
  localStorage.setItem(XP_MIGRATED_KEY, '1');
  const legacyXp = computeTotalStudyCount() * 10 + computeMemorizedCount() * 50;
  if (legacyXp > loadXp()) saveXp(legacyXp);
}
// 過去問1回につき100XPを付与する仕組みを追加した際、それより前に記録されて
// いた過去問ログ（過去の分）にはXPが付与されていなかったため、初回起動時に
// 一度だけ「その時点の過去問ログ件数×100」をまとめて遡及加算する。
// XP_MIGRATED_KEYと同じく端末ごとのローカルな移行済みフラグとして持ち、
// 同期対象には含めない（同期される'xp'自体は既に同期対象のため、複数端末
// それぞれで一度ずつ実行されても、実際に加算されるのは初回同期後の状態次第で
// 変わり得るが、二重加算を防ぐことを優先しフラグは端末ごとに独立させている）
const XP_PAST_EXAM_MIGRATED_KEY = 'ronshoXpPastExamMigratedV1';
function migratePastExamXpIfNeeded() {
  if (localStorage.getItem(XP_PAST_EXAM_MIGRATED_KEY)) return;
  localStorage.setItem(XP_PAST_EXAM_MIGRATED_KEY, '1');
  const logs = (typeof loadPastExamLogs === 'function') ? loadPastExamLogs() : [];
  if (logs.length > 0) saveXp(loadXp() + logs.length * XP_PAST_EXAM);
}
function getLevelInfo(xp) {
  let level = 1;
  let threshold = 0;
  let need = 100;
  while (xp >= threshold + need) {
    threshold += need;
    level++;
    need = level * 100;
  }
  return { level: level, xpIntoLevel: xp - threshold, xpForThisLevel: need, xp: xp };
}
function getTodayStudiedCount() {
  const today = todayStr();
  // カレンダーの学習件数（getAllStudyDates）と同じ数え方にする。
  // entriesだけでフィルタすると、重複整理などで論証本体を削除した後に
  // 学習記録だけが残っているケースがカウントされず、カレンダーとずれてしまう。
  // また、重複統合(dupMergeHistoryArrays)により同じ日付がhistoryに複数回
  // 含まれることがあるため、件数ではなく「その日付の出現回数の合計」を数える
  // （1件=distinctなタイトルではなく、getAllStudyDatesと同じ「延べ件数」）
  let count = 0;
  Object.values(studyLog).forEach(log => {
    if (!log || !log.history) return;
    count += log.history.filter(d => d === today).length;
  });
  return count;
}

const DAILY_STATS_KEY = 'ronshoDailyStatsV1';
function loadDailyStats() {
  try {
    return JSON.parse(localStorage.getItem(DAILY_STATS_KEY) || '{}');
  } catch (e) {
    return {};
  }
}
function saveDailyStats(obj) {
  localStorage.setItem(DAILY_STATS_KEY, JSON.stringify(obj));
}
function recordTodayMemorizedSnapshot() {
  const stats = loadDailyStats();
  stats[todayStr()] = computeMemorizedCount();
  saveDailyStats(stats);
  return stats;
}
function getGrowthToday() {
  const stats = recordTodayMemorizedSnapshot();
  const today = todayStr();
  const priorDates = Object.keys(stats).filter(d => d < today).sort();
  if (priorDates.length === 0) return null;
  const prevDate = priorDates[priorDates.length - 1];
  const prevCount = stats[prevDate];
  const todayCount = stats[today];
  const total = entries.length;
  const prevPct = total > 0 ? Math.round((prevCount / total) * 100) : 0;
  const todayPct = total > 0 ? Math.round((todayCount / total) * 100) : 0;
  return { prevDate: prevDate, countDiff: todayCount - prevCount, pctDiff: todayPct - prevPct, todayPct: todayPct };
}

function renderGamificationPanel() {
  const wrap = document.getElementById('gamificationRow');
  if (!wrap) return;
  if (entries.length === 0) {
    wrap.innerHTML = '';
    return;
  }
  const info = getLevelInfo(computeXp());
  const levelPct = info.xpForThisLevel > 0 ? Math.round((info.xpIntoLevel / info.xpForThisLevel) * 100) : 0;
  const todayCount = getTodayStudiedCount();
  const goal = loadDailyGoal();
  const goalPct = goal > 0 ? Math.min(100, Math.round((todayCount / goal) * 100)) : 0;
  const growth = getGrowthToday();
  let growthHtml;
  if (!growth) {
    growthHtml = '<div class="gamiCardTitle">📈 今日の伸びしろ</div><div class="gamiCardSub">記録は明日から表示されます</div>';
  } else if (growth.countDiff === 0) {
    growthHtml = '<div class="gamiCardTitle">📈 今日の伸びしろ</div><div class="gamiCardSub">暗記率はまだ変化なし（現在' + growth.todayPct + '%）</div>';
  } else {
    const sign = growth.countDiff > 0 ? '+' : '';
    growthHtml = '<div class="gamiCardTitle">📈 今日の伸びしろ</div>'
      + '<div class="gamiGrowthValue' + (growth.countDiff > 0 ? ' up' : ' down') + '">' + sign + growth.pctDiff + '%</div>'
      + '<div class="gamiCardSub">暗記済み ' + sign + growth.countDiff + '件（現在' + growth.todayPct + '%）</div>';
  }
  wrap.innerHTML = '<div class="gamiCard gamiLevelCard">'
    + '<div class="gamiCardTitle">🏆 LV.' + info.level + '</div>'
    + '<div class="gamiBarOuter"><div class="gamiBarInner" style="width:' + levelPct + '%;"></div></div>'
    + '<div class="gamiCardSub">XP ' + info.xpIntoLevel + ' / ' + info.xpForThisLevel + '</div>'
    + '</div>'
    + '<div class="gamiCard gamiGoalCard" id="dailyGoalRing" title="目標は「⚙️ その他」タブで変更できます">'
    + '<div class="gamiRing" style="background: conic-gradient(#0057e7 ' + goalPct + '%, #e6edf7 ' + goalPct + '% 100%);"><div class="gamiRingInner">' + todayCount + ' / ' + goal + '</div></div>'
    + '<div class="gamiCardTitle">🎯 今日の目標</div>'
    + '</div>'
    + '<div class="gamiCard gamiGrowthCard">' + growthHtml + '</div>';
}

const BADGE_DEFS = [
  { id: 'first_step', icon: '🌱', name: 'はじめの一歩', desc: '論証を1回学習する', check: s => s.totalStudy >= 1 },
  { id: 'study_10', icon: '📘', name: '10問クリア', desc: '学習回数の合計が10回に到達', check: s => s.totalStudy >= 10 },
  { id: 'study_100', icon: '📗', name: '100問クリア', desc: '学習回数の合計が100回に到達', check: s => s.totalStudy >= 100 },
  { id: 'study_500', icon: '📕', name: '500問クリア', desc: '学習回数の合計が500回に到達', check: s => s.totalStudy >= 500 },
  { id: 'memorized_10', icon: '⭐', name: '暗記10件', desc: '暗記済みが10件に到達', check: s => s.memorized >= 10 },
  { id: 'memorized_50', icon: '🌟', name: '暗記50件', desc: '暗記済みが50件に到達', check: s => s.memorized >= 50 },
  { id: 'memorized_100', icon: '🏅', name: '暗記100件', desc: '暗記済みが100件に到達', check: s => s.memorized >= 100 },
  { id: 'subject_complete', icon: '🎯', name: '科目コンプリート', desc: 'いずれかの科目で暗記率100%を達成', check: s => s.hasCompleteSubject },
  { id: 'all_subjects_touched', icon: '🔥', name: '全科目に着手', desc: 'すべての科目で1件以上学習', check: s => s.allSubjectsTouched },
  { id: 'tag_user', icon: '🏷️', name: 'タグ活用', desc: 'タグを5種類以上作成', check: s => s.tagCount >= 5 }
];
function computeBadgeStats() {
  const totalStudy = computeTotalStudyCount();
  const memorized = computeMemorizedCount();
  const subjectStats = {};
  entries.forEach(e => {
    const s = e.subject || 'その他';
    if (!subjectStats[s]) subjectStats[s] = { total: 0, memorized: 0, studied: 0 };
    subjectStats[s].total++;
    if (studyLog[e.title] && studyLog[e.title].memorized) subjectStats[s].memorized++;
    if (studyLog[e.title] && (studyLog[e.title].history || []).length > 0) subjectStats[s].studied++;
  });
  const subjectList = Object.values(subjectStats);
  const hasCompleteSubject = subjectList.some(s => s.total > 0 && s.memorized === s.total);
  const allSubjectsTouched = subjectList.length > 0 && subjectList.every(s => s.studied > 0);
  const tagCount = (typeof getUniqueTags === 'function') ? getUniqueTags().length : 0;
  return { totalStudy: totalStudy, memorized: memorized, hasCompleteSubject: hasCompleteSubject, allSubjectsTouched: allSubjectsTouched, tagCount: tagCount };
}
let badgesListVisible = false;
function renderBadgesSection() {
  const wrap = document.getElementById('badgesSection');
  if (!wrap) return;
  if (entries.length === 0) {
    wrap.innerHTML = '';
    return;
  }
  const stats = computeBadgeStats();
  const earnedIds = new Set(BADGE_DEFS.filter(b => b.check(stats)).map(b => b.id));
  let html = '<div class="badgesSectionTitle">🏅 実績バッジ</div>'
    + '<span class="speechDictToggle" id="badgesToggleBtn">' + (badgesListVisible ? '▼ 一覧を隠す' : '▶ 一覧を表示する') + '（' + earnedIds.size + ' / ' + BADGE_DEFS.length + '件獲得）</span>';
  html += '<div class="badgesGrid" id="badgesGridWrap" style="display:' + (badgesListVisible ? '' : 'none') + ';">';
  BADGE_DEFS.forEach(b => {
    const earned = earnedIds.has(b.id);
    html += '<div class="badgeItem' + (earned ? ' earned' : '') + '" title="' + escapeHtml(b.desc) + '">'
      + '<div class="badgeIcon">' + b.icon + '</div>'
      + '<div class="badgeName">' + escapeHtml(b.name) + '</div>'
      + '</div>';
  });
  html += '</div>';
  wrap.innerHTML = html;
}
document.getElementById('badgesSection') && document.getElementById('badgesSection').addEventListener('click', (e) => {
  const btn = e.target.closest('#badgesToggleBtn');
  if (!btn) return;
  badgesListVisible = !badgesListVisible;
  renderBadgesSection();
});

function sumStudyCountsInRange(dailyCounts, startOffsetDays, endOffsetDaysExclusive) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let sum = 0;
  for (let i = startOffsetDays; i < endOffsetDaysExclusive; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    sum += dailyCounts[formatLocalDate(d)] || 0;
  }
  return sum;
}
function computeSummaryStats() {
  const counts = (typeof getDailyStudyCounts === 'function') ? getDailyStudyCounts() : {};
  return {
    thisWeek: sumStudyCountsInRange(counts, 0, 7),
    lastWeek: sumStudyCountsInRange(counts, 7, 14),
    thisMonth: sumStudyCountsInRange(counts, 0, 30),
    lastMonth: sumStudyCountsInRange(counts, 30, 60)
  };
}
function buildSummaryBlockHtml(label, current, prev) {
  const diff = current - prev;
  const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '→';
  const diffClass = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  const maxVal = Math.max(current, prev, 1);
  return '<div class="summaryBlock">'
    + '<div class="summaryLabel">' + escapeHtml(label) + '</div>'
    + '<div class="summaryValue">' + current + '件 <span class="summaryDiff ' + diffClass + '">' + arrow + Math.abs(diff) + '（前期間比）</span></div>'
    + '<div class="summaryBarRow"><span class="summaryBarTag">前期間</span><div class="summaryBarOuter"><div class="summaryBarInner" style="width:' + Math.round(prev / maxVal * 100) + '%;"></div></div></div>'
    + '<div class="summaryBarRow"><span class="summaryBarTag">今期間</span><div class="summaryBarOuter"><div class="summaryBarInner current" style="width:' + Math.round(current / maxVal * 100) + '%;"></div></div></div>'
    + '</div>';
}
function renderSummarySection() {
  const wrap = document.getElementById('summarySection');
  if (!wrap) return;
  if (entries.length === 0) {
    wrap.innerHTML = '';
    return;
  }
  const s = computeSummaryStats();
  wrap.innerHTML = '<div class="summarySectionTitle">📊 週次・月次サマリー（過去の自分と比較）</div>'
    + '<div class="summaryRow">'
    + buildSummaryBlockHtml('今週の学習（先週比）', s.thisWeek, s.lastWeek)
    + buildSummaryBlockHtml('今月の学習（先月比）', s.thisMonth, s.lastMonth)
    + '</div>';
}
/* ▲▲▲ 新規追加：学習モチベーション向上機能 ここまで ▲▲▲ */
