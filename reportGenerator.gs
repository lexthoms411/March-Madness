/**
 * Report Generator for March Madness Quiz Competition
 * This script generates comprehensive reports on question performance
 * broken down by role (RN vs PCA), including statistics on correctness,
 * participation, and manual grading.
 */

/**
 * Main function to generate comprehensive end-of-competition reports
 * This would be added to the Quiz Admin menu
 */
function generateComprehensiveReports() {
  // Show status message
  SpreadsheetApp.getActiveSpreadsheet().toast("Generating comprehensive reports...", "Report Generator", 30);
  
  try {
    // Create a new sheet for the reports if it doesn't exist
    const reportSheet = getOrCreateReportSheet();
    
    // Generate reports for each role - ensure both are processed
    const rnResult = generateRoleReport(reportSheet, "RN");
    
    // Log for debugging
    console.log(`Processed ${rnResult.stats.length} RN questions, ended at row ${rnResult.lastRow}`);
    
    // Add some space between sections for better readability
    reportSheet.getRange(rnResult.lastRow + 1, 1).setValue("");
    
    // Process PCA questions with equal prominence
    const pcaResult = generateRoleReport(reportSheet, "PCA");
    console.log(`Processed ${pcaResult.stats.length} PCA questions, ended at row ${pcaResult.lastRow}`);
    
    // Generate overall summary
    generateOverallSummary(reportSheet);
    
    // Add visualizations
    addVisualizations(reportSheet);
    
    // Format the report sheet for readability
    formatReportSheet(reportSheet);
    
    // Success message and activate the sheet
    reportSheet.activate();
    SpreadsheetApp.getActiveSpreadsheet().toast("Report generation complete!", "Report Generator");
    
    return true;
  } catch (error) {
    console.error("Error generating reports:", error.message, error.stack);
    SpreadsheetApp.getActiveSpreadsheet().toast("Error generating reports: " + error.message, "Report Generator", 10);
    logError('Report Generation', error.message);
    return false;
  }
}

/**
 * Generate report for a specific role
 */
function generateRoleReport(reportSheet, role) {
  // Get all questions for this role
  const questions = getQuestionsForRole(role);
  
  console.log(`Found ${questions.length} questions for ${role} role`); // Add debugging
  
  // Get all audit log entries
  const auditEntries = getAuditLogEntries();
  
  // Get manual grade entries
  const manualEntries = getManualGradeEntries();
  
  // Process the data for each question
  const questionStats = [];
  for (const question of questions) {
    // Add role property to question object for reference
    question.role = role;
    
    const stats = calculateQuestionStatistics(question, auditEntries, manualEntries, role);
    questionStats.push(stats);
  }
  
  // Sort questions by date
  questionStats.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  // Add the role section to the report
  const lastRow = addRoleSectionToReport(reportSheet, role, questionStats);
  
  // Return both stats and last row for better control in main function
  return {
    stats: questionStats,
    lastRow: lastRow
  };
}

/**
 * Get all questions from the Question Bank for a specific role
 */
function getQuestionsForRole(role) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.QUESTION_BANK);
  const data = sheet.getDataRange().getValues();
  const questions = [];
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][11] === role) { // Column L contains the target role
      questions.push({
        id: data[i][1],          // Question ID
        text: data[i][2],        // Question text
        type: data[i][10],       // Question type
        points: Number(data[i][12]) || 0, // Points possible
        date: data[i][0]         // Date question was used
      });
    }
  }
  
  return questions;
}

/**
 * Get all entries from the Audit Log
 */
function getAuditLogEntries() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.AUDIT_LOG);
  const data = sheet.getDataRange().getValues();
  const entries = [];
  
  for (let i = 1; i < data.length; i++) {
    entries.push({
      timestamp: data[i][0],       // Timestamp
      mnemonic: data[i][1],        // Mnemonic
      questionId: data[i][2],      // Question ID
      answer: data[i][3],          // Answer provided
      correctness: data[i][4],     // Correct/Incorrect/Partially Correct
      isDuplicate: data[i][5],     // Duplicate attempt?
      correctRole: data[i][6],     // Correct role?
      prevPoints: Number(data[i][7]) || 0,      // Previous points
      earnedPoints: Number(data[i][8]) || 0,    // Points earned
      totalPoints: Number(data[i][9]) || 0,     // Total points
      status: data[i][10]          // Status (Processed/Duplicate/Manual/etc)
    });
  }
  
  return entries;
}

/**
 * Get participant role information from Scores sheet
 */
function getParticipantRoles() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.SCORES);
  const data = sheet.getDataRange().getValues();
  const roles = {};
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] && data[i][2]) { // Mnemonic and Role
      roles[data[i][0].toLowerCase()] = data[i][2];
    }
  }
  
  return roles;
}

/**
 * Get all manual grade entries
 */
