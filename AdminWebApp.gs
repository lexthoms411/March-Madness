/******************************************************
 * AdminWebApp.gs (FIXED)
 * ----------------------------------------------------
 * Traditional login (email + shared key) WITHOUT OAuth.
 *
 * - Keys are stored in Script Properties, NOT in Sheets.
 * - Permissions are stored in ADMIN_USERS sheet.
 * - Session is stored in UserProperties with TTL.
 *
 * REQUIRED:
 * 1) ADMIN_USERS sheet with headers:
 *    Email, Active, CanRoster, CanQuestions, CanPoints, CanAudit, CanTeams
 *    (Optional: Name, Unit, Role)
 *
 * 2) Script Properties per admin key:
 *    ADMIN_KEY_<email normalized> = <their key>
 *    Example: ADMIN_KEY_angela_f_gmail_com = k_xxx...
 *
 * HTML files:
 * - AdminLogin.html calls google.script.run.adminLogin({email, key})
 * - AdminPanel.html calls:
 *      adminGetContext()
 *      adminRun(action, payload)
 *      adminLogout()
 ******************************************************/

const ADMIN_SHEET_NAME = 'ADMIN_USERS';
const ADMIN_AUDIT_SHEET_NAME = 'Admin_Audit';

// Session TTL (adjust)
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// -------------------------------
// SESSION / AUTH
// -------------------------------

function hasAdminSession_() {
  const up = PropertiesService.getUserProperties();
  const ok = up.getProperty('ADMIN_SESSION') === '1';
  const created = Number(up.getProperty('ADMIN_SESSION_CREATED') || 0);
  if (!ok || !created) return false;

  if (Date.now() - created > ADMIN_SESSION_TTL_MS) {
    adminLogout();
    return false;
  }
  return true;
}

function assertAdminSession_() {
  if (!hasAdminSession_()) throw new Error('NOT_AUTHENTICATED');

  const up = PropertiesService.getUserProperties();
  const email = String(up.getProperty('ADMIN_SESSION_EMAIL') || '').toLowerCase().trim();
  if (!email) throw new Error('NOT_AUTHENTICATED');

  const adminUser = getAdminUserByEmail_(email);
  if (!adminUser || !adminUser.active) {
    adminLogout();
    throw new Error('Not authorized (inactive or missing).');
  }
  return adminUser;
}

/**
 * Called from AdminLogin.html
 * payload: { email, key }
 */
function adminLogin(a, b) {
  // Accept adminLogin({email,key}) OR adminLogin(email,key)
  const payload = (a && typeof a === 'object') ? a : { email: a, key: b };

  const email = String(payload?.email || '').toLowerCase().trim();
  const key = String(payload?.key || '').trim();

  if (!email || !key) throw new Error('Email and shared key are required.');

  const adminUser = getAdminUserByEmail_(email);
  if (!adminUser || !adminUser.active) throw new Error('Not authorized.');

  const expected = getAdminKeyForEmail_(email);
  if (!expected) throw new Error('No key configured for this admin.');
  if (!timingSafeEqual_(key, expected)) throw new Error('Invalid shared key.');

  const up = PropertiesService.getUserProperties();
  up.setProperty('ADMIN_SESSION', '1');
  up.setProperty('ADMIN_SESSION_CREATED', String(Date.now()));
  up.setProperty('ADMIN_SESSION_EMAIL', email);

  logAdminAction_(adminUser, 'LOGIN', { email }, 'OK');

  return {
    ok: true,
    email: adminUser.email,
    name: adminUser.name,
    unit: adminUser.unit,
    role: adminUser.role,
    isOwner: isOwner_(adminUser),
    canRoster: adminUser.canRoster,
    canQuestions: adminUser.canQuestions,
    canPoints: adminUser.canPoints,
    canAudit: adminUser.canAudit,
    canTeams: adminUser.canTeams,
    allowedActions: adminListAllowedActionsForUser(adminUser),
  };
}


function adminLogout() {
  const up = PropertiesService.getUserProperties();
  ['ADMIN_SESSION', 'ADMIN_SESSION_CREATED', 'ADMIN_SESSION_EMAIL'].forEach(k => up.deleteProperty(k));
  return { ok: true };
}

function adminGetContext() {
  const adminUser = assertAdminSession_();
  return {
    email: adminUser.email,
    name: adminUser.name,
    unit: adminUser.unit,
    role: adminUser.role,
    canRoster: adminUser.canRoster,
    canQuestions: adminUser.canQuestions,
    canPoints: adminUser.canPoints,
    canAudit: adminUser.canAudit,
    canTeams: adminUser.canTeams,
    active: adminUser.active,
    isOwner: isOwner_(adminUser),
    allowedActions: adminListAllowedActionsForUser(adminUser),
  };
}

// -------------------------------
// KEYS IN SCRIPT PROPERTIES
// -------------------------------

function getAdminKeyForEmail_(email) {
  const propName = 'ADMIN_KEY_' + emailToPropSuffix_(email);
  return PropertiesService.getScriptProperties().getProperty(propName) || '';
}

