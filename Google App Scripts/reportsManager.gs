/**
 * Reports Manager for March Madness Quiz Competition
 * This script generates comprehensive reports on question performance,
 * participation statistics, and knowledge area analysis.
 */

/**
 * Shows the main Reports Manager dialog
 */
function showReportsManager() {
  const html = HtmlService.createHtmlOutput(getReportsManagerHtml())
    .setWidth(800)
    .setHeight(650)
    .setTitle('March Madness Reports Manager');

  SpreadsheetApp.getUi().showModalDialog(html, 'March Madness Reports Manager');
}

/**
 * Creates necessary sheets for reporting if they don't exist
 */
function ensureRequiredSheetsExist() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Ensure Topics sheet exists
  if (!ss.getSheetByName('Topics')) {
    const topicsSheet = ss.insertSheet('Topics');
    topicsSheet.appendRow(['TopicID', 'Topic Name', 'Description']);
    topicsSheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#f3f3f3');
    topicsSheet.setFrozenRows(1);
  }

  // Ensure Policies sheet exists
  if (!ss.getSheetByName('Policies')) {
    const policiesSheet = ss.insertSheet('Policies');
    policiesSheet.appendRow(['PolicyID', 'Policy Name', 'Description']);
    policiesSheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#f3f3f3');
    policiesSheet.setFrozenRows(1);
  }

  // Ensure Question-Topic Associations sheet exists
  if (!ss.getSheetByName('Question-Topic Associations')) {
    const assocSheet = ss.insertSheet('Question-Topic Associations');
    assocSheet.appendRow(['QuestionID', 'TopicID']);
    assocSheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#f3f3f3');
    assocSheet.setFrozenRows(1);
  }

  // Ensure Question-Policy Associations sheet exists
  if (!ss.getSheetByName('Question-Policy Associations')) {
    const assocSheet = ss.insertSheet('Question-Policy Associations');
    assocSheet.appendRow(['QuestionID', 'PolicyID']);
    assocSheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#f3f3f3');
    assocSheet.setFrozenRows(1);
  }

  // Create default classifications if needed
  createStandardClassifications();
}

/**
 * Main report generation function
 */
function generateReport(options) {
  try {
    // Ensure required sheets exist
    ensureRequiredSheetsExist();

    // Parse options
    const roleFilter = options.roleFilter || "All";
    let reportName;
    switch(roleFilter.toLowerCase()) {
      case "rn":
        reportName = "RN-Report";
        break;
      case "pca":
        reportName = "PCA-Report";
        break;
      case "lpn":
        reportName = "LPN-Report";
        break;
      default:
        reportName = "Competition-Report";
        break;
    }
    const excludedMnemonics = (options.excludedMnemonics || "").split(',').map(m => m.trim().toLowerCase()).filter(Boolean);
    const excludedQuestions = (options.excludedQuestions || "").split(',').map(q => q.trim().toUpperCase()).filter(Boolean);

    // Get filtered data
    const questions = getFilteredQuestions(roleFilter, excludedQuestions);
    const auditEntries = getFilteredAuditEntries(excludedMnemonics, excludedQuestions);

    // Create or get report sheet
    const reportSheet = getOrCreateReportSheet(reportName);

    // Add report header
    const startRow = addReportHeader(reportSheet, options);
    let currentRow = startRow;

    // Add selected sections based on options
    if (options.includeOverallStats) {
      currentRow = addOverallStatistics(reportSheet, currentRow, questions, auditEntries, roleFilter);
      currentRow += 2; // Add space between sections
    }

    if (options.includeParticipationTrend) {
      currentRow = addParticipationTrendAnalysis(reportSheet, currentRow, auditEntries);
      currentRow += 2;
    }

    if (options.includeQuestionStats) {
      currentRow = addQuestionStatistics(reportSheet, currentRow, questions, auditEntries, roleFilter);
      currentRow += 2;
    }

    if (options.includeTopicAnalysis) {
      currentRow = addTopicAnalysis(reportSheet, currentRow, questions, auditEntries, roleFilter);
      currentRow += 2;
    }

    if (options.includeProblemAreas) {
      currentRow = addProblemQuestionAnalysis(reportSheet, currentRow, questions, auditEntries);
      currentRow += 2;
    }

    if (options.flagDuplicates) {
      currentRow = flagQuestionsWithDuplicates(reportSheet, currentRow, questions, auditEntries);
      currentRow += 2;
    }

    if (options.includeVisualizations) {
      currentRow = addVisualizations(reportSheet, questions, auditEntries, roleFilter);
    }

    // Format the report for readability
    formatReportSheet(reportSheet);

    // Activate the report sheet
    reportSheet.activate();

    return {
      success: true,
      message: "Report generated successfully!",
      reportName: reportName
    };
  } catch (error) {
    console.error("Error generating report:", error.message, error.stack);
    reportsManagerLogError_('Generate Report', error.message);
    return {
      success: false,
      message: "Error generating report: " + error.message
    };
  }
}

/**
 * Creates or gets the report sheet
 */
function getOrCreateReportSheet(reportName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(reportName);

  if (sheet) {
    // Clear existing report
    clearReportSheet(sheet);
  } else {
    // Create new sheet
    sheet = ss.insertSheet(reportName);
  }

  return sheet;
}

/**
 * Clears existing report content
 */
function clearReportSheet(sheet) {
  // Clear all content and formatting
  sheet.clear();
  
  // Clear any existing conditional formatting rules
  sheet.clearConditionalFormatRules();
  
  // Remove any existing charts
  const charts = sheet.getCharts();
  for (let i = 0; i < charts.length; i++) {
    sheet.removeChart(charts[i]);
  }
  
  return sheet;
}

/**
 * Adds header to report with metadata
 */
function addReportHeader(sheet, options) {
  // Add title
  sheet.getRange("A1").setValue(options.reportName || "March Madness Quiz Report");
  sheet.getRange("A1:K1").merge().setFontWeight("bold").setFontSize(14).setBackground("#d9ead3");

  // Add report metadata
  const today = new Date();
  let metadataRow = [
    `Generated: ${Utilities.formatDate(today, Session.getScriptTimeZone(), "MM/dd/yyyy HH:mm")}`,
    `Role Filter: ${options.roleFilter || "All"}`,
    `Excluded Questions: ${options.excludedQuestions || "None"}`
  ];

  sheet.getRange(2, 1, 1, 3).setValues([metadataRow]).setFontStyle("italic");

  // Add excluded mnemonics if any
  if (options.excludedMnemonics) {
    sheet.getRange(3, 1).setValue(`Excluded Mnemonics: ${options.excludedMnemonics}`);
  }

  return 4; // Return the next available row
}

/**
 * Gets filtered questions based on role and exclusions
 */
