/* ▼▼▼ 新規追加：論証の直接編集機能（既存の変数・関数名と一切重複しない名前空間で実装） ▼▼▼ */
function getExistingBodyColors() {
  const colors = new Set();
  entries.forEach(en => {
    if (!en.bodyHtml) return;
    for (const m of en.bodyHtml.matchAll(/color:\s*(#[0-9A-Fa-f]{3,8})/g)) colors.add(m[1].toLowerCase());
  });
  return [...colors];
}
function editRgbToHex(str) {
  if (!str) return null;
  const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (m) {
    const h = n => Number(n).toString(16).padStart(2, '0');
    return '#' + h(m[1]) + h(m[2]) + h(m[3]);
  }
  if (/^#/.test(str)) return str.toLowerCase();
  return null;
}
function sanitizeEditedBodyHtml(container, allowedColors) {
  let out = '';
  container.childNodes.forEach(child => {
    if (child.nodeType === 3) {
      out += escapeHtml(child.nodeValue || '');
    } else if (child.nodeType === 1) {
      const tag = child.tagName.toLowerCase();
      if (tag === 'br') { out += '<br>'; return; }
      const inner = sanitizeEditedBodyHtml(child, allowedColors);
      if (tag === 'div' || tag === 'p') {
        out += (out ? '<br>' : '') + inner;
        return;
      }
      const hex = child.style ? editRgbToHex(child.style.color) : null;
      const fw = child.style ? child.style.fontWeight : '';
      const isBold = tag === 'b' || tag === 'strong' || fw === 'bold' || Number(fw) >= 700;
      const isUnbold = fw === 'normal' || Number(fw) === 400;
      let content = inner;
      if (isBold && !isUnbold) content = '<b>' + content + '</b>';
      if (hex && allowedColors.has(hex)) content = '<span style="color:' + hex + ';">' + content + '</span>';
      out += content;
    }
  });
  return out;
}
function bodyHtmlToPlainText(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html.replace(/<br\s*\/?>/gi, '\n');
  return tmp.textContent || '';
}
function buildBodyEditorHtml(e, idx) {
  const colors = getExistingBodyColors();
  const swatches = colors.map(c => '<span class="editColorSwatch" data-color="' + c + '" style="background:' + c + ';" title="' + c + '"></span>').join('');
  return '<div class="editBodyWrap">'
    + '<div class="editColorToolbar"><span class="editBoldBtn" title="太字（Ctrl+B / Cmd+Bで切替）">B</span>' + swatches + '<span class="editColorClearBtn" title="文字色をクリア">色なし</span></div>'
    + '<div class="editBodyArea" contenteditable="true" data-idx="' + idx + '">' + (e.bodyHtml || escapeHtml(e.body || '')) + '</div>'
    + '<div class="editTagsRow"><label>🏷 タグ（カンマ区切り）</label>'
    + '<input type="text" class="editTagsInput" data-idx="' + idx + '" value="' + escapeHtml((e.tags || []).join(', ')) + '" placeholder="例：物権, 対抗要件"></div>'
    + '<div class="editActionsRow">'
    + '<button type="button" class="editSaveBtn" data-idx="' + idx + '">💾 保存</button>'
    + '<button type="button" class="editCancelBtn" data-idx="' + idx + '">✖ キャンセル</button>'
    + '</div>'
    + '</div>';
}
function buildEntryTagsBlockHtml(e) {
  const tags = e.tags || [];
  let html = '';
  if (tags.length) {
    html += '<div class="entryTagsRow">' + tags.map(t =>
      '<span class="entryTagChip" data-tag="' + escapeHtml(t) + '" title="このタグで絞り込む">🏷 ' + escapeHtml(t) + '</span>'
    ).join('') + '</div>';
  }
  const related = getRelatedEntries(e);
  if (related.length) {
    html += '<div class="relatedEntriesRow"><span class="relatedEntriesLabel">🔗 関連論証（' + related.length + '件）：</span>'
      + related.map(r => '<span class="relatedEntryLink" data-title="' + escapeHtml(r.title) + '">' + escapeHtml(r.title) + '</span>').join('、')
      + '</div>';
  }
  return html;
}
const SYNC_CONFLICT_KEY = 'ronshoSyncConflictsV1';
// 確認済みにしてバナーを消す。キー自体を消すため、同期で他端末にも伝わる
window.ronshoClearSyncConflicts = () => {
  localStorage.removeItem(SYNC_CONFLICT_KEY);
  if (window.ronshoSyncNotifyChange) window.ronshoSyncNotifyChange();
  renderSyncConflictBanner();
};
function renderSyncConflictBanner() {
  const banner = document.getElementById('syncConflictBanner');
  if (!banner) return;
  let conflicts = [];
  try { conflicts = JSON.parse(localStorage.getItem(SYNC_CONFLICT_KEY) || '[]'); } catch (_) { conflicts = []; }
  if (!conflicts.length) {
    banner.innerHTML = '';
    banner.classList.remove('visible');
    return;
  }
  banner.classList.add('visible');
  banner.innerHTML = '⚠️ 同期の編集競合をマージしました（<strong>' + conflicts.length + '件</strong>）。内容を確認する場合は重複チェックへ '
    + '<button type="button" id="syncConflictResolveBtn">🔍 重複チェックで確認する</button>'
    + '<span class="syncConflictDismissBtn" id="syncConflictDismissBtn">✖</span>';
}
function toggleCompare(title) {
  const i = compareList.indexOf(title);
  if (i !== -1) {
    compareList.splice(i, 1);
  } else {
    compareList.push(title);
    if (compareList.length > 2) compareList.shift();
  }
  renderCompareBar();
  renderStudyTable(entries);
}
function renderCompareBar() {
  const bar = document.getElementById('compareBar');
  if (!bar) return;
  if (compareList.length === 0) {
    bar.innerHTML = '';
    bar.classList.remove('visible');
    return;
  }
  bar.classList.add('visible');
  bar.innerHTML = '<span class="compareBarLabel">⚖️ 比較：' + compareList.map(t => escapeHtml(t)).join(' ／ ') + '</span>'
    + (compareList.length === 2
      ? '<button type="button" id="compareOpenBtn">比較を表示</button>'
      : '<span class="compareBarHint">あと1件選ぶと比較できます</span>')
    + '<button type="button" id="compareClearBtn">✖ クリア</button>';
}
function openCompareModal() {
  if (compareList.length !== 2) return;
  compareModalOpen = true;
  renderCompareModal();
}
function closeCompareModal() {
  compareModalOpen = false;
  renderCompareModal();
}
function renderCompareModal() {
  const root = document.getElementById('compareModalRoot');
  if (!root) return;
  if (!compareModalOpen || compareList.length !== 2) {
    root.innerHTML = '';
    return;
  }
  const [t1, t2] = compareList;
  const e1 = entries.find(x => x.title === t1);
  const e2 = entries.find(x => x.title === t2);
  if (!e1 || !e2) {
    root.innerHTML = '';
    return;
  }
  const col = (e) => '<div class="compareCol">'
    + '<div class="compareColTitle">' + buildImportanceStarsHtml(e.importance) + escapeHtml(e.title) + '</div>'
    + '<div class="compareColMeta">' + escapeHtml(e.subject || '') + ' ｜ ' + escapeHtml(e.category || '') + '</div>'
    + '<div class="compareColBody">' + e.bodyHtml + '</div>'
    + buildEntryTagsBlockHtml(e)
    + '</div>';
  root.innerHTML = '<div class="compareModalOverlay" id="compareModalOverlay">'
    + '<div class="compareModalBox">'
    + '<div class="compareModalHeader"><span>⚖️ 論証の比較</span><span class="compareModalCloseBtn" id="compareModalCloseBtn">✖</span></div>'
    + '<div class="compareModalBody">' + col(e1) + col(e2) + '</div>'
    + '</div>'
    + '</div>';
}
function parseTagsInputValue(v) {
  return (v || '').split(/[,、，]/).map(t => t.trim()).filter(Boolean).filter((t, i, arr) => arr.indexOf(t) === i);
}
function applyBodyEditorColor(color) {
  document.execCommand('styleWithCSS', false, true);
  document.execCommand('foreColor', false, color);
}
function applyBodyEditorBold() {
  document.execCommand('styleWithCSS', false, true);
  document.execCommand('bold');
}
function handleBodyEditorKeydown(evt) {
  const key = (evt.key || '').toLowerCase();
  if ((evt.ctrlKey || evt.metaKey) && key === 'b') {
    evt.preventDefault();
    applyBodyEditorBold();
  }
}
function saveEntryEdit(idx) {
  const ent = entries[idx];
  if (!ent) return;
  const titleInput = document.querySelector('.editTitleInput[data-idx="' + idx + '"]');
  const bodyArea = document.querySelector('.editBodyArea[data-idx="' + idx + '"]');
  const tagsInput = document.querySelector('.editTagsInput[data-idx="' + idx + '"]');
  if (!titleInput || !bodyArea) return;
  const newTitle = titleInput.value.trim();
  if (!newTitle) { alert('タイトルを入力してください。'); return; }
  const allowedColors = new Set(getExistingBodyColors());
  const newBodyHtml = sanitizeEditedBodyHtml(bodyArea, allowedColors);
  const newBodyText = bodyHtmlToPlainText(newBodyHtml);
  const oldTitle = ent.title;
  ent.title = newTitle;
  ent.body = newBodyText;
  ent.bodyHtml = newBodyHtml;
  ent.hasManualBodyEdit = true;
  ent.tags = tagsInput ? parseTagsInputValue(tagsInput.value) : (ent.tags || []);
  if (oldTitle !== newTitle) {
    if (studyLog[oldTitle]) {
      if (studyLog[newTitle]) {
        const a = studyLog[newTitle], b = studyLog[oldTitle];
        studyLog[newTitle] = {
          ...a,
          history: dupMergeHistoryArrays(a.history, b.history),
          confidenceHistory: mergeConfidenceHistoryArrays(a.confidenceHistory, b.confidenceHistory),
          updatedAt: latestUpdatedAt(a.updatedAt, b.updatedAt),
          memorized: !!(a.memorized || b.memorized),
          starred: !!(a.starred || b.starred),
          bookmarked: !!(a.bookmarked || b.bookmarked),
          skipped: !!(a.skipped || b.skipped),
          confidence: a.confidence || b.confidence || null,
          memo: a.memo || b.memo || ''
        };
      } else {
        studyLog[newTitle] = studyLog[oldTitle];
      }
      delete studyLog[oldTitle];
    }
    if (expandedBodySet.has(oldTitle)) {
      expandedBodySet.delete(oldTitle);
      expandedBodySet.add(newTitle);
    }
  }
  saveEntries();
  saveStudyLog();
  editingEntryTitle = null;
  status.textContent = '✏️ 「' + newTitle + '」を更新しました。';
  renderAll(true);
}
/* ▼▼▼ 新規追加：論証の個別削除機能（ホーム画面・問題演習の右上アイコンから） ▼▼▼ */
function deleteEntryConfirmed(ent) {
  if (!ent) return false;
  if (!confirm('「' + ent.title + '」を削除しますか？（学習記録・暗記度・苦手フラグなどは削除されません）')) return false;
  entries = entries.filter(x => x !== ent);
  const qi = quizPool.indexOf(ent);
  if (qi !== -1) {
    quizPool.splice(qi, 1);
    if (qi <= quizIndex && quizIndex > 0) quizIndex--;
    if (quizIndex >= quizPool.length) quizIndex = Math.max(0, quizPool.length - 1);
    quizRevealed = false;
  }
  saveEntries();
  if (editingEntryTitle === ent.title) editingEntryTitle = null;
  status.textContent = '🗑 「' + ent.title + '」を削除しました。';
  return true;
}
/* ▲▲▲ 新規追加：論証の個別削除機能 ここまで ▲▲▲ */
/* ▲▲▲ 新規追加：論証の直接編集機能 ここまで ▲▲▲ */