function emailToPropSuffix_(email) {
  // admin@example.com -> admin_example_com
  return String(email).toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
}

// Nice-to-have: prevents timing leaks
function timingSafeEqual_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function toBool_(v) {
  if (v === true) return true;
  if (v === false || v === null || v === undefined) return false;
  const s = String(v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y' || s === 'on';
}

// -------------------------------
// ADMIN LOOKUP & PERMISSIONS
// -------------------------------

function getAdminUserByEmail_(email) {
  email = String(email).toLowerCase().trim();

  const sheet = SpreadsheetApp.getActive().getSheetByName(ADMIN_SHEET_NAME);
  if (!sheet) throw new Error(`${ADMIN_SHEET_NAME} sheet missing.`);

  const values = sheet.getDataRange().getValues();
  if (!values.length) throw new Error(`${ADMIN_SHEET_NAME} is empty.`);

  const headers = values.shift().map(h => String(h || '').trim());
  const normHeaders = headers.map(h => h.toLowerCase().replace(/[^a-z0-9]+/g, ''));

  function findIdx_(aliases) {
    const target = aliases.map(a => String(a).toLowerCase().replace(/[^a-z0-9]+/g, ''));
    for (let i = 0; i < normHeaders.length; i++) {
      if (target.includes(normHeaders[i])) return i;
    }
    return -1;
  }

  const idx = {
    email: findIdx_(['Email']),
    name: findIdx_(['Name']),
    unit: findIdx_(['Unit']),
    role: findIdx_(['Role']),
    active: findIdx_(['Active', 'IsActive', 'Enabled']),
    canRoster: findIdx_(['CanRoster', 'Roster', 'CanEditRoster']),
    canQuestions: findIdx_(['CanQuestions', 'Questions', 'CanEditQuestions']),
    canPoints: findIdx_(['CanPoints', 'Points', 'ManualPoints']),
    canAudit: findIdx_(['CanAudit', 'Audit', 'Reports', 'CanReports']),
    canTeams: findIdx_(['CanTeams', 'Teams', 'TeamTools', 'CanEditTeams'])
  };

  if (idx.email < 0) throw new Error(`${ADMIN_SHEET_NAME} is missing an Email column.`);

  const row = values.find(r => String(r[idx.email] || '').toLowerCase().trim() === email);
  if (!row) return null;

  return {
    email,
    name: idx.name >= 0 ? String(row[idx.name] || '') : '',
    unit: idx.unit >= 0 ? String(row[idx.unit] || '') : '',
    role: idx.role >= 0 ? String(row[idx.role] || '') : '',

    active: idx.active >= 0 ? toBool_(row[idx.active]) : false,
    canRoster: idx.canRoster >= 0 ? toBool_(row[idx.canRoster]) : false,
    canQuestions: idx.canQuestions >= 0 ? toBool_(row[idx.canQuestions]) : false,
    canPoints: idx.canPoints >= 0 ? toBool_(row[idx.canPoints]) : false,
    canAudit: idx.canAudit >= 0 ? toBool_(row[idx.canAudit]) : false,
    canTeams: idx.canTeams >= 0 ? toBool_(row[idx.canTeams]) : false,
  };
}

const OWNER_EMAIL_OVERRIDE = ''; // optional hard lock: 'lexthoms411@gmail.com'

function isOwner_(adminUser) {
  if (!adminUser) return false;
  if (OWNER_EMAIL_OVERRIDE && adminUser.email === String(OWNER_EMAIL_OVERRIDE).toLowerCase().trim()) return true;
  return String(adminUser.role || '').toLowerCase().trim() === 'owner';
}

// -------------------------------
// AUDIT LOGGING
// -------------------------------

function ensureAdminAuditSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(ADMIN_AUDIT_SHEET_NAME);
  if (!sh) sh = ss.insertSheet(ADMIN_AUDIT_SHEET_NAME);

  if (sh.getLastRow() === 0) {
    sh.appendRow(['Timestamp', 'Email', 'Name', 'Unit', 'Role', 'Action', 'Payload', 'Result']);
  }
  return sh;
}

function logAdminAction_(adminUser, action, payload, result) {
  const sh = ensureAdminAuditSheet_();
  sh.appendRow([
    new Date(),
    adminUser?.email || '',
    adminUser?.name || '',
    adminUser?.unit || '',
    adminUser?.role || '',
    action,
    JSON.stringify(payload || {}),
    result || 'OK',
  ]);
}

// -------------------------------
// ACTION ALLOWLIST (your rules)
// -------------------------------

