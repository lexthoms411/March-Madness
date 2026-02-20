function shuffleTeams_3MedOnc() {
  const SHEET_NAME = "3-MedOnc";
  const TEAM_COUNT = 12;
  const BASE_TEAM_ID = 3001; // <-- TeamIDs will be 3001–3012

  // 75 staff across 12 teams -> 3 teams of 7, 9 teams of 6
  const TARGET_SIZES = [7,7,7,6,6,6,6,6,6,6,6,6]; // total 75

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) throw new Error("Sheet not found: " + SHEET_NAME);

  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1).map((r, i) => ({ row: r, rowIndex: i + 2 }));

  const col = (name) => {
    const idx = headers.indexOf(name);
    if (idx === -1) throw new Error(`Missing column: ${name}`);
    return idx;
  };

  const cName = col("Name");
  const cMnemonic = col("Mnemonic");
  const cShift = col("Shift");
  const cTeam = col("TeamID");
  const cActive = col("Active");
  const cRole = headers.indexOf("Role"); // optional; fallback to parsing text

  // Treat blank Active as active. Only exclude explicit false/no/0/inactive.
  const isInactive = (v) => {
    if (v === false) return true;
    const s = String(v ?? "").trim().toLowerCase();
    return s === "false" || s === "no" || s === "0" || s === "inactive";
  };

  const norm = (v) => String(v ?? "").trim().replace(/\s+/g, " ").toUpperCase();

  const isBlankPersonRow = (r) => {
    const name = String(r[cName] ?? "").trim();
    const mnem = String(r[cMnemonic] ?? "").trim();
    return !name && !mnem; // spacer row
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

  // Filter staff to include only active + nonblank person rows + has recognizable shift
  const bad = [];
  const unknownRole = [];
  const staff = rows.filter(p => {
    if (isInactive(p.row[cActive])) return false;
    if (isBlankPersonRow(p.row)) return false;

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

  if (bad.length) {
    const msg = bad.slice(0, 15)
      .map(b => `Row ${b.row}: ${b.name} (Shift="${b.shift}")`)
      .join("\n");
    SpreadsheetApp.getUi().alert(
      `Shuffle skipped ${bad.length} row(s) with blank/unknown Shift.\n` +
      `Fix Shift to include Day or Night (or D/N).\n\n` +
      msg +
      (bad.length > 15 ? `\n\n...and ${bad.length - 15} more.` : "")
    );
  }
  if (unknownRole.length) {
    const msg = unknownRole.slice(0, 15)
      .map(b => `Row ${b.row}: ${b.name} (Role="${b.role}", Shift="${b.shift}")`)
      .join("\n");
    SpreadsheetApp.getUi().alert(
      `Role balancing note: ${unknownRole.length} row(s) did not map to RN/PCA/LPN and will be treated as OTHER.\n\n` +
      msg +
      (unknownRole.length > 15 ? `\n\n...and ${unknownRole.length - 15} more.` : "")
    );
  }

  // Buckets
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

  // Day/Night totals from your unit: Day=38, Night=37
  // Targets:
  // - nine 6-person teams: 3 Day / 3 Night each
  // - three 7-person teams: two teams 4 Day / 3 Night, one team 3 Day / 4 Night
  // This achieves Day=38 and Night=37 exactly.

  const targetDayCounts = TARGET_SIZES.map((size, i) => {
    if (size === 6) return 3;
    // for the three 7-person teams (i=0,1,2): make first two 4-day, third 3-day
    return (i === 0 || i === 1) ? 4 : 3;
  });
  const targetNightCounts = TARGET_SIZES.map((size, i) => size - targetDayCounts[i]);
  const roleTotals = staff.reduce((acc, p) => {
    acc[p.roleType] = (acc[p.roleType] || 0) + 1;
    return acc;
  }, {});
  const roleKeys = Object.keys(roleTotals);
  const sum = (arr) => arr.reduce((a, b) => a + b, 0);
  const buildTargetCounts_ = (categoryTotal) => {
    const ratio = categoryTotal / staff.length;
    let out = TARGET_SIZES.map(s => {
      const raw = Math.round(s * ratio);
      return Math.max(0, Math.min(s, raw));
    });
    while (sum(out) > categoryTotal) {
      let best = -1;
      for (let i = 0; i < TEAM_COUNT; i++) {
        if (out[i] > 0) {
          if (best === -1 || (out[i] / TARGET_SIZES[i]) > (out[best] / TARGET_SIZES[best])) best = i;
        }
      }
      if (best === -1) break;
      out[best]--;
    }
    while (sum(out) < categoryTotal) {
      let best = -1;
      for (let i = 0; i < TEAM_COUNT; i++) {
        if (out[i] < TARGET_SIZES[i]) {
          if (best === -1 || (out[i] / TARGET_SIZES[i]) < (out[best] / TARGET_SIZES[best])) best = i;
        }
      }
      if (best === -1) break;
      out[best]++;
    }
    return out;
  };
  const targetRoleCounts = {};
  roleKeys.forEach(k => {
    targetRoleCounts[k] = buildTargetCounts_(roleTotals[k]);
  });

  const teams = Array.from({ length: TEAM_COUNT }, () => []);
  const dayCount = Array(TEAM_COUNT).fill(0);
  const nightCount = Array(TEAM_COUNT).fill(0);
  const roleCount = {};
  roleKeys.forEach(k => roleCount[k] = Array(TEAM_COUNT).fill(0));

  // Pick next team that still needs a slot of given type, prefer smaller current teams
  const pickTeamForMember_ = (member) => {
    const type = member.shiftType;
    const role = member.roleType;
    let best = -1;
    let bestScore = -999999;
    for (let i = 0; i < TEAM_COUNT; i++) {
      if (teams[i].length >= TARGET_SIZES[i]) continue;
      const needs = (type === "DAY")
        ? dayCount[i] < targetDayCounts[i]
        : nightCount[i] < targetNightCounts[i];
      if (!needs) continue;
      const roleNeed = (targetRoleCounts[role]?.[i] || 0) - (roleCount[role]?.[i] || 0);
      const shiftNeed = (type === "DAY")
        ? (targetDayCounts[i] - dayCount[i])
        : (targetNightCounts[i] - nightCount[i]);
      const sizeRoom = TARGET_SIZES[i] - teams[i].length;
      const score = (roleNeed * 100) + (shiftNeed * 10) + sizeRoom;
      if (best === -1 || score > bestScore) {
        best = i;
        bestScore = score;
      }
    }
    if (best === -1) throw new Error(`No available team slots left for ${type}. Check counts / Active flags.`);
    return best;
  };
  const placeMember_ = (member) => {
    const t = pickTeamForMember_(member);
    teams[t].push(member);
    if (member.shiftType === "DAY") dayCount[t]++; else nightCount[t]++;
    roleCount[member.roleType][t]++;
  };

  // Place WIN first (spreads them out)
  winDay.forEach(placeMember_);
  winNight.forEach(placeMember_);

  // Fill remaining
  day.forEach(placeMember_);
  night.forEach(placeMember_);

  // Clear old TeamIDs (but only for data rows)
  sh.getRange(2, cTeam + 1, sh.getLastRow() - 1, 1).clearContent();

  // Write TeamIDs 3001–3012
  teams.forEach((team, idx) => {
    const teamId = BASE_TEAM_ID + idx;
    team.forEach(member => {
      sh.getRange(member.rowIndex, cTeam + 1).setValue(teamId);
    });
  });

  SpreadsheetApp.flush();
}



