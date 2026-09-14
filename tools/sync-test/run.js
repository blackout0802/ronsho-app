#!/usr/bin/env node
// 同期ロジック(drive-sync.js)と重複チェック(js/duplicate-check.js)の自動テスト。
// アプリの実ファイルをそのまま Node の vm に読み込み、localStorage / fetch(GAS) / DOM を
// スタブに差し替えて検証する。実行: node tools/sync-test/run.js
//
// 同期の設計（v21.64〜）: 端末間のデータはマージ（統合）せず、
// 「クラウドを唯一の正本とし、片方だけが変わっていれば丸ごと採用、
// 　両方が変わっていれば確認ポップアップでユーザーに選んでもらう」方式。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const driveSyncCode = fs.readFileSync(path.join(ROOT, 'drive-sync.js'), 'utf8');
const dupCheckCode = fs.readFileSync(path.join(ROOT, 'js', 'duplicate-check.js'), 'utf8');

const deepCopy = x => JSON.parse(JSON.stringify(x));
let failures = 0;
function check(label, cond, detail) {
  console.log((cond ? '  ✅ ' : '  ❌ ') + label + (detail != null ? ' — ' + detail : ''));
  if (!cond) failures++;
}

// ---- スタブ ----
function makeStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    clear: () => { m.clear(); }
  };
}

// 簡易DOM: id付き要素の innerHTML / onclick だけを再現する
function makeElements() {
  const elements = new Map();
  const getEl = id => {
    if (!elements.has(id)) {
      elements.set(id, {
        id, _innerHTML: '', onclick: null,
        get innerHTML() { return this._innerHTML; },
        set innerHTML(html) {
          this._innerHTML = html;
          // innerHTMLの再代入で子要素は消える扱いにする(実DOMの挙動を簡易再現)
          for (const [k] of elements) {
            if (k !== id && k.startsWith(id + '::')) elements.delete(k);
          }
        },
        textContent: '',
        style: {},
        addEventListener: () => {},
        classList: { add: () => {}, remove: () => {} }
      });
    }
    return elements.get(id);
  };
  return { elements, getEl };
}

// GAS(コード.gs)の doGet / doPost を忠実に再現したモック
function makeMockGas(initial) {
  const gas = {
    store: initial ? deepCopy(initial) : { revision: 0, updatedAt: '2026-08-25T00:00:00.000Z', data: {} },
    failNextPost: 0,
    conflictWithoutLatestOnce: false,
    postCount: 0
  };
  gas.fetchImpl = async (url, opts) => {
    if (!opts || opts.method !== 'POST') {
      return { ok: true, json: async () => deepCopy(gas.store) };
    }
    gas.postCount++;
    if (gas.failNextPost > 0) { gas.failNextPost--; return { ok: false, json: async () => ({}) }; }
    const req = JSON.parse(opts.body);
    if (gas.conflictWithoutLatestOnce) {
      gas.conflictWithoutLatestOnce = false;
      return { ok: true, json: async () => ({ ok: false, reason: 'conflict' }) };
    }
    if (req.revision !== gas.store.revision) {
      return { ok: true, json: async () => ({ ok: false, reason: 'conflict', latest: deepCopy(gas.store) }) };
    }
    gas.store = { revision: gas.store.revision + 1, updatedAt: '2026-08-25T00:00:00.000Z', data: deepCopy(req.data) };
    return { ok: true, json: async () => ({ ok: true, result: deepCopy(gas.store) }) };
  };
  return gas;
}

// drive-sync.js を1つの「端末」として読み込む。withDom=true で確認ポップアップの検証もできる
function loadDevice(gas, opts) {
  opts = opts || {};
  const storage = makeStorage();
  const { elements, getEl } = makeElements();
  let confirmReturn = !!opts.confirmReturnsUseCloud;
  const sandbox = {
    console,
    localStorage: storage,
    navigator: { onLine: true },
    window: { addEventListener: () => {} },
    document: {
      getElementById: opts.withDom === false ? (() => null) : getEl,
      addEventListener: () => {}, visibilityState: 'hidden'
    },
    status: { after: () => {} },
    confirm: (msg) => { sandbox.__lastConfirmMsg = msg; return confirmReturn; },
    // 実アプリのjs/core.jsのsaveEntries()を模したスタブ。applyRemoteData()内から
    // 呼ばれた際に、都度同期フックが誤って反応しないかを検証するために使う
    saveEntries: () => { if (typeof sandbox.window.ronshoSyncNotifyChange === 'function') sandbox.window.ronshoSyncNotifyChange(); },
    fetch: gas ? gas.fetchImpl : (async () => { throw new Error('fetch未設定'); }),
    setInterval: () => 0,
    setTimeout: () => 0,
    clearTimeout: () => {}
  };
  vm.createContext(sandbox);
  vm.runInContext(driveSyncCode, sandbox, { filename: 'drive-sync.js' });
  const api = sandbox.window.__ronshoSyncTest;
  const setLocal = (key, value) => storage.setItem(key, JSON.stringify(value));
  const getLocal = (key, dflt) => { const v = storage.getItem(key); return v == null ? dflt : JSON.parse(v); };
  return { api, storage, elements, getEl, setLocal, getLocal, sandbox, setConfirmReturnsUseCloud: v => { confirmReturn = v; } };
}

