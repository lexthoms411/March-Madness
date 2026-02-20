/**
 * Main grading function with optimizations, smart comma handling, and partial correctness
 */
function gradeResponses() {
    // Use lock service to prevent concurrent execution
    const lock = LockService.getScriptLock();
    try {
        if (!lock.tryLock(10000)) { // 10 seconds timeout
            console.log("Could not obtain lock for grading. Another process is running.");
            return;
        }
        
        console.info("📌 Starting grading process...");
        const startTime = new Date().getTime();
        
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
        
        // Keep TeamID as a dedicated trailing column in Audit Log.
        ensureAuditLogTeamIdColumn_(auditLogSheet);

        // Get already processed responses with lightweight recent-window caching
        const processedResponses = getProcessedResponsesWithCache(auditLogSheet);

        // Sync new responses
        syncResponses();

        // Get question data with caching
        const questionMap = getQuestionMapWithCache(questionBankSheet);
        const answerMapping = getAnswerMappingWithCache(questionMap);
        
        // NEW: Get options map for smart comma handling
        const optionsMap = getOptionsMapWithCache(questionBankSheet);
        
        // Get valid mnemonics with caching
        const validMnemonics = getValidMnemonicsWithCache(scoresSheet);

        // Get only ungraded responses for efficiency
        const ungradedResponses = getUngradedResponses(responsesSheet, validMnemonics);
        
        if (ungradedResponses.length === 0) {
            console.info("✅ No ungraded responses to process");
            return;
        }
        
        console.info(`🔍 Processing ${ungradedResponses.length} ungraded responses`);

        // PERFORMANCE IMPROVEMENT: Build user data map once to avoid repeated scans
        const userDataMap = buildUserDataMap(scoresSheet);

        let auditLogEntries = [];
        const MAX_EXECUTION_TIME = 250000; // 250 seconds (under 300s limit)

        // Batch row status updates for Form Responses (Raw): key = data row index (0-based)
        const rawRowStatus = {};

        // Process responses
        for (let i = 0; i < ungradedResponses.length; i++) {
            // Check if we're approaching execution time limit
            if (new Date().getTime() - startTime > MAX_EXECUTION_TIME) {
                console.warn("⚠️ Approaching execution time limit, saving progress");
                
                // Save audit entries processed so far
                if (auditLogEntries.length > 0) {
                    appendToAuditLog(auditLogSheet, auditLogEntries);
                    auditLogEntries = [];
                }

                // Persist partial progress before continuation.
                flushScoresFromUserDataMap_(scoresSheet, userDataMap);
                applyRawResponseStatusUpdates_(responsesSheet, rawRowStatus);
                
                // Schedule continuation
                scheduleContinueGrading_(1000);
                    
                return;
            }
            
            const [rowIndex, row] = ungradedResponses[i];
            const timestamp = row[0];
            const mnemonic = row[1]?.toLowerCase();
            const answerData = parseAnswer(row[2]);
            
            if (!mnemonic || !answerData) continue;

                // Get user data from map instead of repeated sheet lookups
                const userData = userDataMap.get(mnemonic);
                if (!userData) {
                    console.warn(`User ${mnemonic} not found in scores sheet`);
                    continue;
                }
                const teamId = userData.teamId || "";

            for (const [qID, userAnswer] of Object.entries(answerData)) {
                const responseKey = `${timestamp}_${mnemonic}_${qID}`.toLowerCase();

                if (processedResponses.has(responseKey)) {
                    continue;
                }

                const questionData = questionMap[qID];
                if (!questionData) {
                    console.warn(`Question ${qID} not found in bank`);
                    logError('Grade Response', `Question ${qID} not found in bank`);
                    continue;
                }

                // Get current score from user data map instead of scanning sheet
                const currentScore = userData.score;

                // Get actual role from user data map instead of scanning sheet
                const actualRole = (userData.role || "").trim().toLowerCase();
                const requiredRole = (questionData.targetRole || "").trim().toLowerCase();

                // Check both role mismatch & duplicate attempt at the same time
                const correctRole = actualRole === requiredRole || !requiredRole;
                
                // Check attempts from user data map
                const isDuplicate = hasAttemptInUserData(userData, qID);

                // UPDATED: Get options for this question for smart comma handling
                const questionOptions = optionsMap[qID] || [];

                // UPDATED: Variables to track correctness and partial credit
                const isMultipleSelect = questionData.type && questionData.type.toLowerCase() === "multiple select";
                let isCorrect = false;
                let isPartiallyCorrect = false;
                let earnedPoints = 0;

                // Grade the answer
                isCorrect = isAnswerCorrect(
                    userAnswer, 
                    questionData.correctAnswer, 
                    questionData.type,
                    questionOptions
                );

                // Anti-cheat rule: first submission consumes the attempt, even on role mismatch.
                // Points are awarded only when role is correct on that first attempt.
                if (!isDuplicate) {
                    if (correctRole) {
                        if (isMultipleSelect) {
                            // Calculate partial credit for multiple select
                            earnedPoints = calculatePartialCredit(
                                userAnswer,
                                questionData.correctAnswer,
                                questionData.type,
                                questionData.points,
                                questionOptions
                            );
                            
                            // Check if this is partially correct (some points but not full)
                            if (earnedPoints > 0 && earnedPoints < questionData.points) {
                                isPartiallyCorrect = true;
                            }
                        } else {
                            earnedPoints = isCorrect ? questionData.points : 0;
                        }
                    } else {
                        earnedPoints = 0;
                    }

                    // Record attempt regardless of role correctness; this blocks retries.
                    applyScoreUpdateInMemory_(userData, qID, earnedPoints, timestamp);
                }

                // Determine correctness display status for audit log
                let correctnessStatus;
                if (isPartiallyCorrect) {
                    correctnessStatus = "Partially Correct";
                } else if (isCorrect) {
                    correctnessStatus = "Correct";
                } else {
                    correctnessStatus = "Incorrect";
                }

                // Update raw responses with correct/incorrect status
                // For the response sheet, we'll still use binary Correct/Incorrect
                rawRowStatus[rowIndex] = isCorrect || isPartiallyCorrect ? "Correct" : "Incorrect";

                // Get shortened answers for display
                let formattedUserAnswer = getAnswerLetters(userAnswer, qID, answerMapping);
                let formattedCorrectAnswer = getAnswerLetters(questionData.correctAnswer, qID, answerMapping);
                
                // Short display version for audit log
                const answerDisplay = `Answer: ${shortenAnswerText(formattedUserAnswer)} (Expected: ${shortenAnswerText(formattedCorrectAnswer)})`;

                // Log to audit with new column structure and updated correctness status
                auditLogEntries.push([
                    timestamp,                    // Timestamp
                    mnemonic,                    // Mnemonic
                    qID,                         // Question ID
                    answerDisplay,               // Shortened answer
                    correctnessStatus,           // UPDATED: Now shows "Partially Correct" when applicable
                    isDuplicate ? "Yes" : "No",  // Duplicate Attempt?
                    correctRole ? "Yes" : "No",  // Correct Role?
                    currentScore,                // Previous Points
                    earnedPoints,                // Earned Points
                    currentScore + earnedPoints, // Total Points
                    isDuplicate ? "Duplicate" :
                        !correctRole ? "Role Mismatch" :
                        "Processed",             // Status
                    teamId                       // TeamID
                ]);
                
                // Process in smaller batches to avoid memory issues
                if (auditLogEntries.length >= 50) {
                    appendToAuditLog(auditLogSheet, auditLogEntries);
                    auditLogEntries = [];
                }
            }

            // Mark as graded in batched write at end.
            if (!rawRowStatus[rowIndex]) rawRowStatus[rowIndex] = "Incorrect";
        }

        // Flush score/attempt updates in batch.
        flushScoresFromUserDataMap_(scoresSheet, userDataMap);

        // Flush raw response status (graded + correctness) in batch.
        applyRawResponseStatusUpdates_(responsesSheet, rawRowStatus);

        // Add any remaining audit entries
        if (auditLogEntries.length > 0) {
            appendToAuditLog(auditLogSheet, auditLogEntries);
        }

        // Update audit log formatting with new conditional formatting for "Partially Correct"
        updateAuditLogFormattingWithPartialCorrect();
        
        // Update leaderboards
        updateLeaderboard();
        
        // Update Processed Responses periodically to avoid repeated full-sheet scans.
        if (shouldUpdateProcessedResponses_()) {
            updateProcessedResponses();
        }

        console.info("🎉 Grading complete!");
    } catch (e) {
        console.error("❌ Error in grading process:", e.message, e.stack);
        logError('Grade Responses', `Error in grading process: ${e.message}\n${e.stack}`);
    } finally {
        if (lock.hasLock()) {
            lock.releaseLock();
        }
    }
}

/**
 * Update audit log formatting, including special formatting for "Partially Correct"
 */
function updateAuditLogFormattingWithPartialCorrect() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const auditSheet = ss.getSheetByName(SHEETS.AUDIT_LOG);
    
    if (!auditSheet) return;
    
    // Only update formatting periodically to avoid excess API calls
    const props = PropertiesService.getScriptProperties();
    const lastFormatTime = props.getProperty('lastAuditFormatTime');
    const now = new Date().getTime();
    
    if (lastFormatTime && now - parseInt(lastFormatTime) < 300000) { // 5 minutes
        return; // Skip if formatted recently
    }
    
    // Clear existing rules
    auditSheet.clearConditionalFormatRules();
    
    // Get last row
    const lastRow = Math.max(auditSheet.getLastRow(), 1);
    
    // Create rules array
    const rules = [];
    
    // Status column (column K or 11)
    const statusColumn = 11;
    const statusRange = auditSheet.getRange(2, statusColumn, lastRow - 1, 1);
    
    // Correctness column (column E or 5)
    const correctnessColumn = 5;
    const correctnessRange = auditSheet.getRange(2, correctnessColumn, lastRow - 1, 1);
    
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
    
    // NEW: Format for correctness column
    // Correct - green
    rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo("Correct")
        .setBackground("#D9EAD3")
        .setFontColor("#38761d")
        .setRanges([correctnessRange])
        .build());
    
    // Partially Correct - light green/yellow
    rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo("Partially Correct")
        .setBackground("#E7F1D7") // lighter green
        .setFontColor("#7F6000")  // dark yellow/gold
        .setRanges([correctnessRange])
        .build());
    
    // Incorrect - light red
    rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo("Incorrect")
        .setBackground("#F4CCCC")
        .setFontColor("#990000")
        .setRanges([correctnessRange])
        .build());
    
    // Apply all rules
    auditSheet.setConditionalFormatRules(rules);
    
    // Store last format time
    props.setProperty('lastAuditFormatTime', now.toString());
}

/**
 * Helper function to build a map of user data for faster lookups
 */
function buildUserDataMap(scoresSheet) {
    const data = scoresSheet.getDataRange().getValues();
    const userMap = new Map();
    const headers = (data[0] || []).map(h => String(h || '').trim().toLowerCase());
    const teamIdIndex = getScoresTeamIdColumnIndex_(headers);
    
    for (let i = 1; i < data.length; i++) {
        if (data[i][0]) { // If mnemonic exists
            try {
                // Parse attempts JSON if it exists
                let attempts = {};
                if (data[i][5]) {
                    attempts = JSON.parse(data[i][5] || "{}");
                }
                
                userMap.set(data[i][0].toLowerCase(), {
                    score: Number(data[i][3]) || 0,  // Total score
                    role: data[i][2] || "",         // User role
                    teamId: teamIdIndex >= 0 ? String(data[i][teamIdIndex] || '').trim() : '',
                    rowIndex: i + 1,                // For updates later
                    attempts: attempts,             // Parsed attempts
                    dirty: false                    // Set true when score/attempts are changed
                });
            } catch (e) {
                console.error(`Error parsing attempts for ${data[i][0]}:`, e);
            }
        }
    }
    
    return userMap;
}

/**
 * Check if user has attempted question before using userData
 */
function hasAttemptInUserData(userData, questionID) {
    if (!userData.attempts) return false;
    return questionID in userData.attempts;
}

function applyScoreUpdateInMemory_(userData, questionID, points, timestamp) {
    if (!userData) return false;
    if (!userData.attempts) userData.attempts = {};
    if (userData.attempts[questionID]) return false;
    userData.score = (Number(userData.score) || 0) + (Number(points) || 0);
    userData.attempts[questionID] = { timestamp, points: Number(points) || 0 };
    userData.dirty = true;
    return true;
}

