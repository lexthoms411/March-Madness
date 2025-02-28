/**
 * Main grading function
 */
function gradeResponses() {
    console.info("📌 Starting grading process...");

    const sheet = SpreadsheetApp.getActiveSpreadsheet();
    const responsesSheet = sheet.getSheetByName("Form Responses (Raw)");
    const questionBankSheet = sheet.getSheetByName(SHEETS.QUESTION_BANK);
    const scoresSheet = sheet.getSheetByName(SHEETS.SCORES);
    const auditLogSheet = sheet.getSheetByName(SHEETS.AUDIT_LOG);

    if (!responsesSheet || !questionBankSheet || !scoresSheet || !auditLogSheet) {
        console.error("❌ Missing required sheets");
        logError('Grade Responses', 'Missing required sheets');
        return;
    }

    // Get already processed responses
    const processedResponses = getProcessedResponses(auditLogSheet);

    // Sync new responses
    syncResponses();

    const responsesData = responsesSheet.getDataRange().getValues();
    const questionBankData = questionBankSheet.getDataRange().getValues();
    const validMnemonics = scoresSheet.getRange('A2:A')
        .getValues()
        .map(row => row[0]?.toLowerCase())
        .filter(Boolean);

    // Build question map
    const questionMap = {};
    for (let i = 1; i < questionBankData.length; i++) {
        const row = questionBankData[i];
        const qID = row[1];
        if (qID) {
            questionMap[qID] = {
                question: row[2],
                correctAnswer: row[9],
                type: row[10],
                targetRole: row[11],
                points: parseInt(row[12]) || 0
            };
        }
    }

    let auditLogEntries = [];

    // Process responses
    for (let i = 1; i < responsesData.length; i++) {
        const row = responsesData[i];
        const timestamp = row[0];
        const mnemonic = row[1].toLowerCase();
        const answerData = parseAnswer(row[2]);
        const role = row[3];
        const gradedStatus = row[4];

        if (gradedStatus === "Yes" || !validMnemonics.includes(mnemonic)) {
            continue;
        }

        for (const [qID, userAnswer] of Object.entries(answerData)) {
            const responseKey = `${timestamp}_${mnemonic}_${qID}`.toLowerCase();

            if (processedResponses.has(responseKey)) {
                console.log(`Skipping already processed response: ${responseKey}`);
                continue;
            }

            const questionData = questionMap[qID];
            if (!questionData) {
                console.warn(`Question ${qID} not found in bank`);
                logError('Grade Response', `Question ${qID} not found in bank`);
                continue;
            }

            // Get current score before grading
            const currentScore = getCurrentScore(scoresSheet, mnemonic);

            // Get actual role from the Scores sheet
            const actualRole = getUserRole(scoresSheet, mnemonic).trim().toLowerCase();
            const requiredRole = (questionData.targetRole || "").trim().toLowerCase();

            // Check both role mismatch & duplicate attempt at the same time
            const correctRole = actualRole === requiredRole;
            const isDuplicate = hasAttemptedBefore(scoresSheet, mnemonic, qID);

            // Grade answer regardless of eligibility
            const isCorrect = isAnswerCorrect(userAnswer, questionData.correctAnswer, questionData.type);
            let earnedPoints = 0;

            // Only award points if eligible (correct role and not duplicate)
            if (correctRole && !isDuplicate) {
                if (questionData.type.toLowerCase() === "multiple select") {
                    earnedPoints = calculatePartialCredit(
                        userAnswer,
                        questionData.correctAnswer,
                        questionData.type,
                        questionData.points
                    );
                } else {
                    earnedPoints = isCorrect ? questionData.points : 0;
                }

                // Update scores
                updateScores(scoresSheet, mnemonic, qID, earnedPoints, timestamp);
            }

            // Update raw responses with correct/incorrect status
            responsesSheet.getRange(i + 1, 6).setValue(isCorrect ? "Correct" : "Incorrect");

            // Log to audit with new column structure
            auditLogEntries.push([
                timestamp,                    // Timestamp
                mnemonic,                    // Mnemonic
                qID,                         // Question ID
                `Answer: ${userAnswer} (Expected: ${questionData.correctAnswer})`, // Answer
                isCorrect ? "Correct" : "Incorrect",  // Correct? (now shows regardless of status)
                isDuplicate ? "Yes" : "No",  // Duplicate Attempt?
                correctRole ? "Yes" : "No",  // Correct Role?
                currentScore,                // Previous Points
                earnedPoints,                // Earned Points
                currentScore + earnedPoints, // Total Points
                isDuplicate ? "Duplicate" :
                    !correctRole ? "Role Mismatch" :
                    "Processed"              // Status
            ]);
        }

        // Mark as graded
        responsesSheet.getRange(i + 1, 5).setValue("Yes");
    }

    // Add audit entries
    if (auditLogEntries.length > 0) {
        auditLogSheet.getRange(auditLogSheet.getLastRow() + 1, 1, auditLogEntries.length, auditLogEntries[0].length)
            .setValues(auditLogEntries);
    }

    console.info("🎉 Grading complete!");
}

