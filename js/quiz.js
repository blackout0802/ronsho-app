// --- 問題演習モード ---
// 「問題演習」タブを開いたときに最初からチェックされている項目を、設定画面
// (js/settings.js)から変更できるようにする（drive-sync.jsで同期対象）
const QUIZ_DEFAULT_FILTERS_KEY = 'ronshoQuizDefaultFiltersV1';
const QUIZ_DEFAULT_FILTER_FIELDS = ['random', 'overdueOnly', 'excludeToday', 'skippedOnly'];
// 重要度は他のチェックボックス項目と違い真偽値ではなく('all'/'2'/'1'/'0')、
// かつ論証一覧・問題演習の両方で共有しているselectedImportance（js/core.js）に
// 反映するため、他のQUIZ_DEFAULT_FILTER_FIELDSとは別に扱う
const QUIZ_IMPORTANCE_DEFAULT_OPTIONS = ['all', '2', '1', '0'];
function loadQuizDefaultFilters() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(QUIZ_DEFAULT_FILTERS_KEY)) || {}; } catch (e) { saved = {}; }
  const out = {};
  QUIZ_DEFAULT_FILTER_FIELDS.forEach(f => { out[f] = !!saved[f]; });
  out.importance = QUIZ_IMPORTANCE_DEFAULT_OPTIONS.includes(saved.importance) ? saved.importance : 'all';
  return out;
}
function saveQuizDefaultFilters(defaults) {
  localStorage.setItem(QUIZ_DEFAULT_FILTERS_KEY, JSON.stringify(defaults));
}
(() => {
  const defaults = loadQuizDefaultFilters();
  if (quizRandomChk) quizRandomChk.checked = defaults.random;
  if (quizOverdueOnlyChk) quizOverdueOnlyChk.checked = defaults.overdueOnly;
  if (quizExcludeTodayChk) quizExcludeTodayChk.checked = defaults.excludeToday;
  if (quizSkippedOnlyChk) quizSkippedOnlyChk.checked = defaults.skippedOnly;
  selectedImportance = defaults.importance === 'all' ? 'all' : Number(defaults.importance);
})();
function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function getStudyCountFor(e) {
  const log = studyLog[e.title];
  return (log && log.history) ? log.history.length : 0;
}
function isOverdueEntry(e) {
  if (studyLog[e.title] && studyLog[e.title].memorized) return false;
  const info = getNextReviewInfo(e.title);
  if (!info) return false;
  return info.nextDateStr <= todayStr();
}
function isStudiedToday(e) {
  const log = studyLog[e.title];
  const history = log && log.history;
  if (!history || history.length === 0) return false;
  return history[history.length - 1] === todayStr();
}
function isSkippedEntry(e) {
  return !!(studyLog[e.title] && studyLog[e.title].skipped);
}
// 穴埋め問題モード：本文中の太字強調（<b>...</b>、buildBodyHtmlで色付き太字にした
// 部分）を空欄にし、タップで個別に答え合わせできるようにする。太字強調が
// 無い論証はそもそも穴埋め対象が無いので、通常表示にフォールバックする。
const quizModeNormalRadio = document.getElementById('quizModeNormalRadio');
const quizModeBlankRadio = document.getElementById('quizModeBlankRadio');
function isQuizBlankMode() {
  return !!(quizModeBlankRadio && quizModeBlankRadio.checked);
}
if (quizModeNormalRadio) quizModeNormalRadio.addEventListener('change', () => { if (quizStarted) renderQuizPage(); });
if (quizModeBlankRadio) quizModeBlankRadio.addEventListener('change', () => { if (quizStarted) renderQuizPage(); });
function buildQuizBlankHtml(bodyHtml) {
  let count = 0;
  const html = bodyHtml.replace(/<b>([\s\S]*?)<\/b>/g, (m, inner) => {
    count++;
    return '<span class="quizBlank" data-idx="' + count + '">' + inner + '</span>';
  });
  return { html, count };
}
const QUIZ_CONFIDENCE_LABELS = { perfect: '◎ 完璧', good: '○ できた', unsure: '△ あやしい', bad: '✕ ダメ' };
function daysAgoLabel(dateStr) {
  const diff = Math.round((new Date(todayStr() + 'T00:00:00') - new Date(dateStr + 'T00:00:00')) / 86400000);
  if (diff === 0) return '本日';
  if (diff === 1) return '昨日';
  if (diff > 0) return diff + '日前';
  return dateStr;
}
// ナビ行に収めた際に見切れないよう、今年学習した分は年を省略して短くする
function formatLastStudyDate(dateStr) {
  const currentYearPrefix = new Date().getFullYear() + '-';
  return dateStr.startsWith(currentYearPrefix) ? dateStr.slice(currentYearPrefix.length) : dateStr;
}
function buildQuizLastStudyHtml(e) {
  const log = studyLog[e.title];
  const history = log && log.history;
  if (!history || history.length === 0) {
    return '<div class="quizLastStudy quizLastStudyNew">🆕 まだ学習していません</div>';
  }
  const lastDate = history[history.length - 1];
  const confLabel = QUIZ_CONFIDENCE_LABELS[log.confidence] || '';
  // 何月何日の何時何分に解答したかまで分かるよう、日付だけでなく時刻も表示する
  const answeredAtParts = log.lastAnsweredAt ? formatImportedAt(log.lastAnsweredAt).split(' ') : null;
  const timeLabel = (answeredAtParts && answeredAtParts[1]) ? (' ' + answeredAtParts[1]) : '';
  return '<div class="quizLastStudy">🕒 前回学習：' + escapeHtml(formatLastStudyDate(lastDate)) + escapeHtml(timeLabel) + '（' + daysAgoLabel(lastDate) + '）'
    + (confLabel ? ' ／ 前回の暗記度：<strong>' + confLabel + '</strong>' : '')
    + ' ／ 通算' + history.length + '回</div>';
}
function buildQuizPool() {
  // 問題演習ページ自体に科目・分野・重要度を選ぶタブ(subjectTabsQuiz等)が
  // あり、これらは選択を反映するためfilterEntries()を通す必要がある
  // （v21.84で全論証を母集団にする変更を入れたが、この選択が一切反映
  // されなくなる regression だったため、filterEntries()に戻した）
  let pool = filterEntries(entries, '');
  if (quizExcludeTodayChk.checked) {
    pool = pool.filter(e => !isStudiedToday(e));
  }
  if (quizSkippedOnlyChk.checked) {
    pool = pool.filter(isSkippedEntry);
  } else {
    pool = pool.filter(e => !isSkippedEntry(e));
  }
  quizSequentialMode = !quizRandomChk.checked;
  quizOverdueMode = quizOverdueOnlyChk.checked;
  if (quizOverdueMode) {
    pool = pool.filter(isOverdueEntry);
    quizMinCount = 0;
    return quizSequentialMode ? pool : shuffleArray(pool);
  }
  if (pool.length === 0) {
    quizMinCount = 0;
    return [];
  }
  if (quizSequentialMode) {
    quizMinCount = 0;
    return pool;
  }
  const minCount = Math.min(...pool.map(getStudyCountFor));
  quizMinCount = minCount;
  pool = pool.filter(e => getStudyCountFor(e) === minCount);
  return shuffleArray(pool);
}
function startQuiz() {
  quizPool = buildQuizPool();
  quizIndex = 0;
  quizRevealed = false;
  quizStarted = true;
  quizComboCount = 0;
  renderQuizPage();
}
function renderQuizPage() {
  if (entries.length === 0) {
    quizPriorityNote.textContent = '';
    quizArea.innerHTML = '<div class="quizEmpty">まずはWordファイルを読み込んでください。</div>';
    return;
  }
  if (!quizStarted) {
    quizPriorityNote.textContent = '';
    quizArea.innerHTML = '<div class="quizEmpty">「スタート／やり直す」を押すと出題が始まります。</div>';
    return;
  }
  const extraNotes = [];
  if (quizExcludeTodayChk.checked) extraNotes.push('本日学習済みは除外');
  if (quizSkippedOnlyChk.checked) extraNotes.push('⏭️スキップのみ');
  const extraNote = extraNotes.length ? '（' + extraNotes.join('・') + '）' : '';
  if (quizPool.length === 0) {
    quizPriorityNote.textContent = '';
    quizArea.innerHTML = quizOverdueMode
      ? '<div class="quizEmpty">🎉 復習期限が来ている論証はありません' + extraNote + '。</div>'
      : (quizSkippedOnlyChk.checked
        ? '<div class="quizEmpty">⏭️ スキップした論証はありません。</div>'
        : '<div class="quizEmpty">出題対象の論証がありません' + extraNote + '。上の出題範囲（科目・分野・苦手／暗記済みなど）の設定を見直してください。</div>');
    return;
  }
  quizPriorityNote.innerHTML = quizOverdueMode
    ? '⏰ 復習推奨日を過ぎている論点 <strong>' + quizPool.length + '件</strong>' + extraNote + ' のみを出題しています。'
    : (quizSequentialMode
      ? ''
      : '📌 学習回数が最も少ない（<strong>' + quizMinCount + '回</strong>）論点 <strong>' + quizPool.length + '件</strong>' + extraNote + ' のみを出題しています。この回数のものを一通り学習すると、次回はより多く学習した論点が対象から外れ、新しい最少回数のグループが出題されます。');
  if (quizIndex >= quizPool.length) {
    quizArea.innerHTML = '<div class="quizCard"><div class="quizFinished">🎉 全' + quizPool.length + '問終了しました！お疲れさまでした。もう一度「スタート／やり直す」を押すと出題を最初からやり直せます。</div></div>';
    return;
  }
  const e = quizPool[quizIndex];
  const idx = entries.findIndex(x => x.title === e.title);
  const isEditingThis = idx !== -1 && editingEntryTitle === e.title;
  const isSkipped = !!(studyLog[e.title] && studyLog[e.title].skipped);
  const quizMemo = (studyLog[e.title] && studyLog[e.title].memo) || '';
  const isBookmarked = !!(studyLog[e.title] && studyLog[e.title].bookmarked);
  if (quizToolsMenuOpenTitle !== e.title) { quizToolsMenuOpen = false; quizToolsMenuOpenTitle = e.title; }
  // 右上「⋮」メニューの🔖・🗒️・⏭️のいずれかが設定済みなら、カードの
  // 背景を変えて一目で分かるようにする
  const hasToolInput = isBookmarked || !!quizMemo || isSkipped;
  let html = '<div class="quizCard' + (hasToolInput ? ' quizCardMarked' : '') + '"'
    + (hasToolInput ? ' title="ブックマーク・メモ・スキップのいずれかが設定されています"' : '') + '>';
  if (quizComboCount >= 2) {
    html += '<div class="quizCombo">🔥 ' + quizComboCount + '連続できた！</div>';
  }
  // 進捗表示とページ送りボタンに加え、左端に科目・分野、右端にツールメニューの
  // 「⋮」を1行にまとめている（◀▶自体がそれぞれ前の問題／次の問題ボタンを兼ねる）
  html += '<div class="quizNavRow">'
    + '<div class="quizNavMeta">' + escapeHtml(e.subject || '') + ' ｜ ' + escapeHtml(e.category || '') + '</div>'
    + '<div class="quizNavCenter">'
    + '<button type="button" class="quizNavBtn" id="quizPrevBtn" title="前の問題"' + (quizIndex === 0 ? ' disabled' : '') + '>◀</button>'
    + '<span class="quizProgress">' + (quizIndex + 1) + ' / ' + quizPool.length + '問</span>'
    + '<button type="button" class="quizNavBtn" id="quizNextBtn" title="次の問題"' + (quizIndex >= quizPool.length - 1 ? ' disabled' : '') + '>▶</button>'
    + '</div>'
    + '<div class="quizNavTools">'
    + '<span class="quizToolsMenuBtn' + (quizToolsMenuOpen ? ' active' : '') + '" id="quizToolsMenuBtn" title="' + (quizToolsMenuOpen ? 'メニューを閉じる' : 'メニューを開く') + '">⋮</span>';
  if (quizToolsMenuOpen) {
    html += '<div class="quizToolsMenuPanel" id="quizToolsMenuPanel">'
      + '<span class="quizBookmarkToggle' + (isBookmarked ? ' active' : '') + '" id="quizBookmarkBtn" title="ブックマーク">🔖</span>'
      + '<span class="quizMemoBtn' + (quizMemo ? ' active' : '') + '" id="quizMemoBtn" title="' + escapeHtml(quizMemo ? ('メモ：' + quizMemo) : 'メモを追加') + '">🗒️</span>'
      + '<span class="quizSkipBtn' + (isSkipped ? ' active' : '') + '" id="quizSkipBtn" title="スキップ（問題演習から除外）">⏭️</span>'
      + '<span class="quizEditBtn' + (isEditingThis ? ' active' : '') + '" id="quizEditBtn" title="内容を編集">✏️</span>'
      + '<span class="quizDeleteBtn" id="quizDeleteBtn" title="この論証を削除">🗑️</span>'
      + '</div>';
  }
  html += '</div>'
    + '</div>';
  html += buildQuizLastStudyHtml(e);
  if (isEditingThis) {
    html += '<input type="text" class="editTitleInput" data-idx="' + idx + '" value="' + escapeHtml(e.title) + '">';
    html += buildBodyEditorHtml(e, idx);
  } else {
  html += '<div class="quizTitle">' + buildImportanceStarsHtml(e.importance) + escapeHtml(e.title) + '</div>';
  if (!quizRevealed) {
    html += '<div class="quizShowBtn" id="quizShowBtn">📖 本文を表示</div>';
  } else {
    const blankMode = isQuizBlankMode();
    const quizBodyHtml = linkifyLawRefs(e.bodyHtml, e.subject);
    const blankResult = blankMode ? buildQuizBlankHtml(quizBodyHtml) : null;
    const noBlankTargets = blankMode && blankResult.count === 0;
    if (blankMode && !noBlankTargets) {
      html += '<div class="quizBody quizBodyBlank">' + blankResult.html + '</div>';
      html += '<div class="quizBlankToolsRow"><span class="quizBlankRevealAllBtn" id="quizBlankRevealAllBtn">👁 すべて表示／隠す</span></div>';
    } else {
      html += '<div class="quizBody">' + quizBodyHtml + '</div>';
      if (noBlankTargets) {
        html += '<div class="quizBlankNote">💡 この論証には穴埋め対象（太字の強調）が無いため、通常表示にしています。編集画面で太字にすると穴埋め対象にできます。</div>';
      }
    }
    html += buildEntryTagsBlockHtml(e);
    html += '<div class="quizYear">出題年：' + (buildYearHtml(e.year) || 'なし') + '</div>';
    html += '<div class="quizSource" id="quizSourceRow">出典：' + (e.source ? escapeHtml(e.source) : 'なし')
      + ' <span class="quizSourceEditBtn" id="quizSourceEditBtn" title="出典を編集">✏️</span></div>';
    html += '<div class="quizImportedAt">📥 読込日時：' + escapeHtml(formatImportedAt(e.importedAt)) + '</div>';
    const isWeak = !!(studyLog[e.title] && studyLog[e.title].starred);
    html += '<div class="quizJudgeRow">'
      + '<button type="button" class="quizPerfectBtn" id="quizPerfectBtn" title="◎ 完璧"><span class="quizJudgeIcon">◎</span></button>'
      + '<button type="button" class="quizGoodBtn" id="quizGoodBtn" title="○ できた"><span class="quizJudgeIcon">○</span></button>'
      + '<button type="button" class="quizUnsureBtn" id="quizUnsureBtn" title="△ あやしい"><span class="quizJudgeIcon">△</span></button>'
      + '<button type="button" class="quizBadBtn" id="quizBadBtn" title="✕ ダメ"><span class="quizJudgeIcon">✕</span></button>'
      + '<button type="button" class="quizWeakBtn' + (isWeak ? ' active' : '') + '" id="quizWeakBtn" title="😰 苦手"><span class="quizJudgeIcon">😰</span></button>'
      + '</div>';
  }
  }
  html += '</div>';
  quizArea.innerHTML = html;
  const blankSpans = quizArea.querySelectorAll('.quizBlank');
  blankSpans.forEach(span => span.addEventListener('click', (evt) => {
    evt.stopPropagation();
    // 空欄内の条文リンクのタップは条文表示を優先し、空欄の開閉はしない
    if (evt.target.closest('.lawRef')) return;
    span.classList.toggle('revealed');
  }));
  const blankRevealAllBtn = document.getElementById('quizBlankRevealAllBtn');
  if (blankRevealAllBtn) blankRevealAllBtn.addEventListener('click', (evt) => {
    evt.stopPropagation();
    const spans = quizArea.querySelectorAll('.quizBlank');
    const allRevealed = Array.from(spans).every(s => s.classList.contains('revealed'));
    spans.forEach(s => s.classList.toggle('revealed', !allRevealed));
  });
  const showBtn = document.getElementById('quizShowBtn');
  if (showBtn) {
    showBtn.addEventListener('click', () => {
      quizRevealed = true;
      renderQuizPage();
    });
  }
  const prevBtn = document.getElementById('quizPrevBtn');
  if (prevBtn) prevBtn.addEventListener('click', () => {
    if (quizIndex <= 0) return;
    quizIndex--;
    quizRevealed = false;
    renderQuizPage();
  });
  const nextBtn = document.getElementById('quizNextBtn');
  if (nextBtn) nextBtn.addEventListener('click', () => {
    if (quizIndex >= quizPool.length - 1) return;
    quizIndex++;
    quizRevealed = false;
    renderQuizPage();
  });
  function advanceQuiz(level, sourceEl) {
    const idx = entries.findIndex(x => x.title === e.title);
    if (idx !== -1) setConfidence(idx, level, sourceEl);
    quizComboCount = (level === 'good' || level === 'perfect') ? quizComboCount + 1 : 0;
    quizIndex++;
    quizRevealed = false;
    renderQuizPage();
  }
  const perfectBtn = document.getElementById('quizPerfectBtn');
  if (perfectBtn) perfectBtn.addEventListener('click', () => advanceQuiz('perfect', perfectBtn));
  const goodBtn = document.getElementById('quizGoodBtn');
  if (goodBtn) goodBtn.addEventListener('click', () => advanceQuiz('good', goodBtn));
  const unsureBtn = document.getElementById('quizUnsureBtn');
  if (unsureBtn) unsureBtn.addEventListener('click', () => advanceQuiz('unsure', unsureBtn));
  const badBtn = document.getElementById('quizBadBtn');
  if (badBtn) badBtn.addEventListener('click', () => advanceQuiz('bad', badBtn));
  const weakBtn = document.getElementById('quizWeakBtn');
  if (weakBtn) weakBtn.addEventListener('click', () => {
    const idx = entries.findIndex(x => x.title === e.title);
    if (idx !== -1) toggleStar(idx);
    renderQuizPage();
  });
  const toolsMenuBtn = document.getElementById('quizToolsMenuBtn');
  if (toolsMenuBtn) toolsMenuBtn.addEventListener('click', (evt) => {
    evt.stopPropagation();
    quizToolsMenuOpen = !quizToolsMenuOpen;
    quizToolsMenuOpenTitle = e.title;
    renderQuizPage();
  });
  const bookmarkBtn = document.getElementById('quizBookmarkBtn');
  if (bookmarkBtn) bookmarkBtn.addEventListener('click', (evt) => {
    evt.stopPropagation();
    const idx = entries.findIndex(x => x.title === e.title);
    if (idx !== -1) toggleBookmark(idx);
    quizToolsMenuOpen = false;
    renderQuizPage();
  });
  const memoBtn = document.getElementById('quizMemoBtn');
  if (memoBtn) memoBtn.addEventListener('click', (evt) => {
    evt.stopPropagation();
    const idx = entries.findIndex(x => x.title === e.title);
    if (idx !== -1) editMemo(idx);
    quizToolsMenuOpen = false;
    renderQuizPage();
  });
  const skipBtn = document.getElementById('quizSkipBtn');
  if (skipBtn) skipBtn.addEventListener('click', (evt) => {
    evt.stopPropagation();
    const wasSkipped = !!(studyLog[e.title] && studyLog[e.title].skipped);
    const idx = entries.findIndex(x => x.title === e.title);
    if (idx !== -1) toggleSkip(idx);
    if (!wasSkipped) {
      quizIndex++;
      quizRevealed = false;
    }
    quizToolsMenuOpen = false;
    renderQuizPage();
  });
  const sourceEditBtn = document.getElementById('quizSourceEditBtn');
  if (sourceEditBtn) sourceEditBtn.addEventListener('click', (evt) => {
    evt.stopPropagation();
    const idx = entries.findIndex(x => x.title === e.title);
    if (idx !== -1) editSource(idx);
    renderQuizPage();
  });
  const quizEditBtn = document.getElementById('quizEditBtn');
  if (quizEditBtn) quizEditBtn.addEventListener('click', (evt) => {
    evt.stopPropagation();
    const idx = entries.findIndex(x => x.title === e.title);
    if (idx === -1) return;
    editingEntryTitle = editingEntryTitle === e.title ? null : e.title;
    quizToolsMenuOpen = false;
    renderQuizPage();
  });
  const quizDeleteBtn = document.getElementById('quizDeleteBtn');
  if (quizDeleteBtn) quizDeleteBtn.addEventListener('click', (evt) => {
    evt.stopPropagation();
    quizToolsMenuOpen = false;
    if (deleteEntryConfirmed(e)) renderAll(true);
  });
  if (isEditingThis) {
    quizArea.addEventListener('mousedown', (evt) => {
      if (evt.target.closest('.editColorSwatch') || evt.target.closest('.editColorClearBtn') || evt.target.closest('.editBoldBtn')) {
        evt.preventDefault();
      }
    });
    quizArea.addEventListener('keydown', (evt) => {
      if (evt.target.closest('.editBodyArea')) handleBodyEditorKeydown(evt);
    });
    const boldBtn = quizArea.querySelector('.editBoldBtn');
    if (boldBtn) boldBtn.addEventListener('click', (evt) => {
      evt.stopPropagation();
      applyBodyEditorBold();
    });
    const colorSwatches = quizArea.querySelectorAll('.editColorSwatch');
    colorSwatches.forEach(sw => sw.addEventListener('click', (evt) => {
      evt.stopPropagation();
      applyBodyEditorColor(sw.dataset.color);
    }));
    const colorClearBtn = quizArea.querySelector('.editColorClearBtn');
    if (colorClearBtn) colorClearBtn.addEventListener('click', (evt) => {
      evt.stopPropagation();
      document.execCommand('removeFormat');
    });
    const editSaveBtn = quizArea.querySelector('.editSaveBtn');
    if (editSaveBtn) editSaveBtn.addEventListener('click', (evt) => {
      evt.stopPropagation();
      saveEntryEdit(Number(editSaveBtn.dataset.idx));
    });
    const editCancelBtn = quizArea.querySelector('.editCancelBtn');
    if (editCancelBtn) editCancelBtn.addEventListener('click', (evt) => {
      evt.stopPropagation();
      editingEntryTitle = null;
      renderQuizPage();
    });
  }
}

