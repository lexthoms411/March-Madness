function adminAddManualPointsWeb(payload) {
  const adminUser = assertAdminSession_();
  if (!adminUser.canPoints) throw new Error('Permission denied.');

  const mnemonic = String(payload?.mnemonic || '').trim();
  const type = String(payload?.type || 'question').trim(); // 'question' | 'bonus'
  const reason = String(payload?.reason || '').trim();
  const points = Number(payload?.points);

  let questionId = String(payload?.questionId || '').trim();

  if (!mnemonic) throw new Error('Mnemonic is required.');
  if (!Number.isFinite(points)) throw new Error('Points must be a number.');
  if (!reason) throw new Error('Reason is required.');

  if (type === 'bonus') {
    questionId = 'BONUS';
  } else {
    if (!questionId) throw new Error('Question ID is required for Question Points.');
  }

  // IMPORTANT: addManualPoints must be web-safe (uses openById or your helper)
  const ok = addManualPoints(mnemonic, questionId, points, reason, type);

  logAdminAction_(adminUser, 'ADD_MANUAL_POINTS', { mnemonic, questionId, points, reason, type }, ok ? 'OK' : 'FAILED');

  if (!ok) throw new Error('addManualPoints returned false. Check your Error Log sheet.');
  return { ok: true, message: `Added ${points} points to ${mnemonic}.` };
}