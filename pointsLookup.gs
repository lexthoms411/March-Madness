// Code.gs file
// pointsLookup.gs (or wherever your existing doGet lives)
function doGet(e) {
  const page = (e?.parameter?.page || '').toString();
  const view = (e?.parameter?.view || '').toString();

  // Preferred admin route: always serve AdminPanel.
  // AdminPanel already contains login UI + in-page auth flow, which avoids
  // iframe cross-page navigation issues when embedded in Google Sites.
  if (page === 'admin') {
    return HtmlService.createTemplateFromFile('AdminPanel')
      .evaluate()
      .setTitle('March Madness Admin Panel')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // Optional explicit login page route (legacy/support).
  if (page === 'adminlogin') {
    return HtmlService.createTemplateFromFile('AdminLogin')
      .evaluate()
      .setTitle('Admin Login')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // Backward-compatible admin panel route.
  if (page === 'adminpanel') {
    if (!hasAdminSession_()) {
      return HtmlService.createTemplateFromFile('AdminLogin')
        .evaluate()
        .setTitle('Admin Login')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    return HtmlService.createTemplateFromFile('AdminPanel')
      .evaluate()
      .setTitle('March Madness Admin Panel')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  return HtmlService.createTemplateFromFile('PointsLookup')
    .evaluate()
    .setTitle('March Madness Points Lookup')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}




function getPointsForMnemonic(mnemonic) {
  // Trim and lowercase for consistent comparison
  mnemonic = (mnemonic || "").trim().toLowerCase();
  
  if (!mnemonic) {
    return { success: false, message: "Please enter your mnemonic" };
  }
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    // Prefer Scores because grading/admin writes there.
    const scoresSheet = ss.getSheetByName('Scores');
    if (scoresSheet) {
      const data = scoresSheet.getDataRange().getValues();
      // Your Scores layout is sectioned, but participant rows still use:
      // A=Mnemonic, B=Name, C=Role, D=Score (yellow column).
      for (let i = 0; i < data.length; i++) {
        const rowMnemonic = String(data[i][0] || '').trim().toLowerCase();
        if (!rowMnemonic || rowMnemonic === 'mnemonic') continue;
        if (rowMnemonic !== mnemonic) continue;

        const name = String(data[i][1] || '').trim();
        const role = String(data[i][2] || '').trim();

        // Primary score is column D. If not numeric, fallback to first numeric cell to the right.
        let score = Number(data[i][3]);
        if (!Number.isFinite(score)) {
          score = 0;
          for (let c = 3; c < data[i].length; c++) {
            const n = Number(data[i][c]);
            if (Number.isFinite(n)) {
              score = n;
              break;
            }
          }
        }

        return {
          success: true,
          score,
          name,
          role,
          sourceSheet: 'Scores'
        };
      }
    }

    // Fallback for legacy deployments.
    const candidateSheets = ['Individual Leaderboard'];
    let foundAnySheet = Boolean(scoresSheet);

    function norm_(v) {
      return String(v || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
    }

    function findHeaderIdx_(headers, aliases) {
      const aliasSet = new Set(aliases.map(norm_));
      for (let i = 0; i < headers.length; i++) {
        if (aliasSet.has(norm_(headers[i]))) return i;
      }
      return -1;
    }

    for (let s = 0; s < candidateSheets.length; s++) {
      const sheet = ss.getSheetByName(candidateSheets[s]);
      if (!sheet) continue;
      foundAnySheet = true;

      const data = sheet.getDataRange().getValues();
      if (!data || data.length < 2) continue;

      const headers = data[0];
      let mnemonicIdx = findHeaderIdx_(headers, ['Mnemonic']);
      let scoreIdx = findHeaderIdx_(headers, ['Score', 'Total Score', 'Points', 'Total Points']);
      const nameIdx = findHeaderIdx_(headers, ['Name', 'Full Name']);
      const roleIdx = findHeaderIdx_(headers, ['Role']);

      // Legacy Scores often has Mnemonic in column A without a strict header.
      if (mnemonicIdx < 0) mnemonicIdx = 0;
      if (scoreIdx < 0 && data[0].length > 1) scoreIdx = 1;
      if (mnemonicIdx < 0 || scoreIdx < 0) continue;

      for (let i = 1; i < data.length; i++) {
        const rowMnemonic = String(data[i][mnemonicIdx] || '').trim().toLowerCase();
        if (!rowMnemonic) continue;
        if (rowMnemonic !== mnemonic) continue;

        return {
          success: true,
          score: Number(data[i][scoreIdx]) || 0,
          name: nameIdx >= 0 ? String(data[i][nameIdx] || '') : '',
          role: roleIdx >= 0 ? String(data[i][roleIdx] || '') : '',
          sourceSheet: candidateSheets[s]
        };
      }
    }

    if (!foundAnySheet) {
      return {
        success: false,
        message: 'No lookup sheet found. Expected "Scores" or "Individual Leaderboard".'
      };
    }

    return {
      success: false,
      message: 'Mnemonic not found in Scores. Use the exact value from column A.'
    };
    
  } catch (error) {
    return { success: false, message: "Error looking up points: " + error.message };
  }
}
