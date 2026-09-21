// --- 初期化：保存データの復元（すべての関数・定数が定義された後に実行） ---
loadStudyLog();
loadManualLog();
loadEntries();
if (typeof migrateLegacyXpIfNeeded === 'function') migrateLegacyXpIfNeeded();
if (typeof migratePastExamXpIfNeeded === 'function') migratePastExamXpIfNeeded();
if (entries.length > 0) {
  downloadBtn.style.display = 'inline-block';
  downloadLogBtn.style.display = 'inline-block';
  renderAll();
  // ペットの吹き出し（画面上のオーバーレイなので、消えてもレイアウトの高さに影響しない）で知らせる。
  // ペット自体や吹き出しを非表示にしている場合は、従来どおりステータス欄に表示する。
  const restoreMsg = '📂 前回読み込んだ ' + entries.length + '件のデータを復元しました。';
  if (window.ronshoPetControl && window.ronshoPetControl.isEnabled() && window.ronshoPetControl.isBubbleEnabled()) {
    window.ronshoPetControl.say(restoreMsg);
  } else {
    status.textContent = restoreMsg;
  }
}
renderPastLogs();
if (typeof renderBookPage === 'function') renderBookPage();
const dupArchiveToggleBtn = document.getElementById('dupArchiveToggleBtn');
if (dupArchiveToggleBtn) dupArchiveToggleBtn.addEventListener('click', () => {
  dupArchiveListVisible = !dupArchiveListVisible;
  renderDupArchive();
});
renderDupArchive();
renderSyncConflictBanner();
if (typeof renderBackupReminderBanner === 'function') renderBackupReminderBanner();
if (typeof renderBackupLastInfo === 'function') renderBackupLastInfo();
if (typeof renderGamificationPanel === 'function') renderGamificationPanel();
if (typeof renderBadgesSection === 'function') renderBadgesSection();
if (typeof renderSummarySection === 'function') renderSummarySection();
if (typeof renderQuoteCard === 'function') renderQuoteCard();