function getManualGradeEntries() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Manual Grade Processing Log");
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  const entries = [];
  
  for (let i = 1; i < data.length; i++) {
    entries.push({
      timestamp: data[i][0],      // Timestamp
      mnemonic: data[i][1],       // Mnemonic
      points: Number(data[i][2]) || 0, // Points awarded
      questionId: data[i][3],     // Question ID (if applicable)
      type: data[i][4],           // Point type
      reason: data[i][5],         // Reason
      processDate: data[i][6],    // Processing date
      status: data[i][7]          // Status
    });
  }
  
  return entries;
}

/**
 * Calculate statistics for a specific question
 * Enhanced to better handle manual grade additions
 */
function calculateQuestionStatistics(question, auditEntries, manualEntries, role) {
  const stats = {
    questionId: question.id,
    questionText: question.text,
    questionType: question.type,
    possiblePoints: question.points,
    date: question.date,
    totalAttempts: 0,
    correctCount: 0,
    partiallyCorrectCount: 0,
    incorrectCount: 0,
    totalPointsEarned: 0,
    averageScore: 0,
    correctPercentage: 0,
    partiallyCorrectPercentage: 0,
    incorrectPercentage: 0,
    uniqueParticipants: new Set(),
    manualAdditions: 0,
    manualPoints: 0
  };
  
  // Process standard audit entries
  for (const entry of auditEntries) {
    if (entry.questionId === question.id && entry.correctRole === "Yes") {
      if (entry.status !== "Duplicate") {
        stats.totalAttempts++;
        stats.uniqueParticipants.add(entry.mnemonic);
        
        if (entry.correctness === "Correct") {
          stats.correctCount++;
        } else if (entry.correctness === "Partially Correct") {
          stats.partiallyCorrectCount++;
        } else {
          stats.incorrectCount++;
        }
        
        stats.totalPointsEarned += Number(entry.earnedPoints);
      }
    }
  }
  
  // Process manual grade entries more carefully
  for (const entry of manualEntries) {
    // Exact match by question ID
    if (entry.questionId === question.id) {
      stats.manualAdditions++;
      const points = Number(entry.points) || 0;
      stats.manualPoints += points;
      
      // Don't double-count points already in audit log
      const isAlreadyInAudit = auditEntries.some(a => 
        a.questionId === question.id && 
        a.mnemonic === entry.mnemonic && 
        Math.abs(new Date(a.timestamp) - new Date(entry.timestamp)) < 60000 // Within 1 minute
      );
      
      if (!isAlreadyInAudit) {
        // Add to total points if not already counted
        stats.totalPointsEarned += points;
      }
    } 
    // Partial match - for entries like MANUAL_GRADE_Q001 or patterns including the question ID
    else if (entry.questionId && typeof entry.questionId === 'string' && 
             entry.questionId.includes(question.id)) {
      stats.manualAdditions++;
      const points = Number(entry.points) || 0;
      stats.manualPoints += points;
      
      // Check if already counted in audit log
      const isAlreadyInAudit = auditEntries.some(a => 
        a.questionId === question.id && 
        a.mnemonic === entry.mnemonic && 
        Math.abs(new Date(a.timestamp) - new Date(entry.timestamp)) < 60000
      );
      
      if (!isAlreadyInAudit) {
        stats.totalPointsEarned += points;
      }
    }
    // Check reason field for question ID mention
    else if (entry.reason && typeof entry.reason === 'string' && 
             entry.reason.includes(question.id)) {
      stats.manualAdditions++;
      const points = Number(entry.points) || 0;
      stats.manualPoints += points;
      
      // Check if already counted in audit log
      const isAlreadyInAudit = auditEntries.some(a => 
        a.questionId === question.id && 
        a.mnemonic === entry.mnemonic && 
        Math.abs(new Date(a.timestamp) - new Date(entry.timestamp)) < 60000
      );
      
      if (!isAlreadyInAudit) {
        stats.totalPointsEarned += points;
      }
    }
  }
  
  // Calculate percentages and averages
  if (stats.totalAttempts > 0) {
    stats.correctPercentage = (stats.correctCount / stats.totalAttempts) * 100;
    stats.partiallyCorrectPercentage = (stats.partiallyCorrectCount / stats.totalAttempts) * 100;
    stats.incorrectPercentage = (stats.incorrectCount / stats.totalAttempts) * 100;
    stats.averageScore = stats.totalPointsEarned / stats.totalAttempts;
  }
  
  stats.uniqueParticipantCount = stats.uniqueParticipants.size;
  
  return stats;
}


/**
 * Add a role section to the report sheet
 * Returns the last row used for proper spacing
 */