const K = {
  entries: 'ronshoEntries',
  studyLog: 'ronshoStudyLog',
  dupArchive: 'ronshoDupArchiveV1',
  revision: 'ronshoSyncRevisionV1'
};

const mkEntry = (title, body, subject) => ({ title, body, subject });

function makeCloudStore(entries, revision) {
  return {
    revision: revision || 10,
    updatedAt: '2026-08-25T00:00:00.000Z',
    data: { schemaVersion: 4, entries, studyLog: {}, manualLog: {}, pastExamLogs: [], countdowns: [], dupArchive: [], dupResolved: [], speechDict: [], dailyStats: {}, dailyGoal: null }
  };
}

console.log('=== 同期フロー(E2E)試験: マージせず「片方だけ変更なら採用／両方変更なら確認」方式 ===');

async function e2e() {
  console.log('\n■ E0: 真っさらな端末が既にデータのあるクラウドに初めて繋いだ場合、競合ポップアップを出さずそのまま採用する');
  {
    const cloud = makeCloudStore([mkEntry('民法A', '本文A', '民法'), mkEntry('民法B', '本文B', '民法')], 10);
    const gas = makeMockGas(cloud);
    const dev = loadDevice(gas);
    // setLocalを一切呼ばない＝この端末は本当に何も持っていない（revision=0, last=''）
    await dev.api.pullFromCloud(true);
    check('確認ポップアップは表示されない', dev.getEl('driveSyncConflictModal').innerHTML === '');
    check('クラウドの内容がそのまま反映される', dev.getLocal(K.entries, []).length === 2);
    check('revisionがクラウドに追従する', dev.api.getRevision() === 10);
  }

  console.log('\n■ E1: 通常のpush（誰とも競合していない）で revision が進み、クラウドが端末の内容で上書きされる');
  {
    const cloud = makeCloudStore([mkEntry('民法A', '本文A', '民法')], 10);
    const gas = makeMockGas(cloud);
    const dev = loadDevice(gas);
    dev.setLocal(K.entries, [mkEntry('民法A', '本文A', '民法'), mkEntry('民法B', '本文B', '民法')]);
    dev.api.setRevision(cloud.revision);
    await dev.api.pushToCloud();
    check('push成功でrevisionが進む', dev.api.getRevision() === cloud.revision + 1, `revision=${dev.api.getRevision()}`);
    check('クラウドが端末の内容で丸ごと上書きされる', gas.store.data.entries.length === 2);
  }

  console.log('\n■ E2: クラウド・端末ともに変更なし → 何もしない');
  {
    const cloud = makeCloudStore([mkEntry('民法A', '本文A', '民法')], 10);
    const gas = makeMockGas(cloud);
    const dev = loadDevice(gas);
    dev.setLocal(K.entries, cloud.data.entries);
    dev.api.setRevision(cloud.revision);
    dev.api.markSynced(dev.api.snapshot());
    await dev.api.pullFromCloud(false);
    check('revisionは変わらない', dev.api.getRevision() === cloud.revision);
    check('クラウドへのpushは発生しない', gas.store.revision === cloud.revision);
  }

  console.log('\n■ E3: クラウドだけが更新されている（この端末は無変更）→ そのままクラウドを採用する');
  {
    const cloud = makeCloudStore([mkEntry('民法A', '本文A', '民法'), mkEntry('民法C（他端末で追加）', '本文C', '民法')], 11);
    const gas = makeMockGas(cloud);
    const dev = loadDevice(gas);
    // この端末は revision=10 時点の状態のまま何も変えていない
    dev.setLocal(K.entries, [mkEntry('民法A', '本文A', '民法')]);
    dev.api.setRevision(10);
    dev.api.markSynced(dev.api.snapshot());
    await dev.api.pullFromCloud(false);
    check('revisionがクラウドに追従する', dev.api.getRevision() === 11);
    check('クラウドの内容がそのまま反映される', dev.getLocal(K.entries, []).some(e => e.title === '民法C（他端末で追加）'));
  }

  console.log('\n■ E3b: クラウドだけが更新されているが、論証が大きく減っている（例: 空になっている）場合は、この端末に変更が無くても確認なしでは採用しない');
  {
    const cloud = makeCloudStore([], 11);
    const gas = makeMockGas(cloud);
    const dev = loadDevice(gas);
    // この端末は revision=10 時点の状態のまま何も変えていない（論証が複数ある）
    dev.setLocal(K.entries, [mkEntry('民法A', '本文A', '民法'), mkEntry('民法B', '本文B', '民法')]);
    dev.api.setRevision(10);
    dev.api.markSynced(dev.api.snapshot());
    await dev.api.pullFromCloud(false);
    check('この端末に変更が無くても、確認なしでは上書きしない（revisionは据え置き）', dev.api.getRevision() === 10);
    check('この端末の論証は消えずに残る', dev.getLocal(K.entries, []).length === 2);
    const modalHtml = dev.getEl('driveSyncConflictModal').innerHTML;
    check('確認ポップアップが表示される', modalHtml.includes('driveSyncConfirmMergeBtn'));
  }

  console.log('\n■ E4: 両方で変更＝本当の競合 → 自動統合せず、項目ごとに選べる確認ポップアップを出す');
  {
    const cloud = makeCloudStore([mkEntry('民法A', '本文A', '民法'), mkEntry('クラウド側の新規', '本文cloud', '民法')], 11);
    const gas = makeMockGas(cloud);
    const dev = loadDevice(gas);
    dev.setLocal(K.entries, [mkEntry('民法A', '本文A', '民法')]);
    dev.api.setRevision(10);
    dev.api.markSynced(dev.api.snapshot());
    // この端末側でオフライン中に変更（同期前）
    dev.setLocal(K.entries, [mkEntry('民法A', '本文A', '民法'), mkEntry('端末側の新規', '本文local', '民法')]);
    await dev.api.pullFromCloud(false);
    const modalHtml = dev.getEl('driveSyncConflictModal').innerHTML;
    check('確認ポップアップが表示される（項目ごとの選択ボタン・まとめて選ぶボタン・確定ボタンがある）',
      modalHtml.includes('diffChoiceBtn') && modalHtml.includes('driveSyncQuickAllLocalBtn') && modalHtml.includes('driveSyncConfirmMergeBtn'));
    check('まだ自動では上書きされない（revisionは据え置き）', dev.api.getRevision() === 10);

    console.log('\n  ▶ E4-a: 「すべてこの端末」→ 確定 を選ぶ → 端末の内容でクラウドを上書き');
    dev.getEl('driveSyncQuickAllLocalBtn').onclick();
    await dev.getEl('driveSyncConfirmMergeBtn').onclick();
    check('revisionがクラウドに確定する', dev.api.getRevision() === gas.store.revision);
    check('クラウドが端末側の内容になる', gas.store.data.entries.some(e => e.title === '端末側の新規') && !gas.store.data.entries.some(e => e.title === 'クラウド側の新規'));
  }

  console.log('\n■ E4c: 競合時の既定選択は、一括で片方を捨てるのではなく、なるべく両方の内容を残す');
  {
    const dev = loadDevice(null);
    const local = { entries: [mkEntry('端末側だけの新規', '本文local', '民法'), mkEntry('共通A', '同じ本文', '民法'), mkEntry('編集された論点', 'ローカル版', '民法')], studyLog: {} };
    const remote = { entries: [mkEntry('クラウド側だけの新規', '本文cloud', '民法'), mkEntry('共通A', '同じ本文', '民法'), mkEntry('編集された論点', 'クラウド版', '民法')], studyLog: {} };
    const diff = dev.api.computeSyncDiff(local, remote);
    // 何も選ばない（selectionsが空）＝各グループの既定値のまま確定した場合
    const merged = dev.api.buildManualMergeSnapshot(diff, local, remote, new Map(), 'local');
    check('既定では、端末にしかない論証も残る', merged.entries.some(e => e.title === '端末側だけの新規'));
    check('既定では、クラウドにしかない論証も取り込まれる', merged.entries.some(e => e.title === 'クラウド側だけの新規'));
    check('共通の論証は重複しない', merged.entries.filter(e => e.title === '共通A').length === 1);
    check('本文が競合する論証は、既定でこの端末の内容になる', merged.entries.find(e => e.title === '編集された論点').body === 'ローカル版');
  }

  console.log('\n■ E4d: 項目ごとに個別選択できる（この論証だけクラウドを採用し、他はこの端末のまま）');
  {
    const dev = loadDevice(null);
    const local = {
      entries: [mkEntry('論点1（ローカルのまま）', 'ローカル版1', '民法'), mkEntry('論点2（クラウドを採用）', 'ローカル版2', '民法')],
      studyLog: { '論点3': { memorized: false, history: ['2026-08-20'] } }
    };
    const remote = {
      entries: [mkEntry('論点1（ローカルのまま）', 'クラウド版1', '民法'), mkEntry('論点2（クラウドを採用）', 'クラウド版2', '民法')],
      studyLog: { '論点3': { memorized: true, history: ['2026-08-20', '2026-08-21', '2026-08-22'] } }
    };
    const diff = dev.api.computeSyncDiff(local, remote);
    check('本文が違う論証が2件、学習記録が違う論証が1件、それぞれ別項目として検出される',
      diff.groups.find(g => g.kind === 'edited').titles.length === 2 && diff.groups.find(g => g.kind === 'studyLog').titles.length === 1);
    // 「論点2」の本文だけクラウドを選び、「論点3」の学習記録もクラウドを選ぶ。
    // 「論点1」はあえて選択せず、既定（この端末）のままにする
    const selections = new Map([['edited|論点2（クラウドを採用）', 'cloud'], ['studyLog|論点3', 'cloud']]);
    const merged = dev.api.buildManualMergeSnapshot(diff, local, remote, selections, 'local');
    check('選ばなかった論点1は、この端末の内容のまま', merged.entries.find(e => e.title === '論点1（ローカルのまま）').body === 'ローカル版1');
    check('選んだ論点2だけ、クラウドの内容に差し替わる', merged.entries.find(e => e.title === '論点2（クラウドを採用）').body === 'クラウド版2');
    check('選んだ論点3の学習記録だけ、クラウドの内容になる', merged.studyLog['論点3'].memorized === true && merged.studyLog['論点3'].history.length === 3);
  }

  console.log('\n■ E4b: 論証・学習記録は同じでも、他の項目（カウントダウン等）が違う場合はそれを案内する（「違いなし」と誤解させない）');
  {
    const dev = loadDevice(null);
    const sameEntries = [mkEntry('民法A', '本文A', '民法')];
    const sameLog = { '民法A': { memorized: true, history: ['2026-08-20'] } };
    const local = { entries: sameEntries, studyLog: sameLog, countdowns: [{ id: 'c1', label: '予備試験', date: '2027-05-01' }], manualLog: {}, pastExamLogs: [], dupArchive: [], dupResolved: [], speechDict: [], dailyGoal: null };
    const remote = { entries: sameEntries, studyLog: sameLog, countdowns: [], manualLog: {}, pastExamLogs: [], dupArchive: [], dupResolved: [], speechDict: [], dailyGoal: null };
    const diff = dev.api.computeSyncDiff(local, remote);
    check('論証・学習記録のグループは無い', diff.groups.length === 0);
    check('カウントダウンの差は検出される', diff.otherFieldLabels.some(l => l.includes('カウントダウン')));
  }

  console.log('\n■ E5: 競合ポップアップで「すべてクラウド」→ 確定 を選ぶ → 端末側がクラウドの内容で上書きされる');
  {
    const cloud = makeCloudStore([mkEntry('民法A', '本文A', '民法'), mkEntry('クラウド側の新規', '本文cloud', '民法')], 11);
    const gas = makeMockGas(cloud);
    const dev = loadDevice(gas);
    dev.setLocal(K.entries, [mkEntry('民法A', '本文A', '民法')]);
    dev.api.setRevision(10);
    dev.api.markSynced(dev.api.snapshot());
    dev.setLocal(K.entries, [mkEntry('民法A', '本文A', '民法'), mkEntry('端末側の新規', '本文local', '民法')]);
    await dev.api.pullFromCloud(false);
    dev.getEl('driveSyncQuickAllCloudBtn').onclick();
    await dev.getEl('driveSyncConfirmMergeBtn').onclick();
    check('端末側の未同期の変更は破棄され、クラウドの内容になる', dev.getLocal(K.entries, []).some(e => e.title === 'クラウド側の新規') && !dev.getLocal(K.entries, []).some(e => e.title === '端末側の新規'));
    // 「すべてクラウド」を選んでも、内部的には選んだ内容を改めて保存し直す
    // （マージ）ため、押す前と中身が同じでもrevisionは1つ進む
    check('revisionがクラウドに確定する', dev.api.getRevision() === gas.store.revision);
  }

  console.log('\n■ E6: push時のレース（送信直前に他がpush済み）でも自動統合せず確認ポップアップを出す');
  {
    const cloud = makeCloudStore([mkEntry('民法A', '本文A', '民法')], 10);
    const gas = makeMockGas(cloud);
    const dev = loadDevice(gas);
    dev.setLocal(K.entries, [mkEntry('民法A', '本文A', '民法'), mkEntry('端末側の新規', '本文local', '民法')]);
    dev.api.setRevision(9); // 古いrevisionのまま(直前に別の変更がpushされていた状況)
    await dev.api.pushToCloud();
    check('クラウドは上書きされない', gas.store.revision === cloud.revision, `cloud.revision=${gas.store.revision}`);
    check('確認ポップアップが表示される', dev.getEl('driveSyncConflictModal').innerHTML.includes('driveSyncConflictBox'));
  }

  console.log('\n■ E6b: 学習中（直近の学習記録の更新から間もない）は、競合してもポップアップを出さずこの端末を優先して自動マージする（pullFromCloud）');
  {
    const cloud = makeCloudStore([mkEntry('民法A', '本文A', '民法'), mkEntry('クラウド側の新規', '本文cloud', '民法')], 11);
    const gas = makeMockGas(cloud);
    const dev = loadDevice(gas);
    dev.setLocal(K.entries, [mkEntry('民法A', '本文A', '民法')]);
    dev.api.setRevision(10);
    dev.api.markSynced(dev.api.snapshot());
    // この端末側でオフライン中に変更（同期前）。studyLogのupdatedAtを「たった今」にして学習中を再現する
    dev.setLocal(K.entries, [mkEntry('民法A', '本文A', '民法'), mkEntry('端末側の新規', '本文local', '民法')]);
    dev.setLocal(K.studyLog, { '民法A': { memorized: true, history: ['2026-08-25'], updatedAt: new Date().toISOString() } });
    check('学習中と判定される', dev.api.isActivelyStudying() === true);
    await dev.api.pullFromCloud(false);
    check('確認ポップアップは表示されない', dev.getEl('driveSyncConflictModal').innerHTML === '');
    check('端末側の内容は残る', dev.getLocal(K.entries, []).some(e => e.title === '端末側の新規'));
    check('クラウド側にしかなかった論証も自動的に取り込まれる（既定のマージ結果と同じ）', dev.getLocal(K.entries, []).some(e => e.title === 'クラウド側の新規'));
    check('revisionはクラウドに確定する', dev.api.getRevision() === gas.store.revision);
  }

  console.log('\n■ E6c: 学習中でも、自動マージが立て続けに競合し続ける想定外の状況では、最終的に確認ポップアップにフォールバックする');
  {
    const cloud = makeCloudStore([mkEntry('民法A', '本文A', '民法')], 10);
    const gas = makeMockGas(cloud);
    const dev = loadDevice(gas);
    dev.setLocal(K.entries, [mkEntry('民法A', '本文A', '民法'), mkEntry('端末側の新規', '本文local', '民法')]);
    dev.setLocal(K.studyLog, { '民法A': { memorized: true, history: ['2026-08-25'], updatedAt: new Date().toISOString() } });
    dev.api.setRevision(9); // 古いrevisionのまま(直前に別の変更がpushされていた状況)
    // pushのたびに必ず競合させ、自動リトライの上限に達しても解決しない状況を再現する。
    // gas.fetchImplではなく、実際にsandboxが参照しているdev.sandbox.fetchを差し替える
    // 必要がある（loadDevice()の時点でgas.fetchImplの参照値がsandboxに渡し済みのため）
    const origFetch = dev.sandbox.fetch;
    dev.sandbox.fetch = async (url, opts) => {
      if (opts && opts.method === 'POST') {
        gas.postCount++;
        return { ok: true, json: async () => ({ ok: false, reason: 'conflict', latest: deepCopy(gas.store) }) };
      }
      return origFetch(url, opts);
    };
    await dev.api.pushToCloud();
    check('自動マージが上限まで試みられても解決しなければ確認ポップアップにフォールバックする', dev.getEl('driveSyncConflictModal').innerHTML.includes('driveSyncConflictBox'));
  }

  console.log('\n■ E6d: revision番号がずれているだけで中身に実質的な違いが無い場合、確認ポップアップを出さずに黙って同期する（pushToCloud）');
  {
    // クラウドは既に revision 11 だが、中身（entries・studyLog・その他の同期項目）は
    // この端末の内容と完全に同じ。この端末側のrevisionだけが古いまま
    // （何らかの理由で更新前のrevisionを持っている）状況を再現する。
    // 「その他の同期項目」の既定値まで完全に一致させるため、一度この端末の
    // snapshot()をそのままクラウド側のデータとして使う
    const sameEntries = [mkEntry('民法A', '本文A', '民法'), mkEntry('民法B', '本文B', '民法')];
    const seedDev = loadDevice(null);
    seedDev.setLocal(K.entries, sameEntries);
    const cloud = { revision: 11, updatedAt: '2026-08-25T00:00:00.000Z', data: seedDev.api.snapshot() };
    const gas = makeMockGas(cloud);
    const dev = loadDevice(gas);
    dev.setLocal(K.entries, sameEntries);
    dev.api.setRevision(10);
    await dev.api.pushToCloud();
    check('確認ポップアップは表示されない（中身は同じなので競合として扱わない）', dev.getEl('driveSyncConflictModal').innerHTML === '');
    check('revisionはクラウドの値に追従する', dev.api.getRevision() === 11);
  }

  console.log('\n■ E6e: revision番号がずれているだけで中身に実質的な違いが無い場合、確認ポップアップを出さずに黙って同期する（pullFromCloud）');
  {
    const sameEntries = [mkEntry('民法A', '本文A', '民法')];
    const seedDev = loadDevice(null);
    seedDev.setLocal(K.entries, sameEntries);
    const cloud = { revision: 11, updatedAt: '2026-08-25T00:00:00.000Z', data: seedDev.api.snapshot() };
    const gas = makeMockGas(cloud);
    const dev = loadDevice(gas);
    dev.setLocal(K.entries, sameEntries);
    dev.api.setRevision(10);
    // markSynced()に実際とは違うスナップショットを渡し、
    // 「この端末で未同期の変更がある」と判定される状態を意図的に作る
    // （中身は実際にはクラウドと同じだが、直前の同期記録とは異なる、という状況）
    dev.api.markSynced({ entries: [mkEntry('別の内容', '別の本文', '民法')], studyLog: {} });
    check('この端末には未同期の変更があると判定される', dev.api.hasUnsyncedLocalChanges() === true);
    await dev.api.pullFromCloud(false);
    check('確認ポップアップは表示されない（中身は同じなので競合として扱わない）', dev.getEl('driveSyncConflictModal').innerHTML === '');
    check('revisionはクラウドの値に追従する', dev.api.getRevision() === 11);
  }

  console.log('\n■ E7: DOM（ポップアップ用の要素）が無い環境でも confirm() にフォールバックして動作する');
  {
    const cloud = makeCloudStore([mkEntry('民法A', '本文A', '民法'), mkEntry('クラウド側の新規', '本文cloud', '民法')], 11);
    const gas = makeMockGas(cloud);
    const dev = loadDevice(gas, { withDom: false, confirmReturnsUseCloud: true });
    dev.setLocal(K.entries, [mkEntry('民法A', '本文A', '民法')]);
    dev.api.setRevision(10);
    dev.api.markSynced(dev.api.snapshot());
    dev.setLocal(K.entries, [mkEntry('民法A', '本文A', '民法'), mkEntry('端末側の新規', '本文local', '民法')]);
    await dev.api.pullFromCloud(false);
    check('confirm()でクラウド優先を選ぶとクラウドの内容が反映される', dev.getLocal(K.entries, []).some(e => e.title === 'クラウド側の新規'));
  }

  console.log('\n■ E8: 配列の並び順だけが違うデータは「未同期の変更あり」と誤検知しない（並び順だけの違いで競合ポップアップが出ないようにする）');
  {
    const dev = loadDevice(null);
    dev.setLocal(K.entries, [mkEntry('A', '本文A', '民法'), mkEntry('B', '本文B', '民法')]);
    dev.api.markSynced(dev.api.snapshot());
    // 中身は同じだが、entries配列の並びだけを入れ替える（同期時の再取り込み等で起こりうる）
    dev.setLocal(K.entries, [mkEntry('B', '本文B', '民法'), mkEntry('A', '本文A', '民法')]);
    check('entries配列の並び順だけの違いは「変更あり」と判定しない', dev.api.hasUnsyncedLocalChanges() === false);
  }

  console.log('\n■ E8b: dupResolved（Setから復元される配列）の並び順だけの違いは「差がある項目」として案内しない');
  {
    const dev = loadDevice(null);
    const base = { entries: [], studyLog: {}, countdowns: [], manualLog: {}, pastExamLogs: [], dupArchive: [], speechDict: [], dailyGoal: null };
    const local = { ...base, dupResolved: ['sigA', 'sigB', 'sigC'] };
    const remote = { ...base, dupResolved: ['sigC', 'sigA', 'sigB'] };
    const diff = dev.api.computeSyncDiff(local, remote);
    check('並び順だけの違いはotherFieldLabelsに含まれない', diff.otherFieldLabels.length === 0, JSON.stringify(diff.otherFieldLabels));
  }

  console.log('\n■ E8c: 並び順ではなく実際に中身が違う場合は、引き続き正しく検知する');
  {
    const dev = loadDevice(null);
    const base = { entries: [], studyLog: {}, manualLog: {}, pastExamLogs: [], dupArchive: [], dupResolved: [], speechDict: [], dailyGoal: null };
    const local = { ...base, countdowns: [{ id: 'c1', label: 'X', date: '2027-01-01' }] };
    const remote = { ...base, countdowns: [] };
    const diff = dev.api.computeSyncDiff(local, remote);
    check('実際に中身が違う場合はotherFieldLabelsで検知される', diff.otherFieldLabels.some(l => l.includes('カウントダウン')));
  }

  console.log('\n■ E9: 表示テーマ・ペット設定・各画面の既定フィルタなど、新たに同期対象へ追加した端末設定も同期される');
  {
    const cloud = makeCloudStore([mkEntry('民法A', '本文A', '民法')], 10);
    const gas = makeMockGas(cloud);
    const devA = loadDevice(gas);
    devA.setLocal(K.entries, [mkEntry('民法A', '本文A', '民法')]);
    devA.api.setRevision(cloud.revision);
    // これらは生の文字列・数値のまま保存される項目なので、setLocal（JSON.stringify）
    // ではなくstorage.setItemで直接、実際のアプリと同じ形式で入れる
    devA.storage.setItem('ronshoThemeV1', 'dark');
    devA.storage.setItem('ronshoPetSpeciesV1', '2');
    devA.storage.setItem('ronshoStarFilterDefaultV1', 'weak');
    devA.storage.setItem('ronshoPastExamDefaultTypeV1', '新司法試験');
    devA.storage.setItem('ronshoQuizDefaultFiltersV1', JSON.stringify({ random: true, hideMemorized: true }));
    await devA.api.pushToCloud();

    const devB = loadDevice(gas);
    await devB.api.pullFromCloud(true);
    check('表示テーマ（生の文字列）がそのまま同期される', devB.storage.getItem('ronshoThemeV1') === 'dark');
    check('ペットの種類（生の文字列）がそのまま同期される', devB.storage.getItem('ronshoPetSpeciesV1') === '2');
    check('苦手フィルタの既定（生の文字列）がそのまま同期される', devB.storage.getItem('ronshoStarFilterDefaultV1') === 'weak');
    check('過去問ログの既定種別（日本語の生の文字列）がそのまま同期される', devB.storage.getItem('ronshoPastExamDefaultTypeV1') === '新司法試験');
    check('問題演習の既定フィルタ（JSON）が同期される', JSON.parse(devB.storage.getItem('ronshoQuizDefaultFiltersV1')).hideMemorized === true);
  }
}

