/* ▼▼▼ 新規追加：論証の読み上げ機能（既存の変数・関数名と一切重複しない名前空間で実装） ▼▼▼
   既存の entries / studyLog などには一切触れていません。ブラウザ標準の音声合成（Web Speech API）を使用します。 */
let speechQueue = [];
let speechIndex = 0;
let speechIsPlaying = false;
let speechGapTimer = null;
const SPEECH_TITLE_BODY_PAUSE_MS = 700;
const SPEECH_ENTRY_PAUSE_MS = 1400;
// 「読み上げ」タブを開いたときに最初から選ばれている内容を、設定画面
// (js/settings.js)から変更できるようにする（drive-sync.jsで同期対象）
const SPEECH_DEFAULT_RATE_KEY = 'ronshoSpeechDefaultRateV1';
const SPEECH_RATE_OPTIONS = ['0.75', '1', '1.15', '1.25', '1.5', '2'];
function loadSpeechDefaultRate() {
  const raw = localStorage.getItem(SPEECH_DEFAULT_RATE_KEY);
  return SPEECH_RATE_OPTIONS.includes(raw) ? raw : '1.5';
}
function saveSpeechDefaultRate(rate) {
  localStorage.setItem(SPEECH_DEFAULT_RATE_KEY, String(rate));
}
const SPEECH_DEFAULT_IMPORTANCE_KEY = 'ronshoSpeechDefaultImportanceV1';
const SPEECH_IMPORTANCE_OPTIONS = ['all', '2', '1', '0'];
function loadSpeechDefaultImportance() {
  const raw = localStorage.getItem(SPEECH_DEFAULT_IMPORTANCE_KEY);
  return SPEECH_IMPORTANCE_OPTIONS.includes(raw) ? raw : 'all';
}
function saveSpeechDefaultImportance(v) {
  localStorage.setItem(SPEECH_DEFAULT_IMPORTANCE_KEY, String(v));
}
const SPEECH_DEFAULT_LOOP_KEY = 'ronshoSpeechDefaultLoopV1';
const SPEECH_LOOP_OPTIONS = ['none', 'one', 'all'];
function loadSpeechDefaultLoop() {
  const raw = localStorage.getItem(SPEECH_DEFAULT_LOOP_KEY);
  return SPEECH_LOOP_OPTIONS.includes(raw) ? raw : 'all';
}
function saveSpeechDefaultLoop(v) {
  localStorage.setItem(SPEECH_DEFAULT_LOOP_KEY, String(v));
}
const SPEECH_DEFAULT_INCLUDE_MEMORIZED_KEY = 'ronshoSpeechDefaultIncludeMemorizedV1';
function loadSpeechDefaultIncludeMemorized() {
  return localStorage.getItem(SPEECH_DEFAULT_INCLUDE_MEMORIZED_KEY) === '1';
}
function saveSpeechDefaultIncludeMemorized(v) {
  localStorage.setItem(SPEECH_DEFAULT_INCLUDE_MEMORIZED_KEY, v ? '1' : '0');
}
(() => {
  const rateSel = document.getElementById('speechRateSelect');
  if (rateSel) rateSel.value = loadSpeechDefaultRate();
  const importanceSel = document.getElementById('speechImportanceSelect');
  if (importanceSel) importanceSel.value = loadSpeechDefaultImportance();
  const loopSel = document.getElementById('speechLoopSelect');
  if (loopSel) loopSel.value = loadSpeechDefaultLoop();
  const includeMemorizedChk = document.getElementById('speechIncludeMemorizedChk');
  if (includeMemorizedChk) includeMemorizedChk.checked = loadSpeechDefaultIncludeMemorized();
})();
function clearSpeechGapTimer() {
  if (speechGapTimer) {
    clearTimeout(speechGapTimer);
    speechGapTimer = null;
  }
}
let speechKeepAliveTimer = null;
function startSpeechKeepAlive() {
  stopSpeechKeepAlive();
  speechKeepAliveTimer = setInterval(() => {
    if (!speechIsPlaying) return;
    if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    }
  }, 10000);
}
function stopSpeechKeepAlive() {
  if (speechKeepAliveTimer) {
    clearInterval(speechKeepAliveTimer);
    speechKeepAliveTimer = null;
  }
}

