function testIsValidResponse() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const scoresSheet = ss.getSheetByName("Scores");
  const questionBankSheet = ss.getSheetByName("Question Bank");

  if (!scoresSheet || !questionBankSheet) {
    console.error("ERROR: One or more sheets are missing.");
    return;
  }

  const scoresData = scoresSheet.getDataRange().getValues();
  const questionBankData = questionBankSheet.getDataRange().getValues();

  if (!scoresData || scoresData.length === 0 || !questionBankData || questionBankData.length === 0) {
    console.error("ERROR: One or more sheets are empty.");
    return;
  }

  const sampleMnemonic = scoresData[1][0]; // Assuming mnemonics are in column A
  const sampleQuestion = questionBankData[1][1]; // Assuming questions are in column B
  const sampleRole = getUserRoles(scoresData)[sampleMnemonic]; // Get the role for this mnemonic
  const questionRole = getQuestionRole(sampleQuestion, questionBankData); // Get the role assigned to the question
  const isValid = isValidResponse(sampleMnemonic, sampleRole, questionRole);

  console.log(`Mnemonic: "${sampleMnemonic}" | User Role: ${sampleRole} | Question Role: ${questionRole} | Valid Response: ${isValid}`);
}

/**
 * Checks if a response is valid based on the user's role and the question's assigned role.
 */
function isValidResponse(mnemonic, userRole, questionRole) {
  if (!mnemonic || !userRole) {
    return false; // Invalid if mnemonic or user role is missing
  }

  return userRole === questionRole; // Only valid if user's role matches the question's assigned role
}
