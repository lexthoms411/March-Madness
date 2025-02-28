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
    // Create a map of full answers to letter codes
    const answerMapping = {};
    
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
            
            // Create answer mapping for this question if it's multiple choice or select
            if (row[10] && (row[10].toLowerCase().includes("multiple"))) {
                const options = [row[3], row[4], row[5], row[6], row[7], row[8]].filter(Boolean);
                const letterMap = {};
                
                options.forEach((text, index) => {
                    const letter = String.fromCharCode(65 + index); // A, B, C, etc.
                    letterMap[text.toLowerCase().trim()] = letter;
                });
                
                answerMapping[qID] = letterMap;
            }
        }
    }

    let auditLogEntries = [];

    // Process responses
    for (let i = 1; i < responsesData.length; i++) {
        const row = responsesData[i];
        const timestamp = row[0];
        const mnemonic = row[1]?.toLowerCase();
        const answerData = parseAnswer(row[2]);
        const role = row[3];
        const gradedStatus = row[4];

        if (gradedStatus === "Yes" || !mnemonic || !validMnemonics.includes(mnemonic)) {
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
            const correctRole = actualRole === requiredRole || !requiredRole;
            const isDuplicate = hasAttemptedBefore(scoresSheet, mnemonic, qID);

            // Grade answer regardless of eligibility
            const isCorrect = isAnswerCorrect(userAnswer, questionData.correctAnswer, questionData.type);
            let earnedPoints = 0;

            // Only award points if eligible (correct role and not duplicate)
            if (correctRole && !isDuplicate) {
                if (questionData.type && questionData.type.toLowerCase() === "multiple select") {
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

            // Get shortened answers for display
            let formattedUserAnswer = getAnswerLetters(userAnswer, qID, answerMapping);
            let formattedCorrectAnswer = getAnswerLetters(questionData.correctAnswer, qID, answerMapping);
            
            // Short display version for audit log
            const answerDisplay = `Answer: ${shortenAnswerText(formattedUserAnswer)} (Expected: ${shortenAnswerText(formattedCorrectAnswer)})`;

            // Log to audit with new column structure
            auditLogEntries.push([
                timestamp,                    // Timestamp
                mnemonic,                    // Mnemonic
                qID,                         // Question ID
                answerDisplay,               // Shortened answer
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

    // Update audit log formatting
    updateAuditLogFormatting();
    
    // Update leaderboards
    updateLeaderboard();

    console.info("🎉 Grading complete!");
}

/**
 * Sync form responses to raw responses sheet
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

    const formData = formResponsesSheet.getDataRange().getValues();
    const headers = formData[0];
    
    // Get raw data for checking if exists
    const rawData = rawResponsesSheet.getDataRange().getValues();
    
    // Check if raw responses sheet is empty (except header)
    const isEmpty = rawResponsesSheet.getLastRow() <= 1;
    
    // If sheet is empty, we'll process all responses
    // Otherwise, we'll only check for new responses
    const newResponses = [];
    const existingEntries = new Set();
    
    // Build set of existing entries only if not empty
    if (!isEmpty) {
        for (let i = 1; i < rawData.length; i++) {
            const key = `${rawData[i][0]}_${String(rawData[i][1]).toLowerCase()}_${rawData[i][2]}`;
            existingEntries.add(key);
        }
    }

    for (let i = 1; i < formData.length; i++) {
        const row = formData[i];
        const timestamp = row[0];
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

            // If raw sheet is empty OR this entry doesn't exist yet, add it
            if (isEmpty || !existingEntries.has(entryKey)) {
                const formattedRow = [timestamp, mnemonicLower, answerJson, role, "No", ""];
                newResponses.push(formattedRow);
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

    // Update leaderboards
    updateLeaderboard();

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
        // Clear all data except header
        rawResponsesSheet.getRange(2, 1, lastRow - 1, lastColumn).clear();
        
        // Also clear the last sync timestamp to force full resync
        PropertiesService.getScriptProperties().deleteProperty('lastSyncTimestamp');
        
        console.info(`✅ Successfully deleted ${lastRow - 1} synced responses.`);
    } else {
        console.info("ℹ️ No synced responses to delete.");
    }
}

/**
 * Clear audit log for testing purposes
 */
function clearAuditLog() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet();
    const auditLogSheet = sheet.getSheetByName(SHEETS.AUDIT_LOG);

    if (!auditLogSheet) {
        console.error("❌ Audit log sheet not found");
        return;
    }

    const lastRow = auditLogSheet.getLastRow();
    if (lastRow > 1) {
        // Clear all data except header
        auditLogSheet.getRange(2, 1, lastRow - 1, auditLogSheet.getLastColumn()).clear();
        console.info(`✅ Successfully cleared ${lastRow - 1} audit log entries.`);
    } else {
        console.info("ℹ️ No audit log entries to clear.");
    }
}

/**
 * Setup all required triggers for the competition
 */
function setupTriggers() {
    // Clear existing triggers
    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
        ScriptApp.deleteTrigger(triggers[i]);
    }
    
    // Create time trigger to process the queue every 5 minutes
    ScriptApp.newTrigger('processQueue')
        .timeBased()
        .everyMinutes(5)
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
        // Add debug info
        console.log("Form submission received");
        console.log("Event object:", JSON.stringify(e || {}));
        
        // Different handling based on whether this is a form trigger or manual run
        let timestamp = new Date();
        let mnemonic = "";
        
        if (e && e.namedValues) {
            // This is a proper form trigger
            console.log("Processing form trigger");
            
            // Get mnemonic - assuming the field is labeled "Mnemonic" in the form
            const mnemonicArray = e.namedValues['Mnemonic'] || [];
            mnemonic = mnemonicArray.length > 0 ? mnemonicArray[0].toLowerCase().trim() : "";
            
            // Get timestamp
            timestamp = e.values ? new Date(e.values[0]) : timestamp;
        } else if (e && e.response) {
            // This is a form submission object
            console.log("Processing form response object");
            
            // Get submission data
            timestamp = e.response.getTimestamp();
            const itemResponses = e.response.getItemResponses();
            
            // Find the mnemonic - assumes your form has a specific question for mnemonic
            for (let i = 0; i < itemResponses.length; i++) {
                const item = itemResponses[i];
                const title = item.getItem().getTitle();
                
                if (title.toLowerCase().includes("mnemonic")) {
                    mnemonic = item.getResponse().toLowerCase().trim();
                    break;
                }
            }
        } else {
            // No event data
            console.warn("No form data available");
            return;
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
        console.error("❌ Error in form submission handler:", e.message, e.stack);
        logError('Form Submit', `Error handling submission: ${e.message}`);
    }
}

/**
 * Process the queue of submissions (runs every 5 minutes)
 */
function processQueue() {
    console.log("🔄 Processing submission queue...");
    
    try {
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
        const pendingIndices = [];
        
        for (let i = 1; i < queueData.length; i++) {
            if (queueData[i][2] === "No") {
                pendingCount++;
                pendingIndices.push(i);
            }
        }
        
        if (pendingCount === 0) {
            console.log("ℹ️ No pending items in queue");
            return;
        }
        
        console.log(`🔄 Found ${pendingCount} queued submissions to process...`);
        
        // Process in batches of 10 to avoid timeout
        const BATCH_SIZE = 10;
        const batchesToProcess = Math.min(BATCH_SIZE, pendingCount);
        const batchIndices = pendingIndices.slice(0, batchesToProcess);
        
        console.log(`Processing first ${batchesToProcess} of ${pendingCount} pending items`);
        
        // First sync all responses to make sure we have the latest data
        syncResponses();
        
        // Process only a batch of submissions
        processBatchFromQueue(batchIndices, queueSheet, queueData);
        
        // If more remain, set up a trigger to continue processing
        if (pendingCount > BATCH_SIZE) {
            console.log(`${pendingCount - BATCH_SIZE} items remain in queue for next processing cycle`);
        }
    } catch (e) {
        console.error("❌ Error in processQueue:", e.message, e.stack);
    }
}

/**
 * Process a batch of submissions from the queue
 */
function processBatchFromQueue(indices, queueSheet, queueData) {
    // Ensure indices is an array
    if (!Array.isArray(indices)) {  // This was written as !Array.isArray - note the capital A
        console.error("❌ indices is not an array:", indices);
        return;
    }
    
    console.log("Processing batch with indices:", indices);

    // Mark these as being processed
    const now = new Date();
    const pendingRows = [];
    const pendingRowIndices = [];
    
    for (let i = 0; i < indices.length; i++) {
        pendingRows.push(["Yes", now]);
        pendingRowIndices.push(indices[i]+1);
    }
    
    // Batch update status
    if (pendingRows.length > 0) {
        try {
            // Update each row one by one to avoid range errors
            for (let i = 0; i < pendingRows.length; i++) {
                queueSheet.getRange(pendingRowIndices[i], 3, 1, 2).setValues([pendingRows[i]]);
            }
            
            // Process these mnemonics
            for (let i = 0; i < indices.length; i++) {
                const index = indices[i];
                // Check if queueData[index] exists and has a second element
                if (queueData[index] && queueData[index][1]) {
                    const mnemonic = queueData[index][1];
                    gradeResponsesForMnemonic(mnemonic);
                } else {
                    console.error(`❌ Invalid queue data at index ${index}`);
                }
            }
        } catch (e) {
            console.error("❌ Error in processBatchFromQueue:", e.message);
        }
    }
    
    console.log(`✅ Processed ${pendingRows.length} queued submissions`);
}

/**
 * Grade responses for a specific mnemonic
 */
function gradeResponsesForMnemonic(mnemonic) {
    // Check if mnemonic is valid
    if (!mnemonic) {
        console.error("❌ Invalid mnemonic provided to gradeResponsesForMnemonic");
        return;
    }
    
    console.log(`Processing submissions for ${mnemonic}`);
    
    try {
        const sheet = SpreadsheetApp.getActiveSpreadsheet();
        const responsesSheet = sheet.getSheetByName("Form Responses (Raw)");
        
        if (!responsesSheet) {
            console.error("❌ Missing Form Responses (Raw) sheet");
            return;
        }
        
        // Find all ungraded responses for this mnemonic
        const data = responsesSheet.getDataRange().getValues();
        let rowsToGrade = [];
        
        for (let i = 1; i < data.length; i++) {
            // Ensure data[i][1] exists before calling toLowerCase()
            const rowMnemonic = data[i][1] ? data[i][1].toString().toLowerCase() : "";
            
            if (rowMnemonic === mnemonic.toString().toLowerCase() && data[i][4] !== "Yes") {
                rowsToGrade.push(i);
            }
        }
        
        if (rowsToGrade.length === 0) {
            console.log(`No ungraded responses found for ${mnemonic}`);
            return;
        }
        
        console.log(`Found ${rowsToGrade.length} responses to grade for ${mnemonic}`);
        
        // Now we need to grade just these responses
        // For now, we'll call gradeResponses() as it's the simplest option
        gradeResponses();
        
    } catch (e) {
        console.error(`❌ Error processing ${mnemonic}:`, e.message);
    }
}

/**
 * Shorten long answer text for display
 */
function shortenAnswerText(answer, maxLength = 50) {
    if (!answer || answer.length <= maxLength) return answer;
    return answer.substring(0, maxLength) + "...";
}

/**
 * Get answer letters for display
 */
function getAnswerLetters(answerText, qID, answerMapping) {
    if (!answerText || !answerMapping || !answerMapping[qID]) return answerText;
    
    if (answerText.includes(',')) {
        // Multiple select
        return answerText.split(',')
            .map(a => {
                const letterCode = answerMapping[qID][a.toLowerCase().trim()];
                return letterCode ? letterCode : a.trim();
            })
            .join(',');
    }
    
    // Single select
    const letterCode = answerMapping[qID][answerText.toLowerCase().trim()];
    return letterCode ? letterCode : answerText;
}

/**
 * Update formatting in audit log for better readability
 */
function updateAuditLogFormatting() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const auditSheet = ss.getSheetByName(SHEETS.AUDIT_LOG);
    
    if (!auditSheet) return;
    
    // Clear existing rules
    auditSheet.clearConditionalFormatRules();
    
    // Get last row
    const lastRow = Math.max(auditSheet.getLastRow(), 1);
    
    // Create rules array
    const rules = [];
    
    // Status column (column K or 11)
    const statusColumn = 11;
    const statusRange = auditSheet.getRange(2, statusColumn, lastRow - 1, 1);
    
    // Duplicate attempts - yellow
    rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenTextContains("Duplicate")
        .setBackground("#FFF2CC")
        .setRanges([statusRange])
        .build());
    
    // Role mismatch - orange
    rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenTextContains("Role Mismatch")
        .setBackground("#FCE5CD")
        .setRanges([statusRange])
        .build());
    
    // Processed - green
    rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenTextContains("Processed")
        .setBackground("#D9EAD3")
        .setRanges([statusRange])
        .build());
    
    // Manual addition - blue
    rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenTextContains("Manual")
        .setBackground("#CFE2F3")
        .setRanges([statusRange])
        .build());
    
    // Errors - red
    rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenTextContains("Error")
        .setBackground("#F4CCCC")
        .setRanges([statusRange])
        .build());
    
    // Apply all rules
    auditSheet.setConditionalFormatRules(rules);
}