function addRoleSectionToReport(reportSheet, role, questionStats) {
  const lastRow = reportSheet.getLastRow();
  
  // Add section header
  reportSheet.getRange(lastRow + 2, 1).setValue(`${role} Question Performance Report`);
  reportSheet.getRange(lastRow + 2, 1, 1, 12).merge().setFontWeight("bold").setBackground("#f3f3f3");
  
  // Add column headers
  const headers = [
    "Question ID", "Question", "Type", "Date Used", "Total Attempts", 
    "Correct", "Partially Correct", "Incorrect", "Avg Score", "Unique Participants",
    "Manual Additions", "Manual Points"
  ];
  
  reportSheet.getRange(lastRow + 3, 1, 1, headers.length).setValues([headers])
    .setFontWeight("bold").setBackground("#e6e6e6");
  
  // Add question data
  const questionData = [];
  for (const stats of questionStats) {
    let dateFormatted = stats.date;
    if (stats.date instanceof Date) {
      dateFormatted = Utilities.formatDate(stats.date, Session.getScriptTimeZone(), "MM/dd/yyyy");
    }
    
    questionData.push([
      stats.questionId,
      stats.questionText,
      stats.questionType,
      dateFormatted,
      stats.totalAttempts,
      `${stats.correctCount} (${stats.correctPercentage.toFixed(1)}%)`,
      `${stats.partiallyCorrectCount} (${stats.partiallyCorrectPercentage.toFixed(1)}%)`,
      `${stats.incorrectCount} (${stats.incorrectPercentage.toFixed(1)}%)`,
      `${stats.averageScore.toFixed(2)} / ${stats.possiblePoints}`,
      stats.uniqueParticipantCount,
      stats.manualAdditions,
      stats.manualPoints
    ]);
  }
  
  if (questionData.length > 0) {
    reportSheet.getRange(lastRow + 4, 1, questionData.length, headers.length).setValues(questionData);
    
    // Add performance indicators with conditional formatting
    const dataRange = reportSheet.getRange(lastRow + 4, 6, questionData.length, 3); // Columns F-H (Correct, Partially, Incorrect)
    addPerformanceFormatting(dataRange);
    
    // Add summary statistics
    addRoleSummarySection(reportSheet, role, questionStats);
  } else {
    reportSheet.getRange(lastRow + 4, 1).setValue(`No questions found for ${role} role.`);
  }
  
  // Return the last row used so we know where to start the next section
  return reportSheet.getLastRow();
}


/**
 * Add conditional formatting for performance indicators
 */
function addPerformanceFormatting(range) {
  // Get the spreadsheet and create rules
  const sheet = range.getSheet();
  const rules = sheet.getConditionalFormatRules();
  
  // Remove any existing rules for this range
  const rulesForRange = rules.filter(rule => 
    rule.getRanges().some(r => r.getA1Notation() === range.getA1Notation())
  );
  
  rulesForRange.forEach(rule => {
    sheet.removeConditionalFormatRule(rule);
  });
  
  // Create rules for Correct column (high is good)
  const correctRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains("(")
    .setBackground("#b7e1cd")  // Light green for high values
    .setRanges([range])
    .build();
  
  // Create rules for Incorrect column (high is bad)
  const incorrectRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains("(")
    .setBackground("#f4c7c3")  // Light red for high values
    .setRanges([range])
    .build();
  
  // Add the new rules
  const existingRules = sheet.getConditionalFormatRules();
  sheet.setConditionalFormatRules([...existingRules, correctRule, incorrectRule]);
}

/**
 * Add role summary statistics
 */