function flushScoresFromUserDataMap_(scoresSheet, userDataMap) {
    const lastRow = scoresSheet.getLastRow();
    if (lastRow <= 1) return;

    const rowCount = lastRow - 1;
    const scoreValues = scoresSheet.getRange(2, 4, rowCount, 1).getValues();
    const attemptsValues = scoresSheet.getRange(2, 6, rowCount, 1).getValues();
    let hasChanges = false;

    userDataMap.forEach((userData) => {
        if (!userData || !userData.dirty || !userData.rowIndex) return;
        const idx = userData.rowIndex - 2;
        if (idx < 0 || idx >= rowCount) return;
        scoreValues[idx][0] = Number(userData.score) || 0;
        attemptsValues[idx][0] = JSON.stringify(userData.attempts || {});
        hasChanges = true;
        userData.dirty = false;
    });

    if (!hasChanges) return;
    scoresSheet.getRange(2, 4, rowCount, 1).setValues(scoreValues);
    scoresSheet.getRange(2, 6, rowCount, 1).setValues(attemptsValues);
}

function applyRawResponseStatusUpdates_(responsesSheet, rawRowStatus) {
    const rowIndexes = Object.keys(rawRowStatus || {})
        .map(v => Number(v))
        .filter(v => Number.isFinite(v) && v >= 1)
        .sort((a, b) => a - b);
    if (!rowIndexes.length) return;

    const minDataIndex = rowIndexes[0];
    const maxDataIndex = rowIndexes[rowIndexes.length - 1];
    const startRow = minDataIndex + 1;
    const rowCount = maxDataIndex - minDataIndex + 1;

    const range = responsesSheet.getRange(startRow, 5, rowCount, 2); // Col E:F
    const values = range.getValues();

    rowIndexes.forEach((dataIdx) => {
        const offset = dataIdx - minDataIndex;
        values[offset][0] = "Yes"; // Graded
        values[offset][1] = rawRowStatus[dataIdx] || "Incorrect"; // Correct/Incorrect
    });

    range.setValues(values);
}

function getScoresTeamIdColumnIndex_(headers) {
    if (!headers || !headers.length) return -1;
    const aliases = new Set(['teamid', 'team id', 'team_id']);
    return headers.findIndex(h => aliases.has(String(h || '').toLowerCase().trim()));
}

function getUserTeamId(scoresSheet, mnemonic) {
    const data = scoresSheet.getDataRange().getValues();
    if (!data.length) return '';
    const headers = (data[0] || []).map(h => String(h || '').trim().toLowerCase());
    const teamIdIndex = getScoresTeamIdColumnIndex_(headers);
    if (teamIdIndex < 0) return '';
    const key = String(mnemonic || '').toLowerCase().trim();

    for (let i = 1; i < data.length; i++) {
        const rowMnemonic = String(data[i][0] || '').toLowerCase().trim();
        if (rowMnemonic === key) return String(data[i][teamIdIndex] || '').trim();
    }
    return '';
}

function ensureAuditLogTeamIdColumn_(auditLogSheet) {
    if (!auditLogSheet) return;
    const lastCol = Math.max(auditLogSheet.getLastColumn(), 1);
    const headers = auditLogSheet.getRange(1, 1, 1, lastCol).getValues()[0]
        .map(h => String(h || '').toLowerCase().trim());
    const hasTeamId = headers.some(h => h === 'teamid' || h === 'team id' || h === 'team_id');
    if (hasTeamId) return;

    const teamIdCol = 12; // Keep existing 11-col schema and append TeamID.
    if (lastCol < teamIdCol) {
        auditLogSheet.insertColumnsAfter(lastCol, teamIdCol - lastCol);
    }
    auditLogSheet.getRange(1, teamIdCol).setValue('TeamID');
}

/**
 * Continue grading from where we left off
 */
function continueGrading() {
    // Delete all triggers for this function to prevent duplicates
    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
        if (triggers[i].getHandlerFunction() === 'continueGrading') {
            ScriptApp.deleteTrigger(triggers[i]);
        }
    }
    
    // Continue grading
    gradeResponses();
}

function scheduleContinueGrading_(delayMs) {
    const triggers = ScriptApp.getProjectTriggers();
    const existing = triggers.filter(t => t.getHandlerFunction() === 'continueGrading');
    if (existing.length >= 1) return;
    ScriptApp.newTrigger('continueGrading')
        .timeBased()
        .after(Math.max(1000, Number(delayMs) || 1000))
        .create();
}

/**
 * Get ungraded responses efficiently
 */
function getUngradedResponses(responsesSheet, validMnemonics) {
    const data = responsesSheet.getDataRange().getValues();
    const result = [];
    
    // Create a Set for faster lookups
    const validMnemonicsSet = new Set(validMnemonics);
    
    for (let i = 1; i < data.length; i++) {
        const mnemonic = data[i][1]?.toLowerCase();
        if (data[i][4] !== "Yes" && mnemonic && validMnemonicsSet.has(mnemonic)) {
            result.push([i, data[i]]);
        }
    }
    
    return result;
}

/**
 * Append to audit log with retry
 */
function appendToAuditLog(auditLogSheet, entries) {
    if (!entries || entries.length === 0) return;
    
    return retryOperation(() => {
        const lastRow = auditLogSheet.getLastRow();
        auditLogSheet.getRange(
            lastRow + 1, 
            1, 
            entries.length, 
            entries[0].length
        ).setValues(entries);
    });
}

/**
 * Get processed responses with caching
 */
function getProcessedResponsesWithCache(auditLogSheet) {
    const cache = CacheService.getScriptCache();
    const lastRow = auditLogSheet.getLastRow();
    if (lastRow <= 1) return new Set();

    // Only scan a recent window to avoid full-sheet scans as audit log grows.
    const lookbackRows = 6000;
    const startRow = Math.max(2, lastRow - lookbackRows + 1);
    const cacheKey = `processedResponses_recent_${lastRow}_${startRow}`;
    
    // Try to get from cache first
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
        try {
            return new Set(JSON.parse(cachedData));
        } catch (e) {
            console.warn("⚠️ Cache parse error, rebuilding processed responses");
        }
    }
    
    // If not in cache or parse error, rebuild from recent audit rows only.
    const processedResponses = new Set();
    const auditData = auditLogSheet.getRange(startRow, 1, lastRow - startRow + 1, 3).getValues();

    for (let i = 0; i < auditData.length; i++) {
        const key = `${auditData[i][0]}_${auditData[i][1]}_${auditData[i][2]}`.toLowerCase();
        processedResponses.add(key);
    }
    
    // Store in cache for 6 hours (needs to be serialized as array)
    // Since there are size limitations, we'll only cache if it's not too large
    if (processedResponses.size < 15000) {
        cache.put(cacheKey, JSON.stringify(Array.from(processedResponses)), 600);
    }

    return processedResponses;
}

/**
 * Get question map with caching
 */
function getQuestionMapWithCache(questionBankSheet) {
    const cache = CacheService.getScriptCache();
    const cacheKey = 'questionMap';

    // Try cache first.
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
        try {
            return JSON.parse(cachedData);
        } catch (e) {
            console.warn("⚠️ Cache parse error, rebuilding question map");
        }
    }
    
    // Build the question map fresh
    const questionBankData = questionBankSheet.getDataRange().getValues();
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
    
    try {
        cache.put(cacheKey, JSON.stringify(questionMap), 21600);
    } catch (e) {
        console.warn("⚠️ Cache size limit exceeded, question map not cached");
    }
    return questionMap;
}

/**
 * Get answer mapping with caching
 */
/**
 * is function getAnswerMappingWithCache(questionMap) {
    const cache = CacheService.getScriptCache();
    const cacheKey = 'answerMapping';
    
    // Try to get from cache first
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
        try {
            return JSON.parse(cachedData);
        } catch (e) {
            console.warn("⚠️ Cache parse error, rebuilding answer mapping");
        }
    }
    
    // If not in cache or parse error, rebuild
    const answerMapping = {};
    
    // Need to get question bank data for options
    const sheet = SpreadsheetApp.getActiveSpreadsheet();
    const questionBankSheet = sheet.getSheetByName(SHEETS.QUESTION_BANK);
    const questionBankData = questionBankSheet.getDataRange().getValues();
    
    for (let i = 1; i < questionBankData.length; i++) {
        const row = questionBankData[i];
        const qID = row[1];
        const type = row[10];
        
        if (qID && type && type.toLowerCase().includes("multiple")) {
            const options = [row[3], row[4], row[5], row[6], row[7], row[8]].filter(Boolean);
            const letterMap = {};
            
            options.forEach((text, index) => {
                if (text) {
                    const letter = String.fromCharCode(65 + index); // A, B, C, etc.
                    letterMap[text.toLowerCase().trim()] = letter;
                }
            });
            
            if (Object.keys(letterMap).length > 0) {
                answerMapping[qID] = letterMap;
            }
        }
    }
    
    // Cache for 6 hours
    cache.put(cacheKey, JSON.stringify(answerMapping), 21600);
    
    return answerMapping;
}
*/

/**
 * Get valid mnemonics with caching
 */
function getValidMnemonicsWithCache(scoresSheet) {
    const cache = CacheService.getScriptCache();
    const cacheKey = 'validMnemonics';
    
    // Try to get from cache first
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
        try {
            return JSON.parse(cachedData);
        } catch (e) {
            console.warn("⚠️ Cache parse error, rebuilding valid mnemonics");
        }
    }
    
    // If not in cache or parse error, rebuild
    const validMnemonics = scoresSheet.getRange('A2:A')
        .getValues()
        .map(row => row[0]?.toLowerCase())
        .filter(Boolean);
    
    // Cache for 6 hours
    cache.put(cacheKey, JSON.stringify(validMnemonics), 21600);
    
    return validMnemonics;
}

/**
 * Sync form responses to raw responses sheet with improved error handling
 */
function syncResponses() {
    // Use lock service to prevent concurrent execution
    const lock = LockService.getScriptLock();
    try {
        if (!lock.tryLock(10000)) { // 10 seconds timeout
            console.log("Could not obtain lock for syncing. Another process is running.");
            return [];
        }
        
        console.info("🔄 Starting response sync...");

        const sheet = SpreadsheetApp.getActiveSpreadsheet();
        const formResponsesSheet = sheet.getSheetByName(SHEETS.FORM_RESPONSES);
        const rawResponsesSheet = sheet.getSheetByName("Form Responses (Raw)");

        if (!formResponsesSheet || !rawResponsesSheet) {
            console.error("❌ Required sheets not found");
            logError('Sync Responses', 'Required sheets not found');
            return [];
        }

        // Get last synced form row for incremental sync (much faster than full scans).
        const props = PropertiesService.getScriptProperties();
        const lastSyncedRowKey = 'lastSyncedFormRow';
        const formLastRow = formResponsesSheet.getLastRow();
        if (formLastRow <= 1) {
            console.info("ℹ️ No form responses to sync.");
            return [];
        }

        let lastSyncedFormRow = Number(props.getProperty(lastSyncedRowKey) || 1);
        if (!Number.isFinite(lastSyncedFormRow) || lastSyncedFormRow < 1) lastSyncedFormRow = 1;
        const startRow = Math.max(2, lastSyncedFormRow + 1);
        if (startRow > formLastRow) {
            console.info("ℹ️ No new form rows to sync.");
            return [];
        }

        // Get form data headers
        const headers = formResponsesSheet.getRange(1, 1, 1, formResponsesSheet.getLastColumn()).getValues()[0];
        const questionColumns = [];
        for (let col = 4; col < headers.length; col++) {
            if (!headers[col]) continue;
            const qid = extractQuestionID(headers[col]);
            if (qid) questionColumns.push([col, qid]);
        }

        // Get only new form rows
        const formData = formResponsesSheet
            .getRange(startRow, 1, formLastRow - startRow + 1, formResponsesSheet.getLastColumn())
            .getValues();
        const newResponses = [];
        let invalidMnemonics = 0;

        // Process each new form response
        for (let i = 0; i < formData.length; i++) {
            const row = formData[i];
            const timestamp = row[0];

            // Look for mnemonic in the correct column (column C, index 2)
            const mnemonic = row[2]; 
            
            // Better validation of mnemonic
            if (!mnemonic || typeof mnemonic !== 'string' || mnemonic.trim() === '') {
                console.warn(`⚠️ Invalid mnemonic at row ${i + 1}`);
                invalidMnemonics++;
                continue;
            }

            const mnemonicLower = mnemonic.toString().toLowerCase().trim();
            if (mnemonicLower === '') {
                console.warn(`⚠️ Empty mnemonic after trimming at row ${i + 1}`);
                invalidMnemonics++;
                continue;
            }
            
            // Get role from column D (index 3)
            const role = row[3] || '';

            // Process answers - collect question answers from remaining columns
            let answerDataObj = {};
            for (let c = 0; c < questionColumns.length; c++) {
                const col = questionColumns[c][0];
                const questionID = questionColumns[c][1];
                const answer = row[col];
                if (answer && answer.toString().trim() !== "") {
                    answerDataObj[questionID] = answer.toString().trim();
                }
            }

            // Only add if we have at least one answer
            if (Object.keys(answerDataObj).length > 0) {
                const answerJson = JSON.stringify(answerDataObj);
                const formattedRow = [timestamp, mnemonicLower, answerJson, role, "No", ""];
                newResponses.push(formattedRow);
            }
        }

        // Add new responses in batches
        if (newResponses.length > 0) {
            const BATCH_SIZE = 200;
            for (let i = 0; i < newResponses.length; i += BATCH_SIZE) {
                const batch = newResponses.slice(i, Math.min(i + BATCH_SIZE, newResponses.length));
                rawResponsesSheet.getRange(
                    rawResponsesSheet.getLastRow() + 1, 
                    1, 
                    batch.length, 
                    batch[0].length
                ).setValues(batch);
            }
        }

        // Save progress regardless of whether any valid rows were added.
        props.setProperty(lastSyncedRowKey, String(formLastRow));
        if (newResponses.length) {
            const lastTs = newResponses[newResponses.length - 1][0];
            if (lastTs) props.setProperty('lastSyncTimestamp', new Date(lastTs).toISOString());
        }

        console.info(`✅ Synced ${newResponses.length} new responses from rows ${startRow}-${formLastRow}. Invalid mnemonics: ${invalidMnemonics}.`);
        return newResponses;
    } catch (e) {
        console.error("❌ Error in syncResponses:", e.message, e.stack);
        logError('Sync Responses', `Error syncing: ${e.message}\n${e.stack}`);
        return [];
    } finally {
        if (lock.hasLock()) {
            lock.releaseLock();
        }
    }
}

