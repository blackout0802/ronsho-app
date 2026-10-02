/* ▼▼▼ 新規追加：条文参照機能（既存の変数・関数名と一切重複しない名前空間で実装）
   論証本文中の「民法90条」「刑法199条」「90条」などの条文参照に下線を付け、
   タップするとe-Gov法令APIから条文本文を取得して表示する。
   ・検出は表示時に行うだけで、保存済みの entries / bodyHtml には一切書き込まない
   ・条文本文はe-Gov（CORS開放済み）から取得し、端末内のキャッシュ
     'ronshoLawCacheV1' に保持する（キャッシュは端末固有のため同期対象外）
   ・表示方法（ポップアップ／その場に展開）は 'ronshoLawRefViewV1' で保持し、
     同期・バックアップの対象に含める（drive-sync.js・js/backup.jsに登録） */
const LAWREF_LAWS = {
  constitution: { name: '憲法', lawId: '321CONSTITUTION', aliases: ['憲法'] },
  minpou: { name: '民法', lawNum: '明治二十九年法律第八十九号', aliases: ['民法'] },
  keiho: { name: '刑法', lawNum: '明治四十年法律第四十五号', aliases: ['刑法'] },
  shouhou: { name: '商法', lawNum: '明治三十二年法律第四十八号', aliases: ['商法'] },
  kaishahou: { name: '会社法', lawNum: '平成十七年法律第八十六号', aliases: ['会社法'] },
  minsou: { name: '民事訴訟法', lawNum: '平成八年法律第百九号', aliases: ['民事訴訟法', '民訴法', '民訴'] },
  keisou: { name: '刑事訴訟法', lawNum: '昭和二十三年法律第百三十一号', aliases: ['刑事訴訟法', '刑訴法', '刑訴'] },
  gyousohou: { name: '行政事件訴訟法', lawNum: '昭和三十七年法律第百三十九号', aliases: ['行政事件訴訟法', '行訴法'] },
  gyoufufukushinsa: { name: '行政不服審査法', lawNum: '平成二十六年法律第六十八号', aliases: ['行政不服審査法', '行審法'] },
  gyoutetsuzuki: { name: '行政手続法', lawNum: '平成五年法律第八十八号', aliases: ['行政手続法', '行手法'] },
  kokubai: { name: '国家賠償法', lawNum: '昭和二十二年法律第百二十五号', aliases: ['国家賠償法', '国賠法'] },
  gyoudaishikkou: { name: '行政代執行法', lawNum: '昭和二十三年法律第四十三号', aliases: ['行政代執行法'] },
  rouki: { name: '労働基準法', lawNum: '昭和二十二年法律第四十九号', aliases: ['労働基準法', '労基法'] },
  roukumi: { name: '労働組合法', lawNum: '昭和二十四年法律第百七十四号', aliases: ['労働組合法', '労組法'] },
  roukeiyaku: { name: '労働契約法', lawNum: '平成十九年法律第百二十八号', aliases: ['労働契約法', '労契法'] },
  minshikkou: { name: '民事執行法', lawNum: '昭和五十四年法律第四号', aliases: ['民事執行法', '民執法'] },
  minhozen: { name: '民事保全法', lawNum: '平成元年法律第九十一号', aliases: ['民事保全法', '民保法'] },
  minsaisei: { name: '民事再生法', lawNum: '平成十一年法律第二百二十五号', aliases: ['民事再生法', '民再法'] },
  hasan: { name: '破産法', lawNum: '平成十六年法律第七十五号', aliases: ['破産法'] }
};
// 法律名の指定が無い「90条」のような参照は、その論証の科目から法律を推測する
const LAWREF_SUBJECT_DEFAULT = {
  '民法': 'minpou',
  '刑法': 'keiho',
  '憲法': 'constitution',
  '商法': 'shouhou',
  '民事訴訟法': 'minsou',
  '刑事訴訟法': 'keisou',
  '行政法': 'gyousohou',
  '労働法': 'rouki',
  '実務基礎民事': 'minsou',
  '実務基礎刑事': 'keisou'
};
const LAWREF_ALIAS_TO_LID = {};
Object.keys(LAWREF_LAWS).forEach(lid => {
  LAWREF_LAWS[lid].aliases.forEach(a => { LAWREF_ALIAS_TO_LID[a] = lid; });
});
function lawrefEscapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
// 別名の長い順（「民事訴訟法」→「民訴」の順）に並べ、前方一致の誤検出を防ぐ
const LAWREF_ALIAS_PATTERN = Object.keys(LAWREF_ALIAS_TO_LID)
  .sort((a, b) => b.length - a.length)
  .map(lawrefEscapeRegExp).join('|');