function getFilteredQuestions(roleFilter, excludedQuestions) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.QUESTION_BANK);
  const data = sheet.getDataRange().getValues();
  const questions = [];

  // Find column indexes for the data we need
  const headers = data[0];
  const idCol = headers.indexOf("QuestionID") >= 0 ? headers.indexOf("QuestionID") : 1; // Default to column B
  const textCol = headers.indexOf("Question") >= 0 ? headers.indexOf("Question") : 2; // Default to column C
  const typeCol = headers.indexOf("Type") >= 0 ? headers.indexOf("Type") : 10; // Default to column K
  const roleCol = headers.indexOf("Target Role") >= 0 ? headers.indexOf("Target Role") : 11; // Default to column L
  const pointsCol = headers.indexOf("Points") >= 0 ? headers.indexOf("Points") : 12; // Default to column M
  const dateCol = 0; // Date is always in column A

  for (let i = 1; i < data.length; i++) {
    const questionId = data[i][idCol];

    // Skip if question is in excluded list
    if (excludedQuestions.includes(questionId)) {
      continue;
    }

    const role = data[i][roleCol];

    // Apply role filter
    if (roleFilter === "All" || roleFilter === role) {
      questions.push({
        id: questionId,
        text: data[i][textCol],
        type: data[i][typeCol],
        role: role,
        points: Number(data[i][pointsCol]) || 1, // Default to 1 if not specified
        date: data[i][dateCol]
      });
    }
  }

  return questions;
}

/**
 * Gets filtered audit entries based on exclusions
 */
function getFilteredAuditEntries(excludedMnemonics, excludedQuestions) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.AUDIT_LOG);
  const data = sheet.getDataRange().getValues();
  const entries = [];

  for (let i = 1; i < data.length; i++) {
    const mnemonic = data[i][1] ? data[i][1].toLowerCase() : "";
    const questionId = data[i][2];

    // Skip excluded mnemonics and questions
    if (excludedMnemonics.includes(mnemonic) || excludedQuestions.includes(questionId)) {
      continue;
    }

    // Skip special status entries if needed
    const status = data[i][10];
    if (status === "Manual Addition" || status === "Recovery Action") {
      // Skip manual entries unless explicitly requested
      continue;
    }

    entries.push({
      timestamp: data[i][0],       // Timestamp
      mnemonic: mnemonic,          // Mnemonic (already lowercased)
      questionId: questionId,      // Question ID
      answer: data[i][3],          // Answer provided
      correctness: data[i][4],     // Correct/Incorrect/Partially Correct
      isDuplicate: data[i][5],     // Duplicate attempt?
      correctRole: data[i][6],     // Correct role?
      prevPoints: Number(data[i][7]) || 0,      // Previous points
      earnedPoints: Number(data[i][8]) || 0,    // Points earned
      totalPoints: Number(data[i][9]) || 0,     // Total points
      status: status                // Status
    });
  }

  return entries;
}

/**
 * Adds overall statistics to the report
 */
function addOverallStatistics(sheet, startRow, questions, auditEntries, roleFilter) {
  // Add section header
  sheet.getRange(startRow, 1).setValue("Overall Statistics");
  sheet.getRange(startRow, 1, 1, 10).merge().setFontWeight("bold").setBackground("#f3f3f3");
  startRow++;

  // Calculate overall statistics
  const totalQuestions = questions.length;
  const validEntries = auditEntries.filter(e => e.correctRole === "Yes" && e.status !== "Duplicate");
  const totalAttempts = validEntries.length;
  const totalCorrect = validEntries.filter(e => e.correctness === "Correct").length;
  const totalPartiallyCorrect = validEntries.filter(e => e.correctness === "Partially Correct").length;
  const totalIncorrect = validEntries.filter(e =>
    e.correctness === "Incorrect" ||
    (e.correctness !== "Correct" && e.correctness !== "Partially Correct")
  ).length;

  // Count unique participants
  const uniqueParticipants = new Set();
  validEntries.forEach(entry => {
    uniqueParticipants.add(entry.mnemonic);
  });
  const totalParticipants = uniqueParticipants.size;

  // Total points
  const totalPointsEarned = validEntries.reduce((sum, entry) => sum + entry.earnedPoints, 0);
  const totalPossiblePoints = questions.reduce((sum, q) => sum + q.points, 0) * totalParticipants;

  // Add role-specific statistics
  let rnStats = { questions: 0, attempts: 0, correct: 0, partiallyCorrect: 0, incorrect: 0, participants: new Set() };
  let pcaStats = { questions: 0, attempts: 0, correct: 0, partiallyCorrect: 0, incorrect: 0, participants: new Set() };
  let lpnStats = { questions: 0, attempts: 0, correct: 0, partiallyCorrect: 0, incorrect: 0, participants: new Set() };

  // Count questions by role
  questions.forEach(q => {
    if (q.role === "RN") rnStats.questions++;
    else if (q.role === "PCA") pcaStats.questions++;
    else if (q.role === "LPN") lpnStats.questions++;
  });

  // Get participant roles
  const participantRoles = getParticipantRoles();

  // Process entries
  validEntries.forEach(entry => {
    // Find the question
    const question = questions.find(q => q.id === entry.questionId);
    if (!question) return;

    if (question.role === "RN") {
      rnStats.attempts++;
      if (entry.correctness === "Correct") rnStats.correct++;
      else if (entry.correctness === "Partially Correct") rnStats.partiallyCorrect++;
      else rnStats.incorrect++;

      // Count unique participants
      rnStats.participants.add(entry.mnemonic);
    } else if (question.role === "PCA") {
      pcaStats.attempts++;
      if (entry.correctness === "Correct") pcaStats.correct++;
      else if (entry.correctness === "Partially Correct") pcaStats.partiallyCorrect++;
      else pcaStats.incorrect++;

      // Count unique participants
      pcaStats.participants.add(entry.mnemonic);
    } else if (question.role === "LPN") {
      lpnStats.attempts++;
      if (entry.correctness === "Correct") lpnStats.correct++;
      else if (entry.correctness === "Partially Correct") lpnStats.partiallyCorrect++;
      else lpnStats.incorrect++;

      // Count unique participants
      lpnStats.participants.add(entry.mnemonic);
    }
  });

  // Create statistics table
  const statHeaders = ["Metric", "Overall", "RN", "PCA", "LPN"];
  sheet.getRange(startRow, 1, 1, 5).setValues([statHeaders])
    .setFontWeight("bold").setBackground("#e6e6e6");
  startRow++;

  // Format percentages
  const formatPercent = (numerator, denominator) => {
    if (!denominator) return "0.0%";
    return (numerator / denominator * 100).toFixed(1) + "%";
  };
  const formatAvg = (numerator, denominator) => {
    if (!denominator) return "0.0";
    return (numerator / denominator).toFixed(1);
  };

  // Add metrics rows
  const metrics = [
    ["Total Questions", totalQuestions, rnStats.questions, pcaStats.questions, lpnStats.questions],
    ["Total Unique Participants", totalParticipants, rnStats.participants.size, pcaStats.participants.size, lpnStats.participants.size],
    ["Total Attempts", totalAttempts, rnStats.attempts, pcaStats.attempts, lpnStats.attempts],
    ["Correct Answers",
      `${totalCorrect} (${formatPercent(totalCorrect, totalAttempts)})`,
      `${rnStats.correct} (${formatPercent(rnStats.correct, rnStats.attempts)})`,
      `${pcaStats.correct} (${formatPercent(pcaStats.correct, pcaStats.attempts)})`,
      `${lpnStats.correct} (${formatPercent(lpnStats.correct, lpnStats.attempts)})`
    ],
    ["Partially Correct Answers",
      `${totalPartiallyCorrect} (${formatPercent(totalPartiallyCorrect, totalAttempts)})`,
      `${rnStats.partiallyCorrect} (${formatPercent(rnStats.partiallyCorrect, rnStats.attempts)})`,
      `${pcaStats.partiallyCorrect} (${formatPercent(pcaStats.partiallyCorrect, pcaStats.attempts)})`,
      `${lpnStats.partiallyCorrect} (${formatPercent(lpnStats.partiallyCorrect, lpnStats.attempts)})`
    ],
    ["Incorrect Answers",
      `${totalIncorrect} (${formatPercent(totalIncorrect, totalAttempts)})`,
      `${rnStats.incorrect} (${formatPercent(rnStats.incorrect, rnStats.attempts)})`,
      `${pcaStats.incorrect} (${formatPercent(pcaStats.incorrect, pcaStats.attempts)})`,
      `${lpnStats.incorrect} (${formatPercent(lpnStats.incorrect, lpnStats.attempts)})`
    ],
    ["Total Points Earned", totalPointsEarned, "-", "-", "-"],
    ["Average Attempts Per Question",
      formatAvg(totalAttempts, totalQuestions),
      formatAvg(rnStats.attempts, rnStats.questions),
      formatAvg(pcaStats.attempts, pcaStats.questions),
      formatAvg(lpnStats.attempts, lpnStats.questions)
    ],
    ["Average Attempts Per Participant",
      formatAvg(totalAttempts, totalParticipants),
      formatAvg(rnStats.attempts, rnStats.participants.size),
      formatAvg(pcaStats.attempts, pcaStats.participants.size),
      formatAvg(lpnStats.attempts, lpnStats.participants.size)
    ],
    ["Participation Rate",
      formatPercent(totalAttempts, totalQuestions * totalParticipants),
      formatPercent(rnStats.attempts, rnStats.questions * rnStats.participants.size),
      formatPercent(pcaStats.attempts, pcaStats.questions * pcaStats.participants.size),
      formatPercent(lpnStats.attempts, lpnStats.questions * lpnStats.participants.size)
    ]
  ];

  // Add the metrics to the sheet
  sheet.getRange(startRow, 1, metrics.length, 5).setValues(metrics);

  // Add color coding for correct/incorrect percentages
  const correctRow = startRow + 3; // Row with Correct Answers
  const partialRow = startRow + 4; // Row with Partially Correct Answers
  const incorrectRow = startRow + 5; // Row with Incorrect Answers

  // Add rules to color code the percentages
  const rules = sheet.getConditionalFormatRules();

  // Green for high correct percentage
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains("%")
    .setBackground("#d9ead3") // Light green
    .setRanges([sheet.getRange(correctRow, 2, 1, 4)])
    .build());

  // Yellow for partial correct
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains("%")
    .setBackground("#fff2cc") // Light yellow
    .setRanges([sheet.getRange(partialRow, 2, 1, 4)])
    .build());

  // Red for high incorrect percentage
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains("%")
    .setBackground("#f4cccc") // Light red
    .setRanges([sheet.getRange(incorrectRow, 2, 1, 4)])
    .build());

  sheet.setConditionalFormatRules(rules);

  return startRow + metrics.length + 1; // Return next available row
}

