function testGetPointsForQuestion() {
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
  const points = getPointsForQuestion(sampleQuestion, questionBankData);

  console.log(`Sample Question: "${sampleQuestion}" | Points: ${points}`);
}

/**
 * Retrieves the points assigned to a given question from the Question Bank.
 */
function getPointsForQuestion(question, questionBankData) {
  for (let i = 1; i < questionBankData.length; i++) {
    if (questionBankData[i][1] === question) { // Column B contains questions
      return parseInt(questionBankData[i][9], 10) || 0; // Column J contains points
    }
  }
  return 0;
}