const ADMIN_ACTIONS = Object.freeze({
  // Grading Management
  ADD_MANUAL_POINTS: { perm: 'canPoints', fn: 'adminAddManualPointsWeb', uiOnly: false },
  ROSTER_LIST: { perm: 'canRoster', fn: 'adminListRosterWeb', uiOnly: false },
  ROSTER_SAVE: { perm: 'canRoster', fn: 'adminSaveRosterWeb', uiOnly: false },
  ROSTER_REMOVE: { perm: 'canRoster', fn: 'adminRemoveRosterWeb', uiOnly: false },
  TEAM_ASSIGN: { perm: 'canTeams', fn: 'adminAssignTeamWeb', uiOnly: false },
  REPORT_UNIT_ANALYTICS: { perm: 'canAudit', fn: 'adminRunUnitAnalyticsReportWeb', uiOnly: false },

  // Question Management (all except Reset Daily Questions Trigger)
  ADD_NEW_QUESTION: { perm: 'canQuestions', fn: 'showQuestionBankEditor', uiOnly: true },
  EDIT_EXISTING_QUESTION: { perm: 'canQuestions', fn: 'editExistingQuestion', uiOnly: true },
  UPDATE_DAILY_QUESTIONS: { perm: 'canQuestions', fn: 'updateDailyQuestions', uiOnly: false },
  QUESTION_LIST: { perm: 'canQuestions', fn: 'adminListQuestionBankWeb', uiOnly: false },
  QUESTION_SAVE: { perm: 'canQuestions', fn: 'adminSaveQuestionBankWeb', uiOnly: false },
  RESET_DAILY_QUESTIONS_TRIGGER: { perm: 'owner', fn: 'resetDailyQuestionsTrigger', uiOnly: false },

  // Reports (all)
  REPORT_COMPREHENSIVE: { perm: 'canAudit', fn: 'generateComprehensiveReports', uiOnly: false },
  REPORT_DETAILED_QUESTION: { perm: 'canAudit', fn: 'generateDetailedQuestionReport', uiOnly: false },
  EXPORT_REPORT_PDF: { perm: 'canAudit', fn: 'exportReportAsPDF', uiOnly: false },
  EXPORT_REPORT_EXCEL: { perm: 'canAudit', fn: 'exportReportAsExcel', uiOnly: false },
  INIT_TOPIC_POLICIES: { perm: 'canAudit', fn: 'initializeMarchMadnessSheets', uiOnly: false },
  OPEN_REPORTS_MANAGER: { perm: 'canAudit', fn: 'showReportsManager', uiOnly: true },
  OPEN_TOPIC_MANAGER: { perm: 'canAudit', fn: 'showTopicManager', uiOnly: true },
  OPEN_ASSIGN_TOPICS: { perm: 'canAudit', fn: 'showQuestionAssignment', uiOnly: true },

  // ADMIN_USERS page functions bucket (you said: "all functions listed on ADMIN_USERS page")
  // You can add allowlisted actions here later as you convert them to web-native.

  // Team Tools
  SHUFFLE_TEAMS_1: { perm: 'canTeams', fn: 'shuffleTeams_1TraumaSurg', uiOnly: false },
  SHUFFLE_TEAMS_3: { perm: 'canTeams', fn: 'shuffleTeams_3MedOnc', uiOnly: false },
  SHUFFLE_TEAMS_5: { perm: 'canTeams', fn: 'shuffleTeams_5SurgSpec', uiOnly: false },
  SHUFFLE_TEAMS_6: { perm: 'canTeams', fn: 'shuffleTeams_6MedSpec', uiOnly: false },
  SHUFFLE_TEAMS_7: { perm: 'canTeams', fn: 'shuffleTeams_7PSCI', uiOnly: false },
  REBUILD_TEAM_MEMBERS: { perm: 'canTeams', fn: 'rebuildTeamsMembersData', uiOnly: false },
});

// -------------------------------
// DISPATCHER (single safe entry)
// -------------------------------

function adminRun(action, payload) {
  const adminUser = assertAdminSession_();

  const key = String(action || '').trim();
  const meta = ADMIN_ACTIONS[key];
  if (!meta) throw new Error('Unknown or disallowed action: ' + key);

  // permission enforcement
  if (meta.perm === 'owner') {
    if (!isOwner_(adminUser)) throw new Error('Owner-only action.');
  } else {
    if (!adminUser[meta.perm]) throw new Error('Permission denied.');
  }

  const fnName = meta.fn;
  const fn = this[fnName];
  if (typeof fn !== 'function') throw new Error('Missing function: ' + fnName);

  // Web app context cannot render Spreadsheet UI dialogs/sidebars.
  if (meta.uiOnly) {
    logAdminAction_(adminUser, key, payload, 'SKIPPED_UI_ONLY');
    return {
      ok: true,
      message: 'This action is UI-only in the spreadsheet and is not runnable from the web app.',
      raw: null
    };
  }

  const result = fn(payload);

  // audit log
  logAdminAction_(adminUser, key, payload, 'OK');

  return { ok: true, message: 'OK', raw: result };
}

function adminListAllowedActionsForUser(adminUser) {
  const allowed = [];
  Object.keys(ADMIN_ACTIONS).forEach((k) => {
    const meta = ADMIN_ACTIONS[k];
    if (meta.uiOnly) return; // Web app should only show runnable actions.
    if (meta.perm === 'owner') {
      if (isOwner_(adminUser)) allowed.push(k);
    } else {
      if (adminUser[meta.perm]) allowed.push(k);
    }
  });
  return allowed;
}

function getQuestionBankSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('Question Bank');
  if (!sh) throw new Error('Question Bank sheet not found.');
  return sh;
}

