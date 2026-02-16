function determineWeeklyWinners() {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Team Scores");
    if (!sheet) {
        Logger.log("❌ Sheet 'Team Scores' not found.");
        return;
    }

    var today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to midnight for accurate comparisons

    // Define elimination dates (adjust as needed)
    var eliminationDates = [
        new Date("2025-03-09"), // First elimination (Top 16 → Top 8)
        new Date("2025-03-16"), // Second elimination (Top 8 → Top 4)
        new Date("2025-03-23"), // Semi-finals (Top 4 → Top 2)
        new Date("2025-03-31")  // Finals (Top 2 → Winner)
    ];

    // Determine which round we are in
    var currentRoundIndex = eliminationDates.findIndex(date => today.getTime() === date.getTime());
    if (currentRoundIndex === -1) {
        Logger.log("❌ Today is not an elimination date. No action taken.");
        return;
    }

    processWinners(sheet, currentRoundIndex);
}

// 🚀 Manual Test Function (Runs the first elimination round immediately)
function testDetermineWinners() {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Team Scores");
    if (!sheet) {
        Logger.log("❌ Sheet 'Team Scores' not found.");
        return;
    }

    Logger.log("🛠 Running manual test for determining winners...");
    processWinners(sheet, 0); // Force test for the first elimination round
}

function processWinners(sheet, round) {
    var rounds = [
        { startRow: 2, targetColumn: "E", pointsColumn: "F" }, // Round 1 (16 → 8)
        { startRow: 2, targetColumn: "I", pointsColumn: "J" }, // Round 2 (8 → 4)
        { startRow: 2, targetColumn: "M", pointsColumn: "N" }, // Semi-finals (4 → 2)
        { startRow: 2, targetColumn: "Q", pointsColumn: "R" }  // Finals (2 → 1)
    ];

    if (round >= rounds.length) {
        Logger.log("🏆 Final round has already been processed.");
        return;
    }

    var startRow = rounds[round].startRow;
    var targetColumn = rounds[round].targetColumn;
    var pointsColumn = rounds[round].pointsColumn;

    // Process winners for the round
    for (var i = startRow; i <= 16; i += 2) {
        var team1 = sheet.getRange(i, 1).getValue();  // Team 1 Name
        var team2 = sheet.getRange(i + 1, 1).getValue(); // Team 2 Name
        var score1 = sheet.getRange(i, 2).getValue(); // Team 1 Score
        var score2 = sheet.getRange(i + 1, 2).getValue(); // Team 2 Score

        var winner = (score1 >= score2) ? team1 : team2;
        var winnerScore = Math.max(score1, score2);

        var winnerRow = i / 2 + startRow; // Target row for next round
        sheet.getRange(winnerRow, columnToIndex(targetColumn)).setValue(winner);
        sheet.getRange(winnerRow, columnToIndex(pointsColumn)).setValue(winnerScore);

        Logger.log(`🏅 ${winner} advances with ${winnerScore} points!`);
    }
}

// Convert column letter (e.g., "E") to an index number
function columnToIndex(col) {
    return col.charCodeAt(0) - 64; // Converts "A"=1, "B"=2, etc.
}