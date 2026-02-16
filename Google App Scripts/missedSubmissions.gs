/**
 * Check for any submissions that haven't been processed yet
 * This can be run manually from the menu
 */
function checkForMissedSubmissions() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  const rawSheet = sheet.getSheetByName("Form Responses (Raw)");
  const processedSheet = sheet.getSheetByName("Processed Responses");
  
  // Show progress message
  SpreadsheetApp.getActiveSpreadsheet().toast("Checking for missed submissions...", "Processing", 30);
  
  try {
    // Get all submissions from Raw sheet
    const rawData = rawSheet.getDataRange().getValues();
    
    // Get all processed submissions
    const processedData = processedSheet.getDataRange().getValues();
    const processedKeys = new Set();
    
    // Skip header row
    for (let i = 1; i < processedData.length; i++) {
      if (processedData[i][0] && processedData[i][1]) {
        const key = `${processedData[i][0].toString()}_${processedData[i][1].toString().toLowerCase()}`;
        processedKeys.add(key);
      }
    }
    
    // Look for unprocessed submissions
    let missedCount = 0;
    for (let i = 1; i < rawData.length; i++) {
      const timestamp = rawData[i][0];
      const mnemonic = rawData[i][1];
      
      if (timestamp && mnemonic) {
        const key = `${timestamp.toString()}_${mnemonic.toString().toLowerCase()}`;
        
        // If not processed and not marked as Graded
        if (!processedKeys.has(key) && rawData[i][4] !== "Yes") {
          console.log(`Found missed submission: ${mnemonic} from ${timestamp}`);
          
          // Add to processing queue
          const queueSheet = sheet.getSheetByName("Processing Queue");
          if (queueSheet) {
            queueSheet.appendRow([timestamp, mnemonic, "No", ""]);
            missedCount++;
          }
        }
      }
    }
    
    // Show completion message
    if (missedCount > 0) {
      SpreadsheetApp.getActiveSpreadsheet().toast(
        `Found and queued ${missedCount} missed submissions. Running queue processor now...`,
        "Found Missed Submissions", 
        5
      );
      
      // Process the queue immediately
      processQueue();
    } else {
      SpreadsheetApp.getActiveSpreadsheet().toast(
        "No missed submissions found. Everything is up to date!",
        "Check Complete", 
        5
      );
    }
    
    return missedCount;
  } catch (error) {
    console.error("Error checking for missed submissions:", error);
    SpreadsheetApp.getActiveSpreadsheet().toast(
      `Error: ${error.message}`, 
      "Check Failed", 
      10
    );
    return 0;
  }
}

/**
 * Creates time-based triggers for today's evening and tomorrow's early morning
 * This helps ensure all submissions are processed before determining round winners
 */
/**
 * Creates time-based triggers for today's evening and tomorrow's early morning
 * This helps ensure all submissions are processed before determining round winners
 */
/**
 * Creates time-based triggers for today's evening and tomorrow's early morning
 * This helps ensure all submissions are processed before determining round winners
 */
function createDeadlineTriggers() {
  const ui = SpreadsheetApp.getUi();
  
  // Show confirmation dialog
  const response = ui.alert(
    'Create Deadline Triggers', 
    'This will create triggers to check for missed submissions tonight (11:00 PM and 11:45 PM) and early tomorrow morning (12:30 AM).\n\nProceed?',
    ui.ButtonSet.YES_NO
  );
  
  if (response !== ui.Button.YES) {
    return;
  }
  
  try {
    // Delete any existing triggers for this function first
    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'checkForMissedSubmissions') {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }
    
    // Get the current date
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Calculate target times (tonight at 11pm, 11:45pm, and tomorrow at 12:30am)
    const tonight11pm = new Date(today);
    tonight11pm.setHours(23, 0, 0, 0);
    
    const tonight1145pm = new Date(today);
    tonight1145pm.setHours(23, 45, 0, 0);
    
    const tomorrow1230am = new Date(today);
    tomorrow1230am.setDate(tomorrow1230am.getDate() + 1);
    tomorrow1230am.setHours(0, 30, 0, 0);
    
    // Check if we need to schedule for tomorrow instead (if current time is after target time)
    if (now > tonight11pm) {
      tonight11pm.setDate(tonight11pm.getDate() + 1);
    }
    
    if (now > tonight1145pm) {
      tonight1145pm.setDate(tonight1145pm.getDate() + 1);
    }
    
    if (now > tomorrow1230am) {
      tomorrow1230am.setDate(tomorrow1230am.getDate() + 1);
    }
    
    // Create triggers with proper timing
    // 11:00 PM trigger
    ScriptApp.newTrigger('checkForMissedSubmissions')
      .timeBased()
      .at(tonight11pm)
      .create();
    
    // 11:45 PM trigger
    ScriptApp.newTrigger('checkForMissedSubmissions')
      .timeBased()
      .at(tonight1145pm)
      .create();
    
    // 12:30 AM trigger
    ScriptApp.newTrigger('checkForMissedSubmissions')
      .timeBased()
      .at(tomorrow1230am)
      .create();
    
    // Show success message with formatted times
    const timeFormat = {hour: '2-digit', minute: '2-digit', hour12: true};
    ui.alert(
      'Triggers Created',
      `Deadline triggers created successfully for:\n` +
      `- ${tonight11pm.toLocaleTimeString(undefined, timeFormat)}\n` +
      `- ${tonight1145pm.toLocaleTimeString(undefined, timeFormat)}\n` +
      `- ${tomorrow1230am.toLocaleTimeString(undefined, timeFormat)} (tomorrow)`,
      ui.ButtonSet.OK
    );
    
    console.log("Deadline triggers created successfully");
  } catch (error) {
    console.error("Error creating deadline triggers:", error);
    ui.alert(
      'Error',
      `Failed to create triggers: ${error.message}`,
      ui.ButtonSet.OK
    );
  }
}