/**
 * Archive old audit log data to prevent sheet from growing too large
 */
function archiveOldData() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet();
    const auditLogSheet = sheet.getSheetByName(SHEETS.AUDIT_LOG);
    
    if (auditLogSheet.getLastRow() > 5000) { // If we have more than 5000 rows
        // Create archive sheet if it doesn't exist
        let archiveSheet = sheet.getSheetByName("Audit Archive");
        if (!archiveSheet) {
            archiveSheet = sheet.insertSheet("Audit Archive");
            // Copy headers
            auditLogSheet.getRange(1, 1, 1, auditLogSheet.getLastColumn())
                .copyTo(archiveSheet.getRange(1, 1));
        }
        
        // Get oldest 1000 entries (after header)
        const dataToArchive = auditLogSheet.getRange(
            2, 1, 1000, auditLogSheet.getLastColumn()
        ).getValues();
        
        // Append to archive
        archiveSheet.getRange(
            archiveSheet.getLastRow() + 1, 1, dataToArchive.length, dataToArchive[0].length
        ).setValues(dataToArchive);
        
        // Delete from audit log
        auditLogSheet.deleteRows(2, 1000);
    }
}

/**
 * Add test data to queue for benchmarking
 */
function addTestData() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet();
    const mnemonics = sheet.getSheetByName(SHEETS.SCORES).getRange('A2:A').getValues()
        .map(row => row[0])
        .filter(Boolean);
    
    // Create queue if it doesn't exist
    const queueSheet = sheet.getSheetByName("Processing Queue") || 
                        sheet.insertSheet("Processing Queue");
    
    // If queue sheet is new, add headers
    if (queueSheet.getLastRow() === 0) {
        queueSheet.appendRow(["Timestamp", "Mnemonic", "Processed", "Processing Timestamp"]);
    }
    
    // Add test entries - 50 entries at once
    const testRows = [];
    for (let i = 0; i < Math.min(mnemonics.length, 50); i++) {
        testRows.push([new Date(), mnemonics[i], "No", ""]);
    }
    
    if (testRows.length > 0) {
        queueSheet.getRange(
            queueSheet.getLastRow() + 1, 
            1, 
            testRows.length, 
            4
        ).setValues(testRows);
        
        console.log(`✅ Added ${testRows.length} test entries to queue`);
    }
}