function addRoleSummarySection(reportSheet, role, questionStats) {
  const lastRow = reportSheet.getLastRow();
  
  // Calculate summary statistics
  const totalQuestions = questionStats.length;
  const totalAttempts = questionStats.reduce((sum, stats) => sum + stats.totalAttempts, 0);
  const totalCorrect = questionStats.reduce((sum, stats) => sum + stats.correctCount, 0);
  const totalPartiallyCorrect = questionStats.reduce((sum, stats) => sum + stats.partiallyCorrectCount, 0);
  const totalIncorrect = questionStats.reduce((sum, stats) => sum + stats.incorrectCount, 0);
  const totalPointsEarned = questionStats.reduce((sum, stats) => sum + stats.totalPointsEarned, 0);
  const totalPossiblePoints = questionStats.reduce((sum, stats) => sum + (stats.possiblePoints * stats.totalAttempts), 0);
  const totalManualAdditions = questionStats.reduce((sum, stats) => sum + stats.manualAdditions, 0);
  const totalManualPoints = questionStats.reduce((sum, stats) => sum + stats.manualPoints, 0);
  
  // Create all unique participants set
  const allParticipants = new Set();
  for (const stats of questionStats) {
    for (const participant of stats.uniqueParticipants) {
      allParticipants.add(participant);
    }
  }
  
  // Find best and worst performing questions
  let bestQuestion = null;
  let worstQuestion = null;
  let bestCorrectRate = -1;
  let worstCorrectRate = 101;
  
  for (const stats of questionStats) {
    if (stats.totalAttempts > 0) {
      const correctRate = stats.correctPercentage;
      if (correctRate > bestCorrectRate) {
        bestCorrectRate = correctRate;
        bestQuestion = stats;
      }
      if (correctRate < worstCorrectRate) {
        worstCorrectRate = correctRate;
        worstQuestion = stats;
      }
    }
  }
  
  // Add summary section
  reportSheet.getRange(lastRow + 2, 1).setValue(`${role} Summary Statistics`);
  reportSheet.getRange(lastRow + 2, 1, 1, 5).merge().setFontWeight("bold").setBackground("#f3f3f3");
  
  const summaryData = [
    ["Total Questions", totalQuestions],
    ["Total Unique Participants", allParticipants.size],
    ["Total Attempts", totalAttempts],
    ["Correct Answers", `${totalCorrect} (${totalAttempts > 0 ? (totalCorrect / totalAttempts * 100).toFixed(1) : 0}%)`],
    ["Partially Correct Answers", `${totalPartiallyCorrect} (${totalAttempts > 0 ? (totalPartiallyCorrect / totalAttempts * 100).toFixed(1) : 0}%)`],
    ["Incorrect Answers", `${totalIncorrect} (${totalAttempts > 0 ? (totalIncorrect / totalAttempts * 100).toFixed(1) : 0}%)`],
    ["Total Points Earned", totalPointsEarned],
    ["Total Possible Points", totalPossiblePoints],
    ["Overall Percentage", `${totalPossiblePoints > 0 ? (totalPointsEarned / totalPossiblePoints * 100).toFixed(1) : 0}%`],
    ["Manual Grade Additions", totalManualAdditions],
    ["Manual Points Added", totalManualPoints],
    ["Average Attempts Per Question", totalQuestions > 0 ? (totalAttempts / totalQuestions).toFixed(1) : 0],
    ["Average Attempts Per Participant", allParticipants.size > 0 ? (totalAttempts / allParticipants.size).toFixed(1) : 0]
  ];
  
  reportSheet.getRange(lastRow + 3, 1, summaryData.length, 2).setValues(summaryData);
  
  // Add best/worst performing questions if available
  if (bestQuestion && worstQuestion) {
    reportSheet.getRange(lastRow + 3, 4).setValue("Best Performing Question:");
    reportSheet.getRange(lastRow + 3, 5).setValue(`${bestQuestion.questionId} (${bestCorrectRate.toFixed(1)}% correct)`);
    
    reportSheet.getRange(lastRow + 4, 4).setValue("Worst Performing Question:");
    reportSheet.getRange(lastRow + 4, 5).setValue(`${worstQuestion.questionId} (${worstCorrectRate.toFixed(1)}% correct)`);
  }
}

/**
 * Generate an overall summary of the competition
 */
function generateOverallSummary(reportSheet) {
  const lastRow = reportSheet.getLastRow();
  
  // Add overall header
  reportSheet.getRange(lastRow + 3, 1).setValue("Overall Competition Summary");
  reportSheet.getRange(lastRow + 3, 1, 1, 12).merge().setFontWeight("bold").setBackground("#d9ead3");
  
  // Get role-specific data
  const rnQuestions = getQuestionsForRole("RN");
  const pcaQuestions = getQuestionsForRole("PCA");
  const auditEntries = getAuditLogEntries();
  const manualEntries = getManualGradeEntries();
  const participantRoles = getParticipantRoles();
  
  // Get unique participants by role
  const rnParticipants = new Set();
  const pcaParticipants = new Set();
  const allParticipants = new Set();
  
  // Process all audit entries to get participant counts
  for (const entry of auditEntries) {
    if (entry.status !== "Duplicate" && entry.correctRole === "Yes") {
      allParticipants.add(entry.mnemonic);
      
      // Determine role from participant data
      const role = participantRoles[entry.mnemonic.toLowerCase()];
      if (role === "RN") {
        rnParticipants.add(entry.mnemonic);
      } else if (role === "PCA") {
        pcaParticipants.add(entry.mnemonic);
      }
    }
  }
  
  // Calculate overall statistics
  const totalQuestions = rnQuestions.length + pcaQuestions.length;
  const totalAttempts = auditEntries.filter(e => e.status !== "Duplicate" && e.correctRole === "Yes").length;
  const totalCorrect = auditEntries.filter(e => e.status !== "Duplicate" && e.correctRole === "Yes" && e.correctness === "Correct").length;
  const totalPartial = auditEntries.filter(e => e.status !== "Duplicate" && e.correctRole === "Yes" && e.correctness === "Partially Correct").length;
  const totalIncorrect = auditEntries.filter(e => e.status !== "Duplicate" && e.correctRole === "Yes" && e.correctness !== "Correct" && e.correctness !== "Partially Correct").length;
  
  const totalManualEntries = manualEntries.length;
  const totalManualPoints = manualEntries.reduce((sum, entry) => sum + Number(entry.points || 0), 0);
  
  const totalPointsEarned = auditEntries.filter(e => e.status !== "Duplicate").reduce((sum, e) => sum + Number(e.earnedPoints || 0), 0);
  
  // Create overall summary data
  const overallData = [
    ["Total Participants", allParticipants.size],
    ["RN Participants", rnParticipants.size],
    ["PCA Participants", pcaParticipants.size],
    ["Total Questions", totalQuestions],
    ["RN Questions", rnQuestions.length],
    ["PCA Questions", pcaQuestions.length],
    ["Total Attempts", totalAttempts],
    ["Correct Answers", `${totalCorrect} (${totalAttempts > 0 ? (totalCorrect / totalAttempts * 100).toFixed(1) : 0}%)`],
    ["Partially Correct Answers", `${totalPartial} (${totalAttempts > 0 ? (totalPartial / totalAttempts * 100).toFixed(1) : 0}%)`],
    ["Incorrect Answers", `${totalIncorrect} (${totalAttempts > 0 ? (totalIncorrect / totalAttempts * 100).toFixed(1) : 0}%)`],
    ["Manual Grade Additions", totalManualEntries],
    ["Manual Points Added", totalManualPoints],
    ["Total Points Earned", totalPointsEarned + totalManualPoints],
    ["Average Points Per Participant", allParticipants.size > 0 ? ((totalPointsEarned + totalManualPoints) / allParticipants.size).toFixed(1) : 0]
  ];
  
  reportSheet.getRange(lastRow + 4, 1, overallData.length, 2).setValues(overallData);
  
  // Add participation trend analysis
  addParticipationTrendAnalysis(reportSheet, auditEntries, lastRow + 4, 4);
}