function findHeaderIndex_(headers, aliases) {
  const norm = headers.map(h => String(h || '').trim().toLowerCase());
  for (let i = 0; i < norm.length; i++) {
    if (aliases.includes(norm[i])) return i;
  }
  return -1;
}

function getScoresSchema_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Scores');
  if (!sh) throw new Error('Scores sheet not found.');
  const values = sh.getDataRange().getValues();
  if (!values.length) throw new Error('Scores sheet is empty.');
  const headers = values[0];
  return {
    sheet: sh,
    values,
    headers,
    idx: {
      mnemonic: findHeaderIndex_(headers, ['mnemonic']),
      name: findHeaderIndex_(headers, ['name', 'full name']),
      role: findHeaderIndex_(headers, ['role']),
      unit: findHeaderIndex_(headers, ['unit', 'department', 'dept']),
      score: findHeaderIndex_(headers, ['score', 'total score', 'points', 'total points']),
      attempts: findHeaderIndex_(headers, ['attempts', 'question attempts'])
    }
  };
}

function getTeamsSchema_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const requiredAliases = {
    team: ['team', 'team name'],
    mnemonic: ['mnemonic', 'member', 'member mnemonic']
  };
  function hasRequiredHeaders_(headers) {
    const teamIdx = findHeaderIndex_(headers, requiredAliases.team);
    const mnemonicIdx = findHeaderIndex_(headers, requiredAliases.mnemonic);
    return teamIdx >= 0 && mnemonicIdx >= 0;
  }
  const candidates = [
    'Teams_Members',
    'Teams Members',
    'Team_Members',
    'Team Members',
    'Teams_Members_Data',
    'Teams Members Data',
    'Teams',
    'Teams_Master'
  ];
  let sh = null;
  let headers = null;
  const presentCandidates = [];
  for (let i = 0; i < candidates.length; i++) {
    const candidate = ss.getSheetByName(candidates[i]);
    if (!candidate) continue;
    presentCandidates.push(candidates[i]);
    const data = candidate.getDataRange().getValues();
    if (!data.length) continue;
    const rowHeaders = data[0];
    if (hasRequiredHeaders_(rowHeaders)) {
      sh = candidate;
      headers = rowHeaders;
      break;
    }
  }
  if (!sh) {
    if (!presentCandidates.length) {
      throw new Error('Teams sheet not found. Expected one of: ' + candidates.join(', '));
    }
    throw new Error(
      'No valid team-members sheet found. Found: ' + presentCandidates.join(', ') +
      '. Required headers include Team Name and Mnemonic in row 1.'
    );
  }
  const values = sh.getDataRange().getValues();
  if (!values.length) throw new Error('Teams sheet is empty.');
  headers = headers || values[0];
  return {
    sheet: sh,
    values,
    headers,
    idx: {
      team: findHeaderIndex_(headers, ['team', 'team name']),
      mnemonic: findHeaderIndex_(headers, ['mnemonic', 'member', 'member mnemonic']),
      unit: findHeaderIndex_(headers, ['unit', 'department', 'dept'])
    }
  };
}

function normalizeUnit_(u) {
  return String(u || '').trim();
}

function normalizeUnitKey_(u) {
  return normalizeUnit_(u).toUpperCase();
}

function normalizeMnemonic_(m) {
  return String(m || '').trim().toLowerCase();
}

function getTeamMemberInfoByMnemonicMap_() {
  const t = getTeamsSchema_();
  if (t.idx.mnemonic < 0) throw new Error('Teams sheet must contain Mnemonic column.');
  const map = new Map();
  for (let i = 1; i < t.values.length; i++) {
    const mnemonic = normalizeMnemonic_(t.values[i][t.idx.mnemonic]);
    if (!mnemonic) continue;
    const team = t.idx.team >= 0 ? String(t.values[i][t.idx.team] || '').trim() : '';
    const unit = t.idx.unit >= 0 ? normalizeUnit_(t.values[i][t.idx.unit]) : '';
    map.set(mnemonic, { team, unit });
  }
  return map;
}

function getTeamByMnemonicMap_() {
  const t = getTeamsSchema_();
  if (t.idx.team < 0 || t.idx.mnemonic < 0) {
    throw new Error('Teams sheet must contain Team and Mnemonic columns.');
  }
  const map = new Map();
  for (let i = 1; i < t.values.length; i++) {
    const team = String(t.values[i][t.idx.team] || '').trim();
    const mnemonic = normalizeMnemonic_(t.values[i][t.idx.mnemonic]);
    if (!mnemonic) continue;
    map.set(mnemonic, team);
  }
  return map;
}

function resolveTargetUnitForAdmin_(adminUser, payload) {
  const requested = normalizeUnit_(payload?.unit || '');
  const adminUnit = normalizeUnit_(adminUser?.unit || '');
  const requestedKey = normalizeUnitKey_(requested);
  const adminUnitKey = normalizeUnitKey_(adminUnit);
  const owner = isOwner_(adminUser);

  if (owner) {
    // Owner can run all units or specific unit.
    return requested;
  }
  if (!adminUnitKey) throw new Error('Your admin account has no unit assigned.');
  if (requestedKey && requestedKey !== adminUnitKey) {
    throw new Error('You can only access your own unit.');
  }
  return adminUnit;
}