/**
 * Update scores in scores sheet with retry logic
 */
function updateScores(scoresSheet, mnemonic, questionID, points, timestamp) {
    return retryOperation(() => {
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
    });
}

/**
 * Optimized Reset all scores to zero with retry logic
 */
function resetAllScores() {
    const lock = LockService.getScriptLock();
    try {
        if (!lock.tryLock(10000)) {
            console.log("Could not obtain lock for resetting scores. Another process is running.");
            return;
        }
        
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

        retryOperation(() => {
            scoresSheet.getRange(2, 4, numRows, 1).setValues(zeroArray); // Reset scores
            scoresSheet.getRange(2, 6, numRows, 1).setValues(emptyJsonArray); // Reset attempts
        });

        // Update leaderboards
        updateLeaderboard();

        // Clear caches
        clearCaches();

        console.info(`✅ Successfully reset scores for ${numRows} participants.`);
    } catch (e) {
        console.error("❌ Error in resetAllScores:", e.message, e.stack);
        logError('Reset Scores', `Error resetting scores: ${e.message}\n${e.stack}`);
    } finally {
        if (lock.hasLock()) {
            lock.releaseLock();
        }
    }
}

/**
 * Clear script caches
 */
function clearCaches() {
    const cache = CacheService.getScriptCache();
    const keysToDelete = [
        'processedResponses',
        'questionMap',
        'answerMapping',
        'validMnemonics'
    ];
    
    for (const key of keysToDelete) {
        cache.remove(key);
    }
    
    console.log("🧹 Cleared all caches");
}

/**
 * Optimized Delete all synced response data with proper locking
 */
function deleteSyncData() {
    const lock = LockService.getScriptLock();
    try {
        if (!lock.tryLock(10000)) {
            console.log("Could not obtain lock for deleting sync data. Another process is running.");
            return;
        }
        
        const sheet = SpreadsheetApp.getActiveSpreadsheet();
        const rawResponsesSheet = sheet.getSheetByName("Form Responses (Raw)");

        if (!rawResponsesSheet) {
            logError('Delete Sync Data', 'Raw responses sheet not found');
            return;
        }

        const lastRow = rawResponsesSheet.getLastRow();
        const lastColumn = rawResponsesSheet.getLastColumn();

        if (lastRow > 1 && lastColumn > 0) {
            // Clear all data except header with retry
            retryOperation(() => {
                rawResponsesSheet.getRange(2, 1, lastRow - 1, lastColumn).clear();
            });
            
            // Also clear the last sync timestamp to force full resync
            PropertiesService.getScriptProperties().deleteProperty('lastSyncTimestamp');
            
            // Clear caches
            clearCaches();
            
            console.info(`✅ Successfully deleted ${lastRow - 1} synced responses.`);
        } else {
            console.info("ℹ️ No synced responses to delete.");
        }
    } catch (e) {
        console.error("❌ Error in deleteSyncData:", e.message, e.stack);
        logError('Delete Sync Data', `Error deleting sync data: ${e.message}\n${e.stack}`);
    } finally {
        if (lock.hasLock()) {
            lock.releaseLock();
        }
    }
}

/**
 * Clear audit log for testing purposes with proper locking
 */
function clearAuditLog() {
    const lock = LockService.getScriptLock();
    try {
        if (!lock.tryLock(10000)) {
            console.log("Could not obtain lock for clearing audit log. Another process is running.");
            return;
        }
        
        const sheet = SpreadsheetApp.getActiveSpreadsheet();
        const auditLogSheet = sheet.getSheetByName(SHEETS.AUDIT_LOG);

        if (!auditLogSheet) {
            console.error("❌ Audit log sheet not found");
            return;
        }

        const lastRow = auditLogSheet.getLastRow();
        if (lastRow > 1) {
            // Clear all data except header with retry
            retryOperation(() => {
                auditLogSheet.getRange(2, 1, lastRow - 1, auditLogSheet.getLastColumn()).clear();
            });
            
            // Clear cache
            CacheService.getScriptCache().remove('processedResponses');
            
            console.info(`✅ Successfully cleared ${lastRow - 1} audit log entries.`);
        } else {
            console.info("ℹ️ No audit log entries to clear.");
        }
    } catch (e) {
        console.error("❌ Error in clearAuditLog:", e.message, e.stack);
        logError('Clear Audit Log', `Error clearing audit log: ${e.message}\n${e.stack}`);
    } finally {
        if (lock.hasLock()) {
            lock.releaseLock();
        }
    }
}

/**
 * Setup all required triggers for the competition
 */
function setupTriggers() {
    // Only clear triggers managed by this setup routine.
    const managedHandlers = new Set([
      'processQueue',
      'onFormSubmit',
      'archiveOldData',
      'updateDailyQuestions'
    ]);
    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
      if (managedHandlers.has(triggers[i].getHandlerFunction())) {
        ScriptApp.deleteTrigger(triggers[i]);
      }
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
    
    // Create hourly trigger to archive old data
    ScriptApp.newTrigger('archiveOldData')
        .timeBased()
        .everyHours(12)
        .create();

    ScriptApp.newTrigger('updateDailyQuestions')
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
        
        // Add to processing queue with retry
        retryOperation(() => {
            const sheet = SpreadsheetApp.getActiveSpreadsheet();
            const queueSheet = sheet.getSheetByName("Processing Queue") || 
                            sheet.insertSheet("Processing Queue");
            
            // If queue sheet is new, add headers
            if (queueSheet.getLastRow() === 0) {
                queueSheet.appendRow(["Timestamp", "Mnemonic", "Processed", "Processing Timestamp"]);
            }
            
            // Add to queue
            queueSheet.appendRow([timestamp, mnemonic, "No", ""]);
        });
        
        console.log(`✅ Added submission from ${mnemonic} to processing queue`);
    } catch (e) {
        console.error("❌ Error in form submission handler:", e.message, e.stack);
        logError('Form Submit', `Error handling submission: ${e.message}`);
    }
}

/**
 * Process the queue of submissions (runs every 5 minutes)
 */
/**function processQueue() {
    // Use lock service to prevent concurrent execution
    const lock = LockService.getScriptLock();
    try {
        if (!lock.tryLock(10000)) { // 10 seconds timeout
            console.log("Could not obtain lock for processing queue. Another process is running.");
            return;
        }
        
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
        
        // Track execution time
        const startTime = new Date().getTime();
        const MAX_EXECUTION_TIME = 250000; // 250 seconds (under 300s limit)
        
        // Process in batches to avoid timeout
        const BATCH_SIZE = 10;
        const batchesToProcess = Math.min(BATCH_SIZE, pendingCount);
        const batchIndices = pendingIndices.slice(0, batchesToProcess);
        
        console.log(`Processing first ${batchesToProcess} of ${pendingCount} pending items`);
        
        // First sync all responses to make sure we have the latest data
        syncResponses();
        
        // Process only a batch of submissions
        processBatchFromQueue(batchIndices, queueSheet, queueData);
        
        // Check if we've used too much time
        const timeElapsed = new Date().getTime() - startTime;
        
        // If more remain and we have time, set up a trigger to continue processing
        if (pendingCount > BATCH_SIZE) {
            if (timeElapsed > MAX_EXECUTION_TIME) {
                console.log(`⏱️ Time limit approaching. Will process remaining ${pendingCount - BATCH_SIZE} items in next cycle`);
            } else {
                console.log(`${pendingCount - BATCH_SIZE} items remain in queue for next processing cycle`);
                
                // Optionally trigger another immediate run for large backlogs
                if (pendingCount > BATCH_SIZE * 3) {
                    ScriptApp.newTrigger('processQueue')
                        .timeBased()
                        .after(60000) // 1 minute
                        .create();
                    console.log("⏱️ Scheduled additional queue processing in 1 minute due to large backlog");
                }
            }
        }
        
        // Update processed responses sheet
        updateProcessedResponses();
    } catch (e) {
        console.error("❌ Error in processQueue:", e.message, e.stack);
        logError('Process Queue', `Error processing queue: ${e.message}\n${e.stack}`);
    } finally {
        if (lock.hasLock()) {
            lock.releaseLock();
        }
    }
}
*/

function processQueue() {
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(10000)) {
      console.log("Could not obtain lock for processing queue. Another process is running.");
      return;
    }
    
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
    let totalPendingInQueue = 0;
    const pendingIndices = [];
    const BATCH_SIZE = 30;
    
    for (let i = 1; i < queueData.length; i++) {
      const status = String(queueData[i][2] || "");
      const processingTs = queueData[i][3] ? new Date(queueData[i][3]).getTime() : 0;
      const staleProcessing = status === "Processing" && processingTs && (Date.now() - processingTs > 15 * 60 * 1000);
      if (status === "No" || status === "Error" || staleProcessing) {
        totalPendingInQueue++;
        // Process larger batches for throughput while staying under execution limits.
        if (pendingCount < BATCH_SIZE) {
          pendingCount++;
          pendingIndices.push(i);
        }
      }
    }
    
    if (pendingCount === 0) {
      console.log("ℹ️ No pending items in queue");
      return;
    }
    
    console.log(`🔄 Processing ${pendingCount} queued submissions...`);
    
    // First sync all responses to make sure we have the latest data
    // But skip if we already have processed a lot recently
    if (pendingCount > 0) {
      syncResponses();
    }
    
    // Process limited batch to avoid timeout
    const batchIndices = pendingIndices.slice(0, pendingCount);
    processBatchFromQueue(batchIndices, queueSheet, queueData);
    
    // Keep this expensive step throttled.
    if (shouldUpdateProcessedResponses_()) {
      updateProcessedResponses();
    }
    
    // If more remain, schedule another run (bounded to avoid trigger fan-out).
    if (totalPendingInQueue > pendingCount) {
      scheduleProcessQueueRun_(60000);
      console.log("⏱️ Scheduled additional queue processing in 1 minute.");
    }

    // Run expensive formatting once per queue batch, not per mnemonic.
    updateAuditLogFormattingWithPartialCorrect();
  } catch (e) {
    console.error("❌ Error in processQueue:", e.message, e.stack);
    logError('Process Queue', `Error processing queue: ${e.message}\n${e.stack}`);
  } finally {
    if (lock.hasLock()) {
      lock.releaseLock();
    }
  }
}

function scheduleProcessQueueRun_(delayMs) {
  const triggers = ScriptApp.getProjectTriggers();
  const processQueueTriggers = triggers.filter(t => t.getHandlerFunction() === 'processQueue');
  // Keep at most two triggers for processQueue (periodic + one accelerated run).
  if (processQueueTriggers.length >= 2) return;
  ScriptApp.newTrigger('processQueue')
    .timeBased()
    .after(Math.max(1000, Number(delayMs) || 60000))
    .create();
}

/**
 * Process a batch of submissions from the queue with retry
 */