const LAWREF_NUM_PATTERN = '[0-9０-９一二三四五六七八九十百千]+';
// 法律名＋条（「民法90条」「第九十条」「121条の2」「14条1項」など）か、
// 法律名の無い条番号（科目から推測）のどちらかにマッチする
const LAWREF_RE = new RegExp(
  '(?:(?<law>' + LAWREF_ALIAS_PATTERN + '))?第?(?<num>' + LAWREF_NUM_PATTERN + ')条'
  + '(?:の(?<branch>' + LAWREF_NUM_PATTERN + '))?'
  + '(?:第?(?<para>' + LAWREF_NUM_PATTERN + ')項)?',
  'g'
);
// 「第九十条」「1」「２３」→ 90 / 1 / 23。変換不能なら NaN
function lawrefParseNum(s) {
  const t = String(s || '').trim();
  if (/^[0-9０-９]+$/.test(t)) {
    return Number(t.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)));
  }
  const DIGIT = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const UNIT = { 十: 10, 百: 100, 千: 1000 };
  let result = 0, temp = 0, seen = false;
  for (const ch of t) {
    if (DIGIT[ch] !== undefined) { temp = DIGIT[ch]; seen = true; }
    else if (UNIT[ch] !== undefined) { result += (temp === 0 ? 1 : temp) * UNIT[ch]; temp = 0; seen = true; }
    else return NaN;
  }
  if (!seen) return NaN;
  return result + temp;
}
// テキスト中の条文参照を、DOM生成前に純粋なデータとして抜き出す
// （Nodeでの単体検証ができるよう、DOM操作とは分離している）
function lawrefFindRefs(text, subject) {
  const out = [];
  LAWREF_RE.lastIndex = 0;
  let m;
  while ((m = LAWREF_RE.exec(text)) !== null) {
    const g = m.groups || {};
    const lid = (g.law && LAWREF_ALIAS_TO_LID[g.law]) || LAWREF_SUBJECT_DEFAULT[subject] || null;
    if (!lid || !LAWREF_LAWS[lid]) continue;
    const num = lawrefParseNum(g.num);
    if (!Number.isFinite(num) || num < 1 || num > 2000) continue;
    const branch = g.branch ? lawrefParseNum(g.branch) : null;
    if (g.branch && (!Number.isFinite(branch) || branch < 1 || branch > 99)) continue;
    const para = g.para ? lawrefParseNum(g.para) : null;
    if (g.para && (!Number.isFinite(para) || para < 1 || para > 30)) continue;
    const lawName = g.law || LAWREF_LAWS[lid].name;
    out.push({
      index: m.index,
      length: m[0].length,
      text: m[0],
      lid: lid,
      num: num,
      branch: branch,
      para: para,
      label: lawName + num + '条' + (branch ? 'の' + branch : '') + (para ? '第' + para + '項' : '')
    });
  }
  return out;
}
// 表示用HTML中の条文参照に下線リンク（span.lawRef）を付ける。
// 保存データは変えず、表示のたびに掛けるだけなので二重化しない
function linkifyLawRefs(html, subject) {
  if (!html || typeof document === 'undefined' || typeof NodeFilter === 'undefined') return html;
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const walker = document.createTreeWalker(tmp, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (n.parentElement && n.parentElement.closest && n.parentElement.closest('.lawRef')) continue;
    textNodes.push(n);
  }
  textNodes.forEach(n => {
    const refs = lawrefFindRefs(n.nodeValue, subject);
    if (refs.length === 0) return;
    const frag = document.createDocumentFragment();
    let pos = 0;
    refs.forEach(r => {
      if (r.index > pos) frag.appendChild(document.createTextNode(n.nodeValue.slice(pos, r.index)));
      const span = document.createElement('span');
      span.className = 'lawRef';
      span.setAttribute('data-lid', r.lid);
      span.setAttribute('data-num', String(r.num));
      if (r.branch) span.setAttribute('data-branch', String(r.branch));
      if (r.para) span.setAttribute('data-para', String(r.para));
      span.setAttribute('data-label', r.label);
      span.setAttribute('title', r.label + 'の条文を表示');
      span.textContent = r.text;
      frag.appendChild(span);
      pos = r.index + r.length;
    });
    if (pos < n.nodeValue.length) frag.appendChild(document.createTextNode(n.nodeValue.slice(pos)));
    n.parentNode.replaceChild(frag, n);
  });
  return tmp.innerHTML;
}