/**
 * Sync form responses to raw responses sheet with optimized performance
 */
function syncResponses() {
    console.info("🔄 Starting response sync...");

    const sheet = SpreadsheetApp.getActiveSpreadsheet();
    const formResponsesSheet = sheet.getSheetByName(SHEETS.FORM_RESPONSES);
    const rawResponsesSheet = sheet.getSheetByName("Form Responses (Raw)");

    if (!formResponsesSheet || !rawResponsesSheet) {
        console.error("❌ Required sheets not found");
        logError('Sync Responses', 'Required sheets not found');
        return [];
    }

    // Get last sync timestamp to only process new records
    const props = PropertiesService.getScriptProperties();
    const lastSyncTimestamp = props.getProperty('lastSyncTimestamp');
    let lastTimestamp = lastSyncTimestamp ? new Date(lastSyncTimestamp) : null;

    const formData = formResponsesSheet.getDataRange().getValues();
    const headers = formData[0];
    const rawData = rawResponsesSheet.getDataRange().getValues();
    
    // Create lookup for faster checking
    const existingEntries = new Set();
    for (let i = 1; i < rawData.length; i++) {
        const key = `${rawData[i][0]}_${String(rawData[i][1]).toLowerCase()}_${rawData[i][2]}`;
        existingEntries.add(key);
    }

    const newResponses = [];

    for (let i = 1; i < formData.length; i++) {
        const row = formData[i];
        const timestamp = row[0];
        
        // Skip if older than last sync
        if (lastTimestamp && timestamp < lastTimestamp) {
            continue;
        }
        
        // Update latest timestamp
        if (!lastTimestamp || timestamp > lastTimestamp) {
            lastTimestamp = timestamp;
        }
        
        const mnemonic = row[2];  // Mnemonic is in column C
        const role = row[3];      // Role is in column D

        if (!mnemonic || typeof mnemonic !== 'string') {
            console.warn(`⚠️ Invalid mnemonic at row ${i + 1}`);
            logError('Sync Responses', `Invalid mnemonic at row ${i + 1}`);
            continue;
        }

        const mnemonicLower = mnemonic.toString().toLowerCase();
        let answerDataObj = {};

        // Process answers
        for (let col = 4; col < headers.length; col++) {
            const answer = row[col];
            if (answer && answer.toString().trim() !== "") {
                const questionID = extractQuestionID(headers[col]);
                if (questionID) {
                    answerDataObj[questionID] = answer.toString().trim();
                }
            }
        }

        if (Object.keys(answerDataObj).length > 0) {
            const answerJson = JSON.stringify(answerDataObj);
            const entryKey = `${timestamp}_${mnemonicLower}_${answerJson}`;

            if (!existingEntries.has(entryKey)) {
                const formattedRow = [timestamp, mnemonicLower, answerJson, role, "No", ""];
                newResponses.push(formattedRow);
                existingEntries.add(entryKey);
            }
        }
    }

    // Batch append all new rows together
    if (newResponses.length > 0) {
        rawResponsesSheet.getRange(
            rawResponsesSheet.getLastRow() + 1, 
            1, 
            newResponses.length, 
            newResponses[0].length
        ).setValues(newResponses);
    }
    
    // Update the last sync timestamp property
    if (lastTimestamp) {
        props.setProperty('lastSyncTimestamp', lastTimestamp.toISOString());
    }

    console.info(`✅ Synced ${newResponses.length} new responses`);
    return newResponses;
}

/**
 * Update scores in scores sheet with batch operations where possible
 */