function adminListRosterWeb(payload) {
  const adminUser = assertAdminSession_();
  const owner = isOwner_(adminUser);
  const targetUnit = resolveTargetUnitForAdmin_(adminUser, payload);
  const s = getScoresSchema_();
  const teamMemberInfo = getTeamMemberInfoByMnemonicMap_();
  const rows = [];
  const unitMap = new Map(); // key -> display value
  const targetUnitKey = normalizeUnitKey_(targetUnit);

  if (s.idx.mnemonic < 0) throw new Error('Scores sheet must contain Mnemonic column.');

  for (let i = 1; i < s.values.length; i++) {
    const r = s.values[i];
    const mnemonic = normalizeMnemonic_(r[s.idx.mnemonic]);
    if (!mnemonic) continue;
    const name = s.idx.name >= 0 ? String(r[s.idx.name] || '').trim() : '';
    const role = s.idx.role >= 0 ? String(r[s.idx.role] || '').trim().toUpperCase() : '';
    const memberInfo = teamMemberInfo.get(mnemonic) || {};
    const unit = (s.idx.unit >= 0 ? normalizeUnit_(r[s.idx.unit]) : '') || normalizeUnit_(memberInfo.unit || '');
    const team = String(memberInfo.team || '').trim();
    const score = s.idx.score >= 0 ? Number(r[s.idx.score]) || 0 : 0;

    // Skip non-person header/summary rows accidentally present in Scores data.
    if (!name && !role && !unit && !team) continue;

    const unitKey = normalizeUnitKey_(unit);
    if (!owner && targetUnitKey && unitKey !== targetUnitKey) continue;
    if (owner && targetUnitKey && unitKey !== targetUnitKey) continue;

    if (unitKey && !unitMap.has(unitKey)) unitMap.set(unitKey, unit);
    rows.push({
      rowNumber: i + 1,
      mnemonic,
      name,
      role,
      unit,
      score,
      team
    });
  }

  rows.sort((a, b) => a.mnemonic.localeCompare(b.mnemonic));
  return {
    ok: true,
    roster: rows,
    owner,
    adminUnit: normalizeUnit_(adminUser?.unit || ''),
    targetUnit: targetUnit || '',
    units: Array.from(unitMap.values()).sort((a, b) => String(a).localeCompare(String(b)))
  };
}

function adminSaveRosterWeb(payload) {
  const adminUser = assertAdminSession_();
  const owner = isOwner_(adminUser);
  const targetUnit = resolveTargetUnitForAdmin_(adminUser, payload);
  const s = getScoresSchema_();

  if (s.idx.mnemonic < 0) throw new Error('Scores sheet must contain Mnemonic column.');
  const mnemonic = normalizeMnemonic_(payload?.mnemonic);
  if (!mnemonic) throw new Error('Mnemonic is required.');

  const name = String(payload?.name || '').trim();
  const role = String(payload?.role || '').trim().toUpperCase();
  const unit = normalizeUnit_(payload?.unit || targetUnit);
  const unitKey = normalizeUnitKey_(unit);
  const targetUnitKey = normalizeUnitKey_(targetUnit);
  const points = Number(payload?.score);

  if (!name) throw new Error('Name is required.');
  if (!role) throw new Error('Role is required.');
  if (!unitKey) throw new Error('Unit is required.');
  if (!owner && unitKey !== targetUnitKey) throw new Error('You can only edit roster entries in your unit.');

  let rowNumber = -1;
  const teamMemberInfo = getTeamMemberInfoByMnemonicMap_();
  for (let i = 1; i < s.values.length; i++) {
    const existingMnemonic = normalizeMnemonic_(s.values[i][s.idx.mnemonic]);
    if (existingMnemonic === mnemonic) {
      rowNumber = i + 1;
      const existingUnitFromScores = s.idx.unit >= 0 ? normalizeUnit_(s.values[i][s.idx.unit]) : '';
      const existingUnit = existingUnitFromScores || normalizeUnit_((teamMemberInfo.get(mnemonic) || {}).unit || '');
      const existingUnitKey = normalizeUnitKey_(existingUnit);
      if (!owner && existingUnitKey && existingUnitKey !== targetUnitKey) {
        throw new Error('You can only edit roster entries in your unit.');
      }
      break;
    }
  }

  const writeScore = Number.isFinite(points) ? points : 0;
  if (rowNumber > 0) {
    if (s.idx.name >= 0) s.sheet.getRange(rowNumber, s.idx.name + 1).setValue(name);
    if (s.idx.role >= 0) s.sheet.getRange(rowNumber, s.idx.role + 1).setValue(role);
    if (s.idx.unit >= 0) s.sheet.getRange(rowNumber, s.idx.unit + 1).setValue(unit);
    if (s.idx.score >= 0 && Number.isFinite(points)) s.sheet.getRange(rowNumber, s.idx.score + 1).setValue(writeScore);
  } else {
    const newRow = new Array(s.headers.length).fill('');
    newRow[s.idx.mnemonic] = mnemonic;
    if (s.idx.name >= 0) newRow[s.idx.name] = name;
    if (s.idx.role >= 0) newRow[s.idx.role] = role;
    if (s.idx.unit >= 0) newRow[s.idx.unit] = unit;
    if (s.idx.score >= 0) newRow[s.idx.score] = writeScore;
    if (s.idx.attempts >= 0) newRow[s.idx.attempts] = '{}';
    s.sheet.appendRow(newRow);
  }

  return { ok: true, mnemonic, created: rowNumber < 0 };
}