// ---- duplicate-check.js の関数試験 ----
const T_DELETE = '2026-08-23T01:30:00.000Z';
const T_REVOKE = '2026-08-25T13:00:00.000Z';
const timeOf = s => { const t = Date.parse(s || ''); return isNaN(t) ? 0 : t; };
const isActive = x => timeOf(x && x.deletedAt) > timeOf(x && x.revokedAt);

function loadDupCheck(initialArchive, initialEntries) {
  const storage = makeStorage();
  storage.setItem('ronshoDupArchiveV1', JSON.stringify(initialArchive || []));
  const { getEl } = makeElements();
  const sandbox = {
    console,
    localStorage: storage,
    document: { getElementById: getEl, addEventListener: () => {} },
    entries: initialEntries || [],
    studyLog: {},
    status: { textContent: '' },
    saveEntries: () => {},
    saveStudyLog: () => {},
    renderAll: () => {},
    confirm: () => true,
    escapeHtml: s => String(s == null ? '' : s),
    formatLocalDate: () => '2026-08-25',
    buildYearHtml: () => '',
    getYearTokensPlain: () => [],
    // 「その他」タブの再描画リスナー登録先(js/core.js)。このテストでは
    // タブUI自体を検証しないため、登録だけ受け付けて何もしないスタブでよい
    registerSettingsPageRenderer: () => {}
  };
  vm.createContext(sandbox);
  vm.runInContext(dupCheckCode, sandbox, { filename: 'duplicate-check.js' });
  return { sandbox, storage, getEl };
}