/**
 * Add participation trend analysis
 */
function addParticipationTrendAnalysis(reportSheet, auditEntries, startRow, startCol) {
  // Group attempts by date
  const attemptsByDate = {};
  
  for (const entry of auditEntries) {
    if (entry.status !== "Duplicate" && entry.correctRole === "Yes") {
      const date = new Date(entry.timestamp);
      const dateKey = Utilities.formatDate(date, Session.getScriptTimeZone(), "MM/dd/yyyy");
      
      if (!attemptsByDate[dateKey]) {
        attemptsByDate[dateKey] = {
          date: date,
          count: 0,
          uniqueParticipants: new Set()
        };
      }
      
      attemptsByDate[dateKey].count++;
      attemptsByDate[dateKey].uniqueParticipants.add(entry.mnemonic);
    }
  }
  
  // Convert to array and sort by date
  const dateArray = Object.values(attemptsByDate).sort((a, b) => a.date - b.date);
  
  // Add header
  reportSheet.getRange(startRow, startCol).setValue("Participation Trend Analysis");
  reportSheet.getRange(startRow, startCol, 1, 3).merge().setFontWeight("bold");
  
  // Add column headers
  reportSheet.getRange(startRow + 1, startCol, 1, 3).setValues([["Date", "Attempts", "Unique Participants"]]);
  
  // Add data
  const trendData = dateArray.map(item => [
    Utilities.formatDate(item.date, Session.getScriptTimeZone(), "MM/dd/yyyy"),
    item.count,
    item.uniqueParticipants.size
  ]);
  
  if (trendData.length > 0) {
    reportSheet.getRange(startRow + 2, startCol, trendData.length, 3).setValues(trendData);
  } else {
    reportSheet.getRange(startRow + 2, startCol).setValue("No participation data available");
  }
}

/**
 * Add visualizations to the report
 */