function adminRemoveRosterWeb(payload) {
  const adminUser = assertAdminSession_();
  const owner = isOwner_(adminUser);
  const targetUnit = resolveTargetUnitForAdmin_(adminUser, payload);
  const targetUnitKey = normalizeUnitKey_(targetUnit);
  const mnemonic = normalizeMnemonic_(payload?.mnemonic);
  if (!mnemonic) throw new Error('Mnemonic is required.');

  const s = getScoresSchema_();
  if (s.idx.mnemonic < 0) throw new Error('Scores sheet must contain Mnemonic column.');

  let rowToDelete = -1;
  let existingUnit = '';
  const teamMemberInfo = getTeamMemberInfoByMnemonicMap_();
  for (let i = 1; i < s.values.length; i++) {
    const m = normalizeMnemonic_(s.values[i][s.idx.mnemonic]);
    if (m === mnemonic) {
      rowToDelete = i + 1;
      const unitFromScores = s.idx.unit >= 0 ? normalizeUnit_(s.values[i][s.idx.unit]) : '';
      existingUnit = unitFromScores || normalizeUnit_((teamMemberInfo.get(mnemonic) || {}).unit || '');
      break;
    }
  }
  if (rowToDelete < 0) throw new Error('Roster member not found.');
  if (!owner && normalizeUnitKey_(existingUnit) && normalizeUnitKey_(existingUnit) !== targetUnitKey) {
    throw new Error('You can only remove roster entries in your unit.');
  }

  s.sheet.deleteRow(rowToDelete);

  // Remove team mapping rows for this mnemonic as well.
  const t = getTeamsSchema_();
  if (t.idx.mnemonic >= 0) {
    const deleteRows = [];
    for (let i = 1; i < t.values.length; i++) {
      if (normalizeMnemonic_(t.values[i][t.idx.mnemonic]) === mnemonic) deleteRows.push(i + 1);
    }
    for (let i = deleteRows.length - 1; i >= 0; i--) t.sheet.deleteRow(deleteRows[i]);
  }

  return { ok: true, mnemonic };
}

function adminAssignTeamWeb(payload) {
  const adminUser = assertAdminSession_();
  const owner = isOwner_(adminUser);
  const targetUnit = resolveTargetUnitForAdmin_(adminUser, payload);
  const targetUnitKey = normalizeUnitKey_(targetUnit);
  const mnemonic = normalizeMnemonic_(payload?.mnemonic);
  const team = String(payload?.team || '').trim();
  if (!mnemonic) throw new Error('Mnemonic is required.');

  const s = getScoresSchema_();
  if (s.idx.mnemonic < 0) throw new Error('Scores sheet must contain Mnemonic column.');

  let memberUnit = '';
  let foundMember = false;
  const teamMemberInfo = getTeamMemberInfoByMnemonicMap_();
  for (let i = 1; i < s.values.length; i++) {
    if (normalizeMnemonic_(s.values[i][s.idx.mnemonic]) !== mnemonic) continue;
    foundMember = true;
    const unitFromScores = s.idx.unit >= 0 ? normalizeUnit_(s.values[i][s.idx.unit]) : '';
    memberUnit = unitFromScores || normalizeUnit_((teamMemberInfo.get(mnemonic) || {}).unit || '');
    break;
  }
  if (!foundMember) throw new Error('Mnemonic not found in roster.');
  if (!owner && normalizeUnitKey_(memberUnit) && normalizeUnitKey_(memberUnit) !== targetUnitKey) {
    throw new Error('You can only manage teams for your unit.');
  }

  const t = getTeamsSchema_();
  if (t.idx.team < 0 || t.idx.mnemonic < 0) {
    throw new Error('Teams sheet must contain Team and Mnemonic columns.');
  }

  // Delete any existing membership rows for this mnemonic.
  const deleteRows = [];
  for (let i = 1; i < t.values.length; i++) {
    if (normalizeMnemonic_(t.values[i][t.idx.mnemonic]) === mnemonic) deleteRows.push(i + 1);
  }
  for (let i = deleteRows.length - 1; i >= 0; i--) t.sheet.deleteRow(deleteRows[i]);

  // If team blank, this is an unassign operation.
  if (!team) return { ok: true, mnemonic, team: '' };

  const newRow = new Array(t.headers.length).fill('');
  newRow[t.idx.team] = team;
  newRow[t.idx.mnemonic] = mnemonic;
  t.sheet.appendRow(newRow);

  return { ok: true, mnemonic, team };
}