function addParticipationTrendAnalysis(sheet, startRow, auditEntries) {
  const timezone = Session.getScriptTimeZone();

  // Section header
  sheet.getRange(startRow, 1).setValue("Participation Trend Analysis");
  sheet.getRange(startRow, 1, 1, 8).merge().setFontWeight("bold").setBackground("#f3f3f3");
  startRow++;

  // Step 1: Filter valid entries
  function getFinalPoints(autoPoints, manualPoints) {
    if (manualPoints != null && manualPoints !== "") return Number(manualPoints);
    return Number(autoPoints);
  }

  function isValidTrendEntry(entry) {
    const hasQuestion = entry.questionId && entry.questionId !== "";
    const earned = getFinalPoints(entry.earnedPoints, entry.prevPoints);
    const allowedStatus = ["Processed", "Manual Addition", "Recovery Action"];
    const isPointAward = Number(earned) > 0;

    return (
      hasQuestion &&
      entry.status !== "Duplicate" &&
      isPointAward &&
      (
        (entry.status === "Processed" && entry.correctRole === "Yes") ||
        (allowedStatus.includes(entry.status) && hasQuestion)
      )
    );
  }

  const filteredEntries = auditEntries.filter(isValidTrendEntry);

  // Step 2: Group by date + participant + question
  const trendMap = {};

  for (const entry of filteredEntries) {
    const date = new Date(entry.timestamp);
    const dateKey = Utilities.formatDate(date, timezone, "MM/dd/yyyy");
    const key = `${dateKey}_${entry.mnemonic}_${entry.questionId}`;
    const earned = getFinalPoints(entry.earnedPoints, entry.prevPoints);
    const max = Number(entry.totalPoints);

    if (!trendMap[dateKey]) {
      trendMap[dateKey] = {
        date: date,
        count: 0,
        uniqueParticipants: new Set(),
        uniqueQuestions: new Set(),
        correctCount: 0,
        correctPoints: 0,
        partialCount: 0,
        partialPoints: 0,
        incorrectCount: 0,
        totalPossible: 0,
        questionPointValue: 0
      };
    }

    const record = trendMap[dateKey];

    // First time we see this key → use it
    if (!record[key]) {
      record.count++;
      record.uniqueParticipants.add(entry.mnemonic);
      record.uniqueQuestions.add(entry.questionId);
      record.totalPossible += max;

      if (earned >= max && max > 0) {
        record.correctCount++;
        record.correctPoints += max;
      } else if (earned > 0) {
        record.partialCount++;
        record.partialPoints += earned;
      } else {
        record.incorrectCount++;
      }

      record[key] = true; // prevent future duplicates
    }
  }

  const rows = Object.values(trendMap).sort((a, b) => a.date - b.date);
  if (rows.length === 0) {
    sheet.getRange(startRow, 1).setValue("No participation data available.");
    return startRow + 1;
  }

  const headers = [
    "Date", "Total Attempts", "Unique Participants", "Unique Questions (pts per Q)",
    "Correct (pts)", "Partially Correct (pts)", "Incorrect (pts)", "Correctness Rate"
  ];
  sheet.getRange(startRow, 1, 1, headers.length).setValues([headers])
    .setFontWeight("bold").setBackground("#e6e6e6");
  startRow++;

  const trendData = rows.map(day => {
    const perQuestion = day.uniqueQuestions.size > 0
      ? Math.round(day.totalPossible / (day.uniqueQuestions.size * day.count / day.uniqueParticipants.size))
      : 0;
    const correctnessRate = day.totalPossible > 0
      ? ((day.correctPoints + day.partialPoints) / day.totalPossible * 100)
      : 0;

    return [
      Utilities.formatDate(day.date, timezone, "MM/dd/yyyy"),
      day.count,
      day.uniqueParticipants.size,
      `${day.uniqueQuestions.size} (${perQuestion})`,
      `${day.correctCount} (${day.correctPoints.toFixed(0)})`,
      `${day.partialCount} (${day.partialPoints.toFixed(0)})`,
      `${day.incorrectCount} (0)`,
      `${correctnessRate.toFixed(1)}%`
    ];
  });

  sheet.getRange(startRow, 1, trendData.length, headers.length).setValues(trendData);

  // Conditional formatting for Correctness Rate
  const lastColumn = headers.length;
  const rateRange = sheet.getRange(startRow, lastColumn, trendData.length, 1);
  const rules = sheet.getConditionalFormatRules();
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenNumberLessThan(70)
    .setBackground("#f4cccc")
    .setRanges([rateRange])
    .build());
  sheet.setConditionalFormatRules(rules);

  return startRow + trendData.length + 1;
}




