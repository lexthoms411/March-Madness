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
function generateAdminKeysCopyPaste() {
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

    const propName = 'ADMIN_KEY_' + adminKeyEmailToPropSuffix_(email);

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

/** Generates URL-safe strong random key of length n */
function generateStrongKey_(n) {
  // base64url-ish: A–Z a–z 0–9 - _
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Date.now());
  // bytes length 32; extend by chaining UUIDs until enough
  let seed = bytes;

  while (out.length < n) {
    for (let i = 0; i < seed.length && out.length < n; i++) {
      const idx = (seed[i] & 0xff) % chars.length;
      out += chars.charAt(idx);
    }
    seed = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Math.random());
  }
  return out;
}

function adminKeyEmailToPropSuffix_(email) {
  return String(email).toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
}