function adminRunUnitAnalyticsReportWeb(payload) {
  const adminUser = assertAdminSession_();
  const owner = isOwner_(adminUser);
  const requestedScope = String(payload?.scope || '').toUpperCase().trim();
  const requestedUnit = normalizeUnit_(payload?.unit || '');
  const requestedUnitKey = normalizeUnitKey_(requestedUnit);
  const requestedRole = String(payload?.roleFilter || 'All').trim().toUpperCase();
  const roleFilter = (requestedRole === 'RN' || requestedRole === 'PCA' || requestedRole === 'LPN') ? requestedRole : 'All';
  const adminUnit = normalizeUnit_(adminUser?.unit || '');
  const adminUnitKey = normalizeUnitKey_(adminUnit);

  let scope = requestedScope || 'MY_UNIT';
  if (!owner && scope !== 'MY_UNIT') scope = 'MY_UNIT';
  if (!owner && !adminUnitKey) throw new Error('Your admin account has no unit assigned.');

  const s = getScoresSchema_();
  if (s.idx.mnemonic < 0) throw new Error('Scores sheet must contain Mnemonic column.');
  const teamMemberInfo = getTeamMemberInfoByMnemonicMap_();

  const allMnemonics = [];
  const unitMnemonics = [];
  let targetUnit = '';

  if (scope === 'ALL') {
    targetUnit = 'ALL';
  } else if (scope === 'UNIT') {
    if (!owner) throw new Error('Only owner can run arbitrary unit reports.');
    if (!requestedUnitKey) throw new Error('Select a unit.');
    targetUnit = requestedUnit;
  } else {
    targetUnit = adminUnit;
  }
  const targetUnitKey = targetUnit === 'ALL' ? 'ALL' : normalizeUnitKey_(targetUnit);

  for (let i = 1; i < s.values.length; i++) {
    const mnemonic = normalizeMnemonic_(s.values[i][s.idx.mnemonic]);
    if (!mnemonic) continue;
    allMnemonics.push(mnemonic);
    const rowUnitFromScores = s.idx.unit >= 0 ? normalizeUnit_(s.values[i][s.idx.unit]) : '';
    const rowUnit = rowUnitFromScores || normalizeUnit_((teamMemberInfo.get(mnemonic) || {}).unit || '');
    if (targetUnitKey !== 'ALL' && normalizeUnitKey_(rowUnit) === targetUnitKey) unitMnemonics.push(mnemonic);
  }

  const includedSet = new Set(targetUnit === 'ALL' ? allMnemonics : unitMnemonics);
  const excluded = allMnemonics.filter(m => !includedSet.has(m));

  const options = {
    reportName: targetUnit === 'ALL' ? `Division-${roleFilter}-Report` : `${targetUnit}-${roleFilter}-Report`,
    roleFilter,
    excludedMnemonics: excluded.join(','),
    excludedQuestions: '',
    includeOverallStats: true,
    includeParticipationTrend: true,
    includeQuestionStats: true,
    includeTopicAnalysis: true,
    includeProblemAreas: true,
    flagDuplicates: true,
    includeVisualizations: true
  };

  const result = generateReport(options);
  if (!result?.success) {
    throw new Error(result?.message || 'Failed to generate report.');
  }

  return {
    ok: true,
    scope: targetUnit,
    roleFilter,
    reportName: result.reportName || options.reportName,
    includedParticipants: includedSet.size
  };
}

function dateToYmd_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const parsed = new Date(value);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const s = String(value).trim();
  if (!s) return '';
  return s;
}

function getNextQuestionIdWeb_() {
  const sh = getQuestionBankSheet_();
  const values = sh.getDataRange().getValues();
  let maxId = 0;

  for (let i = 1; i < values.length; i++) {
    const qid = String(values[i][1] || '').trim().toUpperCase();
    const m = qid.match(/^Q(\d+)$/);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > maxId) maxId = n;
  }

  const next = maxId + 1;
  return 'Q' + String(next).padStart(4, '0');
}

function adminListQuestionBankWeb(payload) {
  const sh = getQuestionBankSheet_();
  const values = sh.getDataRange().getValues();
  if (!values.length) return { ok: true, questions: [], total: 0 };

  const search = String(payload?.search || '').toLowerCase().trim();
  const roleFilter = String(payload?.role || '').toUpperCase().trim();
  const limit = Math.max(1, Math.min(Number(payload?.limit) || 300, 1000));
  const out = [];

  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    const questionId = String(r[1] || '').trim().toUpperCase();
    const question = String(r[2] || '').trim();
    const options = [r[3], r[4], r[5], r[6], r[7], r[8]].map(v => String(v || '').trim()).filter(Boolean);
    const correctAnswer = String(r[9] || '').trim();
    const type = String(r[10] || '').trim();
    const targetRole = String(r[11] || '').trim().toUpperCase();
    const points = Number(r[12]) || 0;
    const dateYmd = dateToYmd_(r[0]);
    const imageUrl = String(r[13] || '').trim();
    const youtubeUrl = String(r[14] || '').trim();

    if (roleFilter && targetRole !== roleFilter) continue;
    if (search) {
      const haystack = [
        questionId,
        question,
        correctAnswer,
        options.join(' '),
        type,
        targetRole
      ].join(' ').toLowerCase();
      if (!haystack.includes(search)) continue;
    }

    out.push({
      rowNumber: i + 1,
      date: dateYmd,
      questionId,
      question,
      options,
      correctAnswer,
      type,
      targetRole,
      points,
      imageUrl,
      youtubeUrl
    });
  }

  out.sort((a, b) => b.questionId.localeCompare(a.questionId));
  return { ok: true, questions: out.slice(0, limit), total: out.length };
}