function processBatchFromQueue(indices, queueSheet, queueData) {
    // Ensure indices is an array
    if (!Array.isArray(indices)) {
        console.error("❌ indices is not an array:", indices);
        return;
    }
    
    console.log("Processing batch with indices:", indices);

    // Mark these as being processed
    const now = new Date();
    const queueRowNumbers = indices.map(i => i + 1);

    if (queueRowNumbers.length > 0) {
        try {
            // Set initial status to Processing.
            for (let i = 0; i < queueRowNumbers.length; i++) {
                const rowNumber = queueRowNumbers[i];
                retryOperation(() => {
                    queueSheet.getRange(rowNumber, 3, 1, 2).setValues([["Processing", now]]);
                });
            }
            
            // Process these mnemonics
            for (let i = 0; i < indices.length; i++) {
                const index = indices[i];
                const queueRow = index + 1;
                // Check if queueData[index] exists and has a second element
                if (queueData[index] && queueData[index][1]) {
                    const mnemonic = queueData[index][1];
                    const result = gradeResponsesForMnemonic(mnemonic);
                    const status = result && result.ok ? "Yes" : "Error";
                    retryOperation(() => {
                        queueSheet.getRange(queueRow, 3, 1, 2).setValues([[status, new Date()]]);
                    });
                } else {
                    console.error(`❌ Invalid queue data at index ${index}`);
                    retryOperation(() => {
                        queueSheet.getRange(queueRow, 3, 1, 2).setValues([["Error", new Date()]]);
                    });
                }
            }
        } catch (e) {
            console.error("❌ Error in processBatchFromQueue:", e.message, e.stack);
            logError('Process Batch', `Error processing batch: ${e.message}\n${e.stack}`);
        }
    }
    
    console.log(`✅ Processed ${queueRowNumbers.length} queued submissions`);
}

/**
 * Grade responses for a specific mnemonic with smart comma handling
 */
function gradeResponsesForMnemonic(mnemonic) {
    // Check if mnemonic is valid
    if (!mnemonic) {
        console.error("❌ Invalid mnemonic provided to gradeResponsesForMnemonic");
        return { ok: false, message: "Invalid mnemonic." };
    }
    
    console.log(`Processing submissions for ${mnemonic}`);
    
    try {
        const sheet = SpreadsheetApp.getActiveSpreadsheet();
        const responsesSheet = sheet.getSheetByName("Form Responses (Raw)");
        const questionBankSheet = sheet.getSheetByName(SHEETS.QUESTION_BANK);
        const scoresSheet = sheet.getSheetByName(SHEETS.SCORES);
        const auditLogSheet = sheet.getSheetByName(SHEETS.AUDIT_LOG);
        
        if (!responsesSheet || !questionBankSheet || !scoresSheet || !auditLogSheet) {
            console.error("❌ Missing required sheets for grading");
            return { ok: false, message: "Missing required sheets for grading." };
        }
        
        ensureAuditLogTeamIdColumn_(auditLogSheet);
        const userDataMap = buildUserDataMap(scoresSheet);
        const userData = userDataMap.get(String(mnemonic).toLowerCase().trim());
        if (!userData) {
            return { ok: false, message: `User ${mnemonic} not found in Scores.` };
        }
        const teamId = userData.teamId || "";
        
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
            return { ok: true, message: `No ungraded responses found for ${mnemonic}.` };
        }
        
        console.log(`Found ${rowsToGrade.length} responses to grade for ${mnemonic}`);
        
        // Get processed responses
        const processedResponses = getProcessedResponsesWithCache(auditLogSheet);
        
        // Get question data
        const questionMap = getQuestionMapWithCache(questionBankSheet);
        const answerMapping = getAnswerMappingWithCache(questionMap);
        
        // NEW: Get options map for smart comma handling
        const optionsMap = getOptionsMapWithCache(questionBankSheet);
        
        let auditLogEntries = [];
        const rawRowStatus = {};
        
        // Process each ungraded response for this mnemonic
        for (const rowIndex of rowsToGrade) {
            const row = data[rowIndex];
            const timestamp = row[0];
            const answerData = parseAnswer(row[2]);
            
            if (!answerData) continue;
            
            for (const [qID, userAnswer] of Object.entries(answerData)) {
                const responseKey = `${timestamp}_${mnemonic}_${qID}`.toLowerCase();
                
                if (processedResponses.has(responseKey)) {
                    continue;
                }
                
                const questionData = questionMap[qID];
                if (!questionData) {
                    console.warn(`Question ${qID} not found in bank`);
                    continue;
                }
                
                // Get current score from in-memory map
                const currentScore = userData.score;
                
                // Check role and duplicate attempt
                const actualRole = (userData.role || "").trim().toLowerCase();
                const requiredRole = (questionData.targetRole || "").trim().toLowerCase();
                const correctRole = actualRole === requiredRole || !requiredRole;
                const isDuplicate = hasAttemptInUserData(userData, qID);
                
                // UPDATED: Get options for this question for smart comma handling
                const questionOptions = optionsMap[qID] || [];
                
                // UPDATED: Variables to track correctness and partial credit
                const isMultipleSelect = questionData.type && questionData.type.toLowerCase() === "multiple select";
                let isCorrect = false;
                let isPartiallyCorrect = false;
                let earnedPoints = 0;
                
                // UPDATED: Grade answer using smart comma handling
                isCorrect = isAnswerCorrect(
                    userAnswer, 
                    questionData.correctAnswer, 
                    questionData.type,
                    questionOptions
                );
                
                // Anti-cheat rule: first submission consumes the attempt, even on role mismatch.
                // Points are awarded only when role is correct on that first attempt.
                if (!isDuplicate) {
                    if (correctRole) {
                        if (isMultipleSelect) {
                            // UPDATED: Calculate partial credit using smart comma handling
                            earnedPoints = calculatePartialCredit(
                                userAnswer,
                                questionData.correctAnswer,
                                questionData.type,
                                questionData.points,
                                questionOptions
                            );
                            
                            // Check if this is partially correct (some points but not full)
                            if (earnedPoints > 0 && earnedPoints < questionData.points) {
                                isPartiallyCorrect = true;
                            }
                        } else {
                            earnedPoints = isCorrect ? questionData.points : 0;
                        }
                    } else {
                        earnedPoints = 0;
                    }
                    
                    // Record attempt regardless of role correctness; this blocks retries.
                    applyScoreUpdateInMemory_(userData, qID, earnedPoints, timestamp);
                }
                
                // Determine correctness display status for audit log
                let correctnessStatus;
                if (isPartiallyCorrect) {
                    correctnessStatus = "Partially Correct";
                } else if (isCorrect) {
                    correctnessStatus = "Correct";
                } else {
                    correctnessStatus = "Incorrect";
                }
                
                // Batch write raw response status at end.
                rawRowStatus[rowIndex] = isCorrect || isPartiallyCorrect ? "Correct" : "Incorrect";
                
                // UPDATED: Get shortened answers for display with smart comma handling
                let formattedUserAnswer = getAnswerLetters(userAnswer, qID, answerMapping, questionOptions);
                let formattedCorrectAnswer = getAnswerLetters(questionData.correctAnswer, qID, answerMapping, questionOptions);
                
                // Short display version for audit log
                const answerDisplay = `Answer: ${shortenAnswerText(formattedUserAnswer)} (Expected: ${shortenAnswerText(formattedCorrectAnswer)})`;
                
                // Add to audit log entries
                auditLogEntries.push([
                    timestamp,                    // Timestamp
                    mnemonic,                    // Mnemonic
                    qID,                         // Question ID
                    answerDisplay,               // Shortened answer
                    correctnessStatus,           // UPDATED: Now shows "Partially Correct" when applicable
                    isDuplicate ? "Yes" : "No",  // Duplicate Attempt?
                    correctRole ? "Yes" : "No",  // Correct Role?
                    currentScore,                // Previous Points
                    earnedPoints,                // Earned Points
                    currentScore + earnedPoints, // Total Points
                    isDuplicate ? "Duplicate" :
                        !correctRole ? "Role Mismatch" :
                        "Processed",             // Status
                    teamId                       // TeamID
                ]);
                
                // Process in smaller batches
                if (auditLogEntries.length >= 20) {
                    appendToAuditLog(auditLogSheet, auditLogEntries);
                    auditLogEntries = [];
                }
            }
            
            // Mark as graded in batched write at end.
            if (!rawRowStatus[rowIndex]) rawRowStatus[rowIndex] = "Incorrect";
        }
        
        flushScoresFromUserDataMap_(scoresSheet, userDataMap);
        applyRawResponseStatusUpdates_(responsesSheet, rawRowStatus);

        // Add remaining audit entries
        if (auditLogEntries.length > 0) {
            appendToAuditLog(auditLogSheet, auditLogEntries);
        }

        return { ok: true, message: `Processed ${rowsToGrade.length} response row(s) for ${mnemonic}.` };
        
    } catch (e) {
        console.error(`❌ Error processing ${mnemonic}:`, e.message, e.stack);
        logError('Grade For Mnemonic', `Error processing ${mnemonic}: ${e.message}\n${e.stack}`);
        return { ok: false, message: e.message };
    }
}

function resetSyncTimestamp() {
  PropertiesService.getScriptProperties().deleteProperty("LAST_SYNC_TIMESTAMP");
  PropertiesService.getScriptProperties().deleteProperty("lastSyncTimestamp");
  PropertiesService.getScriptProperties().deleteProperty("lastSyncedFormRow");
  console.log("Sync timestamp reset.");
}

/**
 * Update the Processed Responses sheet with incremental updates
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
    
    // Setup headers if needed
    if (processedSheet.getLastRow() === 0) {
        processedSheet.appendRow(["Timestamp", "Mnemonic", "Processed", "Processing Timestamp"]);
    }
    
    // Get existing processed entries to avoid duplicates
    const existingData = processedSheet.getDataRange().getValues();
    const existingEntries = new Set();
    
    for (let i = 1; i < existingData.length; i++) {
        const key = `${existingData[i][0]}_${String(existingData[i][1]).toLowerCase()}`;
        existingEntries.add(key);
    }
    
    // Get all graded responses
    const rawData = rawResponsesSheet.getDataRange().getValues();
    const newProcessedResponses = [];
    
    for (let i = 1; i < rawData.length; i++) {
        if (rawData[i][4] === "Yes") { // If graded
            const key = `${rawData[i][0]}_${String(rawData[i][1]).toLowerCase()}`;
            
            // Only add if not already in processed sheet
            if (!existingEntries.has(key)) {
                newProcessedResponses.push([
                    rawData[i][0], // Timestamp
                    rawData[i][1], // Mnemonic
                    "Yes",         // Processed
                    new Date()     // Processing Timestamp
                ]);
                
                // Add to set to prevent duplicates in this run
                existingEntries.add(key);
            }
        }
    }
    
    // Batch append new entries to processed sheet
    if (newProcessedResponses.length > 0) {
        retryOperation(() => {
            processedSheet.getRange(
                processedSheet.getLastRow() + 1, 
                1, 
                newProcessedResponses.length, 
                4
            ).setValues(newProcessedResponses);
        });
        
        console.log(`✅ Added ${newProcessedResponses.length} new processed responses`);
        
        // Formatting is handled separately to keep this function lightweight.
    } else {
        console.log("ℹ️ No new processed responses to add");
    }
}

function shouldUpdateProcessedResponses_() {
    const props = PropertiesService.getScriptProperties();
    const key = 'lastProcessedResponsesUpdateMs';
    const now = Date.now();
    const last = Number(props.getProperty(key) || 0);
    // Throttle full processed response rebuilds to every 10 minutes.
    if (last && now - last < 10 * 60 * 1000) return false;
    props.setProperty(key, String(now));
    return true;
}

/**
 * Update formatting in audit log for better readability
 */
function updateAuditLogFormatting() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const auditSheet = ss.getSheetByName(SHEETS.AUDIT_LOG);
    
    if (!auditSheet) return;
    
    // Only update formatting periodically to avoid excess API calls
    const props = PropertiesService.getScriptProperties();
    const lastFormatTime = props.getProperty('lastAuditFormatTime');
    const now = new Date().getTime();
    
    if (lastFormatTime && now - parseInt(lastFormatTime) < 300000) { // 5 minutes
        return; // Skip if formatted recently
    }
    
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
    
    // Store last format time
    props.setProperty('lastAuditFormatTime', now.toString());
}

/**
 * Archive old audit log data to prevent sheet from growing too large
 */