const SPEECH_DICT_KEY = 'ronshoSpeechDictV1';
const SPEECH_DICT_DEFAULT = [
  { word: '瑕疵', reading: 'かし' },
  { word: '相殺', reading: 'そうさい' },
  { word: '幇助', reading: 'ほうじょ' },
  { word: '教唆', reading: 'きょうさ' },
  { word: '心裡留保', reading: 'しんりりゅうほ' },
  { word: '表見代理', reading: 'ひょうけんだいり' },
  { word: '既判力', reading: 'きはんりょく' },
  { word: '不当利得', reading: 'ふとうりとく' },
  { word: '詐害行為', reading: 'さがいこうい' },
  { word: '帰責事由', reading: 'きせきじゆう' }
];
let speechDict = [];
function loadSpeechDict() {
  try {
    const raw = localStorage.getItem(SPEECH_DICT_KEY);
    speechDict = raw ? JSON.parse(raw) : SPEECH_DICT_DEFAULT.slice();
  } catch (e) {
    speechDict = SPEECH_DICT_DEFAULT.slice();
  }
}
function saveSpeechDict() {
  localStorage.setItem(SPEECH_DICT_KEY, JSON.stringify(speechDict));
  if (typeof window !== 'undefined' && typeof window.ronshoSyncNotifyChange === 'function') window.ronshoSyncNotifyChange();
}
loadSpeechDict();
function isKanjiChar(ch) {
  return /[一-鿿々〆〤]/.test(ch);
}
// 連続する漢字のかたまり（例:「金曜日」）を、登録済みの単語だけで
// 過不足なく端から端まで埋められる場合に限って分割する。「金」だけが
// 単独で登録されているからといって「金曜日」の頭だけをそれに置き換えて
// しまうと、別の場所の「お金」（かね）と読みを共有してしまい、片方を
// 直すともう片方も変わってしまう（同じ漢字でも組み合わせで読みが
// 変わることに対応できない）ため、埋めきれない場合はそのかたまり
// 全体を1つの未登録語として扱う
function tileKanjiRun(text, start, end, sortedDict) {
  const segs = [];
  let i = start;
  while (i < end) {
    const matched = sortedDict.find(d => i + d.word.length <= end && text.startsWith(d.word, i));
    if (!matched) return null;
    segs.push(matched);
    i += matched.word.length;
  }
  return segs;
}
function applySpeechDict(text) {
  if (!text) return '';
  const sorted = [...speechDict].filter(d => d.word).sort((a, b) => b.word.length - a.word.length);
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (isKanjiChar(text[i])) {
      let j = i + 1;
      while (j < text.length && isKanjiChar(text[j])) j++;
      const tiled = tileKanjiRun(text, i, j, sorted);
      if (tiled) {
        tiled.forEach(d => { out += d.reading; });
      } else {
        out += text.slice(i, j);
      }
      i = j;
      continue;
    }
    out += text[i];
    i++;
  }
  return out;
}
let speechDictListVisible = false;
function renderSpeechDictToggle() {
  const btn = document.getElementById('speechDictToggleBtn');
  if (!btn) return;
  btn.textContent = (speechDictListVisible ? '▼ 登録一覧を隠す' : '▶ 登録一覧を表示する') + '（' + speechDict.length + '件）';
}
function renderSpeechDictList() {
  const wrap = document.getElementById('speechDictListWrap');
  if (!wrap) return;
  wrap.style.display = speechDictListVisible ? '' : 'none';
  renderSpeechDictToggle();
  if (speechDict.length === 0) {
    wrap.innerHTML = '<div class="speechDictEmpty">登録された読み方はありません。</div>';
    return;
  }
  wrap.innerHTML = speechDict.map((d, idx) =>
    '<div class="speechDictRow" data-idx="' + idx + '">'
    + '<span class="speechDictWord">' + escapeHtml(d.word) + '</span>'
    + '<span class="speechDictArrow">→</span>'
    + '<span class="speechDictReading">' + escapeHtml(d.reading) + '</span>'
    + '<span class="speechDictDeleteBtn" data-idx="' + idx + '">🗑</span>'
    + '</div>'
  ).join('');
}
document.getElementById('speechDictAddBtn').addEventListener('click', () => {
  const wordInput = document.getElementById('speechDictWordInput');
  const readingInput = document.getElementById('speechDictReadingInput');
  const word = wordInput.value.trim();
  const reading = readingInput.value.trim();
  if (!word || !reading) {
    alert('表記と読みの両方を入力してください。');
    return;
  }
  const existingIdx = speechDict.findIndex(d => d.word === word);
  if (existingIdx !== -1) speechDict[existingIdx].reading = reading;
  else speechDict.push({ word, reading });
  saveSpeechDict();
  wordInput.value = '';
  readingInput.value = '';
  renderSpeechDictList();
});
document.getElementById('speechDictListWrap').addEventListener('click', (e) => {
  const deleteBtn = e.target.closest('.speechDictDeleteBtn');
  if (!deleteBtn) return;
  const idx = Number(deleteBtn.dataset.idx);
  speechDict.splice(idx, 1);
  saveSpeechDict();
  renderSpeechDictList();
});
document.getElementById('speechDictToggleBtn').addEventListener('click', () => {
  speechDictListVisible = !speechDictListVisible;
  renderSpeechDictList();
});
renderSpeechDictList();

function speechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}
let speechWakeLock = null;
async function acquireSpeechWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    speechWakeLock = await navigator.wakeLock.request('screen');
    speechWakeLock.addEventListener('release', () => { speechWakeLock = null; });
  } catch (e) {
    speechWakeLock = null;
  }
}
function releaseSpeechWakeLock() {
  if (speechWakeLock) {
    speechWakeLock.release().catch(() => {});
    speechWakeLock = null;
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && speechIsPlaying && !speechWakeLock) {
    acquireSpeechWakeLock();
  }
});
function renderSpeechSubjectSelect() {
  const sel = document.getElementById('speechSubjectSelect');
  if (!sel) return;
  const subjects = getUniqueSubjects();
  const current = sel.value || 'all';
  let html = '<option value="all">📚 すべて</option>';
  subjects.forEach(s => {
    html += '<option value="' + escapeHtml(s) + '">' + getSubjectEmoji(s) + ' ' + escapeHtml(s) + '</option>';
  });
  sel.innerHTML = html;
  if ([...sel.options].some(o => o.value === current)) sel.value = current;
  renderSpeechCategorySelect();
}
function getSpeechCategories(subject) {
  const scoped = subject === 'all' ? entries : entries.filter(e => (e.subject || 'その他') === subject);
  const seen = [];
  scoped.forEach(e => {
    const c = e.category || '未分類';
    if (!seen.includes(c)) seen.push(c);
  });
  return seen;
}
function renderSpeechCategorySelect() {
  const sel = document.getElementById('speechCategorySelect');
  const subjectSel = document.getElementById('speechSubjectSelect');
  if (!sel) return;
  const subject = subjectSel ? subjectSel.value : 'all';
  const categories = getSpeechCategories(subject);
  const current = sel.value || 'all';
  let html = '<option value="all">すべての分野</option>';
  categories.forEach(c => {
    html += '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>';
  });
  sel.innerHTML = html;
  sel.value = [...sel.options].some(o => o.value === current) ? current : 'all';
}
function buildSpeechQueue() {
  const sel = document.getElementById('speechSubjectSelect');
  const subject = sel ? sel.value : 'all';
  const catSel = document.getElementById('speechCategorySelect');
  const category = catSel ? catSel.value : 'all';
  const importanceSel = document.getElementById('speechImportanceSelect');
  const importance = importanceSel ? importanceSel.value : 'all';
  const includeMemorized = document.getElementById('speechIncludeMemorizedChk').checked;
  return entries.filter(e => {
    if (subject !== 'all' && (e.subject || 'その他') !== subject) return false;
    if (category !== 'all' && (e.category || '未分類') !== category) return false;
    if (importance !== 'all' && (e.importance || 0) !== Number(importance)) return false;
    if (!includeMemorized && studyLog[e.title] && studyLog[e.title].memorized) return false;
    return true;
  });
}
function renderSpeechStatus(text) {
  const el = document.getElementById('speechStatus');
  if (el) el.textContent = text;
}
// ▼▼▼ 新規追加：読み上げ中の文章を読み仮名カードで表示・直接編集する機能
// 表示中の論証（タイトル・本文）を、辞書登録済みの単語は「読み」に、
// まだ辞書に無い漢字のかたまりは「そのままの表記」に置き換えた断片列に
// 分解する。カード側では断片ごとに編集可能なspanとして表示し、そこを
// 直接編集すると読み方辞書（speechDict）にそのまま反映される
let speechFuriganaVisible = false;
function buildFuriganaSegments(text) {
  if (!text) return [];
  const sorted = [...speechDict].filter(d => d.word).sort((a, b) => b.word.length - a.word.length);
  const segments = [];
  let i = 0;
  while (i < text.length) {
    if (isKanjiChar(text[i])) {
      let j = i + 1;
      while (j < text.length && isKanjiChar(text[j])) j++;
      // [i, j)は連続する漢字のかたまり。applySpeechDictと同じ理由で、
      // このかたまり全体を登録済みの単語だけで埋めきれる場合に限って
      // 分割し、埋めきれない場合はかたまり全体を1つの未登録語として扱う
      const tiled = tileKanjiRun(text, i, j, sorted);
      if (tiled) {
        tiled.forEach(d => segments.push({ type: 'dict', word: d.word, reading: d.reading }));
      } else {
        segments.push({ type: 'kanji', word: text.slice(i, j) });
      }
      i = j;
      continue;
    }
    let j = i + 1;
    while (j < text.length && !isKanjiChar(text[j])) j++;
    segments.push({ type: 'plain', text: text.slice(i, j) });
    i = j;
  }
  return segments;
}
function buildFuriganaHtml(text) {
  return buildFuriganaSegments(text).map(seg => {
    if (seg.type === 'dict') {
      return '<span class="speechFuriganaWord" contenteditable="true" data-word="' + escapeHtml(seg.word)
        + '" title="「' + escapeHtml(seg.word) + '」の読み方（編集すると辞書に反映されます）">' + escapeHtml(seg.reading) + '</span>';
    }
    if (seg.type === 'kanji') {
      return '<span class="speechFuriganaWord speechFuriganaUnregistered" contenteditable="true" data-word="' + escapeHtml(seg.word)
        + '" title="まだ読み方辞書に無い単語です。読み方を入力すると登録されます">' + escapeHtml(seg.word) + '</span>';
    }
    return escapeHtml(seg.text).replace(/\n/g, '<br>');
  }).join('');
}
function renderSpeechFuriganaCard(e) {
  const wrap = document.getElementById('speechFuriganaCard');
  if (!wrap) return;
  if (!speechFuriganaVisible || !e) {
    wrap.innerHTML = '';
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = '';
  wrap.innerHTML = '<div class="speechFuriganaNote">💡 読み方が違う単語はタップして直接修正できます。点線の単語はまだ読み方辞書に登録されていない漢字です（読み方を入力すると登録されます）。</div>'
    + '<div class="speechFuriganaText">' + buildFuriganaHtml(e.title) + '</div>'
    + '<div class="speechFuriganaText speechFuriganaBody">' + buildFuriganaHtml(e.body) + '</div>';
}
function saveFuriganaWordEdit(span) {
  const word = span.getAttribute('data-word');
  const newReading = span.textContent.trim();
  if (!word || !newReading) return;
  const wasUnregistered = span.classList.contains('speechFuriganaUnregistered');
  if (wasUnregistered && newReading === word) return; // 未編集のまま外れた場合は何もしない
  const idx = speechDict.findIndex(d => d.word === word);
  if (idx !== -1) {
    if (speechDict[idx].reading === newReading) return;
    speechDict[idx].reading = newReading;
  } else {
    speechDict.push({ word: word, reading: newReading });
  }
  saveSpeechDict();
  status.textContent = '🔤 「' + word + '」の読み方を「' + newReading + '」として読み方辞書に反映しました。';
  renderSpeechDictList();
  // 同じ単語が文章中の別の箇所にも出てくる場合、そちらの表示にも反映されるよう再描画する
  if (speechQueue.length > 0) renderSpeechFuriganaCard(speechQueue[speechIndex]);
}
const speechCurrentCardEl = document.getElementById('speechCurrentCard');
if (speechCurrentCardEl) {
  speechCurrentCardEl.addEventListener('focusout', (evt) => {
    const span = evt.target.closest ? evt.target.closest('.speechFuriganaWord') : null;
    if (span) saveFuriganaWordEdit(span);
  });
  speechCurrentCardEl.addEventListener('keydown', (evt) => {
    if (evt.key !== 'Enter') return;
    const span = evt.target.closest ? evt.target.closest('.speechFuriganaWord') : null;
    if (!span) return;
    evt.preventDefault();
    span.blur();
  });
  speechCurrentCardEl.addEventListener('click', (evt) => {
    const btn = evt.target.closest ? evt.target.closest('#speechFuriganaToggleBtn') : null;
    if (!btn) return;
    speechFuriganaVisible = !speechFuriganaVisible;
    btn.classList.toggle('active', speechFuriganaVisible);
    renderSpeechFuriganaCard(speechQueue[speechIndex]);
  });
}
// ▲▲▲ 読み仮名カード ここまで ▲▲▲
function renderSpeechCurrentCard() {
  const el = document.getElementById('speechCurrentCard');
  if (!el) return;
  if (speechQueue.length === 0) {
    el.innerHTML = '<div class="speechEmpty">対象の論証がありません。科目や「暗記済みも含める」の設定を見直してください。</div>';
    return;
  }
  const e = speechQueue[speechIndex];
  el.innerHTML = '<div class="speechProgress">' + (speechIndex + 1) + ' / ' + speechQueue.length + '問</div>'
    + '<div class="speechMeta">' + escapeHtml(e.subject || '') + ' ｜ ' + escapeHtml(e.category || '') + '</div>'
    + '<div class="speechTitleRow">'
    + '<div class="speechTitle">' + escapeHtml(e.title) + '</div>'
    + '<span class="speechFuriganaToggleBtn' + (speechFuriganaVisible ? ' active' : '') + '" id="speechFuriganaToggleBtn" title="読み仮名を表示・編集">🔤 読み仮名</span>'
    + '</div>'
    + '<div class="speechBody">' + linkifyLawRefs((e.bodyHtml || escapeHtml(e.body || '')), e.subject) + '</div>'
    + '<div id="speechFuriganaCard" class="speechFuriganaCard"></div>';
  renderSpeechFuriganaCard(e);
}
function advanceSpeechAfterEntry() {
  if (!speechIsPlaying) return;
  const loopSel = document.getElementById('speechLoopSelect');
  const loopMode = loopSel ? loopSel.value : 'none';
  if (loopMode === 'one') {
    speechGapTimer = setTimeout(() => { if (speechIsPlaying) speakCurrentEntry(); }, SPEECH_ENTRY_PAUSE_MS);
  } else if (speechIndex < speechQueue.length - 1) {
    speechIndex++;
    speechGapTimer = setTimeout(() => { if (speechIsPlaying) speakCurrentEntry(); }, SPEECH_ENTRY_PAUSE_MS);
  } else if (loopMode === 'all') {
    speechIndex = 0;
    speechGapTimer = setTimeout(() => { if (speechIsPlaying) speakCurrentEntry(); }, SPEECH_ENTRY_PAUSE_MS);
  } else {
    speechIsPlaying = false;
    stopSpeechKeepAlive();
    releaseSpeechWakeLock();
    renderSpeechStatus('🎉 すべて読み上げが終了しました。');
  }
}
function speakCurrentEntry() {
  if (!speechSupported()) {
    renderSpeechStatus('お使いのブラウザは読み上げ機能に対応していません。');
    return;
  }
  if (speechQueue.length === 0) return;
  const e = speechQueue[speechIndex];
  renderSpeechCurrentCard();
  clearSpeechGapTimer();
  window.speechSynthesis.cancel();
  const rateSel = document.getElementById('speechRateSelect');
  const rate = rateSel ? Number(rateSel.value) || 1 : 1;
  const titleUtterance = new SpeechSynthesisUtterance(applySpeechDict(e.title));
  titleUtterance.lang = 'ja-JP';
  titleUtterance.rate = rate;
  const bodyUtterance = new SpeechSynthesisUtterance(applySpeechDict(e.body));
  bodyUtterance.lang = 'ja-JP';
  bodyUtterance.rate = rate;
  titleUtterance.onend = () => {
    if (!speechIsPlaying) return;
    speechGapTimer = setTimeout(() => {
      if (!speechIsPlaying) return;
      window.speechSynthesis.speak(bodyUtterance);
    }, SPEECH_TITLE_BODY_PAUSE_MS);
  };
  titleUtterance.onerror = (evt) => {
    if (evt.error === 'interrupted' || evt.error === 'canceled') return;
    speechIsPlaying = false;
    stopSpeechKeepAlive();
    releaseSpeechWakeLock();
    renderSpeechStatus('読み上げ中にエラーが発生しました。');
  };
  bodyUtterance.onend = advanceSpeechAfterEntry;
  bodyUtterance.onerror = (evt) => {
    if (evt.error === 'interrupted' || evt.error === 'canceled') return;
    speechIsPlaying = false;
    stopSpeechKeepAlive();
    releaseSpeechWakeLock();
    renderSpeechStatus('読み上げ中にエラーが発生しました。');
  };
  renderSpeechStatus('🔊 読み上げ中… (' + (speechIndex + 1) + ' / ' + speechQueue.length + ')');
  startSpeechKeepAlive();
  window.speechSynthesis.speak(titleUtterance);
}
function startSpeech() {
  if (!speechSupported()) {
    renderSpeechStatus('お使いのブラウザは読み上げ機能に対応していません。');
    return;
  }
  acquireSpeechWakeLock();
  if (window.speechSynthesis.paused && speechQueue.length > 0) {
    window.speechSynthesis.resume();
    speechIsPlaying = true;
    startSpeechKeepAlive();
    renderSpeechStatus('🔊 読み上げ中… (' + (speechIndex + 1) + ' / ' + speechQueue.length + ')');
    return;
  }
  if (speechQueue.length === 0) {
    speechQueue = buildSpeechQueue();
    speechIndex = 0;
  } else {
    speechIndex = Math.min(speechIndex, speechQueue.length - 1);
  }
  speechIsPlaying = true;
  renderSpeechCurrentCard();
  speakCurrentEntry();
}
function pauseSpeech() {
  if (!speechSupported()) return;
  speechIsPlaying = false;
  clearSpeechGapTimer();
  stopSpeechKeepAlive();
  window.speechSynthesis.pause();
  releaseSpeechWakeLock();
  renderSpeechStatus('⏸ 一時停止中');
}
function stopSpeech() {
  if (!speechSupported()) return;
  speechIsPlaying = false;
  clearSpeechGapTimer();
  stopSpeechKeepAlive();
  window.speechSynthesis.cancel();
  releaseSpeechWakeLock();
  renderSpeechStatus('⏹ 停止しました');
}
function speechStep(delta) {
  if (speechQueue.length === 0) return;
  const wasPlaying = speechIsPlaying;
  speechIsPlaying = false;
  clearSpeechGapTimer();
  window.speechSynthesis.cancel();
  speechIndex = Math.min(Math.max(speechIndex + delta, 0), speechQueue.length - 1);
  renderSpeechCurrentCard();
  if (wasPlaying) {
    speechIsPlaying = true;
    speakCurrentEntry();
  }
}
document.getElementById('speechPlayBtn').addEventListener('click', startSpeech);
document.getElementById('speechPauseBtn').addEventListener('click', pauseSpeech);
document.getElementById('speechStopBtn').addEventListener('click', stopSpeech);
document.getElementById('speechNextBtn').addEventListener('click', () => speechStep(1));
document.getElementById('speechPrevBtn').addEventListener('click', () => speechStep(-1));
document.getElementById('speechSubjectSelect').addEventListener('change', () => {
  stopSpeech();
  renderSpeechCategorySelect();
  speechQueue = buildSpeechQueue();
  speechIndex = 0;
  renderSpeechCurrentCard();
  renderSpeechStatus('');
});
document.getElementById('speechCategorySelect').addEventListener('change', () => {
  stopSpeech();
  speechQueue = buildSpeechQueue();
  speechIndex = 0;
  renderSpeechCurrentCard();
  renderSpeechStatus('');
});
document.getElementById('speechImportanceSelect').addEventListener('change', () => {
  stopSpeech();
  speechQueue = buildSpeechQueue();
  speechIndex = 0;
  renderSpeechCurrentCard();
  renderSpeechStatus('');
});
document.getElementById('speechIncludeMemorizedChk').addEventListener('change', () => {
  stopSpeech();
  speechQueue = buildSpeechQueue();
  speechIndex = 0;
  renderSpeechCurrentCard();
  renderSpeechStatus('');
});
/* ▲▲▲ 新規追加：論証の読み上げ機能 ここまで ▲▲▲ */