function getFinalPoints(autoPoints, manualPoints) {
  if (manualPoints != null && manualPoints !== "") {
    return Number(manualPoints);
  }
  return Number(autoPoints);
}


/**
 * Gets role information for participants from Scores sheet
 */
function getParticipantRoles() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.SCORES);
  const data = sheet.getDataRange().getValues();
  const roles = {};

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] && data[i][2]) { // Mnemonic and Role columns
      roles[data[i][0].toLowerCase()] = data[i][2];
    }
  }

  return roles;
}

/**
* Adds question statistics to the report
*/
function addQuestionStatistics(sheet, startRow, questions, auditEntries, roleFilter) {
  // Add section header
  sheet.getRange(startRow, 1).setValue(`Question Performance Statistics (${roleFilter})`);
  sheet.getRange(startRow, 1, 1, 11).merge().setFontWeight("bold").setBackground("#f3f3f3");
  startRow++;

  // Add column headers
  const headers = [
    "Question ID", "Question Text", "Type", "Role", "Points",
    "Total Attempts", "Correct", "Partially Correct", "Incorrect",
    "Correct %", "Avg. Score"
  ];

  sheet.getRange(startRow, 1, 1, headers.length).setValues([headers])
    .setFontWeight("bold").setBackground("#e6e6e6");
  startRow++;

  // Process each question
  const questionData = [];
  for (const question of questions) {
    const stats = calculateQuestionStatistics(question, auditEntries);

    // FIX: Store raw values instead of formatted strings
    // Add validation to avoid division by zero
    const correctPctValue = stats.totalAttempts > 0 ?
      (stats.correctCount / stats.totalAttempts) : 0;

    const avgScoreValue = stats.totalAttempts > 0 ?
      (stats.totalPointsEarned / stats.totalAttempts) : 0;

    questionData.push([
      question.id,
      truncateText(question.text, 100),
      question.type,
      question.role,
      question.points,
      stats.totalAttempts,
      stats.correctCount,
      stats.partiallyCorrectCount,
      stats.incorrectCount,
      correctPctValue, // Raw decimal value
      avgScoreValue    // Raw decimal value
    ]);
  }

  // Sort by question ID
  questionData.sort((a, b) => a[0].localeCompare(b[0]));

  // Add to sheet
  if (questionData.length > 0) {
    sheet.getRange(startRow, 1, questionData.length, headers.length).setValues(questionData);

    // Set proper number formatting for percentage and score columns
    const correctPctColumn = 10; // Column J for "Correct %"
    const avgScoreColumn = 11;   // Column K for "Avg. Score"

    // Apply percentage format to the correctness column
    sheet.getRange(startRow, correctPctColumn, questionData.length, 1).setNumberFormat("0.0%");

    // Apply number format to the average score column
    sheet.getRange(startRow, avgScoreColumn, questionData.length, 1).setNumberFormat("0.00");

    // Add formatting for correctness percentages
    const successRateRange = sheet.getRange(startRow, correctPctColumn, questionData.length, 1);
    addSuccessRateFormatting(sheet, successRateRange);

    return startRow + questionData.length + 1;
  } else {
    sheet.getRange(startRow, 1).setValue(`No questions found for ${roleFilter} role.`);
    return startRow + 2;
  }
}

/**
 * Calculates statistics for a specific question
 */
function calculateQuestionStatistics(question, auditEntries) {
  const stats = {
    questionId: question.id,
    totalAttempts: 0,
    correctCount: 0,
    partiallyCorrectCount: 0,
    incorrectCount: 0,
    totalPointsEarned: 0,
    uniqueParticipants: new Set()
  };

  // Filter entries for this question, excluding duplicates
  const questionEntries = auditEntries.filter(e =>
    e.questionId === question.id &&
    e.correctRole === "Yes" &&
    e.status !== "Duplicate"
  );

  stats.totalAttempts = questionEntries.length;

  for (const entry of questionEntries) {
    stats.uniqueParticipants.add(entry.mnemonic);

    if (entry.correctness === "Correct") {
      stats.correctCount++;
    } else if (entry.correctness === "Partially Correct") {
      stats.partiallyCorrectCount++;
    } else {
      stats.incorrectCount++;
    }

    stats.totalPointsEarned += entry.earnedPoints;
  }

  return stats;
}

/**
 * Adds conditional formatting for success rates
 */
function addSuccessRateFormatting(sheet, range) {
  // Get existing conditional format rules
  const existingRules = sheet.getConditionalFormatRules();

  // Check if a rule already exists for this range
  for (let i = 0; i < existingRules.length; i++) {
    const rule = existingRules[i];
    const ruleRanges = rule.getRanges();

    for (let j = 0; j < ruleRanges.length; j++) {
      if (rangesOverlap(ruleRanges[j], range)) {
        // A rule already exists for this range, so we'll skip
        return;
      }
    }
  }

  // Create new rules
  const rules = [];

  // High success rate (green)
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenNumberGreaterThanOrEqualTo(80)
    .setBackground("#d9ead3") // Light green
    .setRanges([range])
    .build());

  // Medium success rate (yellow)
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenNumberBetween(50, 80)
    .setBackground("#fff2cc") // Light yellow
    .setRanges([range])
    .build());

  // Low success rate (red)
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenNumberLessThan(50)
    .setBackground("#f4cccc") // Light red
    .setRanges([range])
    .build());

  // Apply the new rules
  sheet.setConditionalFormatRules([...existingRules, ...rules]);
}

/**
 * Helper function to check if two ranges overlap
 */
function rangesOverlap(range1, range2) {
  const sheet1 = range1.getSheet().getName();
  const sheet2 = range2.getSheet().getName();

  if (sheet1 !== sheet2) return false;

  const row1Start = range1.getRow();
  const row1End = row1Start + range1.getNumRows() - 1;
  const col1Start = range1.getColumn();
  const col1End = col1Start + range1.getNumColumns() - 1;

  const row2Start = range2.getRow();
  const row2End = row2Start + range2.getNumRows() - 1;
  const col2Start = range2.getColumn();
  const col2End = col2Start + range2.getNumColumns() - 1;

  // Check if ranges overlap
  const rowOverlap = (row1Start <= row2End) && (row2Start <= row1End);
  const colOverlap = (col1Start <= col2End) && (col2Start <= col1End);

  return rowOverlap && colOverlap;
}