function addVisualizations(reportSheet) {
  try {
    // Get the last row
    const lastRow = reportSheet.getLastRow();
    
    // Add a section header for charts
    reportSheet.getRange(lastRow + 3, 1).setValue("Performance Visualizations");
    reportSheet.getRange(lastRow + 3, 1, 1, 12).merge().setFontWeight("bold").setBackground("#d9d2e9");
    
    // Create chart data for overall performance
    const chartData = [
      ["Category", "RN", "PCA"],
      ["Correct", 0, 0],
      ["Partially Correct", 0, 0],
      ["Incorrect", 0, 0]
    ];
    
    // Get data for RN and PCA performance
    const auditEntries = getAuditLogEntries();
    const rnQuestions = getQuestionsForRole("RN");
    const pcaQuestions = getQuestionsForRole("PCA");
    
    // Get question IDs for filtering
    const rnQuestionIds = rnQuestions.map(q => q.id);
    const pcaQuestionIds = pcaQuestions.map(q => q.id);
    
    // Count responses for RN questions
    const rnCorrect = auditEntries.filter(e => 
      rnQuestionIds.includes(e.questionId) && 
      e.status !== "Duplicate" && 
      e.correctRole === "Yes" && 
      e.correctness === "Correct"
    ).length;
    
    const rnPartial = auditEntries.filter(e => 
      rnQuestionIds.includes(e.questionId) && 
      e.status !== "Duplicate" && 
      e.correctRole === "Yes" && 
      e.correctness === "Partially Correct"
    ).length;
    
    const rnIncorrect = auditEntries.filter(e => 
      rnQuestionIds.includes(e.questionId) && 
      e.status !== "Duplicate" && 
      e.correctRole === "Yes" && 
      e.correctness !== "Correct" && 
      e.correctness !== "Partially Correct"
    ).length;
    
    // Count responses for PCA questions
    const pcaCorrect = auditEntries.filter(e => 
      pcaQuestionIds.includes(e.questionId) && 
      e.status !== "Duplicate" && 
      e.correctRole === "Yes" && 
      e.correctness === "Correct"
    ).length;
    
    const pcaPartial = auditEntries.filter(e => 
      pcaQuestionIds.includes(e.questionId) && 
      e.status !== "Duplicate" && 
      e.correctRole === "Yes" && 
      e.correctness === "Partially Correct"
    ).length;
    
    const pcaIncorrect = auditEntries.filter(e => 
      pcaQuestionIds.includes(e.questionId) && 
      e.status !== "Duplicate" && 
      e.correctRole === "Yes" && 
      e.correctness !== "Correct" && 
      e.correctness !== "Partially Correct"
    ).length;
    
    // Update chart data
    chartData[1][1] = rnCorrect;
    chartData[1][2] = pcaCorrect;
    chartData[2][1] = rnPartial;
    chartData[2][2] = pcaPartial;
    chartData[3][1] = rnIncorrect;
    chartData[3][2] = pcaIncorrect;
    
    // Add chart data to sheet
    const chartRange = reportSheet.getRange(lastRow + 4, 1, 4, 3);
    chartRange.setValues(chartData);
    
    // Create chart
    const chart = reportSheet.newChart()
      .setChartType(Charts.ChartType.COLUMN)
      .addRange(chartRange)
      .setPosition(lastRow + 4, 5, 0, 0)
      .setOption('title', 'Answer Performance by Role')
      .setOption('hAxis', {title: 'Answer Type'})
      .setOption('vAxis', {title: 'Number of Responses'})
      .setOption('legend', {position: 'top'})
      .setOption('width', 500)
      .setOption('height', 300)
      .build();
    
    reportSheet.insertChart(chart);
    
    // Create participation trend chart
    createParticipationTrendChart(reportSheet, lastRow + 10);
    
  } catch (error) {
    console.error("Error creating visualizations:", error.message, error.stack);
    reportSheet.getRange(lastRow + 4, 1).setValue("Error creating visualizations: " + error.message);
  }
}

/**
 * Create a participation trend chart
 */
function createParticipationTrendChart(reportSheet, startRow) {
  try {
    // Find the participation trend data
    const dataRange = reportSheet.getRange("D:F");
    const dataValues = dataRange.getValues();
    
    // Find the row with "Participation Trend Analysis"
    let headerRow = -1;
    for (let i = 0; i < dataValues.length; i++) {
      if (dataValues[i][0] === "Participation Trend Analysis") {
        headerRow = i;
        break;
      }
    }
    
    if (headerRow === -1) {
      console.log("Participation trend data not found");
      return;
    }
    
    // Get the range for the trend data
    const trendDataRange = reportSheet.getRange(headerRow + 2, 4, 20, 3); // Assumes up to 20 days of data
    
    // Create the chart
    const chart = reportSheet.newChart()
      .setChartType(Charts.ChartType.LINE)
      .addRange(trendDataRange)
      .setPosition(startRow, 1, 0, 0)
      .setOption('title', 'Daily Participation Trend')
      .setOption('hAxis', {title: 'Date'})
      .setOption('vAxis', {title: 'Count'})
      .setOption('legend', {position: 'top'})
      .setOption('width', 700)
      .setOption('height', 300)
      .build();
    
    reportSheet.insertChart(chart);
    
  } catch (error) {
    console.error("Error creating participation trend chart:", error.message, error.stack);
  }
}

/**
 * Create or get the report sheet
 */
function getOrCreateReportSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Competition Report");
  
  if (!sheet) {
    sheet = ss.insertSheet("Competition Report");
    
    // Add report title and generation info
    sheet.getRange("A1").setValue("March Madness Quiz Competition Report");
    sheet.getRange("A1:L1").merge().setFontWeight("bold").setFontSize(14).setBackground("#d9ead3");
    
    const today = new Date();
    sheet.getRange("A2").setValue(`Generated on: ${Utilities.formatDate(today, Session.getScriptTimeZone(), "MM/dd/yyyy HH:mm")}`);
    sheet.getRange("A2:L2").merge().setFontStyle("italic");
  } else {
    // Clear existing report content
    sheet.clear();
    
    // Re-add title
    sheet.getRange("A1").setValue("March Madness Quiz Competition Report");
    sheet.getRange("A1:L1").merge().setFontWeight("bold").setFontSize(14).setBackground("#d9ead3");
    
    const today = new Date();
    sheet.getRange("A2").setValue(`Generated on: ${Utilities.formatDate(today, Session.getScriptTimeZone(), "MM/dd/yyyy HH:mm")}`);
    sheet.getRange("A2:L2").merge().setFontStyle("italic");
  }
  
  return sheet;
}

