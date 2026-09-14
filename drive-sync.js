(() => {
  const SYNC_URL = 'https://script.google.com/macros/s/AKfycbyB-3irASAEN6amf2QIN74WQNhF4winF8LwO_gfYDFkW4JLw0cTHTUyOHfoPis7Sof5/exec';
  // 同期用URLは公開リポジトリ・公開ページのソースから誰でも読める場所にあるため、
  // URLさえ知っていれば誰でも全データの閲覧・書き換えができてしまわないよう、
  // Googleアカウントでのログインを必須にしている。クライアント側はGoogleの
  // アクセストークンを取得してGAS側に送るだけで、実際に「誰か」の確認（許可した
  // メールアドレスかどうか）はGAS側（tools/gas-backup/code.gs）がGoogleに
  // 問い合わせて行う。CLIENT_IDは非公開情報ではない（クライアント側コードに
  // 含めて問題ない）が、Google Cloud Console側でこのアプリのURL
  // （https://blackout0802.github.io）が「承認済みのJavaScript生成元」に
  // 登録されている必要がある
  const AUTH_CLIENT_ID = '1008108195377-3i95ujevlk1keuf02tcitnuikniie9al.apps.googleusercontent.com';
  // ログインして得たアクセストークンの保存先。端末ごとのログイン状態であり、
  // 他端末と揃える意味が無いため同期対象には含めない
  const AUTH_TOKEN_KEY = 'ronshoAuthTokenV1';
  const REVISION_KEY = 'ronshoSyncRevisionV1';
  const LAST_SYNCED_KEY = 'ronshoSyncLastSnapshotV1';
  const ENTRY_KEY = 'ronshoEntries';
  const STUDYLOG_KEY = 'ronshoStudyLog';
  const MANUALLOG_KEY = 'ronshoManualLog';
  const PASTEXAM_KEY = 'ronshoPastExamLogs_v1';
  const COUNTDOWN_KEY = 'ronshoCountdowns_v1';
  const DUPARCHIVE_KEY = 'ronshoDupArchiveV1';
  const DUPRESOLVED_KEY = 'ronshoDupResolvedV1';
  const SPEECHDICT_KEY = 'ronshoSpeechDictV1';
  const DAILYSTATS_KEY = 'ronshoDailyStatsV1';
  const DAILYGOAL_KEY = 'ronshoDailyGoalV1';
  const XP_KEY = 'ronshoXpV1';
  const ORPHANENTRYARCHIVE_KEY = 'ronshoOrphanEntryArchiveV1';
  const PRECEDENT_KEY = 'ronshoPrecedentsV1';
  // 以下は各画面（テーマ・ペット・問題演習/読み上げ/苦手フィルタ/過去問ログの
  // 既定値・ショートカット・バックアップ催促）の「この端末だけのローカル設定」
  // だったものを、同期対象に加えたキー群。値の形式は元のファイルにそのまま
  // 合わせている（JSON化されているものはread/write、生の文字列・数値の
  // ものはreadRaw/writeRawを使う）
  const THEME_KEY = 'ronshoThemeV1';
  const PET_ENABLED_KEY = 'ronshoPetEnabledV1';
  const PET_SPECIES_KEY = 'ronshoPetSpeciesV1';
  const PET_BUBBLE_ENABLED_KEY = 'ronshoPetBubbleEnabledV1';
  const PET_BUBBLE_DURATION_KEY = 'ronshoPetBubbleDurationV1';
  const QUIZ_DEFAULT_FILTERS_KEY = 'ronshoQuizDefaultFiltersV1';
  const SPEECH_DEFAULT_RATE_KEY = 'ronshoSpeechDefaultRateV1';
  const SPEECH_DEFAULT_IMPORTANCE_KEY = 'ronshoSpeechDefaultImportanceV1';
  const SPEECH_DEFAULT_LOOP_KEY = 'ronshoSpeechDefaultLoopV1';
  const SPEECH_DEFAULT_INCLUDE_MEMORIZED_KEY = 'ronshoSpeechDefaultIncludeMemorizedV1';
  const STAR_FILTER_DEFAULT_KEY = 'ronshoStarFilterDefaultV1';
  const TAB_SHORTCUTS_KEY = 'ronshoTabShortcutsV1';
  const PAST_EXAM_DEFAULT_TYPE_KEY = 'ronshoPastExamDefaultTypeV1';
  const BACKUP_REMINDER_DAYS_KEY = 'ronshoBackupReminderDaysV1';
  const BACKUP_LAST_AT_KEY = 'ronshoLastBackupAtV1';
  const BACKUP_SNOOZE_AT_KEY = 'ronshoBackupSnoozeAtV1';
  const PROGRESS_VIEW_MODE_KEY = 'ronshoProgressViewModeV1';
  // 論証・学習記録以外の項目（カウントダウン・重複チェックのアーカイブなど）。
  // これらは1件ずつの個別選択までは対応せず、競合時は「その他の項目」として
  // まとめて📱／☁️のどちらかを選んでもらう
  const OTHER_FIELD_LABELS = {
    manualLog: '📝 手動学習ログ',
    pastExamLogs: '📄 過去問ログ',
    countdowns: '⏳ カウントダウン',
    dupArchive: '🗑 重複チェックのアーカイブ',
    dupResolved: '✅ 重複チェックの「両方残す」記録',
    speechDict: '🗣 読み方辞書',
    dailyGoal: '🎯 今日の目標値',
    xp: '🏆 経験値・レベル',
    precedents: '⚖️ 判例',
    orphanEntryArchive: '🔗 引き継がれなかった学習記録の内容',
    theme: '🌓 表示テーマ',
    petEnabled: '🐾 ペット表示設定',
    petSpecies: '🐾 ペットの種類',
    petBubbleEnabled: '💬 ペットの吹き出し設定',
    petBubbleDuration: '💬 ペットの吹き出し表示時間',
    quizDefaultFilters: '📝 問題演習の既定フィルタ',
    speechDefaultRate: '🔊 読み上げの速さ設定',
    speechDefaultImportance: '🔊 読み上げの重要度設定',
    speechDefaultLoop: '🔊 読み上げのループ設定',
    speechDefaultIncludeMemorized: '🔊 読み上げの暗記済み設定',
    starFilterDefault: '😰 苦手フィルタの既定',
    tabShortcuts: '⌨️ ショートカット設定',
    pastExamDefaultType: '📄 過去問ログの既定種別',
    backupReminderDays: '📦 バックアップ催促の間隔',
    lastBackupAt: '📦 最終バックアップ日',
    backupSnoozeAt: '📦 バックアップ催促のスヌーズ状態',
    progressViewMode: '📚 科目別暗記完了率の表示切替'
  };

  let revision = Number(localStorage.getItem(REVISION_KEY) || 0);
  // 「最後に同期が完了した時点のローカルの状態」。ページを再読み込みしても
  // 正しく「未同期の変更があるか」を判定できるよう、localStorageに永続化する
  let last = localStorage.getItem(LAST_SYNCED_KEY) || '';
  let timer;
  let syncInFlight = false;
  let syncSuspended = false;
  let lastPullAttempt = 0;
  let applyingRemoteData = false;
  window.ronshoSuspendSync = (v) => { syncSuspended = !!v; };
  // 各画面の保存処理（save*関数）から、変更のたびに直接呼んでもらうためのフック。
  // ボタン操作の直後に同期がキューされるようにし、変更検知のポーリングだけに
  // 頼らないようにする（ポーリングは、このフックが呼ばれない場合の保険として残す）。
  // ただし、クラウドから受け取ったデータを適用している最中は、受け取ったばかりの
  // 内容をそのまま送り返す無駄なpushを避けるため無効にする
  window.ronshoSyncNotifyChange = () => { if (!applyingRemoteData) queue(); };
  // 手動バックアップ書き出し機能（js/backup.js）から、同期対象の全データを
  // まとめて読み出すための公開。同期ロジック自体には影響しない
  window.ronshoBuildBackupSnapshot = () => snapshot();
  // 手動バックアップをGoogle Driveにもアップロードするための公開。
  // 通常の同期用ファイル(revisionで管理)とは別に、GAS側で日付入りの
  // バックアップファイルとして専用フォルダに保存される。同期のrevisionには影響しない
  window.ronshoUploadBackupToDrive = async (payload, fileName) => {
    assertOnlineOrThrow();
    let result;
    try {
      result = await syncFetchPost({ action: 'backup', data: payload, fileName: fileName });
    } catch (e) {
      if (e && e.isAuthError) throw e;
      // fetch自体の失敗（オフライン・通信の不安定・ページ移動等）は、Safariでは
      // "Load failed"、Chromeでは"Failed to fetch"のような生のブラウザメッセージに
      // なり分かりにくいため、他の同期処理（pushToCloud等）と同じ言い回しに揃える
      throw new Error(isOfflineError(e)
        ? 'オフラインです（オンラインになってからもう一度お試しください）'
        : '通信エラーが発生しました。通信状況を確認してもう一度お試しください（' + e.message + '）');
    }
    if (!result.ok) throw new Error('アップロードに失敗しました');
    return result;
  };

  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || JSON.stringify(d)) } catch (_) { return d } };
  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  // JSON化されていない生の文字列・数値（例:'0'/'1'や'dark'のような単純な値）を
  // そのまま読み書きするための版。read/write（JSON.parse/stringify前提）を
  // 通すと、単語だけの文字列などはJSON.parseでエラーになってしまうため分けている
  const readRaw = (k, d) => { const v = localStorage.getItem(k); return v === null ? d : v; };
  const writeRaw = (k, v) => { if (v === null || v === undefined || v === '') localStorage.removeItem(k); else localStorage.setItem(k, String(v)); };
  const getEntries = () => read(ENTRY_KEY, []);
  const state = t => { const e = document.getElementById('driveSyncState'); if (e) e.textContent = t };

  const snapshot = () => ({
    schemaVersion: 7,
    entries: getEntries(),
    studyLog: read(STUDYLOG_KEY, {}),
    manualLog: read(MANUALLOG_KEY, {}),
    pastExamLogs: read(PASTEXAM_KEY, []),
    countdowns: read(COUNTDOWN_KEY, []),
    dupArchive: read(DUPARCHIVE_KEY, []),
    dupResolved: read(DUPRESOLVED_KEY, []),
    speechDict: read(SPEECHDICT_KEY, []),
    dailyStats: read(DAILYSTATS_KEY, {}),
    dailyGoal: read(DAILYGOAL_KEY, null),
    xp: read(XP_KEY, 0),
    orphanEntryArchive: read(ORPHANENTRYARCHIVE_KEY, {}),
    precedents: read(PRECEDENT_KEY, []),
    theme: readRaw(THEME_KEY, ''),
    petEnabled: readRaw(PET_ENABLED_KEY, ''),
    petSpecies: readRaw(PET_SPECIES_KEY, ''),
    petBubbleEnabled: readRaw(PET_BUBBLE_ENABLED_KEY, ''),
    petBubbleDuration: readRaw(PET_BUBBLE_DURATION_KEY, ''),
    quizDefaultFilters: read(QUIZ_DEFAULT_FILTERS_KEY, {}),
    speechDefaultRate: readRaw(SPEECH_DEFAULT_RATE_KEY, ''),
    speechDefaultImportance: readRaw(SPEECH_DEFAULT_IMPORTANCE_KEY, ''),
    speechDefaultLoop: readRaw(SPEECH_DEFAULT_LOOP_KEY, ''),
    speechDefaultIncludeMemorized: readRaw(SPEECH_DEFAULT_INCLUDE_MEMORIZED_KEY, ''),
    starFilterDefault: readRaw(STAR_FILTER_DEFAULT_KEY, ''),
    tabShortcuts: read(TAB_SHORTCUTS_KEY, {}),
    pastExamDefaultType: readRaw(PAST_EXAM_DEFAULT_TYPE_KEY, ''),
    backupReminderDays: readRaw(BACKUP_REMINDER_DAYS_KEY, ''),
    lastBackupAt: readRaw(BACKUP_LAST_AT_KEY, ''),
    backupSnoozeAt: readRaw(BACKUP_SNOOZE_AT_KEY, ''),
    progressViewMode: readRaw(PROGRESS_VIEW_MODE_KEY, '')
  });

  const hasLocalData = () => {
    const e = getEntries();
    const sl = read(STUDYLOG_KEY, {});
    return (e && e.length > 0) || Object.keys(sl).length > 0;
  };
  // dailyStatsは、ホーム画面を開くたびに「今日の暗記済み件数」が自動で
  // 記録される統計で、実際の学習操作が無くても毎日変化する。これを比較に
  // 含めると、何も編集していない端末でも常に「未同期の変更あり」と誤判定
  // されてしまうため、競合検出の比較対象からは除外する
  const withoutVolatileFields = (snap) => { const { dailyStats, ...rest } = snap; return rest; };
  // オブジェクトのキー順・配列の要素順を正規化してから比較するための文字列を作る。
  // 保存・同期のたびにlocalStorageへの書き込み順や他端末での操作順によって
  // 配列やオブジェクトの並びが変わることがあるが、同期にとって意味があるのは
  // 中身であって並び順ではない。ここで正規化した文字列は「変更があるか」
  // 「クラウドと何が違うか」の判定にのみ使い、実際に保存・送受信するデータの
  // 並び順そのものには一切手を加えない（並び順だけの違いで、論証・学習記録に
  // 差が無いのに競合ポップアップが出てしまう不具合を防ぐ）
  function canonicalJSON(value) {
    if (Array.isArray(value)) {
      return '[' + value.map(canonicalJSON).sort().join(',') + ']';
    }
    if (value && typeof value === 'object') {
      const keys = Object.keys(value).sort();
      return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJSON(value[k])).join(',') + '}';
    }
    return JSON.stringify(value);
  }
  const markSynced = (snap) => {
    last = canonicalJSON(withoutVolatileFields(snap));
    localStorage.setItem(LAST_SYNCED_KEY, last);
  };
  // 前回の同期完了時点から、この端末でデータが変わっているか
  const hasUnsyncedLocalChanges = () => canonicalJSON(withoutVolatileFields(snapshot())) !== last;

  function applyRemoteData(data) {
    data = data || {};
    // saveEntries()等をこの中から呼ぶため、都度同期フックが反応して
    // 受け取ったばかりのデータをそのまま送り返してしまわないよう、
    // 適用中はフックを一時的に無効にする
    applyingRemoteData = true;
    try {
      write(ENTRY_KEY, data.entries || []);
      write(STUDYLOG_KEY, data.studyLog || {});
      write(MANUALLOG_KEY, data.manualLog || {});
      write(PASTEXAM_KEY, data.pastExamLogs || []);
      write(COUNTDOWN_KEY, data.countdowns || []);
      write(DUPARCHIVE_KEY, data.dupArchive || []);
      write(DUPRESOLVED_KEY, data.dupResolved || []);
      write(SPEECHDICT_KEY, data.speechDict || []);
      write(DAILYSTATS_KEY, data.dailyStats || {});
      if (data.dailyGoal != null) write(DAILYGOAL_KEY, data.dailyGoal);
      write(XP_KEY, data.xp || 0);
      write(ORPHANENTRYARCHIVE_KEY, data.orphanEntryArchive || {});
      write(PRECEDENT_KEY, data.precedents || []);
      writeRaw(THEME_KEY, data.theme);
      writeRaw(PET_ENABLED_KEY, data.petEnabled);
      writeRaw(PET_SPECIES_KEY, data.petSpecies);
      writeRaw(PET_BUBBLE_ENABLED_KEY, data.petBubbleEnabled);
      writeRaw(PET_BUBBLE_DURATION_KEY, data.petBubbleDuration);
      write(QUIZ_DEFAULT_FILTERS_KEY, data.quizDefaultFilters || {});
      writeRaw(SPEECH_DEFAULT_RATE_KEY, data.speechDefaultRate);
      writeRaw(SPEECH_DEFAULT_IMPORTANCE_KEY, data.speechDefaultImportance);
      writeRaw(SPEECH_DEFAULT_LOOP_KEY, data.speechDefaultLoop);
      writeRaw(SPEECH_DEFAULT_INCLUDE_MEMORIZED_KEY, data.speechDefaultIncludeMemorized);
      writeRaw(STAR_FILTER_DEFAULT_KEY, data.starFilterDefault);
      write(TAB_SHORTCUTS_KEY, data.tabShortcuts || {});
      writeRaw(PAST_EXAM_DEFAULT_TYPE_KEY, data.pastExamDefaultType);
      writeRaw(BACKUP_REMINDER_DAYS_KEY, data.backupReminderDays);
      writeRaw(BACKUP_LAST_AT_KEY, data.lastBackupAt);
      writeRaw(BACKUP_SNOOZE_AT_KEY, data.backupSnoozeAt);
      writeRaw(PROGRESS_VIEW_MODE_KEY, data.progressViewMode);
      // テーマ・ペットは、専用の公開APIがあれば呼んで見た目にもすぐ反映する。
      // それ以外の設定（既定フィルタ等）は、次にその画面を開いたときに
      // 反映される（他の同期項目と同様、都度の即時反映までは行わない）
      if (window.ronshoThemeControl && typeof window.ronshoThemeControl.setTheme === 'function') {
        window.ronshoThemeControl.setTheme(data.theme === 'light' || data.theme === 'dark' ? data.theme : 'system');
      }
      if (window.ronshoPetControl) {
        if (typeof window.ronshoPetControl.setEnabled === 'function') window.ronshoPetControl.setEnabled(data.petEnabled !== '0');
        if (typeof window.ronshoPetControl.setSpeciesIndex === 'function' && data.petSpecies !== '' && data.petSpecies != null) window.ronshoPetControl.setSpeciesIndex(Number(data.petSpecies));
        if (typeof window.ronshoPetControl.setBubbleEnabled === 'function') window.ronshoPetControl.setBubbleEnabled(data.petBubbleEnabled !== '0');
        if (typeof window.ronshoPetControl.setBubbleDurationMs === 'function' && data.petBubbleDuration) window.ronshoPetControl.setBubbleDurationMs(Number(data.petBubbleDuration));
      }
      try { entries = data.entries || [] } catch (_) {}
      try { studyLog = data.studyLog || {} } catch (_) {}
      try { manualLog = data.manualLog || {} } catch (_) {}
      try { dupArchiveList = data.dupArchive || [] } catch (_) {}
      try { dupResolvedSet = new Set(data.dupResolved || []) } catch (_) {}
      try { speechDict = data.speechDict || [] } catch (_) {}
      try { orphanEntryArchive = data.orphanEntryArchive || {} } catch (_) {}
      try { precedents = data.precedents || [] } catch (_) {}
      try { if (typeof PROGRESS_VIEW_MODES !== 'undefined' && PROGRESS_VIEW_MODES.includes(data.progressViewMode)) progressViewMode = data.progressViewMode; } catch (_) {}
      if (typeof saveEntries === 'function') saveEntries();
      if (typeof renderAll === 'function') renderAll(true);
      if (typeof renderCountdownCard === 'function') renderCountdownCard();
      if (typeof renderDupArchive === 'function') renderDupArchive();
      if (typeof renderPastMatrixTable === 'function') renderPastMatrixTable();
      if (typeof renderSpeechDictList === 'function') renderSpeechDictList();
      if (typeof renderOrphanedStudyLog === 'function') renderOrphanedStudyLog();
      if (typeof renderPrecedentPage === 'function') renderPrecedentPage();
    } finally {
      applyingRemoteData = false;
    }
  }

  // クラウド側のデータをそのまま採用する（この端末に未同期の変更が無いときのみ安全）
  function adoptRemoteWholesale(remoteData, remoteRevision) {
    revision = remoteRevision;
    localStorage.setItem(REVISION_KEY, String(revision));
    applyRemoteData(remoteData);
    markSynced(snapshot());
  }

  // --- 競合確認ポップアップ ---
  // 「この端末」と「クラウド」の両方でデータが変わっている場合のみ表示する。
  // 統合(マージ)はせず、ユーザーが選んだ方をまるごと採用する単純な方式にしている。
  function entryCountOf(data) { return (data && data.entries && data.entries.length) || 0; }
  function memorizedCountOf(data) {
    const sl = (data && data.studyLog) || {};
    return Object.values(sl).filter(v => v && v.memorized).length;
  }
  // グローバルのescapeHtml（js/core.js）に頼らず、この端末単体でも安全に動くようにする
  const escHtml = (typeof escapeHtml === 'function')
    ? escapeHtml
    : (s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const entryKeyOf = e => [e && e.title, e && e.body].filter(Boolean).join('|') || JSON.stringify(e);
  function formatUpdatedAt(iso) {
    if (!iso) return '不明';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '不明';
    return d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  // 「この端末」と「クラウド」の何がどう違うのかを具体的に洗い出す。
  // 件数が同じでも中身が違うケース（タイトルの入れ替わり・暗記フラグの違いなど）を
  // 見落とさないよう、論証の追加/削除と学習記録の差分を個別に数える
  function computeSyncDiff(localData, remoteData) {
    const localEntries = (localData && localData.entries) || [];
    const remoteEntries = (remoteData && remoteData.entries) || [];
    const localByTitle = new Map(localEntries.map(e => [e.title, e]));
    const remoteByTitle = new Map(remoteEntries.map(e => [e.title, e]));

    // 同じタイトルで本文だけが違う論証は「編集された1件」として扱い、
    // 「片方にしかない論証」の集計からは除外する（二重に数えて分かりにくくなるのを防ぐ）
    const editedTitles = new Set();
    localByTitle.forEach((le, title) => {
      const re = remoteByTitle.get(title);
      if (re && (re.body || '') !== (le.body || '')) editedTitles.add(title);
    });

    const localMap = new Map(localEntries.filter(e => !editedTitles.has(e.title)).map(e => [entryKeyOf(e), e]));
    const remoteMap = new Map(remoteEntries.filter(e => !editedTitles.has(e.title)).map(e => [entryKeyOf(e), e]));
    const onlyLocalTitles = [...localMap.keys()].filter(k => !remoteMap.has(k)).map(k => localMap.get(k).title);
    const onlyRemoteTitles = [...remoteMap.keys()].filter(k => !localMap.has(k)).map(k => remoteMap.get(k).title);

    const localLog = (localData && localData.studyLog) || {};
    const remoteLog = (remoteData && remoteData.studyLog) || {};
    const allLogTitles = new Set([...Object.keys(localLog), ...Object.keys(remoteLog)]);
    // 暗記済みフラグ・学習回数のどちらかでも違えば、その論証の学習記録
    // まるごとを1つの選択対象にする（片方だけ選ばせると、暗記済みは📱・
    // 学習回数は☁️のような矛盾した記録になってしまうため）
    const studyLogDiffTitles = [];
    allLogTitles.forEach(t => {
      const a = localLog[t] || {}, b = remoteLog[t] || {};
      const memorizedDiffers = !!a.memorized !== !!b.memorized;
      const historyDiffers = (a.history || []).length !== (b.history || []).length;
      if (memorizedDiffers || historyDiffers) studyLogDiffTitles.push(t);
    });

    // 論証・学習記録以外の項目（カウントダウン・重複チェックのアーカイブなど）も、
    // 「違いが無い」と誤解させないよう、変わっている項目名だけ拾っておく
    const otherFieldLabels = Object.keys(OTHER_FIELD_LABELS).filter(k => {
      return canonicalJSON((localData || {})[k]) !== canonicalJSON((remoteData || {})[k]);
    }).map(k => OTHER_FIELD_LABELS[k]);

    return {
      localByTitle, remoteByTitle, localLog, remoteLog, otherFieldLabels,
      groups: [
        { kind: 'onlyLocal', icon: '📱', label: 'この端末にしかない論証', titles: onlyLocalTitles },
        { kind: 'onlyRemote', icon: '☁️', label: 'クラウドにしかない論証', titles: onlyRemoteTitles },
        { kind: 'edited', icon: '✏️', label: '同じタイトルで本文の内容が違う論証', titles: [...editedTitles] },
        { kind: 'studyLog', icon: '📊', label: '学習記録（暗記済み・学習回数など）が違う論証', titles: studyLogDiffTitles }
      ].filter(g => g.titles.length > 0),
      // 上記のどのグループにも該当せず、同期対象の他の項目にも差が無ければ、
      // 本当は中身が同じ（revision番号がずれていただけ）ということ。
      // 「競合が起きたのに何が違うのか分からない」という状況を無くすため、
      // この判定を使って中身が同じ場合はそもそも競合ポップアップを出さない
      isReallyIdentical: onlyLocalTitles.length === 0 && onlyRemoteTitles.length === 0
        && editedTitles.size === 0 && studyLogDiffTitles.length === 0 && otherFieldLabels.length === 0
    };
  }

  // クラウド側が何らかの理由で意図せず空・激減した状態になっているのに、
  // 「この端末に未同期の変更が無い」という理由だけで確認なしに採用してしまうと、
  // その空データが他端末にもそのまま伝播し、実害の大きいデータ消失につながる。
  // これを防ぐため、明らかにおかしい減り方をしている場合は自動採用せず、
  // 通常の競合と同じくユーザーに確認してもらう
  function isSuspiciousDataLoss(localData, remoteData) {
    const localCount = ((localData && localData.entries) || []).length;
    const remoteCount = ((remoteData && remoteData.entries) || []).length;
    if (localCount === 0) return false; // 元々この端末に論証が無ければ失うものが無い
    if (remoteCount === 0) return true; // 論証が全部消えているのは明らかにおかしい
    return remoteCount < localCount * 0.5; // 半分以上減っているのも疑わしい
  }
  const DIFF_ROWS_SHOWN_MAX = 20;
  // 種類ごとに「何も選ばなかった場合」の既定側を決める。onlyLocal/onlyRemoteは
  // 「片方にしかない論証をなるべく残す」方向（＝両端末の内容を合わせた集合）を
  // 既定にし、本当に内容が競合しているedited/studyLogだけ「この端末」を暫定の
  // 既定にしている（どちらが新しいかを判定する手段が無いための便宜上の選択）
  function defaultSideForKind(kind) {
    if (kind === 'onlyLocal') return 'local';
    if (kind === 'onlyRemote') return 'cloud';
    return 'local';
  }
  function diffChoiceHtml(kind, title) {
    const def = defaultSideForKind(kind);
    return '<span class="driveSyncDiffChoice">'
      + '<button type="button" class="diffChoiceBtn' + (def === 'local' ? ' active' : '') + '" data-side="local" title="この端末の内容を採用">📱</button>'
      + '<button type="button" class="diffChoiceBtn' + (def === 'cloud' ? ' active' : '') + '" data-side="cloud" title="クラウドの内容を採用">☁️</button>'
      + '</span>';
  }
  function diffSummaryHtml(diff) {
    if (diff.groups.length === 0) {
      if (diff.otherFieldLabels.length === 0) {
        return '<div class="driveSyncConflictDiffEmpty">論証・学習記録に違いは見つかりませんでした。</div>';
      }
      return '<div class="driveSyncConflictDiffEmpty">論証・学習記録に違いはありませんが、次の項目に差があります: '
        + diff.otherFieldLabels.map(l => escHtml(l)).join('、') + '</div>';
    }
    return diff.groups.map(g => {
      const shown = g.titles.slice(0, DIFF_ROWS_SHOWN_MAX);
      const rows = shown.map(t => '<div class="driveSyncDiffRow" data-diff-kind="' + g.kind + '" data-diff-title="' + escHtml(t) + '">'
        + '<span class="driveSyncDiffCaret">▶</span> <span class="driveSyncDiffRowTitle">' + escHtml(t || '(タイトルなし)') + '</span>'
        + diffChoiceHtml(g.kind, t)
        + '</div><div class="driveSyncDiffDetail" hidden></div>').join('');
      const more = g.titles.length > shown.length
        ? '<div class="driveSyncDiffMoreNote">他' + (g.titles.length - shown.length) + '件（' + (defaultSideForKind(g.kind) === 'local' ? '📱この端末' : '☁️クラウド') + 'を採用します）</div>'
        : '';
      return '<div class="driveSyncConflictDiffGroup">'
        + '<div class="driveSyncConflictDiffGroupTitle">' + g.icon + ' ' + g.label + ': <strong>' + g.titles.length + '件</strong>（行をクリックで内容を表示。📱☁️ボタンでこの項目だけ採用する側を選べます）</div>'
        + rows + more
        + '</div>';
    }).join('') + (diff.otherFieldLabels.length
      ? '<div class="driveSyncConflictDiffEmpty">ほかに次の項目にも差があります: ' + diff.otherFieldLabels.map(l => escHtml(l)).join('、') + '</div>'
      : '');
  }
  function entryDetailHtml(label, entry) {
    if (!entry) return '<div class="driveSyncDiffDetailSide"><div class="driveSyncDiffDetailLabel">' + label + '</div><div class="driveSyncDiffDetailNone">論証なし</div></div>';
    return '<div class="driveSyncDiffDetailSide">'
      + '<div class="driveSyncDiffDetailLabel">' + label + '</div>'
      + '<div class="driveSyncDiffDetailMeta">' + escHtml(entry.subject || '未設定') + ' ／ ' + escHtml(entry.category || '') + '</div>'
      + '<div class="driveSyncDiffDetailText">' + escHtml(entry.body || '(本文なし)') + '</div>'
      + '</div>';
  }
  function logDetailHtml(label, log) {
    const l = log || {};
    // 「直近」の学習日は日付までしか記録が無い（同日中に複数回操作すると
    // 両端末で同じ日付になり得る）ため、区別できるようupdatedAt（変更の
    // たびに記録している時刻）があれば時刻まで併記する
    const updatedAtHtml = l.updatedAt ? '（更新時刻: ' + formatUpdatedAt(l.updatedAt) + '）' : '';
    return '<div class="driveSyncDiffDetailSide">'
      + '<div class="driveSyncDiffDetailLabel">' + label + '</div>'
      + '<div class="driveSyncDiffDetailMeta">暗記済み: ' + (l.memorized ? '○' : '×') + ' ／ 学習回数: ' + ((l.history || []).length) + '回'
      + (l.history && l.history.length ? '（直近: ' + l.history[l.history.length - 1] + '）' : '') + updatedAtHtml + '</div>'
      + '</div>';
  }
  function renderDiffDetail(diff, kind, title) {
    if (kind === 'onlyLocal') {
      return '<div class="driveSyncDiffDetailCols">' + entryDetailHtml('📱 この端末', diff.localByTitle.get(title)) + '</div>';
    }
    if (kind === 'onlyRemote') {
      return '<div class="driveSyncDiffDetailCols">' + entryDetailHtml('☁️ クラウド', diff.remoteByTitle.get(title)) + '</div>';
    }
    if (kind === 'edited') {
      return '<div class="driveSyncDiffDetailCols">'
        + entryDetailHtml('📱 この端末', diff.localByTitle.get(title))
        + entryDetailHtml('☁️ クラウド', diff.remoteByTitle.get(title))
        + '</div>';
    }
    // studyLog（暗記済み・学習回数などが違う論証）
    return '<div class="driveSyncDiffDetailCols">'
      + logDetailHtml('📱 この端末', diff.localLog[title])
      + logDetailHtml('☁️ クラウド', diff.remoteLog[title])
      + '</div>';
  }
  function hideSyncConflictModal() {
    const root = document.getElementById('driveSyncConflictModal');
    if (root) root.innerHTML = '';
  }
  function showSyncConflictModal(remoteData, remoteRevision, remoteUpdatedAt) {
    const root = document.getElementById('driveSyncConflictModal');
    if (!root) {
      // モーダル用の要素が無い場合はやむを得ず確認ダイアログで代替する
      const useCloud = confirm('この端末とクラウドの両方でデータが更新されています。\nクラウド側の内容を使いますか？\n（OK＝クラウドを優先／キャンセル＝この端末を優先）');
      if (useCloud) resolveConflictKeepCloud(remoteData, remoteRevision);
      else resolveConflictKeepLocal();
      return;
    }
    const localData = snapshot();
    const diff = computeSyncDiff(localData, remoteData);
    // 行ごとの選択状態。キーは「種類|タイトル」、値は'local'または'cloud'。
    // 何も触っていない項目はdefaultSideForKind()の既定値がそのまま使われる
    const selections = new Map();
    let otherFieldsSide = 'local';
    const otherFieldsRowHtml = diff.otherFieldLabels.length
      ? '<div class="driveSyncConflictOtherRow">'
        + '<span>📦 その他の項目（' + diff.otherFieldLabels.map(l => escHtml(l)).join('・') + '）</span>'
        + '<span class="driveSyncDiffChoice" id="driveSyncOtherFieldsChoice">'
        + '<button type="button" class="diffChoiceBtn active" data-side="local">📱</button>'
        + '<button type="button" class="diffChoiceBtn" data-side="cloud">☁️</button>'
        + '</span>'
        + '</div>'
      : '';
    root.innerHTML = '<div class="driveSyncConflictOverlay">'
      + '<div class="driveSyncConflictBox">'
      + '<div class="driveSyncConflictHeader">⚠️ 同期の競合</div>'
      + '<div class="driveSyncConflictBody">'
      + '<p>この端末とクラウドの両方でデータが更新されているため、自動では統合できません。以下の項目ごとに、📱この端末／☁️クラウドのどちらの内容を使うか選んでください（初期状態は、なるべく両方のデータを活かせるように選ばれています）。</p>'
      + '<div class="driveSyncConflictQuickRow">🚀 まとめて選ぶ：'
      + '<button type="button" id="driveSyncQuickAllLocalBtn" class="driveSyncQuickBtn">📱 すべてこの端末</button>'
      + '<button type="button" id="driveSyncQuickAllCloudBtn" class="driveSyncQuickBtn">☁️ すべてクラウド</button>'
      + '</div>'
      + '<div class="driveSyncConflictDiffTitle">🔍 項目ごとの選択（<span id="driveSyncLocalMeta">📱この端末：論証 ' + entryCountOf(localData) + '件 ／ 暗記済み ' + memorizedCountOf(localData) + '件（確認時刻: ' + formatUpdatedAt(new Date().toISOString()) + '）</span>　vs　<span id="driveSyncCloudMeta">☁️クラウド：論証 ' + entryCountOf(remoteData) + '件 ／ 暗記済み ' + memorizedCountOf(remoteData) + '件（最終更新: ' + formatUpdatedAt(remoteUpdatedAt) + '）</span>）</div>'
      + diffSummaryHtml(diff)
      + otherFieldsRowHtml
      + '<div class="driveSyncConflictHint">選ばなかった項目・「他N件」に含まれる項目は、それぞれの初期選択（📱／☁️）がそのまま適用されます。あとで「重複チェック」から個別に復元することもできます。</div>'
      + '<div class="driveSyncConflictConfirmRow">'
      + '<button type="button" id="driveSyncConfirmMergeBtn">✅ 選んだ内容でマージする</button>'
      + '<span class="driveSyncConflictLaterBtn" id="driveSyncConflictLaterBtn">あとで決める</span>'
      + '</div>'
      + '</div>'
      + '</div>'
      + '</div>';
    const confirmBtn = document.getElementById('driveSyncConfirmMergeBtn');
    // マージしたデータのアップロードは、全データ(約1MB規模になりうる)を送信
    // するため数秒かかることがある。押した直後にボタンを無効化して
    // 「処理中」と分かるようにし、連打による二重送信も防ぐ。失敗してモーダルが
    // まだ残っている場合だけ、再度押せる状態に戻す
    confirmBtn.onclick = async () => {
      if (confirmBtn.disabled) return;
      confirmBtn.disabled = true;
      confirmBtn.textContent = '⏳ マージ中…';
      const merged = buildManualMergeSnapshot(diff, localData, remoteData, selections, otherFieldsSide);
      await resolveConflictManualMerge(merged, remoteRevision);
      if (isConflictModalOpen()) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = '✅ 選んだ内容でマージする';
      }
    };
    document.getElementById('driveSyncConflictLaterBtn').onclick = () => hideSyncConflictModal();
    document.getElementById('driveSyncQuickAllLocalBtn').onclick = () => setAllDiffChoices(diff, root, selections, 'local');
    document.getElementById('driveSyncQuickAllCloudBtn').onclick = () => setAllDiffChoices(diff, root, selections, 'cloud');
    // 差分の各行をクリックすると、その論証・学習記録の中身を開閉できるようにする。
    // 📱☁️ボタンは行のクリックとは別扱いにし、押した項目だけの選択を切り替える
    root.onclick = (e) => {
      const choiceBtn = e.target.closest ? e.target.closest('.diffChoiceBtn') : null;
      if (choiceBtn) {
        const otherWrap = choiceBtn.closest('#driveSyncOtherFieldsChoice');
        if (otherWrap) {
          otherFieldsSide = choiceBtn.getAttribute('data-side');
        } else {
          const row = choiceBtn.closest('.driveSyncDiffRow');
          if (row) selections.set(row.getAttribute('data-diff-kind') + '|' + row.getAttribute('data-diff-title'), choiceBtn.getAttribute('data-side'));
        }
        choiceBtn.parentElement.querySelectorAll('.diffChoiceBtn').forEach(b => b.classList.toggle('active', b === choiceBtn));
        return;
      }
      const row = e.target.closest ? e.target.closest('.driveSyncDiffRow') : null;
      if (!row) return;
      const detail = row.nextElementSibling;
      if (!detail) return;
      const opening = detail.hasAttribute('hidden');
      if (opening) {
        detail.innerHTML = renderDiffDetail(diff, row.getAttribute('data-diff-kind'), row.getAttribute('data-diff-title'));
        detail.removeAttribute('hidden');
      } else {
        detail.setAttribute('hidden', '');
      }
      const caret = row.querySelector('.driveSyncDiffCaret');
      if (caret) caret.textContent = opening ? '▼' : '▶';
    };
  }
  async function resolveConflictKeepCloud(remoteData, remoteRevision) {
    adoptRemoteWholesale(remoteData, remoteRevision);
    hideSyncConflictModal();
    state('☁️ クラウドのデータを優先しました（' + new Date().toLocaleTimeString() + '）');
  }
  async function resolveConflictKeepLocal() {
    try {
      // 選択の間に更に更新されている可能性があるため、最新のrevisionを取り直してから上書きする
      const remote = await syncFetchGet();
      const data = snapshot();
      const result = await syncFetchPost({ revision: remote.revision || 0, data });
      if (result.ok) {
        revision = result.result.revision;
        localStorage.setItem(REVISION_KEY, String(revision));
        markSynced(data);
        hideSyncConflictModal();
        state('📱 この端末のデータを優先しました（' + new Date().toLocaleTimeString() + '）');
      } else if (result.latest) {
        showSyncConflictModal(result.latest.data, result.latest.revision || 0, result.latest.updatedAt);
      }
    } catch (e) {
      state(e && e.isAuthError ? ('🔒 ' + e.message) : ('保存に失敗しました: ' + e.message));
    }
  }
  // 表示中の全ての差分行（省略されている「他N件」も含む）の選択を、
  // 一括でlocal/cloudどちらかに揃える。「まとめて選ぶ」ボタン用
  function setAllDiffChoices(diff, root, selections, side) {
    diff.groups.forEach(g => g.titles.forEach(t => selections.set(g.kind + '|' + t, side)));
    // 自動テスト(tools/sync-test)ではDOM操作を簡易スタブで済ませているため
    // querySelectorAllが無く、その場合は見た目の更新（ボタンの色）だけ省略する
    if (typeof root.querySelectorAll !== 'function') return;
    root.querySelectorAll('.driveSyncDiffRow .diffChoiceBtn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-side') === side);
    });
  }
  // 競合モーダルで項目ごとに選んだ内容から、実際に保存するスナップショットを組み立てる。
  // ベースは常にこの端末の現在のデータとし、選択に応じて該当タイトルだけを
  // クラウド側の内容に差し替える／削除する（＝「全部乗せ or 全部差し替え」ではなく、
  // 選んだ項目だけがクラウド優先になる）
  function buildManualMergeSnapshot(diff, localData, remoteData, selections, otherFieldsSide) {
    const finalEntries = (localData.entries || []).slice();
    const sideOf = (kind, title) => selections.get(kind + '|' + title) || defaultSideForKind(kind);
    diff.groups.forEach(g => {
      if (g.kind === 'onlyLocal') {
        g.titles.forEach(t => {
          if (sideOf('onlyLocal', t) !== 'cloud') return;
          const idx = finalEntries.findIndex(e => e.title === t);
          if (idx !== -1) finalEntries.splice(idx, 1);
        });
      } else if (g.kind === 'onlyRemote') {
        g.titles.forEach(t => {
          if (sideOf('onlyRemote', t) !== 'cloud') return;
          const re = diff.remoteByTitle.get(t);
          if (re && !finalEntries.some(e => e.title === t)) finalEntries.push(re);
        });
      } else if (g.kind === 'edited') {
        g.titles.forEach(t => {
          if (sideOf('edited', t) !== 'cloud') return;
          const re = diff.remoteByTitle.get(t);
          const idx = finalEntries.findIndex(e => e.title === t);
          if (re && idx !== -1) finalEntries[idx] = re;
        });
      }
    });
    const finalStudyLog = Object.assign({}, localData.studyLog || {});
    const studyLogGroup = diff.groups.find(g => g.kind === 'studyLog');
    if (studyLogGroup) {
      studyLogGroup.titles.forEach(t => {
        if (sideOf('studyLog', t) !== 'cloud') return;
        if (diff.remoteLog[t]) finalStudyLog[t] = diff.remoteLog[t];
        else delete finalStudyLog[t];
      });
    }
    const otherBase = otherFieldsSide === 'cloud' ? (remoteData || {}) : localData;
    const merged = Object.assign({}, localData, { entries: finalEntries, studyLog: finalStudyLog });
    Object.keys(OTHER_FIELD_LABELS).forEach(k => { merged[k] = otherBase[k]; });
    return merged;
  }
  async function resolveConflictManualMerge(mergedData, remoteRevision) {
    try {
      // 選択の間に更に更新されている可能性があるため、最新のrevisionを取り直してから保存する
      const remote = await syncFetchGet();
      const result = await syncFetchPost({ revision: remote.revision || 0, data: mergedData });
      if (result.ok) {
        revision = result.result.revision;
        localStorage.setItem(REVISION_KEY, String(revision));
        applyRemoteData(mergedData);
        markSynced(mergedData);
        hideSyncConflictModal();
        state('🔀 選んだ内容でマージしました（' + new Date().toLocaleTimeString() + '）');
      } else if (result.latest) {
        showSyncConflictModal(result.latest.data, result.latest.revision || 0, result.latest.updatedAt);
      }
    } catch (e) {
      state(e && e.isAuthError ? ('🔒 ' + e.message) : (isOfflineError(e) ? '📴 オフラインのため保存できません（オンラインになってからもう一度お試しください）' : ('保存に失敗しました: ' + e.message)));
    }
  }

  // ▼▼▼ 新規追加：学習中の端末を競合時に優先する仕組み ここから ▼▼▼
  // 学習記録（studyLog）のupdatedAtが直近この時間以内に更新されていれば、
  // 「今まさにこの端末で学習している最中」とみなす。学習に集中している間に
  // 競合の確認ポップアップで中断させられたり、選択を誤って進行中の学習記録を
  // 失ったりすることがないよう、この間だけは確認なしで「この端末を優先」した
  // 自動マージを行う（学習中でなければ、従来どおり確認ポップアップを出す）
  const ACTIVE_STUDY_WINDOW_MS = 3 * 60 * 1000;
  const AUTO_RESOLVE_MAX_RETRY = 3;
  function getLatestStudyLogUpdatedAt(studyLogObj) {
    let latest = 0;
    Object.values(studyLogObj || {}).forEach(log => {
      const t = log && log.updatedAt ? Date.parse(log.updatedAt) : NaN;
      if (!isNaN(t) && t > latest) latest = t;
    });
    return latest;
  }
  function isActivelyStudying() {
    const latest = getLatestStudyLogUpdatedAt(read(STUDYLOG_KEY, {}));
    return latest > 0 && (Date.now() - latest) <= ACTIVE_STUDY_WINDOW_MS;
  }
  // 手動マージ（buildManualMergeSnapshot）と同じ既定ルール（この端末にしか
  // ない論証は残す・クラウドにしかない論証は取り込む・本文や学習記録が
  // 競合する場合はこの端末を優先）を、選択操作なしでそのまま適用する
  async function autoResolveConflictFavoringActiveStudy(remoteData, remoteRevision, remoteUpdatedAt, retryCount) {
    const localData = snapshot();
    const diff = computeSyncDiff(localData, remoteData);
    const merged = buildManualMergeSnapshot(diff, localData, remoteData, new Map(), 'local');
    try {
      // 選択の間に更に更新されている可能性があるため、最新のrevisionを取り直してから保存する
      const remote = await syncFetchGet();
      const result = await syncFetchPost({ revision: remote.revision || 0, data: merged });
      if (result.ok) {
        revision = result.result.revision;
        localStorage.setItem(REVISION_KEY, String(revision));
        applyRemoteData(merged);
        markSynced(merged);
        state('📖 学習中のため、この端末の学習記録を優先して自動的に同期しました（' + new Date().toLocaleTimeString() + '）');
        return;
      }
      if (result.latest && (retryCount || 0) < AUTO_RESOLVE_MAX_RETRY) {
        await autoResolveConflictFavoringActiveStudy(result.latest.data, result.latest.revision || 0, result.latest.updatedAt, (retryCount || 0) + 1);
        return;
      }
      // 短時間に何度も競合が起きるなど想定外の状況では、安全側に倒して通常の確認ポップアップを出す
      if (result.latest) showSyncConflictModal(result.latest.data, result.latest.revision || 0, result.latest.updatedAt);
    } catch (e) {
      state(e && e.isAuthError ? ('🔒 ' + e.message) : (isOfflineError(e) ? '📴 オフラインのため保存できません（オンラインになってからもう一度お試しください）' : ('保存に失敗しました: ' + e.message)));
    }
  }
  // ▲▲▲ 学習中の端末を競合時に優先する仕組み ここまで ▲▲▲

  // オフライン中は無駄にfetchを試みて待たされることのないよう、事前に
  // navigator.onLineで分かる範囲は早めに弾く（判定が不確実なブラウザもあるため、
  // 最終的な保証はfetch失敗時のcatch側で行う。ここはあくまで高速化のための先読み）
  function assertOnlineOrThrow() {
    if (!navigator.onLine) {
      const e = new Error('オフラインです');
      e.isOffline = true;
      throw e;
    }
  }
  function isOfflineError(e) {
    return !!(e && (e.isOffline || !navigator.onLine));
  }

  // --- Googleアカウントによるログイン ---
  function loadAuthToken() {
    try {
      const raw = localStorage.getItem(AUTH_TOKEN_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.token || !obj.expiresAt || Date.now() >= obj.expiresAt) return null;
      return obj.token;
    } catch (_) { return null; }
  }
  function saveAuthToken(token, expiresInSec) {
    // 期限ギリギリで使ってサーバー側に拒否されるのを避けるため、少し余裕を持たせて期限を切る
    const ttlMs = (Number(expiresInSec) || 3600) * 1000;
    localStorage.setItem(AUTH_TOKEN_KEY, JSON.stringify({ token, expiresAt: Date.now() + ttlMs - 60000 }));
  }
  function clearAuthToken() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
  function makeAuthError(message) {
    const e = new Error(message);
    e.isAuthError = true;
    return e;
  }
  // index.htmlで<script>読み込み済みのGoogle Identity Servicesライブラリが
  // 使えるようになるまで待つ（読み込みは非同期・かつ先行してdrive-sync.jsの
  // 方が先に実行され得るため）。長時間待っても読み込めない場合は諦める
  function ensureGisLoaded() {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let tries = 0;
      const iv = setInterval(() => {
        tries++;
        if (window.google && window.google.accounts && window.google.accounts.oauth2) {
          clearInterval(iv);
          resolve();
        } else if (tries > 100) {
          clearInterval(iv);
          reject(new Error('Googleログイン機能の読み込みに失敗しました'));
        }
      }, 100);
    });
  }
  let gisTokenClient = null;
  // requestAccessToken()は同じtoken clientに対して同時に複数呼ぶと、後の呼び出しが
  // 前の呼び出しのコールバックを乗っ取ってしまい（ボタンを押しても応答が来ず
  // 「ログイン中…」のまま固まる不具合の原因だった）、これを防ぐため
  // 「呼び出しごとに固有の番号を振り、その番号あてのコールバックだけを受け取る」
  // ようにしたうえで、常に1件ずつ順番に実行する（authRequestChainで直列化）
  let authCallSeq = 0;
  let currentAuthCall = null; // { seq, resolve, reject }
  function getGisTokenClient() {
    if (!gisTokenClient) {
      gisTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: AUTH_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/userinfo.email',
        callback: (resp) => {
          const call = currentAuthCall;
          if (!call) return; // 既にタイムアウト等で見切りをつけた呼び出しへの遅延応答は無視する
          if (resp && resp.access_token) {
            saveAuthToken(resp.access_token, resp.expires_in);
            call.resolve(resp.access_token);
          } else {
            call.reject(new Error('ログインに失敗しました'));
          }
        },
        error_callback: () => {
          if (currentAuthCall) currentAuthCall.reject(new Error('ログインがキャンセルされました'));
        }
      });
    }
    return gisTokenClient;
  }
  // 呼び出しを1件だけ実行する。呼び出し元同士の直列化はrequestNewToken側で行う
  function requestNewTokenOnce(interactive) {
    return new Promise((resolve, reject) => {
      const seq = ++authCallSeq;
      let settled = false;
      let timer;
      const finish = (fn, arg) => {
        if (settled) return;
        settled = true;
        if (currentAuthCall && currentAuthCall.seq === seq) currentAuthCall = null;
        clearTimeout(timer);
        fn(arg);
      };
      currentAuthCall = {
        seq,
        resolve: v => finish(resolve, v),
        reject: e => finish(reject, e)
      };
      // interactiveはユーザーの操作待ちなので長め、silentは無言の再取得なので
      // 短めに切り上げる（GISが応答自体を返さないまま固まるケースへの保険）
      // silent（無言）側は短めに切り上げる。ここを長くすると、ページ読み込み直後の
      // 自動的な無言再取得がまだ終わっていない間にユーザーが「ログイン」ボタンを
      // 押した場合、直列化のためポップアップがクリック操作から数秒遅れて開くことに
      // なり、ブラウザにポップアップブロックされる恐れがあるため
      timer = setTimeout(() => finish(reject, new Error('ログイン処理がタイムアウトしました')), interactive ? 60000 : 3000);
      try {
        getGisTokenClient().requestAccessToken({ prompt: interactive ? 'consent' : '' });
      } catch (e) {
        finish(reject, e);
      }
    });
  }
  // 同じtoken clientへの呼び出しが重ならないよう、常に前の呼び出しの決着後に
  // 次を実行する（interactive=falseの場合、既にこのブラウザでログイン・許可済み
  // であれば画面を出さずに再取得できることがある。できなければタイムアウトする）
  let authRequestChain = Promise.resolve();
  function requestNewToken(interactive) {
    return ensureGisLoaded().then(() => {
      const run = () => requestNewTokenOnce(interactive);
      const next = authRequestChain.then(run, run);
      authRequestChain = next.catch(() => {});
      return next;
    });
  }
  function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('タイムアウトしました')), ms);
      promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
    });
  }
  function showAuthGate() {
    let el = document.getElementById('driveAuthGate');
    if (!el) {
      el = document.createElement('div');
      el.id = 'driveAuthGate';
      el.className = 'driveSyncPanel';
      el.innerHTML = '🔒 同期にはGoogleアカウントでのログインが必要です '
        + '<button id="driveAuthLoginBtn" type="button">Googleでログイン</button>';
      const slot = document.getElementById('driveSyncPanelSlot');
      const row = document.getElementById('topStatusRow');
      if (slot) slot.appendChild(el);
      else if (row) row.appendChild(el);
      else status.after(el);
      const loginBtn = document.getElementById('driveAuthLoginBtn');
      if (loginBtn) {
        loginBtn.onclick = () => {
          loginBtn.disabled = true;
          loginBtn.textContent = '⏳ ログイン中…';
          requestNewToken(true).then(() => {
            hideAuthGate();
            pullFromCloud(true).catch(e => state(e && e.isAuthError ? ('🔒 ' + e.message) : ('同期に失敗しました: ' + e.message)));
          }).catch(e => {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Googleでログイン';
            state(e.message);
          });
        };
      }
    }
    if (typeof el.hidden !== 'undefined') el.hidden = false;
  }
  function hideAuthGate() {
    const el = document.getElementById('driveAuthGate');
    if (el && typeof el.hidden !== 'undefined') el.hidden = true;
  }
  // 有効なトークンが無ければ、まず無言での再取得を試し（既にログイン済みなら
  // 画面を出さずに済む）、それも失敗したらログイン案内を表示してエラーにする。
  // 複数箇所から同時に呼ばれても、ログイン試行が重複しないようにする
  let sharedAuthPromise = null;
  async function ensureAuthToken() {
    const cached = loadAuthToken();
    if (cached) return cached;
    if (!sharedAuthPromise) {
      sharedAuthPromise = (async () => {
        try {
          return await withTimeout(requestNewToken(false), 4000);
        } catch (_) {
          showAuthGate();
          throw makeAuthError('同期にはGoogleアカウントでのログインが必要です。画面の「Googleでログイン」から操作してください');
        }
      })();
    }
    try {
      return await sharedAuthPromise;
    } finally {
      sharedAuthPromise = null;
    }
  }
  function isUnauthorizedBody(body) {
    return !!(body && body.ok === false && body.reason === 'unauthorized');
  }
  async function syncFetchGet() {
    const token = await ensureAuthToken();
    const r = await fetch(SYNC_URL + '?token=' + encodeURIComponent(token), { cache: 'no-store' });
    if (!r.ok) throw new Error('クラウドからの取得に失敗しました');
    const body = await r.json();
    if (isUnauthorizedBody(body)) {
      clearAuthToken();
      showAuthGate();
      throw makeAuthError('ログインの有効期限が切れたか、許可されていないアカウントです。もう一度ログインしてください');
    }
    return body;
  }
  async function syncFetchPost(obj) {
    const token = await ensureAuthToken();
    const r = await fetch(SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ token }, obj))
    });
    const body = await r.json();
    if (isUnauthorizedBody(body)) {
      clearAuthToken();
      showAuthGate();
      throw makeAuthError('ログインの有効期限が切れたか、許可されていないアカウントです。もう一度ログインしてください');
    }
    return body;
  }

  // 同期用ファイルの上書き保存とは別に、確実に残る「別ファイルとしての保存」を
  // 自動的に積み重ねておくための保険。クラウド上の同期ファイル自体の
  // バージョン履歴はGoogleドライブ側の内部都合で間引かれ当てにできないことが
  // 分かったため（同期のたびに別ファイルとして残る手動バックアップと同じ仕組みを、
  // 同期成功時にも自動で行う）。頻繁な書き込みでドライブの容量・API呼び出しを
  // 圧迫しないよう、一定間隔（AUTO_DRIVE_BACKUP_INTERVAL_MS）でしか実行しない。
  // この間隔の管理用タイムスタンプは端末ごとの内部管理値であり、他端末と揃える
  // 意味が無いため同期対象には含めない
  const AUTO_DRIVE_BACKUP_LAST_AT_KEY = 'ronshoLastAutoDriveBackupAtMsV1';
  const AUTO_DRIVE_BACKUP_INTERVAL_MS = 15 * 60 * 1000;
  async function maybeAutoBackupToDrive(data) {
    if (typeof window.ronshoUploadBackupToDrive !== 'function') return;
    const now = Date.now();
    const lastAt = Number(localStorage.getItem(AUTO_DRIVE_BACKUP_LAST_AT_KEY));
    if (Number.isFinite(lastAt) && now - lastAt < AUTO_DRIVE_BACKUP_INTERVAL_MS) return;
    // 次に取りかかる前に間隔ぶんの予約を先に立てる（アップロードに時間がかかる間に
    // 別の同期が続けて完了して二重に実行されるのを防ぐ）
    localStorage.setItem(AUTO_DRIVE_BACKUP_LAST_AT_KEY, String(now));
    try {
      const exportedAt = new Date(now).toISOString();
      const fileName = '自動バックアップ_' + exportedAt.replace(/[:.]/g, '-') + '.json';
      await window.ronshoUploadBackupToDrive(Object.assign({ exportedAt }, data), fileName);
    } catch (e) {
      // 自動バックアップの失敗は同期そのものには影響させない（次の間隔で再試行される）
    }
  }

  async function pushToCloud() {
    assertOnlineOrThrow();
    const data = snapshot();
    const result = await syncFetchPost({ revision, data });
    if (!result.ok && result.reason === 'conflict') {
      if (result.latest) {
        // revision番号がずれていただけで、中身（論証・学習記録・その他の同期項目）に
        // 実質的な違いが無い場合は、ポップアップを出さずクラウドのrevisionに
        // 合わせるだけにする。「競合が起きたのに何も違いが表示されない」を防ぐため、
        // ポップアップを出すときは必ず何かしらの差分がある状態にする
        const diff = computeSyncDiff(data, result.latest.data);
        if (diff.isReallyIdentical) {
          revision = result.latest.revision || revision;
          localStorage.setItem(REVISION_KEY, String(revision));
          markSynced(data);
          state('同期しました（' + new Date().toLocaleTimeString() + '）');
          return;
        }
        if (isActivelyStudying()) {
          // 学習中はポップアップで中断させず、この端末を優先して自動的にマージする
          await autoResolveConflictFavoringActiveStudy(result.latest.data, result.latest.revision || 0, result.latest.updatedAt);
          return;
        }
        showSyncConflictModal(result.latest.data, result.latest.revision || 0, result.latest.updatedAt);
      }
      state('⚠️クラウド側で更新があるため、確認が必要です（' + new Date().toLocaleTimeString() + '）');
      return;
    }
    if (!result.ok) throw new Error('保存に失敗しました');
    revision = result.result.revision;
    localStorage.setItem(REVISION_KEY, String(revision));
    markSynced(data);
    state('同期しました（' + new Date().toLocaleTimeString() + '）');
    maybeAutoBackupToDrive(data);
  }

  async function pullFromCloud(isInitial) {
    assertOnlineOrThrow();
    const remote = await syncFetchGet();
    const remoteRevision = remote.revision || 0;
    if (isInitial && remoteRevision === 0 && hasLocalData()) {
      // クラウドが未使用（初回）かつ端末側にデータがある場合は、こちらのデータを送る
      await syncNow();
      return;
    }
    if (!hasLocalData()) {
      // この端末にまだ何もない（真っさらな状態）場合は、統合の余地が無いのでそのまま採用する。
      // hasUnsyncedLocalChanges()は「何も無い」状態でも空でないJSONと比較されて
      // trueになりうるため、ここで先に判定して不要な競合ポップアップを防ぐ
      adoptRemoteWholesale(remote.data, remoteRevision);
      state('☁️ クラウドのデータを取り込みました（' + new Date().toLocaleTimeString() + '）');
      return;
    }
    if (remoteRevision === revision) {
      // クラウド側は変わっていない。この端末の変更があれば送る
      if (hasUnsyncedLocalChanges()) { await syncNow(); }
      else { state('同期済み（' + new Date().toLocaleTimeString() + '）'); }
      return;
    }
    if (!hasUnsyncedLocalChanges()) {
      // クラウド側だけが更新されている（この端末はまだ何も変えていない）→ そのまま採用してよい。
      // ただし、クラウド側が論証を大きく失っているように見える場合は、意図しない
      // データ消失が他端末に伝播するのを防ぐため、確認なしでは採用しない
      if (isSuspiciousDataLoss(snapshot(), remote.data)) {
        if (isActivelyStudying()) {
          await autoResolveConflictFavoringActiveStudy(remote.data, remoteRevision, remote.updatedAt);
        } else {
          showSyncConflictModal(remote.data, remoteRevision, remote.updatedAt);
        }
        return;
      }
      adoptRemoteWholesale(remote.data, remoteRevision);
      state('☁️ クラウドの更新を取り込みました（' + new Date().toLocaleTimeString() + '）');
      maybeAutoBackupToDrive(remote.data);
      return;
    }
    // 両方のrevisionが変わっている。ただし中身（論証・学習記録・その他の同期項目）に
    // 実質的な違いが無ければ、revision番号がずれていただけの見せかけの競合なので、
    // ポップアップを出さずクラウドのrevisionに合わせるだけにする
    const localDataForDiff = snapshot();
    const diff = computeSyncDiff(localDataForDiff, remote.data);
    if (diff.isReallyIdentical) {
      revision = remoteRevision;
      localStorage.setItem(REVISION_KEY, String(revision));
      markSynced(localDataForDiff);
      state('同期済み（' + new Date().toLocaleTimeString() + '）');
      return;
    }
    // 本当に中身が違う競合。学習中はこの端末を優先して自動的にマージし、
    // そうでなければ従来どおりユーザーに選んでもらう
    if (isActivelyStudying()) {
      await autoResolveConflictFavoringActiveStudy(remote.data, remoteRevision, remote.updatedAt);
      return;
    }
    showSyncConflictModal(remote.data, remoteRevision, remote.updatedAt);
  }

  async function syncNow() {
    if (syncInFlight) return;
    syncInFlight = true;
    state('同期中…');
    try {
      await pushToCloud();
    } finally {
      syncInFlight = false;
    }
  }

  // インポート処理などデータ変更中は自動同期を一時停止し、
  // 変更が確定する前の状態で上書き保存されるのを防ぐ（syncSuspendedはwindow.ronshoSuspendSyncで制御）
  // オフライン中の変更も、この端末のlocalStorageには通常どおり即座に保存されて
  // いる（save*()関数が同期とは無関係に必ず先に書き込む）。同期側の「キュー」は
  // 専用の保存領域を持たず、hasUnsyncedLocalChanges()（最後に同期できた
  // スナップショットとの差分）そのものが「まだ送れていない変更」を表す。
  // オフライン時はここで分かりやすい状態表示に留め、オンライン復帰時の
  // 'online'イベント・保険のポーリング(LOCAL_CHANGE_CHECK_INTERVAL_MS)が
  // 自動的に再送を試みることで「復帰後に反映」を実現している
  const queue = () => {
    if (syncSuspended) return;
    clearTimeout(timer);
    timer = setTimeout(() => syncNow().catch(e => {
      if (isOfflineError(e)) {
        state('📴 オフラインのため同期を保留しています（変更はこの端末に保存済み。オンラインに戻ると自動的に同期します）');
      } else {
        state(e.message);
      }
    }), 1200);
  };

  // メインの変更検知は各save*()からの都度同期フック(ronshoSyncNotifyChange)が
  // 担っており、このポーリングはフックが呼ばれなかった場合の保険にすぎない
  // （localStorageには変更イベントが無く、同一タブ内での変更を検知する標準的な
  // 仕組みが無いため）。保険用の頻度なので、hasUnsyncedLocalChanges()（770件規模の
  // 論証データ全体を比較するため軽くない）を必要以上の頻度で呼ばないよう、
  // 短すぎない間隔にしている
  const AUTO_PULL_INTERVAL_MS = 30 * 1000;
  const MIN_PULL_GAP_MS = 10 * 1000;
  const LOCAL_CHANGE_CHECK_INTERVAL_MS = 10 * 1000;
  const isConflictModalOpen = () => {
    const root = document.getElementById('driveSyncConflictModal');
    return !!(root && root.innerHTML.trim() !== '');
  };
  function maybePullIfIdle() {
    if (syncSuspended || syncInFlight) return;
    if (isConflictModalOpen()) return; // 競合の選択待ちの間は取得し直さない
    if (hasUnsyncedLocalChanges()) return; // 未同期のローカル変更があれば、こちらからは取得しない
    const now = Date.now();
    if (now - lastPullAttempt < MIN_PULL_GAP_MS) return;
    lastPullAttempt = now;
    pullFromCloud(false).catch(() => {});
  }

  // 同期ロジックの自動テスト(tools/sync-test)から直接検証するための公開。アプリの動作には影響しない
  window.__ronshoSyncTest = {
    pushToCloud, pullFromCloud, snapshot, applyRemoteData, adoptRemoteWholesale,
    hasUnsyncedLocalChanges, computeSyncDiff, canonicalJSON,
    showSyncConflictModal, hideSyncConflictModal, buildManualMergeSnapshot,
    isActivelyStudying, autoResolveConflictFavoringActiveStudy,
    getRevision: () => revision,
    setRevision: (v) => { revision = v; localStorage.setItem(REVISION_KEY, String(v)); },
    getLast: () => last,
    markSynced
  };

  window.addEventListener('load', () => {
    const old = document.getElementById('driveSyncPanel');
    if (old) old.remove();
    const p = document.createElement('div');
    p.id = 'driveSyncPanel';
    p.className = 'driveSyncPanel';
    p.innerHTML = '<button id="driveSyncBtn" type="button" title="変更があると数秒後に自動的に同期されます。この端末とクラウドの両方で更新があった場合のみ、どちらを使うか確認のポップアップが表示されます。すぐに反映させたい場合はこのボタンを押してください。">☁️ 今すぐ同期</button> <span id="driveSyncState">起動時に自動で同期します</span>';
    const slot = document.getElementById('driveSyncPanelSlot');
    const row = document.getElementById('topStatusRow');
    if (slot) slot.appendChild(p);
    else if (row) row.appendChild(p);
    else status.after(p);
    document.getElementById('driveSyncBtn').onclick = () => {
      syncNow().catch(e => state(isOfflineError(e) ? '📴 オフラインです（変更はこの端末に保存されています）' : e.message));
    };

    pullFromCloud(true).catch(e => {
      if (e && e.isAuthError) { state('🔒 ' + e.message); return; }
      state(isOfflineError(e) ? '📴 オフラインで起動しました（この端末のデータで動作します。オンラインになると自動的に同期します）' : 'オフラインで動作中（' + e.message + '）');
    });

    // オンラインに復帰した瞬間に、保険のポーリング（最大10秒）を待たず
    // すぐに再送・再取得を試みる。オフラインに変わった瞬間は、進行中の
    // fetchが失敗して上のqueue()/pullFromCloud()側のcatchが分かりやすい
    // メッセージに置き換えるので、ここでは状態表示のみ更新する
    window.addEventListener('online', () => {
      if (hasUnsyncedLocalChanges()) queue();
      else maybePullIfIdle();
    });
    window.addEventListener('offline', () => {
      state('📴 オフラインです。変更はこの端末に保存され、オンラインに戻ると自動的に同期します。');
    });

    // ローカル変更を検知したら短い遅延で自動アップロード（保険用のポーリング）。
    // タブが非表示の間・同期処理中・競合ポップアップの選択待ちの間はスキップし、
    // iPad等での不要なCPU消費（操作中の重さの原因になりうる）を抑える
    setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (syncInFlight) return;
      if (isConflictModalOpen()) return;
      if (hasUnsyncedLocalChanges()) queue();
    }, LOCAL_CHANGE_CHECK_INTERVAL_MS);

    // 変更が無いときに限り、数分おきに他端末の更新を取り込む安全策
    setInterval(maybePullIfIdle, AUTO_PULL_INTERVAL_MS);

    // タブを再度開いた／フォーカスした直後にも、変更が無ければ最新状態を取り込む
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') maybePullIfIdle();
    });
    window.addEventListener('focus', maybePullIfIdle);
  });
})();