/**
* Adds topic analysis to the report
*/
function addTopicAnalysis(sheet, startRow, questions, auditEntries, roleFilter) {
  // Add section header
  sheet.getRange(startRow, 1).setValue("Topic Performance Analysis");
  sheet.getRange(startRow, 1, 1, 9).merge().setFontWeight("bold").setBackground("#f3f3f3");
  startRow++;

  // Get topic associations
  const topicAssociations = getQuestionTopicAssociations();
  const policyAssociations = getQuestionPolicyAssociations();

  // Get all topics and policies
  const allTopics = getAllTopics();
  const allPolicies = getAllPolicies();

  if (allTopics.length === 0 && allPolicies.length === 0) {
    sheet.getRange(startRow, 1).setValue("No topics or policies defined. Use the Topic Manager to add classifications.");
    return startRow + 2;
  }

  // Add topic performance section
  if (allTopics.length > 0) {
    sheet.getRange(startRow, 1).setValue("Performance by Topic");
    sheet.getRange(startRow, 1, 1, 9).merge().setFontWeight("bold");
    startRow++;

    // Add column headers
    const topicHeaders = [
      "Topic", "Questions", "Total Attempts", "Correct", "Partially Correct",
      "Incorrect", "Correct %", "Avg. Score", "Description"
    ];

    sheet.getRange(startRow, 1, 1, topicHeaders.length).setValues([topicHeaders])
      .setFontWeight("bold").setBackground("#e6e6e6");
    startRow++;

    // Process each topic
    const topicData = [];
    for (const topic of allTopics) {
      // Get questions for this topic
      const topicQuestionIds = topicAssociations
        .filter(a => a.topicId === topic.id)
        .map(a => a.questionId);

      // Skip if no questions for this topic with the current role filter
      const topicQuestions = questions.filter(q =>
        topicQuestionIds.includes(q.id) &&
        (roleFilter === "All" || q.role === roleFilter)
      );

      if (topicQuestions.length === 0) continue;

      // Calculate statistics
      const stats = calculateTopicStatistics(topicQuestionIds, topicQuestions, auditEntries);

      // Format for display - FIX: Store raw values instead of formatted strings
      // Validation to prevent division by zero
      const correctPctValue = stats.totalAttempts > 0 ?
        (stats.correctCount / stats.totalAttempts) : 0;

      const avgScoreValue = stats.totalAttempts > 0 ?
        (stats.totalPointsEarned / stats.totalAttempts) : 0;

      topicData.push([
        topic.name,
        topicQuestions.length,
        stats.totalAttempts,
        stats.correctCount,
        stats.partiallyCorrectCount,
        stats.incorrectCount,
        correctPctValue, // Raw decimal value instead of formatted string
        avgScoreValue,   // Raw decimal value
        truncateText(topic.description, 100)
      ]);
    }

    // Sort by topic name
    topicData.sort((a, b) => a[0].localeCompare(b[0]));

    // Add to sheet
    if (topicData.length > 0) {
      sheet.getRange(startRow, 1, topicData.length, topicHeaders.length).setValues(topicData);

      // Apply proper number formatting to percentage and score columns
      const correctPctColumn = 7; // Column G for "Correct %"
      const avgScoreColumn = 8;   // Column H for "Avg. Score"

      // Set percentage format for the correctness column
      sheet.getRange(startRow, correctPctColumn, topicData.length, 1).setNumberFormat("0.0%");

      // Set number format for the average score column
      sheet.getRange(startRow, avgScoreColumn, topicData.length, 1).setNumberFormat("0.00");

      // Add formatting for correctness percentages
      const successRateRange = sheet.getRange(startRow, correctPctColumn, topicData.length, 1);
      addSuccessRateFormatting(sheet, successRateRange);

      startRow += topicData.length + 1;
    } else {
      sheet.getRange(startRow, 1).setValue(`No topics with questions for ${roleFilter} role.`);
      startRow += 2;
    }
  }

  // Add policy performance section
  if (allPolicies.length > 0) {
    sheet.getRange(startRow, 1).setValue("Performance by Policy");
    sheet.getRange(startRow, 1, 1, 9).merge().setFontWeight("bold");
    startRow++;

    // Add column headers
    const policyHeaders = [
      "Policy", "Questions", "Total Attempts", "Correct", "Partially Correct",
      "Incorrect", "Correct %", "Avg. Score", "Description"
    ];

    sheet.getRange(startRow, 1, 1, policyHeaders.length).setValues([policyHeaders])
      .setFontWeight("bold").setBackground("#e6e6e6");
    startRow++;

    // Process each policy
    const policyData = [];
    for (const policy of allPolicies) {
      // Get questions for this policy
      const policyQuestionIds = policyAssociations
        .filter(a => a.policyId === policy.id)
        .map(a => a.questionId);

      // Skip if no questions for this policy with the current role filter
      const policyQuestions = questions.filter(q =>
        policyQuestionIds.includes(q.id) &&
        (roleFilter === "All" || q.role === roleFilter)
      );

      if (policyQuestions.length === 0) continue;

      // Calculate statistics
      const stats = calculateTopicStatistics(policyQuestionIds, policyQuestions, auditEntries);

      // Format for display - FIX: Store raw values instead of formatted strings
      // Validation to prevent division by zero
      const correctPctValue = stats.totalAttempts > 0 ?
        (stats.correctCount / stats.totalAttempts) : 0;

      const avgScoreValue = stats.totalAttempts > 0 ?
        (stats.totalPointsEarned / stats.totalAttempts) : 0;

      policyData.push([
        policy.name,
        policyQuestions.length,
        stats.totalAttempts,
        stats.correctCount,
        stats.partiallyCorrectCount,
        stats.incorrectCount,
        correctPctValue, // Raw decimal value
        avgScoreValue,   // Raw decimal value
        truncateText(policy.description, 100)
      ]);
    }

    // Sort by policy name
    policyData.sort((a, b) => a[0].localeCompare(b[0]));

    // Add to sheet
    if (policyData.length > 0) {
      sheet.getRange(startRow, 1, policyData.length, policyHeaders.length).setValues(policyData);

      // Apply proper number formatting to percentage and score columns
      const correctPctColumn = 7; // Column G for "Correct %"
      const avgScoreColumn = 8;   // Column H for "Avg. Score"

      // Set percentage format for the correctness column
      sheet.getRange(startRow, correctPctColumn, policyData.length, 1).setNumberFormat("0.0%");

      // Set number format for the average score column
      sheet.getRange(startRow, avgScoreColumn, policyData.length, 1).setNumberFormat("0.00");

      // Add formatting for correctness percentages
      const successRateRange = sheet.getRange(startRow, correctPctColumn, policyData.length, 1);
      addSuccessRateFormatting(sheet, successRateRange);

      startRow += policyData.length + 1;
    } else {
      sheet.getRange(startRow, 1).setValue(`No policies with questions for ${roleFilter} role.`);
      startRow += 2;
    }
  }

  return startRow;
}

/**
 * Calculates statistics for a set of topic/policy questions
 */
function calculateTopicStatistics(topicQuestionIds, questions, auditEntries) {
  const stats = {
    totalAttempts: 0,
    correctCount: 0,
    partiallyCorrectCount: 0,
    incorrectCount: 0,
    totalPointsEarned: 0
  };

  // Filter entries for this topic's questions, excluding duplicates
  const topicEntries = auditEntries.filter(e =>
    topicQuestionIds.includes(e.questionId) &&
    e.correctRole === "Yes" &&
    e.status !== "Duplicate"
  );

  stats.totalAttempts = topicEntries.length;

  for (const entry of topicEntries) {
    if (entry.correctness === "Correct") {
      stats.correctCount++;
    } else if (entry.correctness === "Partially Correct") {
      stats.partiallyCorrectCount++;
    } else {
      stats.incorrectCount++;
    }

    stats.totalPointsEarned += entry.earnedPoints;
  }

  return stats;
}

/**
 * Adds problem question analysis to the report
 */