function adminSaveQuestionBankWeb(payload) {
  const sh = getQuestionBankSheet_();
  const values = sh.getDataRange().getValues();
  const questionId = String(payload?.questionId || '').trim().toUpperCase() || getNextQuestionIdWeb_();
  const question = String(payload?.question || '').trim();
  const correctAnswer = String(payload?.correctAnswer || '').trim();
  const type = String(payload?.type || 'Multiple Choice').trim();
  const targetRole = String(payload?.targetRole || '').trim().toUpperCase();
  const points = Number(payload?.points);
  const date = String(payload?.date || '').trim() || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const imageUrl = String(payload?.imageUrl || '').trim();
  const youtubeUrl = String(payload?.youtubeUrl || '').trim();
  const optionsIn = Array.isArray(payload?.options) ? payload.options : [];
  const options = optionsIn.map(v => String(v || '').trim()).filter(Boolean).slice(0, 6);

  if (!question) throw new Error('Question text is required.');
  if (!correctAnswer) throw new Error('Correct answer is required.');
  if (!targetRole) throw new Error('Target role is required.');
  if (!Number.isFinite(points)) throw new Error('Points must be a valid number.');

  const row = [
    date,
    questionId,
    question,
    options[0] || '',
    options[1] || '',
    options[2] || '',
    options[3] || '',
    options[4] || '',
    options[5] || '',
    correctAnswer,
    type,
    targetRole,
    points,
    imageUrl,
    youtubeUrl
  ];

  let existingRow = -1;
  for (let i = 1; i < values.length; i++) {
    const qid = String(values[i][1] || '').trim().toUpperCase();
    if (qid === questionId) {
      existingRow = i + 1;
      break;
    }
  }

  if (existingRow > 0) {
    sh.getRange(existingRow, 1, 1, row.length).setValues([row]);
  } else {
    sh.appendRow(row);
  }

  return { ok: true, questionId, updated: existingRow > 0 };
}

/**
function adminListAllowedActions() {
  const adminUser = assertAdminSession_();
  const allowed = [];

  Object.keys(ADMIN_ACTIONS).forEach((k) => {
    const meta = ADMIN_ACTIONS[k];
    if (meta.perm === 'owner') {
      if (isOwner_(adminUser)) allowed.push({ action: k, uiOnly: meta.uiOnly });
      return;
    }
    if (adminUser[meta.perm]) allowed.push({ action: k, uiOnly: meta.uiOnly });
  });

  return allowed;
}
*/
/**
 * Generates per-admin shared keys for all ACTIVE admins in ADMIN_USERS
 * and prints a COPY/PASTE block for Script Properties.
 *
 * - Does NOT write secrets to any sheet.
 * - Output is shown in Logs.
 *
 * Usage:
 * 1) Run generateAdminKeysCopyPaste_()
 * 2) View -> Logs
 * 3) Copy/paste lines into Script Properties manually
 */
function generateAdminKeysCopyPaste_() {
  const sheetName = 'ADMIN_USERS';
  const sh = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sh) throw new Error(`${sheetName} sheet missing.`);

  const values = sh.getDataRange().getValues();
  if (values.length < 2) throw new Error(`${sheetName} has no data.`);

  const headers = values.shift().map(h => String(h).trim());
  const idx = {};
  headers.forEach((h, i) => idx[h] = i);

  if (idx.Email === undefined) throw new Error('ADMIN_USERS missing "Email" column.');
  if (idx.Active === undefined) throw new Error('ADMIN_USERS missing "Active" column.');

  const webAppUrl = ScriptApp.getService().getUrl(); // your /exec URL

  const lines = [];
  const urls = [];

  values.forEach((r) => {
    const active = r[idx.Active] === true;
    if (!active) return;

    const email = String(r[idx.Email] || '').toLowerCase().trim();
    if (!email) return;

    const propName = 'ADMIN_KEY_' + emailToPropSuffix_(email);

    // If you already have a key set, keep it unless you want to force rotate
    const existing = PropertiesService.getScriptProperties().getProperty(propName);
    const key = existing || generateStrongKey_(48); // 48 chars

    lines.push(`${propName} = ${key}`);
    urls.push(`${email} -> ${webAppUrl}?page=admin (login via form; key not in URL)`);
  });

  Logger.log('=== COPY/PASTE into Script Properties (Name = Value) ===');
  lines.forEach(l => Logger.log(l));

  Logger.log('=== Admin URLs (they will login on-page) ===');
  urls.forEach(u => Logger.log(u));

  Logger.log('NOTE: Keys were NOT written automatically. Paste them into Script Properties manually.');
}
