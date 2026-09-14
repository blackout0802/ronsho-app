// GAS(Google Apps Script)側ソースの参照用コピー(2026-08-27 時点、プロジェクト「論証集アプリ同期」の コード.gs)。
// デプロイされている実体は GAS エディタ側にあり、このファイルを変更しても反映されない。
// このファイルを更新した場合は、GASエディタ側のコード.gsに手動で反映し、
// 「デプロイを管理」から既存のデプロイを「新しいバージョン」で更新すること
// （URLは変わらないため、アプリ側(drive-sync.js)の設定変更は不要）。
//
// 同期の仕様: GET は保存済み JSON({revision, updatedAt, data})をそのまま返す。
// POST（action省略、または'sync'）は revision が一致すれば丸ごと保存して revision+1、
// 一致しなければ {ok:false, reason:'conflict', latest:(現在の全データ)} を返す。
// マージや削除の判断はすべてクライアント側(drive-sync.js)で行う。
//
// POST { action: 'backup', data, fileName } は、上記の同期用ファイルとは別に、
// 専用フォルダに日付入りのバックアップファイルを1件追加保存する（revisionには無関係）。
// 古いバックアップは件数上限を超えたら自動的に削除する。
const FILE_NAME = 'ronsho-app-sync-data.json';
const BACKUP_FOLDER_NAME = 'ronsho-app-backups';
// アプリ側で同期成功のたびに自動バックアップ（最短15分間隔）も行うようになったため、
// 手動バックアップと合わせてすぐに古いものから消えてしまわないよう保持件数を増やしている
const BACKUP_KEEP_COUNT = 200;

function getOrCreateFile() {
  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty('FILE_ID');
  if (savedId) {
    try {
      return DriveApp.getFileById(savedId);
    } catch (e) {
      // 保存されていたIDが無効な場合は下で作り直す
    }
  }
  const files = DriveApp.getFilesByName(FILE_NAME);
  if (files.hasNext()) {
    const file = files.next();
    props.setProperty('FILE_ID', file.getId());
    return file;
  }
  const initial = JSON.stringify({ revision: 0, updatedAt: new Date().toISOString(), data: {} });
  const file = DriveApp.createFile(FILE_NAME, initial, MimeType.PLAIN_TEXT);
  props.setProperty('FILE_ID', file.getId());
  return file;
}

function getOrCreateBackupFolder() {
  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty('BACKUP_FOLDER_ID');
  if (savedId) {
    try {
      return DriveApp.getFolderById(savedId);
    } catch (e) {
      // 保存されていたIDが無効な場合は下で作り直す
    }
  }
  const folders = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(BACKUP_FOLDER_NAME);
  props.setProperty('BACKUP_FOLDER_ID', folder.getId());
  return folder;
}

function handleBackupUpload(request) {
  const folder = getOrCreateBackupFolder();
  const fileName = request.fileName || ('論証集バックアップ_' + new Date().toISOString().slice(0, 10) + '.json');
  folder.createFile(fileName, JSON.stringify(request.data), MimeType.PLAIN_TEXT);
  pruneOldBackups(folder);
  return jsonResponse({ ok: true });
}

function pruneOldBackups(folder) {
  const files = [];
  const it = folder.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    files.push({ file: f, created: f.getDateCreated().getTime() });
  }
  if (files.length <= BACKUP_KEEP_COUNT) return;
  files.sort((a, b) => b.created - a.created);
  files.slice(BACKUP_KEEP_COUNT).forEach(entry => entry.file.setTrashed(true));
}

function doGet() {
  const file = getOrCreateFile();
  const text = file.getBlob().getDataAsString() || '{"revision":0,"data":{}}';
  return jsonResponse(JSON.parse(text));
}

function doPost(e) {
  const request = JSON.parse(e.postData.contents);
  if (request.action === 'backup') {
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      return handleBackupUpload(request);
    } finally {
      lock.releaseLock();
    }
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const file = getOrCreateFile();
    const currentText = file.getBlob().getDataAsString() || '{"revision":0,"data":{}}';
    const current = JSON.parse(currentText);

    if (request.revision !== current.revision) {
      return jsonResponse({ ok: false, reason: 'conflict', latest: current });
    }

    const next = {
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
      data: request.data
    };
    file.setContent(JSON.stringify(next));
    return jsonResponse({ ok: true, result: next });
  } finally {
    lock.releaseLock();
  }
}

function jsonResponse(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