function addProblemQuestionAnalysis(sheet, startRow, questions, auditEntries) {
  // Add section header
  sheet.getRange(startRow, 1).setValue("Problem Areas Analysis");
  sheet.getRange(startRow, 1, 1, 8).merge().setFontWeight("bold").setBackground("#f3f3f3");
  startRow++;

  // Add column headers
  const headers = [
    "Question ID", "Question Text", "Type", "Role",
    "Attempts", "Correct %", "Topics", "Policies"
  ];

  sheet.getRange(startRow, 1, 1, headers.length).setValues([headers])
    .setFontWeight("bold").setBackground("#e6e6e6");
  startRow++;

  // Calculate stats for all questions
  const questionStatsMap = new Map();
  for (const question of questions) {
    const stats = calculateQuestionStatistics(question, auditEntries);

    // Only include questions with at least 3 attempts
    if (stats.totalAttempts >= 3) {
      const correctPct = stats.totalAttempts > 0 ?
        (stats.correctCount / stats.totalAttempts * 100) : 0;

      questionStatsMap.set(question.id, {
        question: question,
        stats: stats,
        correctPct: correctPct
      });
    }
  }

  // Sort by correctness percentage (ascending)
  const sortedQuestions = Array.from(questionStatsMap.values())
    .sort((a, b) => a.correctPct - b.correctPct);

  // Take the bottom 10 or all if less than 10
  const problemQuestions = sortedQuestions.slice(0, Math.min(10, sortedQuestions.length));

  // Get topic and policy associations
  const topicAssociations = getQuestionTopicAssociations();
  const policyAssociations = getQuestionPolicyAssociations();
  const allTopics = getAllTopics();
  const allPolicies = getAllPolicies();

  // Create problem question data
  const problemData = [];
  for (const item of problemQuestions) {
    const question = item.question;
    const correctPct = item.correctPct.toFixed(1) + "%";

    // Get topics for this question
    const questionTopics = topicAssociations
      .filter(a => a.questionId === question.id)
      .map(a => {
        const topic = allTopics.find(t => t.id === a.topicId);
        return topic ? topic.name : "";
      })
      .filter(Boolean)
      .join(", ");

    // Get policies for this question
    const questionPolicies = policyAssociations
      .filter(a => a.questionId === question.id)
      .map(a => {
        const policy = allPolicies.find(p => p.id === a.policyId);
        return policy ? policy.name : "";
      })
      .filter(Boolean)
      .join(", ");

    problemData.push([
      question.id,
      truncateText(question.text, 100),
      question.type,
      question.role,
      item.stats.totalAttempts,
      correctPct,
      questionTopics,
      questionPolicies
    ]);
  }

  // Add to sheet
  if (problemData.length > 0) {
    sheet.getRange(startRow, 1, problemData.length, headers.length).setValues(problemData);

    // Add formatting for correctness percentages
    const correctPctColumn = 6; // Column F for "Correct %"
    const problemAreaRange = sheet.getRange(startRow, correctPctColumn, problemData.length, 1);
    addProblemAreaFormatting(sheet, problemAreaRange);

    return startRow + problemData.length + 1;
  } else {
    sheet.getRange(startRow, 1).setValue("No problem questions identified (minimum 3 attempts required).");
    return startRow + 2;
  }
}

/**
 * Adds conditional formatting for problem areas
 */
function addProblemAreaFormatting(sheet, range) {
  // Get existing rules
  const existingRules = sheet.getConditionalFormatRules();

  // Create new rules
  const rules = [];

  // Critical (very low success rate) - dark red
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenNumberLessThan(30)
    .setBackground("#ea9999") // Medium red
    .setBold(true)
    .setRanges([range])
    .build());

  // Major problem - red
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenNumberBetween(30, 50)
    .setBackground("#f4cccc") // Light red
    .setRanges([range])
    .build());

  // Moderate problem - yellow
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenNumberBetween(50, 70)
    .setBackground("#fff2cc") // Light yellow
    .setRanges([range])
    .build());

  // Apply rules
  sheet.setConditionalFormatRules([...existingRules, ...rules]);
}

/**
 * Flags questions with duplicate responses
 */
function flagQuestionsWithDuplicates(sheet, startRow, questions, auditEntries) {
  // Add section header
  sheet.getRange(startRow, 1).setValue("Questions with Duplicate Responses");
  sheet.getRange(startRow, 1, 1, 6).merge().setFontWeight("bold").setBackground("#f3f3f3");
  startRow++;

  // Get questions with duplicates
  const questionsWithDuplicates = findQuestionsWithDuplicates(questions, auditEntries);

  if (questionsWithDuplicates.length === 0) {
    sheet.getRange(startRow, 1).setValue("No questions with duplicate responses found.");
    return startRow + 2;
  }

  // Add column headers
  const headers = [
    "Question ID", "Question Text", "Role", "Duplicate Count",
    "Affected Participants", "Actions Required"
  ];

  sheet.getRange(startRow, 1, 1, headers.length).setValues([headers])
    .setFontWeight("bold").setBackground("#e6e6e6");
  startRow++;

  // Add duplicate questions data
  const duplicateData = [];
  for (const item of questionsWithDuplicates) {
    duplicateData.push([
      item.questionId,
      truncateText(item.questionText, 100),
      item.role,
      item.duplicateCount,
      item.affectedParticipants.join(", "),
      "Review duplicate responses in Audit Log"
    ]);
  }

  sheet.getRange(startRow, 1, duplicateData.length, headers.length).setValues(duplicateData);

  // Highlight for attention
  sheet.getRange(startRow, 1, duplicateData.length, headers.length).setBackground("#fce5cd"); // Light orange

  return startRow + duplicateData.length + 1;
}

/**
 * Finds questions with duplicate response submissions
 */
function findQuestionsWithDuplicates(questions, auditEntries) {
  // Find entries marked as duplicates
  const duplicateEntries = auditEntries.filter(e => e.isDuplicate === "Yes" || e.status === "Duplicate");

  // If no duplicates, return empty array
  if (duplicateEntries.length === 0) {
    return [];
  }

  // Group by question ID
  const duplicatesByQuestion = {};

  for (const entry of duplicateEntries) {
    const questionId = entry.questionId;

    if (!duplicatesByQuestion[questionId]) {
      duplicatesByQuestion[questionId] = {
        questionId: questionId,
        duplicateCount: 0,
        affectedParticipants: new Set()
      };
    }

    duplicatesByQuestion[questionId].duplicateCount++;
    duplicatesByQuestion[questionId].affectedParticipants.add(entry.mnemonic);
  }

  // Add question text and role information
  const result = [];
  for (const key in duplicatesByQuestion) {
    const item = duplicatesByQuestion[key];
    const question = questions.find(q => q.id === item.questionId);

    if (question) {
      result.push({
        questionId: item.questionId,
        questionText: question.text,
        role: question.role,
        duplicateCount: item.duplicateCount,
        affectedParticipants: Array.from(item.affectedParticipants)
      });
    } else {
      // Question might be excluded, but we'll still show it
      result.push({
        questionId: item.questionId,
        questionText: "Unknown or excluded question",
        role: "Unknown",
        duplicateCount: item.duplicateCount,
        affectedParticipants: Array.from(item.affectedParticipants)
      });
    }
  }

  // Sort by duplicate count (descending)
  return result.sort((a, b) => b.duplicateCount - a.duplicateCount);
}

/**
 * Adds visualizations to the report
 */