function archiveOldData() {
    const lock = LockService.getScriptLock();
    try {
        if (!lock.tryLock(10000)) {
            console.log("Could not obtain lock for archiving. Another process is running.");
            return;
        }
        
        const sheet = SpreadsheetApp.getActiveSpreadsheet();
        const auditLogSheet = sheet.getSheetByName(SHEETS.AUDIT_LOG);
        
        if (!auditLogSheet || auditLogSheet.getLastRow() <= 5000) {
            return; // No need to archive
        }
        
        // Create archive sheet if it doesn't exist
        let archiveSheet = sheet.getSheetByName("Audit Archive");
        if (!archiveSheet) {
            archiveSheet = sheet.insertSheet("Audit Archive");
            // Copy headers
            auditLogSheet.getRange(1, 1, 1, auditLogSheet.getLastColumn())
                .copyTo(archiveSheet.getRange(1, 1));
        }
        
        // Get oldest 1000 entries (after header)
        const numRows = 1000;
        const dataToArchive = auditLogSheet.getRange(
            2, 1, numRows, auditLogSheet.getLastColumn()
        ).getValues();
        
        // Append to archive with retry
        retryOperation(() => {
            archiveSheet.getRange(
                archiveSheet.getLastRow() + 1, 
                1, 
                dataToArchive.length, 
                dataToArchive[0].length
            ).setValues(dataToArchive);
        });
        
        // Delete from audit log with retry
        retryOperation(() => {
            auditLogSheet.deleteRows(2, numRows);
        });
        
        // Clear processed responses cache
        CacheService.getScriptCache().remove('processedResponses');
        
        console.log(`✅ Archived ${numRows} audit log entries`);
    } catch (e) {
        console.error("❌ Error in archiveOldData:", e.message, e.stack);
        logError('Archive Data', `Error archiving data: ${e.message}\n${e.stack}`);
    } finally {
        if (lock.hasLock()) {
            lock.releaseLock();
        }
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
    
    // Add test entries - default to 10 entries for performance
    const testCount = Math.min(mnemonics.length, 10);
    const testRows = [];
    
    for (let i = 0; i < testCount; i++) {
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

/**
 * Generate simulated raw responses for stress testing.
 * This writes directly to Form Responses (Raw) so you can audit exact generated payloads.
 *
 * payload:
 *  - count: number of simulated submissions (default 300, max 5000)
 *  - autoGrade: run gradeResponses() after insert (default true)
 *  - duplicateRate: fraction [0..1] of rows that should intentionally be duplicate attempts (default 0.2)
 */
function simulateStressResponses(payload) {
    payload = payload || {};
    const count = Math.max(1, Math.min(Number(payload.count) || 300, 5000));
    const autoGrade = payload.autoGrade !== false;
    const duplicateRate = Math.max(0, Math.min(Number(payload.duplicateRate), 1));
    const effectiveDuplicateRate = Number.isFinite(duplicateRate) ? duplicateRate : 0.2;

    const lock = LockService.getScriptLock();
    let result;
    try {
        if (!lock.tryLock(10000)) {
            throw new Error("Could not obtain lock for stress simulation.");
        }

        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const scoresSheet = ss.getSheetByName(SHEETS.SCORES);
        const questionBankSheet = ss.getSheetByName(SHEETS.QUESTION_BANK);
        const rawSheet = ss.getSheetByName("Form Responses (Raw)");

        if (!scoresSheet || !questionBankSheet || !rawSheet) {
            throw new Error("Missing Scores, Question Bank, or Form Responses (Raw) sheet.");
        }

        const users = getSimulationUsers_(scoresSheet);
        if (!users.length) throw new Error("No participants found in Scores.");

        const questionMap = getQuestionMapWithCache(questionBankSheet);
        const optionsMap = getOptionsMapWithCache(questionBankSheet);
        const pools = buildSimulationQuestionPools_(questionMap, optionsMap);
        if (!pools.all.length) throw new Error("No questions found in Question Bank.");

        const rawRows = [];
        const baseMs = Date.now();
        let correctAnswers = 0;
        let incorrectAnswers = 0;
        let partialAnswers = 0;
        let correctRoleCount = 0;
        let wrongRoleCount = 0;
        let injectedDuplicateRows = 0;
        const priorByUser = new Map(); // mnemonic -> [{ qID, correctAnswer, options, isMultipleSelect, targetRole }]

        for (let i = 0; i < count; i++) {
            const user = randomFromArray_(users);
            if (!user) continue;

            const userKey = String(user.mnemonic || '').toLowerCase();
            const priorForUser = priorByUser.get(userKey) || [];
            const forceDuplicate = priorForUser.length > 0 && Math.random() < effectiveDuplicateRate;

            let question;
            if (forceDuplicate) {
                // Pick one of this user's prior questions to ensure duplicate attempt behavior.
                question = randomFromArray_(priorForUser);
                injectedDuplicateRows++;
            } else {
                const wantCorrectRole = Math.random() < 0.7;
                question = pickQuestionForSimulation_(pools, user.role, wantCorrectRole);
            }
            if (!question) continue;

            const roleIsCorrect = String(question.targetRole || "").toLowerCase() === String(user.role || "").toLowerCase();
            if (roleIsCorrect) correctRoleCount++; else wrongRoleCount++;

            const outcomeRoll = Math.random();
            let outcome = "incorrect";
            if (outcomeRoll < 0.45) outcome = "correct";
            else if (outcomeRoll < 0.7) outcome = "incorrect";
            else if (outcomeRoll < 0.9 && question.isMultipleSelect) outcome = "partial";
            else outcome = "incorrect";

            const simulatedAnswer = generateSimulatedAnswerForQuestion_(question, outcome);
            if (outcome === "correct") correctAnswers++;
            else if (outcome === "partial") partialAnswers++;
            else incorrectAnswers++;

            const timestamp = new Date(baseMs + (i * 1000) + Math.floor(Math.random() * 500));
            const answerObj = {};
            answerObj[question.qID] = simulatedAnswer;
            rawRows.push([
                timestamp,
                user.mnemonic,
                JSON.stringify(answerObj),
                user.role || "",
                "No",
                ""
            ]);

            if (!forceDuplicate) {
                priorForUser.push({
                    qID: question.qID,
                    targetRole: question.targetRole,
                    correctAnswer: question.correctAnswer,
                    options: question.options,
                    isMultipleSelect: question.isMultipleSelect
                });
                priorByUser.set(userKey, priorForUser);
            }
        }

        if (!rawRows.length) {
            throw new Error("No stress rows were generated.");
        }

        const BATCH_SIZE = 400;
        for (let i = 0; i < rawRows.length; i += BATCH_SIZE) {
            const batch = rawRows.slice(i, Math.min(i + BATCH_SIZE, rawRows.length));
            rawSheet.getRange(rawSheet.getLastRow() + 1, 1, batch.length, 6).setValues(batch);
        }

        // Let sync know where it left off so it doesn't re-import same Form Responses rows.
        PropertiesService.getScriptProperties().setProperty('lastSyncedFormRow', String(ss.getSheetByName(SHEETS.FORM_RESPONSES)?.getLastRow() || 1));

        result = {
            ok: true,
            inserted: rawRows.length,
            autoGraded: autoGrade,
            duplicateRate: effectiveDuplicateRate,
            mix: {
                correctAnswers,
                incorrectAnswers,
                partialAnswers,
                correctRoleCount,
                wrongRoleCount,
                injectedDuplicateRows
            }
        };
    } finally {
        if (lock.hasLock()) lock.releaseLock();
    }

    if (autoGrade) {
        gradeResponses();
    }
    return result;
}

function getSimulationUsers_(scoresSheet) {
    const data = scoresSheet.getDataRange().getValues();
    if (!data.length) return [];
    const users = [];
    for (let i = 1; i < data.length; i++) {
        const mnemonic = String(data[i][0] || '').toLowerCase().trim();
        if (!mnemonic) continue;
        const role = String(data[i][2] || '').toUpperCase().trim();
        users.push({ mnemonic, role });
    }
    return users;
}

function buildSimulationQuestionPools_(questionMap, optionsMap) {
    const pools = { all: [], RN: [], PCA: [], LPN: [] };
    Object.keys(questionMap || {}).forEach((qID) => {
        const q = questionMap[qID] || {};
        const targetRole = String(q.targetRole || '').toUpperCase().trim();
        const options = optionsMap[qID] || [];
        const isMultipleSelect = String(q.type || '').toLowerCase() === 'multiple select';
        const entry = {
            qID,
            targetRole,
            correctAnswer: String(q.correctAnswer || ''),
            type: String(q.type || ''),
            options,
            isMultipleSelect
        };
        pools.all.push(entry);
        if (targetRole === 'RN' || targetRole === 'PCA' || targetRole === 'LPN') {
            pools[targetRole].push(entry);
        }
    });
    return pools;
}

function pickQuestionForSimulation_(pools, userRole, wantCorrectRole) {
    const role = String(userRole || '').toUpperCase().trim();
    if (!pools || !pools.all || !pools.all.length) return null;

    if (wantCorrectRole && pools[role] && pools[role].length) {
        return randomFromArray_(pools[role]);
    }

    if (!wantCorrectRole) {
        const wrongRolePool = pools.all.filter(q => String(q.targetRole || '').toUpperCase() !== role);
        if (wrongRolePool.length) return randomFromArray_(wrongRolePool);
    }

    return randomFromArray_(pools.all);
}

function generateSimulatedAnswerForQuestion_(question, outcome) {
    const correct = String(question.correctAnswer || '');
    const options = Array.isArray(question.options) ? question.options : [];
    const isMultiple = !!question.isMultipleSelect;

    if (outcome === 'correct') return correct;

    if (isMultiple) {
        const correctParts = correct.split(',').map(s => s.trim()).filter(Boolean);
        const optionSet = new Set(options.map(o => String(o).trim()).filter(Boolean));
        const wrongOptions = Array.from(optionSet).filter(o => !correctParts.some(c => c.toLowerCase() === o.toLowerCase()));

        if (outcome === 'partial' && correctParts.length > 1) {
            return correctParts.slice(0, Math.max(1, correctParts.length - 1)).join(', ');
        }

        if (wrongOptions.length) {
            const pick = randomFromArray_(wrongOptions);
            return pick || 'Incorrect Option';
        }
        return 'Incorrect Option';
    }

    if (options.length > 1) {
        const wrong = options.filter(o => String(o).trim().toLowerCase() !== correct.toLowerCase());
        if (wrong.length) return randomFromArray_(wrong);
    }

    return 'Incorrect Answer';
}

function randomFromArray_(arr) {
    if (!arr || !arr.length) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Reset testing data so stress tests can be repeated cleanly.
 * Clears audit, raw responses, queue, processed responses, and resets points/attempts.
 */
function resetCompetitionTestData() {
    const lock = LockService.getScriptLock();
    try {
        if (!lock.tryLock(10000)) throw new Error("Could not obtain lock for reset.");

        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const scoresSheet = ss.getSheetByName(SHEETS.SCORES);
        const auditSheet = ss.getSheetByName(SHEETS.AUDIT_LOG);
        const rawSheet = ss.getSheetByName("Form Responses (Raw)");
        const queueSheet = ss.getSheetByName("Processing Queue");
        const processedSheet = ss.getSheetByName("Processed Responses");

        if (!scoresSheet || !auditSheet || !rawSheet) {
            throw new Error("Missing required sheets for reset.");
        }

        // Reset scores + attempts
        const scoresLastRow = scoresSheet.getLastRow();
        if (scoresLastRow > 1) {
            const rowCount = scoresLastRow - 1;
            scoresSheet.getRange(2, 4, rowCount, 1).setValues(Array.from({ length: rowCount }, () => [0]));
            scoresSheet.getRange(2, 6, rowCount, 1).setValues(Array.from({ length: rowCount }, () => ['{}']));
        }

        // Clear audit rows (keep header)
        if (auditSheet.getLastRow() > 1) {
            auditSheet.getRange(2, 1, auditSheet.getLastRow() - 1, auditSheet.getLastColumn()).clearContent();
        }

        // Clear raw rows (keep header)
        if (rawSheet.getLastRow() > 1) {
            rawSheet.getRange(2, 1, rawSheet.getLastRow() - 1, rawSheet.getLastColumn()).clearContent();
        }

        // Clear queue rows
        if (queueSheet && queueSheet.getLastRow() > 1) {
            queueSheet.getRange(2, 1, queueSheet.getLastRow() - 1, queueSheet.getLastColumn()).clearContent();
        }

        // Clear processed response rows
        if (processedSheet && processedSheet.getLastRow() > 1) {
            processedSheet.getRange(2, 1, processedSheet.getLastRow() - 1, processedSheet.getLastColumn()).clearContent();
        }

        // Reset sync/process markers and caches
        const props = PropertiesService.getScriptProperties();
        [
            'LAST_SYNC_TIMESTAMP',
            'lastSyncTimestamp',
            'lastSyncedFormRow',
            'lastProcessedResponsesUpdateMs',
            'lastAuditFormatTime'
        ].forEach(k => props.deleteProperty(k));

        clearCaches();
        updateLeaderboard();

        return { ok: true, message: "Test data reset complete." };
    } finally {
        if (lock.hasLock()) lock.releaseLock();
    }
}

/**
 * Retry operation with exponential backoff
 */
function retryOperation(operation, maxRetries = 3) {
    let retries = 0;
    while (retries < maxRetries) {
        try {
            return operation();
        } catch (e) {
            if (e.toString().includes("Rate Limit") || 
                e.toString().includes("Too many requests") ||
                e.toString().includes("exceeded maximum execution time") ||
                e.toString().includes("Service unavailable")) {
                
                if (retries < maxRetries - 1) {
                    const backoffTime = Math.pow(2, retries) * 1000 + Math.random() * 1000;
                    Utilities.sleep(backoffTime);
                    retries++;
                    console.warn(`Retry attempt ${retries} after ${backoffTime}ms delay...`);
                } else {
                    throw e;
                }
            } else {
                throw e;
            }
        }
    }
}

/**
 * Flush all queued items (admin function for immediate processing)
 */
function flushQueue() {
    const lock = LockService.getScriptLock();
    try {
        if (!lock.tryLock(10000)) {
            console.log("Could not obtain lock for flushing queue. Another process is running.");
            return;
        }
        
        console.log("🔄 Flushing all queued submissions...");
        
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
        
        // Find all pending indices
        const pendingIndices = [];
        for (let i = 1; i < queueData.length; i++) {
            if (queueData[i][2] === "No") {
                pendingIndices.push(i);
            }
        }
        
        if (pendingIndices.length === 0) {
            console.log("ℹ️ No pending items in queue");
            return;
        }
        
        console.log(`🔄 Flushing ${pendingIndices.length} queued submissions...`);
        
        // Process all pending items
        const BATCH_SIZE = 10;
        const startTime = new Date().getTime();
        const MAX_EXECUTION_TIME = 250000; // 250 seconds
        
        let processedCount = 0;
        
        for (let i = 0; i < pendingIndices.length; i += BATCH_SIZE) {
            // Check if approaching time limit
            if (new Date().getTime() - startTime > MAX_EXECUTION_TIME) {
                console.warn(`⏱️ Approaching time limit. Processed ${processedCount} items.`);
                
                // Schedule continuation
                ScriptApp.newTrigger('flushQueue')
                    .timeBased()
                    .after(1000) // 1 second
                    .create();
                    
                return;
            }
            
            const batchIndices = pendingIndices.slice(i, i + BATCH_SIZE);
            processBatchFromQueue(batchIndices, queueSheet, queueData);
            processedCount += batchIndices.length;
        }
        
        console.log(`✅ Successfully flushed ${processedCount} queued submissions`);
        
        // Update processed responses
        updateProcessedResponses();
    } catch (e) {
        console.error("❌ Error in flushQueue:", e.message, e.stack);
        logError('Flush Queue', `Error flushing queue: ${e.message}\n${e.stack}`);
    } finally {
        if (lock.hasLock()) {
            lock.releaseLock();
        }
    }
}

function reconcileRawGradedStatusFromAudit() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const raw = ss.getSheetByName("Form Responses (Raw)");
  const audit = ss.getSheetByName("Audit Log");

  if (!raw || !audit) throw new Error("Missing Raw or Audit sheet.");

  // Raw columns: A Timestamp, B Mnemonic, C Answer JSON, D Role, E Graded?, F Correct/Incorrect
  const rawData = raw.getDataRange().getValues();
  if (rawData.length < 2) return;

  // Audit: (based on your screenshot) B=Mnemonic, C=QuestionID, E=Result ("Correct"), J/K maybe points, L status text
  const auditData = audit.getDataRange().getValues();

  // Build a lookup: mnemonic|timestampString -> { graded: true, result: "Correct"/"Incorrect"/etc }
  // We'll treat any row in audit that indicates "Processed" as graded.
  const lookup = new Map();

  for (let i = 1; i < auditData.length; i++) {
    const row = auditData[i];
    const ts = row[0]; // col A timestamp
    const mnemonic = (row[1] || "").toString().trim(); // col B mnemonic
    const result = (row[4] || "").toString().trim();   // col E result (e.g., "Correct")
    const status = (row[11] || "").toString().trim();  // col L status (e.g., "Processed")

    if (!mnemonic || !ts) continue;

    const key = `${mnemonic}|${new Date(ts).toISOString()}`;

    // If any audit row for that submission is processed, mark graded
    if (status.toLowerCase() === "processed" || result) {
      lookup.set(key, { graded: true, result: result || "Processed" });
    }
  }

  // Update Raw E/F if match
  let updates = 0;
  for (let r = 1; r < rawData.length; r++) {
    const ts = rawData[r][0];
    const mnemonic = (rawData[r][1] || "").toString().trim();
    if (!ts || !mnemonic) continue;

    const key = `${mnemonic}|${new Date(ts).toISOString()}`;
    const found = lookup.get(key);
    if (!found) continue;

    // Only overwrite if still "No"
    if ((rawData[r][4] || "").toString().trim().toLowerCase() === "no") {
      rawData[r][4] = "Yes";
      rawData[r][5] = found.result;
      updates++;
    }
  }

  // Write back (only E/F columns)
  if (updates > 0) {
    const out = rawData.slice(1).map(row => [row[4], row[5]]);
    raw.getRange(2, 5, out.length, 2).setValues(out);
  }

  console.log(`Reconciled ${updates} raw rows from Audit Log.`);
}

/**
 * Fix timestamp formatting in Form Responses (Raw) and other sheets
 */
function fixTimestampFormatting() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  const rawResponsesSheet = sheet.getSheetByName("Form Responses (Raw)");
  const processedSheet = sheet.getSheetByName("Processed Responses");
  
  if (rawResponsesSheet && rawResponsesSheet.getLastRow() > 1) {
    // Get the format from an existing cell
    const existingFormat = rawResponsesSheet.getRange("A2").getNumberFormat();
    
    // Apply to all timestamp cells
    const timestampRange = rawResponsesSheet.getRange(2, 1, rawResponsesSheet.getLastRow()-1, 1);
    timestampRange.setNumberFormat(existingFormat);
  }
  
  if (processedSheet && processedSheet.getLastRow() > 1) {
    // Get the format from an existing cell if available, otherwise use a default format
    let existingFormat = "M/d/yyyy h:mm:ss";
    if (processedSheet.getLastRow() > 1) {
      existingFormat = processedSheet.getRange("A2").getNumberFormat() || existingFormat;
    }
    
    // Apply to all timestamp cells
    const timestampRange = processedSheet.getRange(2, 1, processedSheet.getLastRow()-1, 1);
    timestampRange.setNumberFormat(existingFormat);
    
    // Apply to processing timestamp column
    const processingTimestampRange = processedSheet.getRange(2, 4, processedSheet.getLastRow()-1, 1);
    processingTimestampRange.setNumberFormat(existingFormat);
  }
}


/**
 * Fix text alignment in all sheets
 */
function fixTextAlignment() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheetsToFix = [
    "Form Responses (Raw)", 
    "Processed Responses",
    "Processing Queue"
  ];
  
  for (const sheetName of sheetsToFix) {
    const currentSheet = sheet.getSheetByName(sheetName);
    if (!currentSheet || currentSheet.getLastRow() <= 1) continue;
    
    // Get the last row and column
    const lastRow = currentSheet.getLastRow();
    const lastCol = currentSheet.getLastColumn();
    
    // Apply consistent alignment to all data cells
    currentSheet.getRange(2, 1, lastRow-1, lastCol)
      .setHorizontalAlignment("left")
      .setVerticalAlignment("middle");
  }
}

/**
 * Creates a combined menu for all functions when the spreadsheet is opened
 */
/**
 * Creates a combined menu for all functions when the spreadsheet is opened
 */
/**
 * Integration code for adding reporting functions to existing onOpen menu
 * Add this at the end of your reportGenerator.gs file
 */

/**
 * Creates a combined menu for all functions when the spreadsheet is opened
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  
  // Create Quiz Admin menu (main menu)
  const quizMenu = ui.createMenu('Quiz Admin');
  
  // Response Processing Submenu
  const processingMenu = ui.createMenu('Response Processing')
    .addItem('Process Pending Responses', 'processQueue')
    .addItem('Flush All Pending Responses', 'flushQueue')
    .addItem('Grade Responses', 'gradeResponses')
    .addItem('Sync Responses', 'syncResponses')
    .addSeparator()
    .addItem('Check for Missed Submissions Now', 'checkForMissedSubmissions')
    .addItem('Setup Deadline Triggers for Tonight', 'createDeadlineTriggers');
  
  // Grading Management Submenu
  const gradingMenu = ui.createMenu('Grading Management')
    .addItem('Regrade Specific Mnemonic', 'promptForRegrade')
    .addItem('Fix Q009 CDF Answers', 'fixQ009Answers')
    .addItem('Clear Question Cache', 'clearQuestionCache')
    .addSeparator()
    .addItem('Add Manual Points', 'showManualPointsDialog')
    .addItem('Process Manual Form Grades', 'handleFormGradeOverride')
    .addItem('Setup Manual Grade Processing Log', 'setupManualGradeProcessingLog')
    .addItem('Recover Bonus Points', 'recoverBonusPoints');
  
  // Competition Management Submenu
  const competitionMenu = ui.createMenu('Competition Management')
    .addItem('Update Leaderboard', 'updateLeaderboard')
    .addSeparator()
    .addItem('Advance to Round 2 (Top 8)', 'advanceToRoundTwo')
    .addItem('Update Round 2 Scores', 'updateRoundTwoScores')
    .addItem('Advance to Round 3 (Top 4)', 'advanceToRoundThree')
    .addItem('Update Round 3 Scores', 'updateRoundThreeScores')
    .addItem('Advance to Round 4 (Finals)', 'advanceToRoundFour')
    .addItem('Update Round 4 Scores', 'updateRoundFourScores')
    .addItem('Determine Champion', 'determineChampion')
    .addSeparator()
    .addItem('Determine Weekly Winners', 'testDetermineWinners');
  
  // Question Management Submenu
  const questionMenu = ui.createMenu('Question Management')
    .addItem('Add New Question', 'showQuestionBankEditor')
    .addItem('Edit Existing Question', 'editExistingQuestion')
    .addItem('Update Daily Questions', 'updateDailyQuestions')
    .addItem('Reset Daily Questions Trigger', 'resetDailyQuestionsTrigger');
  
  // Maintenance Submenu
  const maintenanceMenu = ui.createMenu('Maintenance')
    .addItem('Fix Timestamp Display', 'fixTimestampDisplay')
    .addItem('Check Timestamps', 'checkForTimestamps')
    .addItem('Clean Duplicate Responses', 'cleanupProcessedResponses')
    .addItem('Fix Formatting & Alignment', 'fixAllSheetFormatting')
    .addSeparator()
    .addItem('Reset All Scores', 'resetAllScores')
    .addItem('Clear Audit Log', 'clearAuditLog')
    .addItem('Archive Old Audit Data', 'archiveOldData')
    .addSeparator()
    .addItem('Add Test Data (10 Entries)', 'addTestData')
    .addItem('Stress Test (300 Responses)', 'runStressTest300')
    .addItem('Reset Competition Test Data', 'resetCompetitionTestData')
    .addItem('Clear Caches', 'clearCaches')
    .addItem('Setup Automatic Processing', 'setupTriggers')
    .addItem('Reset Raw Sheet', 'resetRawSheet')
    .addItem('Reconstitute Raw Grading From Audit', 'reconcileRawGradedStatusFromAudit');
  
  // Reports Submenu
  const reportsMenu = ui.createMenu('Reports')
    .addItem('Generate Comprehensive Report', 'generateComprehensiveReports')
    .addItem('Generate Detailed Question Report', 'generateDetailedQuestionReport')
    .addSeparator()
    .addItem('Export Report as PDF', 'exportReportAsPDF')
    .addItem('Export Report as Excel', 'exportReportAsExcel')
    .addSeparator()
    .addItem('Create Topic & Policies Sheets', 'initializeMarchMadnessSheets')
    .addItem('Generate Reports', 'showReportsManager')
    .addItem('Manage Topics & Policies', 'showTopicManager')
    .addItem('Assign Topics to Questions', 'showQuestionAssignment');
  
  // Backup Submenu
  const backupMenu = ui.createMenu('Backup')
    .addItem('Create Backup Now', 'createSpreadsheetBackup')
    .addItem('List All Backups', 'listBackups')
    .addSeparator()
    .addItem('Set Custom Backup Folder', 'setBackupFolder')
    .addItem('Reset to Default Backup Folder', 'resetBackupFolder')
    .addSeparator()
    .addItem('Schedule Daily Backups', 'createDailyBackupTrigger')
    .addItem('Schedule Weekly Backups', 'createWeeklyBackupTrigger')
    .addItem('Remove Backup Schedule', 'removeBackupTriggers');

  // Team Tools Submenu
  const teamToolsMenu = ui.createMenu('Team Tools')
    .addItem('Shuffle Teams (1-TraumaSurg)', 'shuffleTeams_1TraumaSurg')
    .addItem('Shuffle Teams (3-MedOnc)', 'shuffleTeams_3MedOnc')
    .addItem('Shuffle Teams (4-OrthoNeuro)', 'shuffleTeams_4OrthoNeuro')
    .addItem('Shuffle Teams (5-SurgSpec)', 'shuffleTeams_5SurgSpec')
    .addItem('Shuffle Teams (6-MedSpec)', 'shuffleTeams_6MedSpec')
    .addItem('Shuffle Teams (7-PSCI)', 'shuffleTeams_7PSCI')
    .addItem('Rebuild Team Members Data', 'rebuildTeamsMembersData');
  
  // Add all submenus to main menu
  quizMenu
    .addSubMenu(processingMenu)
    .addSubMenu(gradingMenu)
    .addSubMenu(competitionMenu)
    .addSubMenu(questionMenu)
    .addSubMenu(reportsMenu)
    .addSubMenu(maintenanceMenu)
    .addSubMenu(backupMenu)
    .addSubMenu(teamToolsMenu);
  
  // Add the main menu to the UI
  quizMenu.addToUi();
}

function runStressTest300() {
  const result = simulateStressResponses({
    count: 300,
    autoGrade: true,
    duplicateRate: 0.2
  });
  SpreadsheetApp.getActiveSpreadsheet().toast(
    `Inserted ${result.inserted || 0} simulated responses. Duplicates injected: ${(result.mix && result.mix.injectedDuplicateRows) || 0}.`,
    'Stress Test Complete',
    7
  );
  return result;
}

/**
 * Alternative approach if you don't want to replace your entire onOpen function.
 * This function modifies your existing menu by adding reporting items.
 * 
 * To use this, call it from your existing onOpen function right before
 * you call .addToUi() on your menu.
 */
function addReportingItemsToMenu(menu) {
  // This version assumes 'menu' is your existing Quiz Admin menu
  return menu
    .addSeparator()
    .addItem('Generate Comprehensive Report', 'generateComprehensiveReports')
    .addItem('Generate Detailed Question Report', 'generateDetailedQuestionReport')
    .addItem('Export Report as PDF', 'exportReportAsPDF')
    .addItem('Export Report as Excel', 'exportReportAsExcel');
}

/**
 * Fix all sheet formatting issues
 */
function fixAllSheetFormatting() {
  fixTimestampFormatting();
  fixTextAlignment();
  SpreadsheetApp.getActiveSpreadsheet().toast("Sheet formatting has been fixed", "Formatting Fixed", 5);
}

/**
 * Get answer letters for display
 */
/**
 * function getAnswerLetters(answerText, qID, answerMapping) {
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
*/

/**
 * Shorten long answer text for display
 */
function shortenAnswerText(answer, maxLength = 50) {
    if (!answer || answer.length <= maxLength) return answer;
    return answer.substring(0, maxLength) + "...";
}

function restoreTimestamps() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  const processedSheet = sheet.getSheetByName("Processed Responses");
  const rawResponsesSheet = sheet.getSheetByName("Form Responses (Raw)");
  
  if (!processedSheet || !rawResponsesSheet) {
    console.error("Required sheets not found");
    return;
  }
  
  // Get data from both sheets
  const processedData = processedSheet.getDataRange().getValues();
  const rawData = rawResponsesSheet.getDataRange().getValues();
  
  // Create a map of mnemonic to timestamps from processed responses
  const timestampMap = new Map();
  
  for (let i = 1; i < processedData.length; i++) {
    const timestamp = processedData[i][0]; // Timestamp is in column A
    const mnemonic = processedData[i][1]?.toLowerCase()?.trim() || ""; // Mnemonic is in column B
    
    if (timestamp && mnemonic) {
      timestampMap.set(mnemonic, timestamp);
    }
  }
  
  // Track updates needed
  let updatesNeeded = 0;
  const updates = [];
  
  // Check raw responses sheet for missing timestamps
  for (let i = 1; i < rawData.length; i++) {
    const existingTimestamp = rawData[i][0];
    const mnemonic = rawData[i][1]?.toLowerCase()?.trim() || "";
    
    // If timestamp is missing but we have mnemonic data
    if ((!existingTimestamp || existingTimestamp === "") && mnemonic) {
      const matchTimestamp = timestampMap.get(mnemonic);
      
      if (matchTimestamp) {
        // Queue the update
        updates.push([i+1, matchTimestamp]);
        updatesNeeded++;
      }
    }
  }
  
  console.log(`Found ${updatesNeeded} missing timestamps to restore`);
  
  if (updatesNeeded > 0) {
    for (const [row, timestamp] of updates) {
      rawResponsesSheet.getRange(row, 1).setValue(timestamp);
      // Add a small delay to prevent overloading
      Utilities.sleep(50);
    }
    
    // Fix formatting
    if (rawResponsesSheet.getLastRow() > 1) {
      const timestampRange = rawResponsesSheet.getRange(2, 1, rawResponsesSheet.getLastRow()-1, 1);
      timestampRange.setNumberFormat("M/d/yyyy h:mm:ss");
    }
    
    console.log(`Restored ${updatesNeeded} timestamps`);
  } else {
    console.log("No missing timestamps found");
  }
}

