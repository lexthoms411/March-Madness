function testScript1() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  const scoresSheet = sheet.getSheetByName('Scores');
  const validMnemonics = scoresSheet.getRange(`A2:A${scoresSheet.getLastRow()}`).getValues().flat();
        //.map(row => row[0]?.toLowerCase())
        //.filter(Boolean);

  Logger.log(validMnemonics);
}

function testScript2() {
  const processedResponses = new Set();

  let sheet = SpreadsheetApp.openById('1KdWRHJX2Qe2j6XCgrLyJp_E_SAx6oBquNkjvsUE0ByU');
  const auditLogSheet = sheet.getSheetByName('Audit Log');
  const auditData = auditLogSheet.getDataRange().getValues();

  for (let i = 1; i < auditData.length; i++) {
    const key = `${auditData[i][0]}_${auditData[i][1]}_${auditData[i][2]}`.toLowerCase();
    Logger.log(key);
    processedResponses.add(key);
  }

  Logger.log(processedResponses);
}

function testScript3() {
  let question = `[Q001] When should a needleless connector be changed? Type 14`;

  let qID = question.match(/\[(q\d+)\]/i)[1];
  Logger.log(qID);
}