function addVisualizations(sheet, questions, auditEntries, roleFilter) {
  const lastRow = sheet.getLastRow();

  // Add section header
  sheet.getRange(lastRow + 1, 1).setValue("Visualization Dashboard");
  sheet.getRange(lastRow + 1, 1, 1, 10).merge().setFontWeight("bold").setBackground("#f3f3f3");

  // Create correctness distribution pie chart
  createCorrectnessPieChart(sheet, questions, auditEntries, lastRow + 3, 1);

  // Create topic performance chart (if topics exist)
  const topicAssociations = getQuestionTopicAssociations();
  if (topicAssociations.length > 0) {
    createTopicPerformanceChart(sheet, questions, auditEntries, lastRow + 3, 6);
  }

  // Create role comparison chart if showing all roles
  if (roleFilter === "All") {
    createRoleComparisonChart(sheet, questions, auditEntries, lastRow + 20, 1);
  }

  // Create participation trend chart
  createParticipationTrendChart(sheet, auditEntries, lastRow + 20, 6);

  return lastRow + 40; // Return approximate last row after charts
}

/**
 * Creates a pie chart showing correctness distribution
 */
function createCorrectnessPieChart(sheet, questions, auditEntries, row, column) {
  // Only use valid entries (non-duplicates, correct role)
  const validEntries = auditEntries.filter(e => {
    const isValidRole = e.correctRole === "Yes";
    const isProcessable = e.status !== "Duplicate";
    const isManual = e.status === "Manual Addition" || e.status === "Recovery Action";

    return isValidRole && (isProcessable || isManual);
  });

  // Count by correctness
  const correctCount = validEntries.filter(e => e.correctness === "Correct").length;
  const partialCount = validEntries.filter(e => e.correctness === "Partially Correct").length;
  const incorrectCount = validEntries.filter(e =>
    e.correctness === "Incorrect" ||
    (e.correctness !== "Correct" && e.correctness !== "Partially Correct")
  ).length;

  // Create data for the chart
  const dataRange = sheet.getRange(row, column, 4, 2);
  dataRange.setValues([
    ["Response", "Count"],
    ["Correct", correctCount],
    ["Partially Correct", partialCount],
    ["Incorrect", incorrectCount]
  ]);

  // Create the chart
  const chart = sheet.newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(dataRange)
    .setPosition(row, column + 3, 0, 0)
    .setOption("title", "Answer Correctness Distribution")
    .setOption("pieSliceText", "percentage")
    .setOption("legend", {position: "right"})
    .setOption("colors", ["#d9ead3", "#fff2cc", "#f4cccc"]) // Green, Yellow, Red
    .setOption("width", 400)
    .setOption("height", 300)
    .build();

  // Add the chart to the sheet
  sheet.insertChart(chart);
}

/**
 * Creates a bar chart showing topic performance
 */
function createTopicPerformanceChart(sheet, questions, auditEntries, row, column) {
  // Get topic associations and topics
  const topicAssociations = getQuestionTopicAssociations();
  const allTopics = getAllTopics();

  if (allTopics.length === 0) return;

  // Only use topics with at least one question
  const topicsWithQuestions = allTopics.filter(topic => {
    const topicQuestionIds = topicAssociations
      .filter(a => a.topicId === topic.id)
      .map(a => a.questionId);

    return questions.some(q => topicQuestionIds.includes(q.id));
  });

  if (topicsWithQuestions.length === 0) return;

  // Limit to top 8 topics if there are more
  const limitedTopics = topicsWithQuestions.length > 8 ?
    topicsWithQuestions.slice(0, 8) : topicsWithQuestions;

  // Create data for the chart
  const chartData = [["Topic", "Correct %"]];

  for (const topic of limitedTopics) {
    // Get questions for this topic
    const topicQuestionIds = topicAssociations
      .filter(a => a.topicId === topic.id)
      .map(a => a.questionId);

    const topicQuestions = questions.filter(q => topicQuestionIds.includes(q.id));

    // Calculate statistics
    const stats = calculateTopicStatistics(topicQuestionIds, topicQuestions, auditEntries);

    // Calculate correct percentage
    const correctPct = stats.totalAttempts > 0 ?
      (stats.correctCount / stats.totalAttempts * 100) : 0;

    chartData.push([topic.name, correctPct]);
  }

  // Add data to the sheet
  const dataRange = sheet.getRange(row, column, chartData.length, 2);
  dataRange.setValues(chartData);

  // Create the chart
  const chart = sheet.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(dataRange)
    .setPosition(row, column + 3, 0, 0)
    .setOption("title", "Topic Performance (% Correct)")
    .setOption("legend", {position: "none"})
    .setOption("hAxis", {title: "Topic", textPosition: "out", slantedText: true, slantedTextAngle: 45})
    .setOption("vAxis", {title: "Correct %", minValue: 0, maxValue: 100})
    .setOption("colors", ["#4285f4"]) // Blue
    .setOption("width", 500)
    .setOption("height", 300)
    .build();

  // Add the chart to the sheet
  sheet.insertChart(chart);
}

/**
 * Creates a comparison chart between role performances.
 */
function createRoleComparisonChart(sheet, questions, auditEntries, row, column) {
  // Only compare known roles and only those present in the filtered question set.
  const roles = ["RN", "PCA", "LPN"].filter(role => questions.some(q => q.role === role));
  if (roles.length < 2) return;

  // Only use valid entries
  const validEntries = auditEntries.filter(e => e.correctRole === "Yes" && e.status !== "Duplicate");

  const statsByRole = {};
  roles.forEach((role) => {
    const roleQuestions = questions.filter(q => q.role === role);
    const roleEntries = validEntries.filter(e => roleQuestions.some(q => q.id === e.questionId));
    statsByRole[role] = {
      correct: roleEntries.filter(e => e.correctness === "Correct").length,
      partial: roleEntries.filter(e => e.correctness === "Partially Correct").length,
      incorrect: roleEntries.filter(e =>
        e.correctness === "Incorrect" ||
        (e.correctness !== "Correct" && e.correctness !== "Partially Correct")
      ).length
    };
  });

  // Create data for the chart
  const chartData = [["Response"].concat(roles)];
  chartData.push(["Correct"].concat(roles.map(role => statsByRole[role].correct)));
  chartData.push(["Partially Correct"].concat(roles.map(role => statsByRole[role].partial)));
  chartData.push(["Incorrect"].concat(roles.map(role => statsByRole[role].incorrect)));

  // Add data to the sheet
  const dataRange = sheet.getRange(row, column, chartData.length, chartData[0].length);
  dataRange.setValues(chartData);

  // Create the chart
  const chart = sheet.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(dataRange)
    .setPosition(row, column + 4, 0, 0)
    .setOption("title", "Role Performance Comparison")
    .setOption("legend", {position: "top"})
    .setOption("hAxis", {title: "Response Type"})
    .setOption("vAxis", {title: "Number of Responses"})
    .setOption("isStacked", false)
    .setOption("width", 500)
    .setOption("height", 300)
    .build();

  // Add the chart to the sheet
  sheet.insertChart(chart);
}

/**
 * Creates a line chart showing participation trends over time
 */