function onOpen() {
    const ui = SpreadsheetApp.getUi();
    ui.createMenu('Quiz Admin')
        .addItem('Process Pending Responses', 'processQueue')
        .addItem('Grade Responses', 'gradeResponses')
        .addItem('Sync Responses', 'syncResponses')
        .addItem('Update Processed Responses', 'updateProcessedResponses')
        .addItem('Delete Synced Data', 'deleteSyncData')
        .addItem('Reset Scores', 'resetAllScores')
        .addItem('Update Leaderboard', 'updateLeaderboard')
        .addSeparator()
        .addItem('Clear Audit Log', 'clearAuditLog')
        .addItem('Archive Old Audit Data', 'archiveOldData')
        .addItem('Add Test Data (10 Entries)', 'addTestData')
        .addSeparator()
        .addItem('Setup Automatic Processing', 'setupTriggers')
        .addItem('Update Audit Log Formatting', 'updateAuditLogFormatting')
        .addItem('Add Manual Points', 'showManualPointsDialog')
        .addItem('Process Manual Form Grades', 'handleFormGradeOverride')
        .addToUi();
}

/**
 * Update the Processed Responses sheet
 */
function updateProcessedResponses() {
    console.log("🔄 Updating Processed Responses sheet...");
    
    const sheet = SpreadsheetApp.getActiveSpreadsheet();
    const rawResponsesSheet = sheet.getSheetByName("Form Responses (Raw)");
    const processedSheet = sheet.getSheetByName("Processed Responses") || 
                          sheet.insertSheet("Processed Responses");
    
    if (!rawResponsesSheet) {
        console.error("❌ Form Responses (Raw) sheet not found");
        return;
    }
    
    // Clear processed sheet except header
    if (processedSheet.getLastRow() > 1) {
        processedSheet.getRange(2, 1, processedSheet.getLastRow() - 1, processedSheet.getLastColumn()).clear();
    }
    
    // Setup headers if needed
    if (processedSheet.getLastRow() === 0) {
        processedSheet.appendRow(["Timestamp", "Mnemonic", "Processed", "Processing Timestamp"]);
    }
    
    // Get all graded responses
    const rawData = rawResponsesSheet.getDataRange().getValues();
    const processedResponses = [];
    
    for (let i = 1; i < rawData.length; i++) {
        if (rawData[i][4] === "Yes") { // If graded
            processedResponses.push([
                rawData[i][0], // Timestamp
                rawData[i][1], // Mnemonic
                "Yes",         // Processed
                new Date()     // Processing Timestamp
            ]);
        }
    }
    
    // Batch append to processed sheet
    if (processedResponses.length > 0) {
        processedSheet.getRange(2, 1, processedResponses.length, 4).setValues(processedResponses);
        console.log(`✅ Updated ${processedResponses.length} processed responses`);
    } else {
        console.log("ℹ️ No processed responses to update");
    }
}