console.log('\n=== duplicate-check.js: アーカイブ・復元の試験 ===');

console.log('\n■ D1: 「これだけ削除」— 完全一致ペアでは削除記録を作らない');
{
  const a = { title: '双子', body: '本文T', subject: '民法' };
  const b = { title: '双子', body: '本文T', subject: '民法' };
  const env = loadDupCheck([], [a, b]);
  const r = env.sandbox.dupDeleteOneFromPair({ a, b, reasons: new Set(['title', 'body']), score: 1 }, b, a);
  check('sameKeyと判定され記録は作られない', r.sameKey === true && JSON.parse(env.storage.getItem('ronshoDupArchiveV1')).length === 0);
  check('対象の1件だけが削除される', env.sandbox.entries.length === 1);
  const c = { title: 'キーK', body: '', subject: '刑法' };
  const d2 = { title: 'キーK', subject: '刑法' };
  const env2 = loadDupCheck([], [c, d2]);
  const r2 = env2.sandbox.dupDeleteOneFromPair({ a: c, b: d2, reasons: new Set(['title']), score: 1 }, d2, c);
  check('body空とフィールド無しもsameKey扱い', r2.sameKey === true && JSON.parse(env2.storage.getItem('ronshoDupArchiveV1')).length === 0);
  const e1 = { title: '類似A', body: '本文1', subject: '商法' };
  const e2 = { title: '類似A(修正)', body: '本文2', subject: '商法' };
  const env3 = loadDupCheck([], [e1, e2]);
  const r3 = env3.sandbox.dupDeleteOneFromPair({ a: e1, b: e2, reasons: new Set(['fuzzy']), score: 0.9 }, e2, e1);
  const saved3 = JSON.parse(env3.storage.getItem('ronshoDupArchiveV1'));
  check('非完全一致ペアは有効な削除記録を作る', r3.sameKey === false && saved3.length === 1 && isActive(saved3[0]));
}