// ▼▼▼ 新規追加：問題演習カードのスワイプ操作（スマホ向け）
// quizAreaはrenderQuizPage()のたびにinnerHTMLだけ差し替わり要素自体は
// 使い回されるため、リスナーはここで1回だけ登録すれば常に効く。
// 編集中のテキスト選択やボタン操作を邪魔しないよう、contenteditable・
// input・textarea・button・select・a・ナビゲーションボタンの上から
// 始まったタッチはスワイプ判定の対象から外す
(() => {
  if (!quizArea) return;
  const SWIPE_MIN_DISTANCE_PX = 60;
  const SWIPE_MAX_VERTICAL_RATIO = 0.6; // 縦移動が横移動よりずっと大きい＝スクロール意図とみなして無視する
  let touchStartX = null, touchStartY = null, touchIgnored = false;
  quizArea.addEventListener('touchstart', (evt) => {
    if (evt.touches.length !== 1) { touchIgnored = true; return; }
    const target = evt.target;
    if (target.closest && target.closest('[contenteditable="true"], input, textarea, button, select, a')) {
      touchIgnored = true;
      return;
    }
    touchIgnored = false;
    touchStartX = evt.touches[0].clientX;
    touchStartY = evt.touches[0].clientY;
  }, { passive: true });
  quizArea.addEventListener('touchend', (evt) => {
    const startX = touchStartX, startY = touchStartY;
    touchStartX = null;
    touchStartY = null;
    if (touchIgnored || startX === null || !quizStarted || quizPool.length === 0) return;
    const touch = evt.changedTouches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (Math.abs(dx) < SWIPE_MIN_DISTANCE_PX) return;
    if (Math.abs(dy) > Math.abs(dx) * SWIPE_MAX_VERTICAL_RATIO) return;
    if (dx < 0) {
      if (quizIndex >= quizPool.length - 1) return;
      quizIndex++;
    } else {
      if (quizIndex <= 0) return;
      quizIndex--;
    }
    quizRevealed = false;
    renderQuizPage();
  }, { passive: true });
})();
// ▲▲▲ 問題演習カードのスワイプ操作 ここまで ▲▲▲

// カード右上の「⋮」メニューの外側をクリック／タップしたら閉じる
document.addEventListener('click', (evt) => {
  if (!quizToolsMenuOpen) return;
  if (evt.target.closest('.quizNavTools')) return;
  quizToolsMenuOpen = false;
  renderQuizPage();
});