function updateScores(scoresSheet, mnemonic, questionID, points, timestamp) {
    // Ensure scoresSheet is properly defined
    if (!scoresSheet) {
        console.error("❌ scoresSheet is undefined. Attempting to retrieve it.");
        const sheet = SpreadsheetApp.getActiveSpreadsheet();
        scoresSheet = sheet.getSheetByName(SHEETS.SCORES);

        if (!scoresSheet) {
            console.error("❌ Scores sheet not found!");
            logError('Update Scores', 'Scores sheet not found');
            return;
        }
    }

    const scoresData = scoresSheet.getDataRange().getValues();
    const mnemonicLower = mnemonic.toLowerCase();

    for (let i = 1; i < scoresData.length; i++) {
        const row = scoresData[i];
        if (!row || row.length < 4 || !row[0]) continue; // Skip empty or malformed rows

        if (row[0].toLowerCase() === mnemonicLower) {
            if (!hasAttemptedBefore(scoresSheet, mnemonic, questionID)) {
                let currentScore = row[3] || 0;
                let newScore = currentScore + points;
                scoresSheet.getRange(i + 1, 4).setValue(newScore);

                let attempts = {};
                try {
                    attempts = JSON.parse(row[5] || "{}");
                } catch (e) {
                    console.error(`❌ Error parsing attempts for ${mnemonic}:`, e);
                    logError('Update Scores', `Error parsing attempts for ${mnemonic}: ${e.message}`);
                }

                attempts[questionID] = { timestamp, points };
                scoresSheet.getRange(i + 1, 6).setValue(JSON.stringify(attempts));

                console.info(`✅ Updated score for ${mnemonic}: ${newScore} (Question: ${questionID}, Points: ${points})`);
            } else {
                console.info(`ℹ️ Skipped score update - ${mnemonic} already attempted question ${questionID}`);
            }
            return;
        }
    }
}

/**
 * Set up triggers for automatic processing
 */
function setupTriggers() {
    // Clear existing triggers
    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
        ScriptApp.deleteTrigger(triggers[i]);
    }
    
    // Create time trigger to process the queue every 1 minute
    ScriptApp.newTrigger('processQueue')
        .timeBased()
        .everyMinutes(1)
        .create();
    
    // Get the form ID from the constants
    try {
        const form = FormApp.openById(FORM_ID);
        ScriptApp.newTrigger('onFormSubmit')
            .forForm(form)
            .onFormSubmit()
            .create();
        console.log("✅ Form trigger created successfully");
    } catch (e) {
        console.error("❌ Error creating form trigger: " + e.message);
    }
    
    // Create daily trigger to update leaderboard at midnight
    ScriptApp.newTrigger('updateLeaderboard')
        .timeBased()
        .atHour(0)
        .everyDays(1)
        .create();
        
    console.log("✅ All triggers set up successfully");
}

/**
 * Handle form submission - just add to queue, don't process yet
 */
function onFormSubmit(e) {
    try {
        // Get submission data
        const timestamp = e.response.getTimestamp();
        const itemResponses = e.response.getItemResponses();
        
        // Find the mnemonic - assumes your form has a specific question for mnemonic
        let mnemonic = "";
        let role = "";
        
        for (let i = 0; i < itemResponses.length; i++) {
            const item = itemResponses[i];
            const title = item.getItem().getTitle();
            
            if (title.toLowerCase().includes("mnemonic")) {
                mnemonic = item.getResponse().toLowerCase().trim();
            } else if (title.toLowerCase().includes("role")) {
                role = item.getResponse();
            }
        }
        
        if (!mnemonic) {
            console.warn("⚠️ No mnemonic found in submission");
            return;
        }
        
        // Add to processing queue
        const sheet = SpreadsheetApp.getActiveSpreadsheet();
        const queueSheet = sheet.getSheetByName("Processing Queue") || 
                           sheet.insertSheet("Processing Queue");
        
        // If queue sheet is new, add headers
        if (queueSheet.getLastRow() === 0) {
            queueSheet.appendRow(["Timestamp", "Mnemonic", "Processed", "Processing Timestamp"]);
        }
        
        // Add to queue
        queueSheet.appendRow([timestamp, mnemonic, "No", ""]);
        
        console.log(`✅ Added submission from ${mnemonic} to processing queue`);
    } catch (e) {
        console.error("❌ Error in form submission handler: " + e.message);
        logError('Form Submit', `Error handling submission: ${e.message}`);
    }
}