console.log('\n■ D2: 復元は記録を取り消しつつrestoredAtを付けて論証を戻す');
{
  const archived = [{ entry: { title: '復元対象', body: '本文R', subject: '商法' }, deletedAt: T_DELETE, reason: 'x' }];
  const { sandbox, storage } = loadDupCheck(archived, []);
  sandbox.loadDupArchive();
  sandbox.dupRestoreArchivedEntry(0);
  check('entriesにrestoredAt付きで戻る', sandbox.entries.length === 1 && !!sandbox.entries[0].restoredAt);
  const saved = JSON.parse(storage.getItem('ronshoDupArchiveV1'));
  check('記録は残るが取り消し済みになる', saved.length === 1 && !isActive(saved[0]));
  check('取り消しが削除より新しい', timeOf(saved[0].revokedAt) > timeOf(saved[0].deletedAt));
}

console.log('\n■ D3: アーカイブ一覧は有効な記録だけを表示し、ボタンの添字は元配列を指す');
{
  const archived = [
    { entry: { title: '有効1', body: 'b1', subject: '民法' }, deletedAt: T_DELETE, reason: 'x' },
    { entry: { title: '取消済', body: 'b2', subject: '民法' }, deletedAt: T_DELETE, revokedAt: T_REVOKE, reason: 'x' },
    { entry: { title: '有効2', body: 'b3', subject: '民法' }, deletedAt: T_DELETE, reason: 'x' }
  ];
  const { sandbox, getEl } = loadDupCheck(archived, []);
  sandbox.loadDupArchive();
  sandbox.dupArchiveListVisible = true;
  sandbox.renderDupArchive();
  const html = getEl('dupArchiveWrap').innerHTML;
  check('有効な2件だけが表示される', html.includes('有効1') && html.includes('有効2') && !html.includes('取消済'));
  check('復元ボタンの添字が元配列の位置(0,2)を指す', html.includes('data-archive-idx="0"') && html.includes('data-archive-idx="2"') && !html.includes('data-archive-idx="1"'));
  check('件数表示は2件', html.includes('2件のアーカイブ'));
}

(async () => {
  await e2e();
  console.log('\n' + (failures === 0 ? '🎉 全チェック合格' : `⚠️ ${failures}件のチェックが不合格`));
  process.exit(failures === 0 ? 0 : 1);
})();
