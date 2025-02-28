function testGetUserRoles() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const scoresSheet = ss.getSheetByName("Scores");

  if (!scoresSheet) {
    console.error("ERROR: 'Scores' sheet does not exist or is inaccessible.");
    return;
  }

  const scoresData = scoresSheet.getDataRange().getValues();
  
  if (!scoresData || scoresData.length === 0) {
    console.error("ERROR: 'Scores' sheet is empty.");
    return;
  }

  const roles = getUserRoles(scoresData);
  console.log(`User Roles Retrieved: ${Object.keys(roles).length} found`);
}