function cleanupProcessedResponses() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  const processedSheet = sheet.getSheetByName("Processed Responses");
  
  if (!processedSheet) {
    console.error("Processed Responses sheet not found");
    return;
  }
  
  const data = processedSheet.getDataRange().getValues();
  
  if (data.length <= 1) {
    console.log("No data to clean up");
    return;
  }
  
  // Create a set of unique entries
  const uniqueEntries = new Map();
  const duplicates = [];
  
  // Skip header row
  for (let i = 1; i < data.length; i++) {
    const timestamp = data[i][0];
    const mnemonic = data[i][1];
    
    if (!timestamp || !mnemonic) continue;
    
    const key = `${mnemonic}_${timestamp}`;
    
    if (!uniqueEntries.has(key)) {
      uniqueEntries.set(key, i+1); // Store row number
    } else {
      duplicates.push(i+1); // This is a duplicate row
    }
  }
  
  console.log(`Found ${duplicates.length} duplicate entries`);
  
  // Delete duplicates in reverse order to avoid index shifting
  if (duplicates.length > 0) {
    for (let i = duplicates.length - 1; i >= 0; i--) {
      processedSheet.deleteRow(duplicates[i]);
    }
    console.log(`Removed ${duplicates.length} duplicate entries`);
  }
}

function diagnoseTimestampIssue() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  const rawSheet = sheet.getSheetByName("Form Responses (Raw)");
  const formSheet = sheet.getSheetByName(SHEETS.FORM_RESPONSES);
  
  if (!rawSheet || !formSheet) {
    console.log("Required sheets not found");
    return;
  }
  
  // Check protection
  const protections = rawSheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
  for (const p of protections) {
    const range = p.getRange();
    if (range.getColumn() === 1) {
      console.log("🔒 Column A is protected! Can't modify it.");
    }
  }
  
  // Check data validation
  const validation = rawSheet.getRange("A2").getDataValidation();
  if (validation) {
    console.log("⚠️ Column A has data validation rules: " + validation.getCriteriaType());
  }
  
  // Check for formulas
  const formulas = rawSheet.getRange("A2:A10").getFormulas();
  let hasFormulas = false;
  for (const row of formulas) {
    if (row[0]) {
      hasFormulas = true;
      console.log("📝 Column A contains formulas: " + row[0]);
      break;
    }
  }
  
  // Test writing a timestamp and check if it persists
  console.log("🧪 Testing timestamp writing...");
  const testRow = 2; // Use the second row for testing
  const testTimestamp = new Date();
  rawSheet.getRange(testRow, 1).setValue(testTimestamp);
  
  // Get the value immediately after setting
  const immediateValue = rawSheet.getRange(testRow, 1).getValue();
  console.log("📊 Immediate value after setting: " + immediateValue);
  
  // Wait a moment and check again
  Utilities.sleep(2000);
  const delayedValue = rawSheet.getRange(testRow, 1).getValue();
  console.log("📊 Value after 2 second delay: " + delayedValue);
  
  // Try writing with different format
  console.log("🧪 Testing with different format...");
  const formattedTimestamp = Utilities.formatDate(testTimestamp, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  rawSheet.getRange(testRow, 1).setValue(formattedTimestamp);
  
  Utilities.sleep(2000);
  const finalValue = rawSheet.getRange(testRow, 1).getValue();
  console.log("📊 Final value after formatted write: " + finalValue);
  
  // Check display values vs actual values
  const displayValue = rawSheet.getRange(testRow, 1).getDisplayValue();
  console.log("📝 Display value: " + displayValue);
  const actualValue = rawSheet.getRange(testRow, 1).getValue();
  console.log("📝 Actual value: " + actualValue);
  
  // Check sheet triggers
  const triggers = ScriptApp.getProjectTriggers();
  console.log("⚙️ Checking for triggers that might interfere:");
  for (const trigger of triggers) {
    console.log(" - " + trigger.getHandlerFunction() + " (event: " + trigger.getEventType() + ")");
  }
  
  // Check if column is hidden
  const isHidden = rawSheet.isColumnHidden(1);
  console.log("👀 Column A hidden? " + isHidden);
  
  // Get sample timestamps from form responses
  const formData = formSheet.getRange("A2:A10").getValues();
  console.log("📅 Sample timestamps from Form Responses:");
  for (const row of formData) {
    if (row[0]) {
      console.log(" - " + row[0] + " (type: " + typeof row[0] + ")");
    }
  }
}

