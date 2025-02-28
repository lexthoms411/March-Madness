function testGetCorrectAnswers() {
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
  const correctAnswers = getCorrectAnswers(sampleQuestion, questionBankData);

  console.log(`Sample Question: "${sampleQuestion}" | Correct Answers: ${correctAnswers.join(", ")}`);
}

/**
 * Retrieves the correct answers for a given question from the Question Bank.
 */
function getCorrectAnswers(question, questionBankData) {
  for (let i = 1; i < questionBankData.length; i++) {
    if (questionBankData[i][1] === question) { // Column B contains questions
      let correctAnswers = questionBankData[i][6]; // Column G contains correct answers
      return correctAnswers ? correctAnswers.split(",").map(ans => ans.trim()) : [];
    }
  }
  return [];
}
