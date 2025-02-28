
function processResponse() {
  // Copy response data
  copyResponse()
  
  scoreResponses()
  
  
  
  
}


var scriptLock = LockService.getScriptLock();
var allProperties = PropertiesService.getScriptProperties();
var spreadsheets = SpreadsheetApp.openById('1KdWRHJX2Qe2j6XCgrLyJp_E_SAx6oBquNkjvsUE0ByU');

function copyResponse() {
  let sheet = spreadsheets.getSheetByName('Form Responses');
  let lastR = sheet.getLastRow();
  let lastC = sheet.getLastColumn();

  let timestamps = sheet.getRange(2, 1, lastR - 1, 1).getValues().flat();
  for (let i = 0; i < timestamps.length; i++) {
    let timestamp = Utilities.formatDate(timestamps[i], Session.getScriptTimeZone(), "M/d/yyyy HH:mm:ss");
    if (allProperties.getProperty(timestamp)) {continue;}

    let rowN = i + 2;
    let data = sheet.getRange(rowN, 1, 1, lastC).getValues().flat();

    let mnemonic = data[2].toLowerCase();
    let role = data[3].toUpperCase();
    let qID;
    let answer;
    let column = 5;
    for (let ii = 4; ii < data.length; ii++) {
      if (data[ii] == '') {
        column++
      } else {
        qID = sheet.getRange(1, column).getValue().match(/\[(q\d+)\]/i)[1];
        answer = sheet.getRange(rowN, column).getValue();

        break;
      }
    }
       
    scriptLock.tryLock(5000); try {
      let sheet = spreadsheets.getSheetByName('Processed Responses');
      sheet.appendRow(['NEW', timestamp, mnemonic, role, qID, answer]);
      SpreadsheetApp.flush();

      allProperties.setProperty(timestamp, 'x');
    } catch (error) {throw error;}
    finally {scriptLock.releaseLock();}
  }
}





function scoreResponses() {
  
}







function testScript() {
  let sheet = spreadsheets.getSheetByName('Form Responses');
  let lastR = sheet.getLastRow();

  let timestamps = sheet.getRange(2, 1, lastR - 1, 1).getValues().flat();
  //Logger.log(timestamps);

  for (let i = 0; i < timestamps.length; i++) {
    let timestamp = Utilities.formatDate(timestamps[i], Session.getScriptTimeZone(), "M/d/yyyy HH:mm:ss");
    if (allProperties.getProperty(timestamp)) {Logger.log(true)}
    else {Logger.log(false);}

  }
}