/**
 * Format the report sheet for better readability
 */
function formatReportSheet(sheet) {
  // Auto-resize columns for better readability
  sheet.autoResizeColumns(1, 12);
  
  // Set alternate row coloring for data sections
  const lastRow = sheet.getLastRow();
  for (let i = 4; i <= lastRow; i += 2) {
    sheet.getRange(i, 1, 1, 12).setBackground("#f7f7f7");
  }
  
  // Add borders to tables
  sheet.getRange(1, 1, lastRow, 12).setBorder(true, true, true, true, true, true);
  
  // Freeze header rows
  sheet.setFrozenRows(2);
}

/**
 * Export the report as PDF
 */
function exportReportAsPDF() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Competition Report");
  
  if (!sheet) {
    throw new Error("Report sheet not found. Generate the report first.");
  }
  
  // Get the spreadsheet URL and modify it for PDF export
  const url = ss.getUrl().replace(/edit$/, '');
  const exportUrl = url + 'export?format=pdf&gid=' + sheet.getSheetId() +
                   '&size=letter' +
                   '&landscape=true' +
                   '&fitw=true' +
                   '&sheetnames=false' +
                   '&printtitle=false' +
                   '&pagenumbers=true' +
                   '&gridlines=false' +
                   '&fzr=false';
  
  // Fetch the PDF
  const response = UrlFetchApp.fetch(exportUrl, {
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken()
    }
  });
  
  // Get the PDF content
  const pdfBlob = response.getBlob().setName("March Madness Quiz Report.pdf");
  
  // Save to Drive
  const file = DriveApp.createFile(pdfBlob);
  
  // Show confirmation dialog with link
  const ui = SpreadsheetApp.getUi();
  const result = ui.alert(
    'PDF Export Complete',
    `The report has been exported as PDF and saved to Google Drive with the name "March Madness Quiz Report.pdf".\n\nWould you like to open it?`,
    ui.ButtonSet.YES_NO
  );
  
  if (result === ui.Button.YES) {
    // Open the PDF in a new browser tab
    const fileUrl = file.getUrl();
    const html = HtmlService.createHtmlOutput(`<script>window.open('${fileUrl}', '_blank');</script>`)
      .setWidth(10)
      .setHeight(10);
    ui.showModalDialog(html, 'Opening PDF...');
  }
  
  return file;
}

/**
 * Generate Excel export of the report
 */
function exportReportAsExcel() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Competition Report");
  
  if (!sheet) {
    throw new Error("Report sheet not found. Generate the report first.");
  }
  
  // Get the spreadsheet URL and modify it for Excel export
  const url = ss.getUrl().replace(/edit$/, '');
  const exportUrl = url + 'export?format=xlsx&gid=' + sheet.getSheetId();
  
  // Fetch the XLSX
  const response = UrlFetchApp.fetch(exportUrl, {
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken()
    }
  });
  
  // Get the Excel content
  const xlsxBlob = response.getBlob().setName("March Madness Quiz Report.xlsx");
  
  // Save to Drive
  const file = DriveApp.createFile(xlsxBlob);
  
  // Show confirmation dialog
  const ui = SpreadsheetApp.getUi();
  ui.alert(
    'Excel Export Complete',
    `The report has been exported as Excel and saved to Google Drive with the name "March Madness Quiz Report.xlsx".`,
    ui.ButtonSet.OK
  );
  
  return file;
}

/**
 * Generate detailed question report with clear role separation
 */