function fixTimestampDisplay() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  const rawSheet = sheet.getSheetByName("Form Responses (Raw)");
  
  if (!rawSheet) {
    console.log("Form Responses (Raw) sheet not found");
    return;
  }
  
  // Get the last row with data
  const lastRow = rawSheet.getLastRow();
  if (lastRow <= 1) {
    console.log("No data rows to fix");
    return;
  }
  
  // Try different date formats to see which one works
  console.log("Applying different date formats to make timestamps visible...");
  
  // First format - standard date/time
  rawSheet.getRange(2, 1, lastRow - 1, 1).setNumberFormat("yyyy-mm-dd hh:mm:ss");
  
  // Second approach - directly modify the column format
  const sheet_id = sheet.getSheetId();
  const column_index = 1; // Column A
  
  try {
    const request = {
      'requests': [
        {
          'updateDimensionProperties': {
            'properties': {
              'numberFormat': {
                'type': 'DATE_TIME',
                'pattern': 'M/d/yyyy h:mm:ss'
              }
            },
            'fields': 'numberFormat',
            'range': {
              'sheetId': sheet_id,
              'dimension': 'COLUMNS',
              'startIndex': column_index - 1,
              'endIndex': column_index
            }
          }
        }
      ]
    };
    
    Sheets.Spreadsheets.batchUpdate(request, sheet.getId());
    console.log("Applied column format via API");
  } catch (e) {
    console.log("API format update failed: " + e.message);
    // Fall back to direct formatting
    rawSheet.getRange("A:A").setNumberFormat("M/d/yyyy h:mm:ss");
    console.log("Applied fallback formatting method");
  }
  
  // Try refreshing the values by writing them back
  const timestampValues = rawSheet.getRange(2, 1, lastRow - 1, 1).getValues();
  rawSheet.getRange(2, 1, lastRow - 1, 1).setValues(timestampValues);
  console.log("Refreshed timestamp values");
}

/**
 * Prompts user for mnemonic and question ID to regrade
 */