// --- 条文本文の取得・キャッシュ ---
// 取得済みの条文は端末内に保持し、オフラインでも確認できるようにする。
// 端末固有のキャッシュであり他端末と揃える意味が無いため、同期対象には含めない
const LAWREF_CACHE_KEY = 'ronshoLawCacheV1';
const LAWREF_CACHE_MAX = 300;
function lawrefCacheKey(lid, num, branch) {
  return lid + '|' + num + (branch ? '-' + branch : '');
}
function lawrefLoadCache() {
  try {
    const raw = localStorage.getItem(LAWREF_CACHE_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return (obj && typeof obj === 'object') ? obj : {};
  } catch (e) {
    return {};
  }
}
function lawrefSaveCache(cache) {
  try {
    const keys = Object.keys(cache).sort((a, b) => (cache[a].at || 0) - (cache[b].at || 0));
    while (keys.length > LAWREF_CACHE_MAX) delete cache[keys.shift()];
    localStorage.setItem(LAWREF_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.error('条文キャッシュの保存に失敗しました:', e);
  }
}
function lawrefBuildArticleUrl(lid, num, branch) {
  const law = LAWREF_LAWS[lid];
  const articleParam = num + '条' + (branch ? 'の' + branch : '');
  const base = 'https://laws.e-gov.go.jp/api/1/articles;';
  const lawPart = law.lawId
    ? 'lawId=' + encodeURIComponent(law.lawId)
    : 'lawNum=' + encodeURIComponent(law.lawNum);
  return base + lawPart + ';article=' + encodeURIComponent(articleParam);
}
// e-Govの条文XML（DOMParser用）を {caption, title, paras:[{label, text}]} に整形する。
// XML構造の取得自体は lawrefGetArticle が行い、ここは整形だけに専念する
function lawrefFormatArticleDoc(doc) {
  const textOf = (el, tag) => {
    const els = el.getElementsByTagName(tag);
    return els.length > 0 ? (els[0].textContent || '').trim() : '';
  };
  const articles = doc.getElementsByTagName('Article');
  if (articles.length === 0) return null;
  const articleEl = articles[articles.length - 1];
  const paras = [];
  const paraEls = articleEl.getElementsByTagName('Paragraph');
  for (let i = 0; i < paraEls.length; i++) {
    const numLabel = textOf(paraEls[i], 'ParagraphNum');
    const sentences = [];
    const sentenceEls = paraEls[i].getElementsByTagName('Sentence');
    for (let j = 0; j < sentenceEls.length; j++) {
      const t = (sentenceEls[j].textContent || '').trim();
      if (t) sentences.push(t);
    }
    const text = sentences.join('');
    if (text) paras.push({ label: numLabel, text: text });
  }
  if (paras.length === 0) return null;
  return { caption: textOf(articleEl, 'ArticleCaption'), title: textOf(articleEl, 'ArticleTitle'), paras: paras };
}
async function lawrefGetArticle(lid, num, branch) {
  const key = lawrefCacheKey(lid, num, branch);
  const cache = lawrefLoadCache();
  if (cache[key]) return Object.assign({ cached: true }, cache[key]);
  const res = await fetch(lawrefBuildArticleUrl(lid, num, branch));
  if (!res.ok) throw new Error('条文の取得に失敗しました（HTTP ' + res.status + '）');
  const xml = await res.text();
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const codes = doc.getElementsByTagName('Code');
  if (codes.length === 0 || (codes[0].textContent || '').trim() !== '0') {
    throw new Error('該当する条文が見つかりませんでした。');
  }
  const formatted = lawrefFormatArticleDoc(doc);
  if (!formatted) throw new Error('条文の形式を読み取れませんでした。');
  const entry = Object.assign({ at: Date.now() }, formatted);
  cache[key] = entry;
  lawrefSaveCache(cache);
  return Object.assign({ cached: false }, entry);
}
function lawrefArticleBodyHtml(data) {
  let html = '';
  if (data.caption) html += '<div class="lawRefCaption">' + escapeHtml(data.caption) + '</div>';
  if (data.title) html += '<div class="lawRefTitle">' + escapeHtml(data.title) + '</div>';
  html += data.paras.map(p => '<div class="lawRefPara">'
    + (p.label ? '<span class="lawRefParaNum">' + escapeHtml(p.label) + '</span>' : '')
    + escapeHtml(p.text) + '</div>').join('');
  return html;
}

// --- 表示（ポップアップ／その場に展開の2方式） ---
const LAWREF_VIEW_KEY = 'ronshoLawRefViewV1';
function loadLawRefView() {
  const raw = localStorage.getItem(LAWREF_VIEW_KEY);
  return raw === 'inline' ? 'inline' : 'popup';
}
function saveLawRefView(v) {
  localStorage.setItem(LAWREF_VIEW_KEY, v === 'inline' ? 'inline' : 'popup');
  if (typeof window !== 'undefined' && typeof window.ronshoSyncNotifyChange === 'function') window.ronshoSyncNotifyChange();
}
function lawrefSourceNote(data) {
  const date = data.at ? new Date(data.at).toLocaleDateString('ja-JP') : '';
  return '出典：e-Gov法令検索' + (date ? '（' + date + '取得' + (data.cached ? '・キャッシュ表示' : '') + '）' : '');
}
function openLawRefPopup(ref) {
  const root = document.getElementById('lawRefModalRoot');
  if (!root) return;
  const label = ref.getAttribute('data-label') || '条文';
  const lid = ref.getAttribute('data-lid');
  const num = Number(ref.getAttribute('data-num'));
  const branch = ref.getAttribute('data-branch') ? Number(ref.getAttribute('data-branch')) : null;
  root.innerHTML = '<div class="lawModalOverlay" id="lawModalOverlay">'
    + '<div class="lawModalBox">'
    + '<div class="lawModalHeader"><span>📜 ' + escapeHtml(label) + '</span><span class="lawModalCloseBtn" id="lawModalCloseBtn">✖</span></div>'
    + '<div class="lawModalBody" id="lawModalBody"><div class="lawModalLoading">読み込み中…</div></div>'
    + '<div class="lawModalFoot" id="lawModalFoot"></div>'
    + '</div>'
    + '</div>';
  lawrefGetArticle(lid, num, branch).then(data => {
    const body = document.getElementById('lawModalBody');
    const foot = document.getElementById('lawModalFoot');
    if (!body) return;
    body.innerHTML = lawrefArticleBodyHtml(data);
    if (foot) foot.textContent = lawrefSourceNote(data);
  }).catch(err => {
    const body = document.getElementById('lawModalBody');
    if (!body) return;
    const offline = !navigator.onLine ? 'オフラインのようです。' : '';
    body.innerHTML = '<div class="lawModalError">条文を取得できませんでした。' + escapeHtml(offline)
      + 'オンラインになってからもう一度お試しください。（' + escapeHtml(err.message) + '）</div>';
  });
}
function closeLawRefPopup() {
  const root = document.getElementById('lawRefModalRoot');
  if (root) root.innerHTML = '';
}
// その場に展開モード：押した参照の直後に条文ボックスを出し、もう一度押すと閉じる
function toggleLawRefInline(ref) {
  const lid = ref.getAttribute('data-lid');
  const num = Number(ref.getAttribute('data-num'));
  const branch = ref.getAttribute('data-branch') ? Number(ref.getAttribute('data-branch')) : null;
  const label = ref.getAttribute('data-label') || '条文';
  const key = lawrefCacheKey(lid, num, branch);
  const next = ref.nextSibling;
  if (next && next.classList && next.classList.contains('lawRefInline') && next.getAttribute('data-key') === key) {
    next.remove();
    return;
  }
  const box = document.createElement('div');
  box.className = 'lawRefInline';
  box.setAttribute('data-key', key);
  box.innerHTML = '<div class="lawRefInlineHead"><span>📜 ' + escapeHtml(label) + '</span><span class="lawRefInlineClose">✖</span></div>'
    + '<div class="lawRefInlineBody"><div class="lawModalLoading">読み込み中…</div></div>'
    + '<div class="lawRefInlineFoot"></div>';
  ref.parentNode.insertBefore(box, ref.nextSibling);
  box.querySelector('.lawRefInlineClose').addEventListener('click', (e) => {
    e.stopPropagation();
    box.remove();
  });
  lawrefGetArticle(lid, num, branch).then(data => {
    if (!box.isConnected) return;
    box.querySelector('.lawRefInlineBody').innerHTML = lawrefArticleBodyHtml(data);
    box.querySelector('.lawRefInlineFoot').textContent = lawrefSourceNote(data);
  }).catch(err => {
    if (!box.isConnected) return;
    const offline = !navigator.onLine ? 'オフラインのようです。' : '';
    box.querySelector('.lawRefInlineBody').innerHTML = '<div class="lawModalError">条文を取得できませんでした。' + escapeHtml(offline)
      + 'オンラインになってからもう一度お試しください。（' + escapeHtml(err.message) + '）</div>';
  });
}
// --- 条文ストック（一覧タブ）：取得済みキャッシュを辞書として眺める ---
function lawrefStockList() {
  const cache = lawrefLoadCache();
  return Object.keys(cache).map(key => {
    const sep = key.indexOf('|');
    const lid = sep === -1 ? key : key.slice(0, sep);
    const rest = sep === -1 ? '' : key.slice(sep + 1);
    const dash = rest.indexOf('-');
    const num = dash === -1 ? rest : rest.slice(0, dash);
    const branch = dash === -1 ? null : rest.slice(dash + 1);
    const lawName = (LAWREF_LAWS[lid] && LAWREF_LAWS[lid].name) || lid;
    return Object.assign({
      key: key, lid: lid, num: num, branch: branch,
      label: lawName + num + '条' + (branch ? 'の' + branch : '')
    }, cache[key]);
  }).sort((a, b) => (b.at || 0) - (a.at || 0));
}
function renderLawStockPage() {
  const area = document.getElementById('lawStockArea');
  if (!area) return;
  const list = lawrefStockList();
  const countEl = document.getElementById('lawStockProgress');
  if (countEl) countEl.textContent = list.length > 0 ? list.length + '件' : '';
  if (list.length === 0) {
    area.innerHTML = '<div class="quizEmpty">まだ取得した条文がありません。論証本文の条文リンクを押すとここに集まります。</div>';
    return;
  }
  area.innerHTML = list.map(item => {
    const firstPara = (item.paras && item.paras[0] && item.paras[0].text) || '';
    const snippet = firstPara.length > 60 ? firstPara.slice(0, 60) + '…' : firstPara;
    return '<div class="lawStockCard" data-key="' + escapeHtml(item.key) + '">'
      + '<div class="lawStockTitle">📜 ' + escapeHtml(item.label) + '</div>'
      + (item.caption ? '<div class="lawStockCaption">' + escapeHtml(item.caption) + '</div>' : '')
      + (snippet ? '<div class="lawStockSnippet">' + escapeHtml(snippet) + '</div>' : '')
      + '<div class="bookActionsRow">'
      + '<button type="button" class="lawStockViewBtn" data-key="' + escapeHtml(item.key) + '">📖 表示</button>'
      + '<button type="button" class="lawStockDeleteBtn" data-key="' + escapeHtml(item.key) + '">🗑️ 削除</button>'
      + '</div>'
      + '</div>';
  }).join('');
}
function initLawStockFeature() {
  const area = document.getElementById('lawStockArea');
  const clearBtn = document.getElementById('lawStockClearBtn');
  if (!area) return;
  area.addEventListener('click', (e) => {
    const viewBtn = e.target.closest('.lawStockViewBtn');
    if (viewBtn) {
      const item = lawrefStockList().find(x => x.key === viewBtn.dataset.key);
      if (!item) return;
      const span = document.createElement('span');
      span.setAttribute('data-lid', item.lid);
      span.setAttribute('data-num', String(item.num));
      if (item.branch) span.setAttribute('data-branch', String(item.branch));
      span.setAttribute('data-label', item.label);
      openLawRefPopup(span);
      return;
    }
    const delBtn = e.target.closest('.lawStockDeleteBtn');
    if (delBtn) {
      const cache = lawrefLoadCache();
      if (!cache[delBtn.dataset.key]) return;
      delete cache[delBtn.dataset.key];
      lawrefSaveCache(cache);
      renderLawStockPage();
      status.textContent = '🗑️ 条文ストックから削除しました。';
    }
  });
  if (clearBtn) clearBtn.addEventListener('click', () => {
    if (Object.keys(lawrefLoadCache()).length === 0) return;
    if (!confirm('取得済みの条文ストックをすべて削除しますか？（条文リンクから再取得できます）')) return;
    lawrefSaveCache({});
    renderLawStockPage();
    status.textContent = '🗑️ 条文ストックをすべて削除しました。';
  });
  renderLawStockPage();
}
initLawStockFeature();
// 論証本文中の条文リンク（span.lawRef）のタップを拾う委任リスナー
document.addEventListener('click', (e) => {
  const ref = e.target.closest ? e.target.closest('.lawRef') : null;
  if (ref) {
    if (loadLawRefView() === 'inline') toggleLawRefInline(ref);
    else openLawRefPopup(ref);
    return;
  }
  if (e.target.closest && (e.target.closest('#lawModalCloseBtn') || e.target.id === 'lawModalOverlay')) {
    closeLawRefPopup();
  }
});

// --- 設定画面（表示方法の切替） ---
function renderLawRefViewSetting() {
  const radios = document.querySelectorAll('input[name="lawRefView"]');
  if (!radios || radios.length === 0) return;
  const current = loadLawRefView();
  radios.forEach(r => { r.checked = (r.value === current); });
}
function initLawRefFeature() {
  document.querySelectorAll('input[name="lawRefView"]').forEach(r => {
    r.addEventListener('change', () => {
      if (!r.checked) return;
      saveLawRefView(r.value);
      status.textContent = r.value === 'inline'
        ? '📜 条文リンクの表示を「その場に展開」にしました。'
        : '📜 条文リンクの表示を「ポップアップ」にしました。';
    });
  });
  if (typeof registerSettingsPageRenderer === 'function') registerSettingsPageRenderer(renderLawRefViewSetting);
}
initLawRefFeature();
/* ▲▲▲ 新規追加：条文参照機能 ここまで ▲▲▲ */
