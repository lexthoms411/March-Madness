/**
 * 5-SurgSpec Team Shuffle
 * - 16 teams
 * - TeamIDs: 5001–5016
 * - Ignores rows where Active is FALSE / "false" / "no" / "inactive" / 0
 * - Ignores blank spacer rows
 * - Requires Mnemonic (prevents non-participants from being assigned)
 * - Recognizes Shift values containing "Day" or "Night" (including "WIN Night", "PCA WIN Night", etc.)
 * - Spreads WIN staff first to avoid clumping
 * - Balances Day/Night and Role (RN/PCA/LPN) proportionally to the active roster
 */

function shuffleTeams_5SurgSpec() {
  const SHEET_NAME = "5-SurgSpec";
  const TEAM_COUNT = 16;
  const BASE_TEAM_ID = 5001; // 5001–5016

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) throw new Error("Sheet not found: " + SHEET_NAME);

  const data = sh.getDataRange().getValues();
  if (data.length < 2) throw new Error("No roster rows found on " + SHEET_NAME);

  const headers = data[0];
  const rows = data.slice(1).map((r, i) => ({ row: r, rowIndex: i + 2 }));

  const col = (name) => {
    const idx = headers.indexOf(name);
    if (idx === -1) throw new Error(`Missing column: ${name} on sheet ${SHEET_NAME}`);
    return idx;
  };

  const cName = col("Name");
  const cMnemonic = col("Mnemonic");
  const cShift = col("Shift");
  const cTeam = col("TeamID");
  const cActive = col("Active");
  const cRole = headers.indexOf("Role"); // optional; fallback to parsing text

  const norm = (v) => String(v ?? "").trim().replace(/\s+/g, " ").toUpperCase();

  const isInactive = (v) => {
    if (v === false) return true;
    const s = String(v ?? "").trim().toLowerCase();
    return s === "false" || s === "no" || s === "0" || s === "inactive";
  };

  const isBlankPersonRow = (r) => {
    const name = String(r[cName] ?? "").trim();
    const mnem = String(r[cMnemonic] ?? "").trim();
    return !name && !mnem;
  };

  const shiftType = (shiftVal) => {
    const s = norm(shiftVal);
    if (!s) return null;
    if (s.includes("DAY")) return "DAY";
    if (s.includes("NIGHT")) return "NIGHT";
    if (s === "D") return "DAY";
    if (s === "N") return "NIGHT";
    return null;
  };

  const isWin = (shiftVal) => norm(shiftVal).includes("WIN");
  const roleType = (row) => {
    const roleCell = cRole >= 0 ? norm(row[cRole]) : "";
    const shiftCell = norm(row[cShift]);
    const combined = `${roleCell} ${shiftCell}`.trim();
    if (combined.includes("RN")) return "RN";
    if (combined.includes("PCA")) return "PCA";
    if (combined.includes("LPN")) return "LPN";
    return "OTHER";
  };

  // Build active participant list
  const bad = [];
  const unknownRole = [];
  const staff = rows.filter(p => {
    if (isInactive(p.row[cActive])) return false;
    if (isBlankPersonRow(p.row)) return false;

    // Require Mnemonic so leadership/etc doesn't sneak in unless intended
    const mnem = String(p.row[cMnemonic] ?? "").trim();
    if (!mnem) return false;

    const st = shiftType(p.row[cShift]);
    if (!st) {
      bad.push({ row: p.rowIndex, name: p.row[cName], shift: p.row[cShift] });
      return false;
    }
    if (roleType(p.row) === "OTHER") {
      unknownRole.push({ row: p.rowIndex, name: p.row[cName], role: cRole >= 0 ? p.row[cRole] : "", shift: p.row[cShift] });
    }
    return true;
  });

  if (staff.length < TEAM_COUNT) {
    throw new Error(`Not enough active participants (${staff.length}) for ${TEAM_COUNT} teams.`);
  }

  if (bad.length) {
    const msg = bad.slice(0, 20)
      .map(b => `Row ${b.row}: ${b.name} (Shift="${b.shift}")`)
      .join("\n");
    SpreadsheetApp.getUi().alert(
      `Shuffle skipped ${bad.length} row(s) due to blank/unknown Shift.\n` +
      `Fix Shift to include Day or Night.\n\n` +
      msg +
      (bad.length > 20 ? `\n\n...and ${bad.length - 20} more.` : "")
    );
  }
  if (unknownRole.length) {
    const msg = unknownRole.slice(0, 20)
      .map(b => `Row ${b.row}: ${b.name} (Role="${b.role}", Shift="${b.shift}")`)
      .join("\n");
    SpreadsheetApp.getUi().alert(
      `Role balancing note: ${unknownRole.length} row(s) did not map to RN/PCA/LPN and will be treated as OTHER.\n\n` +
      msg +
      (unknownRole.length > 20 ? `\n\n...and ${unknownRole.length - 20} more.` : "")
    );
  }

  // Compute team sizes dynamically (works even if roster count changes)
  const total = staff.length;
  const baseSize = Math.floor(total / TEAM_COUNT);
  const remainder = total % TEAM_COUNT;

  // First 'remainder' teams get (baseSize+1), the rest get baseSize
  const targetSizes = Array.from({ length: TEAM_COUNT }, (_, i) => (i < remainder ? baseSize + 1 : baseSize));

  // Bucket staff by WIN + shift
  const winDay = [], winNight = [], day = [], night = [];
  staff.forEach(p => {
    const st = shiftType(p.row[cShift]);
    p.shiftType = st;
    p.roleType = roleType(p.row);
    if (isWin(p.row[cShift]) && st === "DAY") winDay.push(p);
    else if (isWin(p.row[cShift]) && st === "NIGHT") winNight.push(p);
    else if (!isWin(p.row[cShift]) && st === "DAY") day.push(p);
    else if (!isWin(p.row[cShift]) && st === "NIGHT") night.push(p);
  });

  // Shuffle helper
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  };
  shuffle(winDay); shuffle(winNight); shuffle(day); shuffle(night);

  const totalDay = winDay.length + day.length;
  const totalNight = winNight.length + night.length;
  const roleTotals = staff.reduce((acc, p) => {
    acc[p.roleType] = (acc[p.roleType] || 0) + 1;
    return acc;
  }, {});

  const sum = (arr) => arr.reduce((a, b) => a + b, 0);
  const buildTargetCounts_ = (categoryTotal) => {
    const ratio = categoryTotal / total;
    let out = targetSizes.map(s => {
      const raw = Math.round(s * ratio);
      return Math.max(0, Math.min(s, raw));
    });
    while (sum(out) > categoryTotal) {
      let best = -1;
      for (let i = 0; i < TEAM_COUNT; i++) {
        if (out[i] > 0) {
          if (best === -1 || (out[i] / targetSizes[i]) > (out[best] / targetSizes[best])) best = i;
        }
      }
      if (best === -1) break;
      out[best]--;
    }
    while (sum(out) < categoryTotal) {
      let best = -1;
      for (let i = 0; i < TEAM_COUNT; i++) {
        if (out[i] < targetSizes[i]) {
          if (best === -1 || (out[i] / targetSizes[i]) < (out[best] / targetSizes[best])) best = i;
        }
      }
      if (best === -1) break;
      out[best]++;
    }
    return out;
  };

  const targetDayCounts = buildTargetCounts_(totalDay);
  const targetNightCounts = targetSizes.map((s, i) => s - targetDayCounts[i]);
  const roleKeys = Object.keys(roleTotals);
  const targetRoleCounts = {};
  roleKeys.forEach(k => {
    targetRoleCounts[k] = buildTargetCounts_(roleTotals[k]);
  });

  // Prepare teams
  const teams = Array.from({ length: TEAM_COUNT }, () => []);
  const dayCount = Array(TEAM_COUNT).fill(0);
  const nightCount = Array(TEAM_COUNT).fill(0);
  const roleCount = {};
  roleKeys.forEach(k => roleCount[k] = Array(TEAM_COUNT).fill(0));

  const pickTeamForMember_ = (member) => {
    const type = member.shiftType;
    const role = member.roleType;
    let best = -1;
    let bestScore = -999999;
    for (let i = 0; i < TEAM_COUNT; i++) {
      if (teams[i].length >= targetSizes[i]) continue;
      const needs = (type === "DAY")
        ? dayCount[i] < targetDayCounts[i]
        : nightCount[i] < targetNightCounts[i];
      if (!needs) continue;
      const roleNeed = (targetRoleCounts[role]?.[i] || 0) - (roleCount[role]?.[i] || 0);
      const shiftNeed = (type === "DAY")
        ? (targetDayCounts[i] - dayCount[i])
        : (targetNightCounts[i] - nightCount[i]);
      const sizeRoom = targetSizes[i] - teams[i].length;
      const score = (roleNeed * 100) + (shiftNeed * 10) + sizeRoom;
      if (best === -1 || score > bestScore) {
        best = i;
        bestScore = score;
      }
    }
    if (best === -1) throw new Error(`No available team slots left for ${type}. Check Active/Shift values.`);
    return best;
  };
  const placeMember_ = (member) => {
    const t = pickTeamForMember_(member);
    teams[t].push(member);
    if (member.shiftType === "DAY") dayCount[t]++; else nightCount[t]++;
    roleCount[member.roleType][t]++;
  };

  // Place WIN staff first
  winDay.forEach(placeMember_);
  winNight.forEach(placeMember_);

  // Fill remaining
  day.forEach(placeMember_);
  night.forEach(placeMember_);

  // Clear old TeamIDs
  sh.getRange(2, cTeam + 1, sh.getLastRow() - 1, 1).clearContent();

  // Write new TeamIDs 5001–5016
  teams.forEach((team, idx) => {
    const teamId = BASE_TEAM_ID + idx;
    team.forEach(member => {
      sh.getRange(member.rowIndex, cTeam + 1).setValue(teamId);
    });
  });

  SpreadsheetApp.flush();
}

