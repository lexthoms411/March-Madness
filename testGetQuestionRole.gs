function testGetQuestionRole() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const questionBankSheet = ss.getSheetByName("Question Bank");

  if (!questionBankSheet) {
    console.error("ERROR: 'Question Bank' sheet does not exist or is inaccessible.");
    return;
  }

  const questionBankData = questionBankSheet.getDataRange().getValues();
  
  if (!questionBankData || questionBankData.length === 0) {
    console.error("ERROR: 'Question Bank' sheet is empty.");
    return;
  }

  const sampleQuestion = questionBankData[1][1]; // Get the first actual question (skip header)
  const role = getQuestionRole(sampleQuestion, questionBankData);

  console.log(`Sample Question: "${sampleQuestion}" | Assigned Role: ${role}`);
}