function generateDetailedQuestionReport() {
  // Show status message
  SpreadsheetApp.getActiveSpreadsheet().toast("Generating detailed question report...", "Report Generator", 30);
  
  try {
    // Create or get report sheet
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName("Detailed Question Report");
    
    if (!sheet) {
      sheet = ss.insertSheet("Detailed Question Report");
    } else {
      sheet.clear();
    }
    
    // Add title
    sheet.getRange("A1").setValue("March Madness Quiz - Detailed Question Report");
    sheet.getRange("A1:I1").merge().setFontWeight("bold").setFontSize(14).setBackground("#d9ead3");
    
    const today = new Date();
    sheet.getRange("A2").setValue(`Generated on: ${Utilities.formatDate(today, Session.getScriptTimeZone(), "MM/dd/yyyy HH:mm")}`);
    sheet.getRange("A2:I2").merge().setFontStyle("italic");
    
    // Get all questions by role
    const rnQuestions = getQuestionsForRole("RN");
    const pcaQuestions = getQuestionsForRole("PCA");
    
    // Add RN section header
    sheet.getRange("A3").setValue("RN Questions");
    sheet.getRange("A3:I3").merge().setFontWeight("bold").setBackground("#d9ead3");
    
    // Add column headers for RN section
    const headers = [
      "Question ID", "Question Text", "Type", "Points", "Total Attempts",
      "Correct", "Partially Correct", "Incorrect", "Manual Points"
    ];
    
    sheet.getRange("A4:I4").setValues([headers])
      .setFontWeight("bold").setBackground("#e6e6e6");
    
    // Get audit entries and manual entries
    const auditEntries = getAuditLogEntries();
    const manualEntries = getManualGradeEntries();
    
    // Process RN questions
    let currentRow = 5;
    if (rnQuestions.length > 0) {
      // Sort questions by ID for better readability
      rnQuestions.sort((a, b) => a.id.localeCompare(b.id));
      
      const rnData = [];
      for (const question of rnQuestions) {
        const stats = calculateQuestionStatistics(question, auditEntries, manualEntries, "RN");
        
        rnData.push([
          question.id,
          question.text,
          question.type,
          question.points,
          stats.totalAttempts,
          `${stats.correctCount} (${stats.correctPercentage.toFixed(1)}%)`,
          `${stats.partiallyCorrectCount} (${stats.partiallyCorrectPercentage.toFixed(1)}%)`,
          `${stats.incorrectCount} (${stats.incorrectPercentage.toFixed(1)}%)`,
          stats.manualPoints
        ]);
      }
      
      // Add RN data
      sheet.getRange(currentRow, 1, rnData.length, headers.length).setValues(rnData);
      currentRow += rnData.length + 2; // Add extra space
    } else {
      sheet.getRange(currentRow, 1).setValue("No RN questions found.");
      currentRow += 2;
    }
    
    // Add PCA section header
    sheet.getRange(currentRow, 1).setValue("PCA Questions");
    sheet.getRange(currentRow, 1, 1, 9).merge().setFontWeight("bold").setBackground("#d9ead3");
    currentRow++;
    
    // Add column headers for PCA section
    sheet.getRange(currentRow, 1, 1, headers.length).setValues([headers])
      .setFontWeight("bold").setBackground("#e6e6e6");
    currentRow++;
    
    // Process PCA questions
    if (pcaQuestions.length > 0) {
      // Sort questions by ID
      pcaQuestions.sort((a, b) => a.id.localeCompare(b.id));
      
      const pcaData = [];
      for (const question of pcaQuestions) {
        const stats = calculateQuestionStatistics(question, auditEntries, manualEntries, "PCA");
        
        pcaData.push([
          question.id,
          question.text,
          question.type,
          question.points,
          stats.totalAttempts,
          `${stats.correctCount} (${stats.correctPercentage.toFixed(1)}%)`,
          `${stats.partiallyCorrectCount} (${stats.partiallyCorrectPercentage.toFixed(1)}%)`,
          `${stats.incorrectCount} (${stats.incorrectPercentage.toFixed(1)}%)`,
          stats.manualPoints
        ]);
      }
      
      // Add PCA data
      sheet.getRange(currentRow, 1, pcaData.length, headers.length).setValues(pcaData);
    } else {
      sheet.getRange(currentRow, 1).setValue("No PCA questions found.");
    }
    
    // Format sheet
    sheet.autoResizeColumns(1, 9);
    for (let col = 1; col <= 9; col++) {
      // Limit column width to avoid extremely wide columns
      if (sheet.getColumnWidth(col) > 400) {
        sheet.setColumnWidth(col, 400);
      }
    }
    
    // Add alternate row coloring
    const lastRow = sheet.getLastRow();
    for (let i = 5; i <= lastRow; i += 2) {
      sheet.getRange(i, 1, 1, 9).setBackground("#f7f7f7");
    }
    
    // Freeze header rows
    sheet.setFrozenRows(4);
    
    // Activate sheet and show success message
    sheet.activate();
    SpreadsheetApp.getActiveSpreadsheet().toast("Detailed question report generated successfully!", "Report Generator");
    
    return sheet;
  } catch (error) {
    console.error("Error generating detailed question report:", error.message, error.stack);
    SpreadsheetApp.getActiveSpreadsheet().toast("Error generating report: " + error.message, "Report Generator", 10);
    logError('Detailed Question Report', error.message);
    return null;
  }
}

/**
 * Add reporting options to the menu
 * This would be added to your existing onOpen function
 */
function addReportingToMenu() {
  const ui = SpreadsheetApp.getUi();
  const menu = ui.createMenu('Quiz Admin');
  
  // Add your existing menu items
  
  // Add reporting section
  menu.addSeparator()
    .addItem('Generate Comprehensive Report', 'generateComprehensiveReports')
    .addItem('Generate Detailed Question Report', 'generateDetailedQuestionReport')
    .addItem('Export Report as PDF', 'exportReportAsPDF')
    .addItem('Export Report as Excel', 'exportReportAsExcel');
  
  menu.addToUi();
}