/**
 * Process the queue of submissions (runs every minute)
 */
function processQueue() {
    console.log("🔄 Processing submission queue...");
    
    const sheet = SpreadsheetApp.getActiveSpreadsheet();
    const queueSheet = sheet.getSheetByName("Processing Queue");
    
    if (!queueSheet) {
        console.log("ℹ️ No queue sheet found - nothing to process");
        return;
    }
    
    const queueData = queueSheet.getDataRange().getValues();
    if (queueData.length <= 1) {
        console.log("ℹ️ No items in queue to process");
        return;
    }
    
    // Count how many we need to process
    let pendingCount = 0;
    for (let i = 1; i < queueData.length; i++) {
        if (queueData[i][2] === "No") {
            pendingCount++;
        }
    }
    
    if (pendingCount === 0) {
        console.log("ℹ️ No pending items in queue");
        return;
    }
    
    console.log(`🔄 Processing ${pendingCount} queued submissions...`);
    
    // First sync all responses to make sure we have the latest data
    syncResponses();
    
    // Now grade responses
    gradeResponses();
    
    // Mark all as processed
    const now = new Date();
    const pendingRows = [];
    const pendingRowIndices = [];
    
    for (let i = 1; i < queueData.length; i++) {
        if (queueData[i][2] === "No") {
            pendingRows.push(["Yes", now]);
            pendingRowIndices.push(i+1);
        }
    }
    
    // Batch update status
    if (pendingRows.length > 0) {
        // Use batch update for efficiency
        const statusRange = queueSheet.getRange(pendingRowIndices[0], 3, pendingRows.length, 2);
        statusRange.setValues(pendingRows);
    }
    
    console.log(`✅ Processed ${pendingRows.length} queued submissions`);
}

/**
 * Optimized Reset all scores to zero
 */
function resetAllScores() {
    console.info("🔄 Resetting all scores...");

    const sheet = SpreadsheetApp.getActiveSpreadsheet();
    const scoresSheet = sheet.getSheetByName(SHEETS.SCORES);

    if (!scoresSheet) {
        console.error("❌ Scores sheet not found");
        logError('Reset Scores', 'Scores sheet not found');
        return;
    }

    const lastRow = scoresSheet.getLastRow();
    if (lastRow <= 1) {
        console.info("ℹ️ No scores to reset.");
        return;
    }

    // Batch update using setValues for efficiency
    const numRows = lastRow - 1;
    const zeroArray = Array(numRows).fill([0]);
    const emptyJsonArray = Array(numRows).fill(["{}"]);

    scoresSheet.getRange(2, 4, numRows, 1).setValues(zeroArray); // Reset scores
    scoresSheet.getRange(2, 6, numRows, 1).setValues(emptyJsonArray); // Reset attempts

    console.info(`✅ Successfully reset scores for ${numRows} participants.`);
}

/**
 * Optimized Delete all synced response data
 */
function deleteSyncData() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet();
    const rawResponsesSheet = sheet.getSheetByName("Form Responses (Raw)");

    if (!rawResponsesSheet) {
        logError('Delete Sync Data', 'Raw responses sheet not found');
        return;
    }

    const lastRow = rawResponsesSheet.getLastRow();
    const lastColumn = rawResponsesSheet.getLastColumn();

    if (lastRow > 1 && lastColumn > 0) {
        rawResponsesSheet.getRange(2, 1, lastRow - 1, lastColumn).clear();
        console.info(`✅ Successfully deleted ${lastRow - 1} synced responses.`);
    } else {
        console.info("ℹ️ No synced responses to delete.");
    }
}

function onOpen() {
    const ui = SpreadsheetApp.getUi();
    ui.createMenu('Quiz Admin')
        .addItem('Process Pending Responses', 'processQueue')
        .addItem('Grade Responses', 'gradeResponses')
        .addItem('Sync Responses', 'syncResponses')
        .addItem('Delete Synced Data', 'deleteSyncData')
        .addItem('Reset Scores', 'resetAllScores')
        .addItem('Update Leaderboard', 'updateLeaderboard')
        .addSeparator()
        .addItem('Setup Automatic Processing', 'setupTriggers')
        .addItem('Add Manual Points', 'showManualPointsDialog')
        .addItem('Process Manual Form Grades', 'handleFormGradeOverride')
        .addToUi();
}