function promptForRegrade() {
  const ui = SpreadsheetApp.getUi();
  
  // First prompt for mnemonic
  const mnemonicResponse = ui.prompt(
    'Regrade Student Answer',
    'Enter the student mnemonic to regrade:',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (mnemonicResponse.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  
  const mnemonic = mnemonicResponse.getResponseText().trim();
  if (!mnemonic) {
    ui.alert('Error', 'Mnemonic cannot be empty', ui.ButtonSet.OK);
    return;
  }
  
  // Then prompt for question ID
  const questionResponse = ui.prompt(
    'Question to Regrade',
    'Enter the question ID to regrade (e.g., Q0009):',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (questionResponse.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  
  const questionID = questionResponse.getResponseText().trim().toUpperCase();
  if (!questionID) {
    ui.alert('Error', 'Question ID cannot be empty', ui.ButtonSet.OK);
    return;
  }
  
  // Show progress dialog
  const progressMsg = ui.alert(
    'Processing',
    `Starting to regrade ${mnemonic} for question ${questionID}. Click OK to continue.`,
    ui.ButtonSet.OK
  );
  
  // Run the regrade operation
  try {
    const result = regradeSpecificAnswer(mnemonic, questionID);
    
    // Show result
    if (result.success) {
      ui.alert(
        'Regrade Complete',
        `Successfully regraded ${mnemonic} for question ${questionID}.\n\n${result.message}`,
        ui.ButtonSet.OK
      );
    } else {
      ui.alert(
        'Regrade Error',
        `Error: ${result.message}`,
        ui.ButtonSet.OK
      );
    }
  } catch (e) {
    ui.alert(
      'Error Occurred',
      `An error occurred while regrading: ${e.message}`,
      ui.ButtonSet.OK
    );
  }
}


/**
 * Regrades a specific answer for a specific mnemonic and question
 * Ignores duplicate check since this is a manual override
 * @param {string} mnemonic - The student mnemonic
 * @param {string} questionID - The question ID to regrade
 * @returns {Object} Success status and message
 */
function regradeSpecificAnswer(mnemonic, questionID) {
  // Normalize inputs
  mnemonic = mnemonic.toLowerCase().trim();
  questionID = questionID.toUpperCase().trim();
  
  console.log(`🔄 Starting regrade for ${mnemonic} question ${questionID}`);
  
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet();
    const responsesSheet = sheet.getSheetByName("Form Responses (Raw)");
    const questionBankSheet = sheet.getSheetByName(SHEETS.QUESTION_BANK);
    const scoresSheet = sheet.getSheetByName(SHEETS.SCORES);
    const auditLogSheet = sheet.getSheetByName(SHEETS.AUDIT_LOG);
    
    if (!responsesSheet || !questionBankSheet || !scoresSheet || !auditLogSheet) {
      return { success: false, message: "Required sheets not found" };
    }
    
    ensureAuditLogTeamIdColumn_(auditLogSheet);
    
    // Clear cache to ensure fresh data
    clearQuestionCache();
    
    // Get question data
    const questionBankData = questionBankSheet.getDataRange().getValues();
    let questionData = null;
    
    for (let i = 1; i < questionBankData.length; i++) {
      if (questionBankData[i][1] === questionID) {
        questionData = {
          question: questionBankData[i][2],
          correctAnswer: questionBankData[i][9],
          type: questionBankData[i][10],
          targetRole: questionBankData[i][11],
          points: parseInt(questionBankData[i][12]) || 0
        };
        break;
      }
    }
    
    if (!questionData) {
      return { success: false, message: `Question ${questionID} not found in question bank` };
    }
    
    console.log(`Question ${questionID} found with correct answer: ${questionData.correctAnswer}`);
    
    // Find the response for this mnemonic and question
    const responseData = responsesSheet.getDataRange().getValues();
    let rowIndex = -1;
    let answerData = null;
    let timestamp = null;
    
    for (let i = 1; i < responseData.length; i++) {
      const rowMnemonic = responseData[i][1]?.toLowerCase().trim();
      if (rowMnemonic === mnemonic) {
        const parsedAnswer = parseAnswer(responseData[i][2]);
        if (parsedAnswer && parsedAnswer[questionID]) {
          rowIndex = i;
          answerData = parsedAnswer;
          timestamp = responseData[i][0];
          break;
        }
      }
    }
    
    if (rowIndex === -1 || !answerData) {
      return { success: false, message: `No response found for ${mnemonic} and question ${questionID}` };
    }
    
    const userAnswer = answerData[questionID];
    console.log(`Found response for ${mnemonic}: ${userAnswer}`);
    
    // Get user role
    const userData = getUserData(scoresSheet, mnemonic);
    if (!userData) {
      return { success: false, message: `User ${mnemonic} not found in scores sheet` };
    }
    const teamId = getUserTeamId(scoresSheet, mnemonic);
    
    const actualRole = (userData.role || "").trim().toLowerCase();
    const requiredRole = (questionData.targetRole || "").trim().toLowerCase();
    
    // Check role match
    const correctRole = actualRole === requiredRole || !requiredRole;
    if (!correctRole) {
      return { 
        success: true, 
        message: `User ${mnemonic} has role ${actualRole} but question requires ${requiredRole}. No points awarded.` 
      };
    }
    
    // Check if already attempted (for informational purposes only)
    const isDuplicate = hasAttemptedBefore(scoresSheet, mnemonic, questionID);
    console.log(`User has attempted before: ${isDuplicate} (will be ignored for manual regrade)`);
    
    // Grade the answer
    const isCorrect = isAnswerCorrect(userAnswer, questionData.correctAnswer, questionData.type);
    
    // Update raw responses with correct/incorrect status
    const currentStatus = responsesSheet.getRange(rowIndex + 1, 6).getValue();
    responsesSheet.getRange(rowIndex + 1, 6).setValue(isCorrect ? "Correct" : "Incorrect");
    
    let earnedPoints = 0;
    let message = "";
    
    // Award points if answer is correct, ignoring duplicate status
    if (correctRole && isCorrect) {
      // Calculate points
      if (questionData.type && questionData.type.toLowerCase() === "multiple select") {
        earnedPoints = calculatePartialCredit(
          userAnswer, questionData.correctAnswer, questionData.type, questionData.points
        );
      } else {
        earnedPoints = questionData.points;
      }
      
      // Calculate new score
      const currentScore = getCurrentScore(scoresSheet, mnemonic);
      
      // If this is a duplicate attempt, we need to handle it specially to update the existing attempt
      if (isDuplicate) {
        // Remove previous attempt first
        removeAttempt(scoresSheet, mnemonic, questionID);
      }
      
      // Add the new attempt with points
      updateScores(scoresSheet, mnemonic, questionID, earnedPoints, timestamp);
      
      // Get new score
      const newScore = getCurrentScore(scoresSheet, mnemonic);
      
      message = `Answer changed from ${currentStatus} to ${isCorrect ? "Correct" : "Incorrect"}. ` +
                `Points awarded: ${earnedPoints}. ` +
                `Previous score: ${currentScore}, new score: ${newScore}. ` + 
                (isDuplicate ? "(Previous attempt was overridden)" : "");
    } else if (!isCorrect) {
      message = `Answer is incorrect. No points awarded.`;
    }
    
    // Log this regrade action in the audit log
    auditLogSheet.appendRow([
      new Date(),           // Timestamp
      mnemonic,            // Mnemonic
      questionID,          // Question ID
      userAnswer,          // Answer
      isCorrect ? "Correct" : "Incorrect",  // Correct?
      "No",               // Duplicate? (marked No for manual regrading)
      correctRole ? "Yes" : "No",  // Correct Role?
      userData.score,      // Previous Points
      earnedPoints,        // Earned Points
      userData.score + earnedPoints, // Total Points
      "Manual Regrade",    // Status
      teamId               // TeamID
    ]);
    
    // Update leaderboard
    updateLeaderboard();
    
    return { success: true, message: message };
  } catch (e) {
    console.error(`Error regrading ${mnemonic} for ${questionID}:`, e);
    return { success: false, message: e.message };
  }
}

/**
 * Helper function to get user data from scores sheet
 */
function getUserData(scoresSheet, mnemonic) {
  const data = scoresSheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]?.toLowerCase().trim() === mnemonic.toLowerCase().trim()) {
      return {
        mnemonic: data[i][0],
        name: data[i][1],
        role: data[i][2],
        score: Number(data[i][3]) || 0,
        row: i + 1
      };
    }
  }
  
  return null;
}

/**
 * Remove a previous attempt from a user's record
 */
function removeAttempt(scoresSheet, mnemonic, questionID) {
  const userData = getUserData(scoresSheet, mnemonic);
  if (!userData) return false;
  
  try {
    // Get existing attempts
    const attemptsCell = scoresSheet.getRange(userData.row, 6);
    const attemptsJson = attemptsCell.getValue();
    const attempts = JSON.parse(attemptsJson || "{}");
    
    // Check if the question is in attempts
    if (!(questionID in attempts)) return false;
    
    // Get previous points awarded for this question
    const previousPoints = attempts[questionID].points || 0;
    
    // Update user's score by subtracting previous points
    if (previousPoints > 0) {
      const scoreCell = scoresSheet.getRange(userData.row, 4);
      const currentScore = scoreCell.getValue();
      scoreCell.setValue(currentScore - previousPoints);
    }
    
    // Remove the question from attempts
    delete attempts[questionID];
    
    // Save updated attempts
    attemptsCell.setValue(JSON.stringify(attempts));
    
    return true;
  } catch (e) {
    console.error(`Error removing attempt for ${mnemonic} question ${questionID}:`, e);
    return false;
  }
}

function debugSyncSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const formSheetName = SHEETS.FORM_RESPONSES;              // whatever your constant says
  const form = ss.getSheetByName(formSheetName);
  const raw = ss.getSheetByName("Form Responses (Raw)");

  console.log("=== DEBUG SYNC SETUP ===");
  console.log("Active spreadsheet:", ss.getName(), ss.getId());

  console.log("SHEETS.FORM_RESPONSES =", formSheetName);
  console.log("Form sheet found?", !!form, form ? form.getName() : "NULL");
  console.log("Raw sheet found?", !!raw, raw ? raw.getName() : "NULL");

  if (form) {
    console.log("Form lastRow/lastCol:", form.getLastRow(), form.getLastColumn());
    const headers = form.getRange(1, 1, 1, form.getLastColumn()).getValues()[0];
    console.log("Headers sample:", headers.slice(0, 12));

    if (form.getLastRow() >= 2) {
      const row2 = form.getRange(2, 1, 1, form.getLastColumn()).getValues()[0];
      console.log("Row2 sample (0-12):", row2.slice(0, 12));
      console.log("Row2 types (0-12):", row2.slice(0, 12).map(v => typeof v));
    } else {
      console.log("Form has no data rows (only header).");
    }
  }

  if (raw) {
    console.log("Raw lastRow/lastCol:", raw.getLastRow(), raw.getLastColumn());
  }

  const props = PropertiesService.getScriptProperties().getProperties();
  console.log("ScriptProperties keys:", Object.keys(props));
  console.log("lastSyncTimestamp:", props.lastSyncTimestamp);

  console.log("=== END DEBUG ===");
}

function resetRawSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const raw = ss.getSheetByName("Form Responses (Raw)");
  
  raw.clearContents();
  raw.getRange(1,1,1,6).setValues([[
    "Timestamp",
    "Mnemonic",
    "Answer JSON",
    "Role",
    "Graded?",
    "Correct/Incorrect"
  ]]);
  
  console.log("Raw sheet reset.");
}


/**
 * Clears the cached question data to force a fresh load
 * This is useful when you've updated the Question Bank but changes aren't reflecting
 */
function clearQuestionCache() {
  const cache = CacheService.getScriptCache();
  
  // Remove all cached data related to questions
  cache.remove('questionMap');
  cache.remove('answerMapping');
  cache.remove('optionsMap');
  cache.remove('validMnemonics');
  cache.remove('processedResponses');
  
  // Let the user know it's done
  SpreadsheetApp.getUi().alert(
    'Cache Cleared',
    'Question cache has been cleared. The next grading operation will use fresh data from the Question Bank.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
  
  console.log("🧹 Question cache cleared");
}

/**
 * Direct fix for Q009 answers that should be correct
 * This function directly fixes the issue without complex logic
 */
function fixQ009Answers() {
  const ui = SpreadsheetApp.getUi();
  
  // Ask for mnemonic to fix
  const response = ui.prompt(
    'Fix Q009 Answer',
    'Enter the mnemonic to fix (or leave blank to fix all CDF answers):',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  
  const targetMnemonic = response.getResponseText().trim().toLowerCase();
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  const responsesSheet = sheet.getSheetByName("Form Responses (Raw)");
  const auditLogSheet = sheet.getSheetByName(SHEETS.AUDIT_LOG);
  const scoresSheet = sheet.getSheetByName(SHEETS.SCORES);
  
  if (!responsesSheet || !auditLogSheet || !scoresSheet) {
    ui.alert("Error", "Required sheets not found", ui.ButtonSet.OK);
    return;
  }
  
  // Process the audit log
  const auditData = auditLogSheet.getDataRange().getValues();
  let fixedEntries = 0;
  
  for (let i = 1; i < auditData.length; i++) {
    const row = auditData[i];
    const mnemonic = row[1]?.toLowerCase();
    const questionID = row[2];
    const answerText = row[3];
    
    // Skip if not matching our target or not Q009
    if ((targetMnemonic && mnemonic !== targetMnemonic) || questionID !== "Q009") {
      continue;
    }
    
    // If answer contains C,D,F and expected contains C,D,F, mark as correct
    if (answerText.includes("Answer: C,D,F") && 
        answerText.includes("Expected: C")) {
      
      console.log(`Fixing row ${i+1} for ${mnemonic}`);
      
      // Mark as correct in audit log
      auditLogSheet.getRange(i+1, 5).setValue("Correct");
      
      // Award points (2 points for Q009)
      const currentScore = getCurrentScore(scoresSheet, mnemonic);
      updateScores(scoresSheet, mnemonic, "Q009", 2, new Date());
      
      // Mark as manually fixed
      auditLogSheet.getRange(i+1, 11).setValue("Manually Fixed");
      
      fixedEntries++;
    }
  }
  
  // Also fix in the raw responses sheet
  if (targetMnemonic) {
    const rawData = responsesSheet.getDataRange().getValues();
    
    for (let i = 1; i < rawData.length; i++) {
      const mnemonic = rawData[i][1]?.toLowerCase();
      
      if (mnemonic === targetMnemonic) {
        const answerData = parseAnswer(rawData[i][2]);
        
        if (answerData && answerData["Q009"] === "C,D,F") {
          responsesSheet.getRange(i+1, 6).setValue("Correct");
        }
      }
    }
  }
  
  // Update leaderboard
  updateLeaderboard();
  
  ui.alert("Fix Applied", `Fixed ${fixedEntries} entries for Q009.`, ui.ButtonSet.OK);
}
