function shuffleTeams_1TraumaSurg() {
  const SHEET_NAME = "1-TraumaSurg";
  const TEAM_COUNT = 8;
  const TARGET_SIZES = [6,6,6,6,6,6,5,5]; // totals 46

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) throw new Error("Sheet not found: " + SHEET_NAME);

  const data = sh.getDataRange().getValues();
  if (data.length < 2) throw new Error("No roster rows found on " + SHEET_NAME);

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
  const cTeam  = col("TeamID");
  const cActive = col("Active");
  const cRole = headers.indexOf("Role"); // optional; fallback to parsing shift text

  const norm = (v) => String(v ?? "").trim().replace(/\s+/g, " ").toUpperCase();

  // Active logic: blank = active, only exclude explicit false/no/0/inactive
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

  const bad = [];
  const unknownRole = [];
  const staff = rows.filter(p => {
    if (isInactive(p.row[cActive])) return false;
    if (isBlankPersonRow(p.row)) return false;

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

  // Helpers
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  };

  // Buckets
  const winDay = [], winNight = [], day = [], night = [];
  staff.forEach(p => {
    p.shiftType = shiftType(p.row[cShift]);
    p.roleType = roleType(p.row);
    if (isWin(p.row[cShift]) && p.shiftType === "DAY") winDay.push(p);
    else if (isWin(p.row[cShift]) && p.shiftType === "NIGHT") winNight.push(p);
    else if (!isWin(p.row[cShift]) && p.shiftType === "DAY") day.push(p);
    else if (!isWin(p.row[cShift]) && p.shiftType === "NIGHT") night.push(p);
  });

  shuffle(winDay); shuffle(winNight); shuffle(day); shuffle(night);

  // Trauma fixed size and shift shape:
  // 6-person teams: 3 day / 3 night
  // 5-person teams: one 3 day / 2 night, one 2 day / 3 night
  const targetDayCounts = TARGET_SIZES.map((size, i) => {
    if (size === 6) return 3;
    return (i === 6) ? 3 : 2;
  });
  const targetNightCounts = TARGET_SIZES.map((size, i) => size - targetDayCounts[i]);

  // Role targets are proportional to team size and overall active roster.
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

  // Team containers
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
      if (teams[i].length >= TARGET_SIZES[i]) continue;
      const needsShift = (type === "DAY")
        ? dayCount[i] < targetDayCounts[i]
        : nightCount[i] < targetNightCounts[i];
      if (!needsShift) continue;

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

  // Place WIN first
  winDay.forEach(placeMember_);
  winNight.forEach(placeMember_);

  // Fill remaining
  day.forEach(placeMember_);
  night.forEach(placeMember_);

  // Write TeamIDs back
  sh.getRange(2, cTeam + 1, sh.getLastRow() - 1, 1).clearContent();

  const BASE_TEAM_ID = 1001;
  teams.forEach((team, idx) => {
    const teamId = BASE_TEAM_ID + idx; // 1001–1008
    team.forEach(member => {
      sh.getRange(member.rowIndex, cTeam + 1).setValue(teamId);
    });
  });

  SpreadsheetApp.flush();
}