function createParticipationTrendChart(sheet, auditEntries, row, column) {
  // Only use valid entries
  const validEntries = auditEntries.filter(e => e.correctRole === "Yes" && e.status !== "Duplicate");

  // Group by date
  const attemptsByDate = {};

  for (const entry of validEntries) {
    if (!entry.timestamp) continue;

    const date = new Date(entry.timestamp);
    const dateKey = Utilities.formatDate(date, Session.getScriptTimeZone(), "MM/dd/yyyy");

    if (!attemptsByDate[dateKey]) {
      attemptsByDate[dateKey] = {
        date: dateKey,
        count: 0,
        participants: new Set()
      };
    }

    attemptsByDate[dateKey].count++;
    attemptsByDate[dateKey].participants.add(entry.mnemonic);
  }

  // Convert to array and sort by date
  const dateArray = Object.values(attemptsByDate)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (dateArray.length === 0) return;

  // Create data for the chart
  const chartData = [["Date", "Attempts", "Unique Participants"]];

  for (const item of dateArray) {
    chartData.push([
      item.date,
      item.count,
      item.participants.size
    ]);
  }

  // Add data to the sheet
  const dataRange = sheet.getRange(row, column, chartData.length, 3);
  dataRange.setValues(chartData);

  // Create the chart
  const chart = sheet.newChart()
    .setChartType(Charts.ChartType.LINE)
    .addRange(dataRange)
    .setPosition(row, column + 4, 0, 0)
    .setOption("title", "Daily Participation Trends")
    .setOption("legend", {position: "top"})
    .setOption("hAxis", {title: "Date", slantedText: true, slantedTextAngle: 45})
    .setOption("vAxis", {title: "Count"})
    .setOption("series", {
      0: {color: "#4285f4"}, // Blue for attempts
      1: {color: "#0f9d58"}  // Green for participants
    })
    .setOption("width", 500)
    .setOption("height", 300)
    .build();

  // Add the chart to the sheet
  sheet.insertChart(chart);
}

/**
 * Formats the report sheet for better readability
 */
function formatReportSheet(sheet) {
  // Auto-resize columns for better readability
  for (let i = 1; i <= 12; i++) {
    sheet.autoResizeColumn(i);

    // Set a maximum width for text columns to avoid excessive width
    if (sheet.getColumnWidth(i) > 400) {
      sheet.setColumnWidth(i, 400);
    }
  }

  // Set alternating row colors for better readability
  const lastRow = sheet.getLastRow();
  const maxCol = 12;

  // Find all data sections (areas with headers)
  const data = sheet.getRange(1, 1, lastRow, 1).getValues();
  const sectionStarts = [];

  for (let i = 0; i < data.length; i++) {
    const cell = data[i][0];
    if (cell && typeof cell === 'string' && cell.trim() !== '') {
      const rowBelow = i + 1 < data.length ? data[i+1][0] : null;

      // Check if this is a section header followed by column headers
      if (rowBelow !== null && rowBelow !== undefined) {
        sectionStarts.push(i + 1); // +1 because array is 0-based but rows are 1-based
      }
    }
  }

  // Apply alternating colors to data sections
  for (let i = 0; i < sectionStarts.length; i++) {
    const startRow = sectionStarts[i] + 1; // +1 to skip the header row
    const endRow = (i < sectionStarts.length - 1) ? sectionStarts[i+1] - 1 : lastRow;

    // Apply alternating colors
    for (let row = startRow; row <= endRow; row++) {
      if ((row - startRow) % 2 === 0) {
        // Even rows (relative to section) - light gray
        sheet.getRange(row, 1, 1, maxCol).setBackground("#f3f3f3");
      }
    }
  }

  // Freeze the top rows (title and metadata)
  sheet.setFrozenRows(3);

  // Add borders to tables
  for (let i = 0; i < sectionStarts.length; i++) {
    const headerRow = sectionStarts[i];
    const startRow = headerRow + 1;
    const endRow = (i < sectionStarts.length - 1) ? sectionStarts[i+1] - 1 : lastRow;

    // Only apply if there's actual data
    if (endRow >= startRow) {
      // Get the column count for this section
      const headerRange = sheet.getRange(headerRow, 1, 1, maxCol);
      const headerValues = headerRange.getValues()[0];
      let colCount = 0;
      for (let j = 0; j < headerValues.length; j++) {
        if (headerValues[j] && headerValues[j].toString().trim() !== '') {
          colCount = j + 1;
        }
      }

      // Apply borders to data section
      if (colCount > 0) {
        sheet.getRange(headerRow, 1, (endRow - headerRow) + 1, colCount)
          .setBorder(true, true, true, true, true, true, 'gray', SpreadsheetApp.BorderStyle.SOLID);
      }
    }
  }
}

/**
 * Helper function to truncate long text
 */
function truncateText(text, maxLength) {
  if (!text) return '';

  text = text.toString();
  if (text.length <= maxLength) return text;

  return text.substring(0, maxLength) + '...';
}

/**
 * Error logging function
 */
function reportsManagerLogError_(action, message) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let errorSheet = ss.getSheetByName(SHEETS.ERROR_LOG);

    if (!errorSheet) {
      errorSheet = ss.insertSheet(SHEETS.ERROR_LOG);
      errorSheet.appendRow(['Timestamp', 'Action', 'Error Message', 'Status']);
      errorSheet.setFrozenRows(1);
    }

    errorSheet.appendRow([
      new Date(),
      action,
      message,
      'Unresolved'
    ]);
  } catch (error) {
    console.error('Failed to log error:', error.message);
  }
}

/**
 * Adds required sheets and starter data for March Madness Reports Manager
 */
function initializeMarchMadnessSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Topics Sheet
  if (!ss.getSheetByName('Topics')) {
    const sheet = ss.insertSheet('Topics');
    sheet.appendRow(['TopicID', 'Name', 'Description']);
    const defaultTopics = [
      ['T001', 'Patient Safety', 'Topics related to patient safety practices and protocols'],
      ['T002', 'Infection Control', 'Infection prevention and control measures'],
      ['T003', 'Medication Safety', 'Proper medication administration and safety'],
      ['T004', 'Fall Prevention', 'Fall risk assessment and prevention'],
      ['T005', 'Documentation', 'Proper clinical documentation practices'],
      ['T006', 'Communication', 'Effective communication in healthcare settings'],
      ['T007', 'Pain Management', 'Assessment and management of patient pain']
    ];
    sheet.getRange(2, 1, defaultTopics.length, 3).setValues(defaultTopics);
  }

  // Policies Sheet
  if (!ss.getSheetByName('Policies')) {
    const sheet = ss.insertSheet('Policies');
    sheet.appendRow(['PolicyID', 'Name', 'Description']);
    const defaultPolicies = [
      ['P001', 'CAUTI Prevention', 'Catheter-Associated Urinary Tract Infection Prevention'],
      ['P002', 'CLABSI Prevention', 'Central Line-Associated Bloodstream Infection Prevention'],
      ['P003', 'CDI Prevention', 'Clostridioides difficile Infection Prevention'],
      ['P004', 'Falls Prevention', 'Protocols for preventing patient falls'],
      ['P005', 'HAPI Prevention', 'Hospital-Acquired Pressure Injury Prevention'],
      ['P006', 'Patient Identification', 'Proper patient identification procedures'],
      ['P007', 'Handoff Communication', 'Safe handoff communication between caregivers']
    ];
    sheet.getRange(2, 1, defaultPolicies.length, 3).setValues(defaultPolicies);
  }

  // Question-Topic Associations Sheet
  if (!ss.getSheetByName('Question-Topic Associations')) {
    const sheet = ss.insertSheet('Question-Topic Associations');
    sheet.appendRow(['QuestionID', 'TopicID']);
  }

  // Question-Policy Associations Sheet
  if (!ss.getSheetByName('Question-Policy Associations')) {
    const sheet = ss.insertSheet('Question-Policy Associations');
    sheet.appendRow(['QuestionID', 'PolicyID']);
  }

  SpreadsheetApp.getUi().alert('Sheets and starter data initialized successfully!');
}
