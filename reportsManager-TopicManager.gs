/**
 * Topic Management functions for the Reports Manager
 * This script handles everything related to managing topics, policies,
 * and their associations with questions
 */

/**
 * Gets all available topics for UI dropdowns
 */

function getTopicOptions() {
  const topics = getAllTopics();
  return topics.map(topic => ({
    id: topic.id,
    name: topic.name,
    description: topic.description
  }));
}

/**
 * Gets all available policies for UI dropdowns
 */
function getPolicyOptions() {
  const policies = getAllPolicies();
  return policies.map(policy => ({
    id: policy.id,
    name: policy.name,
    description: policy.description
  }));
}

/**
 * @public
 * Returns all topics and policies for UI dropdowns
 * This function is called from reportsManager.gs and the HTML interface
 */
function getTopicsAndPolicies() {
  return {
    topics: getTopicOptions(),
    policies: getPolicyOptions()
  };
}

/**
 * @public
 * Gets all topics from the Topics sheet
 * This function is called from reportsManager.gs
 */
function getAllTopics() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Topics');

  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  const topics = [];

  // Skip header row
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) { // If TopicID exists
      topics.push({
        id: data[i][0],
        name: data[i][1],
        description: data[i][2] || ""
      });
    }
  }

  return topics;
}

/**
 * @public
 * Gets all policies from the Policies sheet
 * This function is called from reportsManager.gs
 */
function getAllPolicies() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Policies');

  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  const policies = [];

  // Skip header row
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) { // If PolicyID exists
      policies.push({
        id: data[i][0],
        name: data[i][1],
        description: data[i][2] || ""
      });
    }
  }

  return policies;
}

/**
 * @public
 * Gets all question-topic associations
 * This function is called from reportsManager.gs
 */
function getQuestionTopicAssociations() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Question-Topic Associations');

  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  const associations = [];

  // Skip header row
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] && data[i][1]) { // If both QuestionID and TopicID exist
      associations.push({
        questionId: data[i][0],
        topicId: data[i][1]
      });
    }
  }

  return associations;
}

/**
 * @public
 * Gets all question-policy associations
 * This function is called from reportsManager.gs
 */
function getQuestionPolicyAssociations() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Question-Policy Associations');

  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  const associations = [];

  // Skip header row
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] && data[i][1]) { // If both QuestionID and PolicyID exist
      associations.push({
        questionId: data[i][0],
        policyId: data[i][1]
      });
    }
  }

  return associations;
}

/**
 * Adds a new topic
 */
function addNewTopic(name, description) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Topics');

    if (!sheet) {
      throw new Error("Topics sheet not found. Please run ensureRequiredSheetsExist() first.");
    }

    // Generate a unique TopicID
    const data = sheet.getDataRange().getValues();
    let maxId = 0;

    // Skip header row
    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) {
        const id = parseInt(data[i][0].replace('T', ''), 10);
        if (!isNaN(id) && id > maxId) {
          maxId = id;
        }
      }
    }

    const newId = 'T' + (maxId + 1).toString().padStart(3, '0');

    // Add new topic
    sheet.appendRow([newId, name, description]);

    return {
      success: true,
      id: newId,
      name: name,
      description: description
    };
  } catch (error) {
    console.error("Error adding topic:", error.message);
    logError('Add Topic', error.message);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Adds a new policy
 */
function addNewPolicy(name, description) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Policies');

    if (!sheet) {
      throw new Error("Policies sheet not found. Please run ensureRequiredSheetsExist() first.");
    }

    // Generate a unique PolicyID
    const data = sheet.getDataRange().getValues();
    let maxId = 0;

    // Skip header row
    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) {
        const id = parseInt(data[i][0].replace('P', ''), 10);
        if (!isNaN(id) && id > maxId) {
          maxId = id;
        }
      }
    }

    const newId = 'P' + (maxId + 1).toString().padStart(3, '0');

    // Add new policy
    sheet.appendRow([newId, name, description]);

    return {
      success: true,
      id: newId,
      name: name,
      description: description
    };
  } catch (error) {
    console.error("Error adding policy:", error.message);
    logError('Add Policy', error.message);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Updates an existing topic
 */
function updateTopic(topicId, name, description) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Topics');

    if (!sheet) {
      throw new Error("Topics sheet not found.");
    }

    // Find the topic
    const data = sheet.getDataRange().getValues();
    let rowIndex = -1;

    // Skip header row
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === topicId) {
        rowIndex = i + 1; // +1 because array is 0-based but rows are 1-based
        break;
      }
    }

    if (rowIndex === -1) {
      throw new Error(`Topic with ID ${topicId} not found.`);
    }

    // Update the topic
    sheet.getRange(rowIndex, 2).setValue(name);
    sheet.getRange(rowIndex, 3).setValue(description);

    return {
      success: true,
      id: topicId,
      name: name,
      description: description
    };
  } catch (error) {
    console.error("Error updating topic:", error.message);
    logError('Update Topic', error.message);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Updates an existing policy
 */
function updatePolicy(policyId, name, description) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Policies');

    if (!sheet) {
      throw new Error("Policies sheet not found.");
    }

    // Find the policy
    const data = sheet.getDataRange().getValues();
    let rowIndex = -1;

    // Skip header row
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === policyId) {
        rowIndex = i + 1; // +1 because array is 0-based but rows are 1-based
        break;
      }
    }

    if (rowIndex === -1) {
      throw new Error(`Policy with ID ${policyId} not found.`);
    }

    // Update the policy
    sheet.getRange(rowIndex, 2).setValue(name);
    sheet.getRange(rowIndex, 3).setValue(description);

    return {
      success: true,
      id: policyId,
      name: name,
      description: description
    };
  } catch (error) {
    console.error("Error updating policy:", error.message);
    logError('Update Policy', error.message);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Deletes a topic and all its associations
 */
function deleteTopic(topicId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const topicsSheet = ss.getSheetByName('Topics');
    const associationsSheet = ss.getSheetByName('Question-Topic Associations');

    if (!topicsSheet) {
      throw new Error("Topics sheet not found.");
    }

    // Find and delete the topic
    const topicsData = topicsSheet.getDataRange().getValues();
    let topicRowIndex = -1;

    // Skip header row
    for (let i = 1; i < topicsData.length; i++) {
      if (topicsData[i][0] === topicId) {
        topicRowIndex = i + 1; // +1 because array is 0-based but rows are 1-based
        break;
      }
    }

    if (topicRowIndex === -1) {
      throw new Error(`Topic with ID ${topicId} not found.`);
    }

    // Delete the topic
    topicsSheet.deleteRow(topicRowIndex);

    // Delete all associations for this topic
    if (associationsSheet) {
      const associationsData = associationsSheet.getDataRange().getValues();
      const rowsToDelete = [];

      // Skip header row, and start from the bottom to avoid index shifting
      for (let i = associationsData.length - 1; i >= 1; i--) {
        if (associationsData[i][1] === topicId) {
          rowsToDelete.push(i + 1); // +1 because array is 0-based but rows are 1-based
        }
      }

      // Delete rows in reverse order to avoid index shifting
      for (let i = 0; i < rowsToDelete.length; i++) {
        associationsSheet.deleteRow(rowsToDelete[i]);
      }
    }

    return {
      success: true,
      message: `Topic ${topicId} and ${rowsToDelete ? rowsToDelete.length : 0} associations deleted successfully.`
    };
  } catch (error) {
    console.error("Error deleting topic:", error.message);
    logError('Delete Topic', error.message);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Deletes a policy and all its associations
 */
function deletePolicy(policyId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const policiesSheet = ss.getSheetByName('Policies');
    const associationsSheet = ss.getSheetByName('Question-Policy Associations');

    if (!policiesSheet) {
      throw new Error("Policies sheet not found.");
    }

    // Find and delete the policy
    const policiesData = policiesSheet.getDataRange().getValues();
    let policyRowIndex = -1;

    // Skip header row
    for (let i = 1; i < policiesData.length; i++) {
      if (policiesData[i][0] === policyId) {
        policyRowIndex = i + 1; // +1 because array is 0-based but rows are 1-based
        break;
      }
    }

    if (policyRowIndex === -1) {
      throw new Error(`Policy with ID ${policyId} not found.`);
    }

    // Delete the policy
    policiesSheet.deleteRow(policyRowIndex);

    // Delete all associations for this policy
    if (associationsSheet) {
      const associationsData = associationsSheet.getDataRange().getValues();
      const rowsToDelete = [];

      // Skip header row, and start from the bottom to avoid index shifting
      for (let i = associationsData.length - 1; i >= 1; i--) {
        if (associationsData[i][1] === policyId) {
          rowsToDelete.push(i + 1); // +1 because array is 0-based but rows are 1-based
        }
      }

      // Delete rows in reverse order to avoid index shifting
      for (let i = 0; i < rowsToDelete.length; i++) {
        associationsSheet.deleteRow(rowsToDelete[i]);
      }
    }

    return {
      success: true,
      message: `Policy ${policyId} and ${rowsToDelete ? rowsToDelete.length : 0} associations deleted successfully.`
    };
  } catch (error) {
    console.error("Error deleting policy:", error.message);
    logError('Delete Policy', error.message);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Gets topic and policy assignments for a specific question
 */
function getQuestionAssignments(questionId) {
  try {
    const topicAssociations = getQuestionTopicAssociations();
    const policyAssociations = getQuestionPolicyAssociations();

    // Get all topic IDs for this question
    const assignedTopicIds = topicAssociations
      .filter(a => a.questionId === questionId)
      .map(a => a.topicId);

    // Get all policy IDs for this question
    const assignedPolicyIds = policyAssociations
      .filter(a => a.questionId === questionId)
      .map(a => a.policyId);

    return {
      success: true,
      questionId: questionId,
      topicIds: assignedTopicIds,
      policyIds: assignedPolicyIds
    };
  } catch (error) {
    console.error("Error getting question assignments:", error.message);
    logError('Get Question Assignments', error.message);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Saves topic and policy assignments for a specific question
 */
function saveQuestionAssignments(questionId, selectedTopics, selectedPolicies) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const topicAssocSheet = ss.getSheetByName('Question-Topic Associations');
    const policyAssocSheet = ss.getSheetByName('Question-Policy Associations');

    if (!topicAssocSheet || !policyAssocSheet) {
      throw new Error("Association sheets not found. Please run ensureRequiredSheetsExist() first.");
    }

    // First, delete existing associations for this question
    const topicAssocData = topicAssocSheet.getDataRange().getValues();
    const topicRowsToDelete = [];

    // Skip header row, and start from the bottom to avoid index shifting
    for (let i = topicAssocData.length - 1; i >= 1; i--) {
      if (topicAssocData[i][0] === questionId) {
        topicRowsToDelete.push(i + 1); // +1 because array is 0-based but rows are 1-based
      }
    }

    // Delete rows in reverse order to avoid index shifting
    for (let i = 0; i < topicRowsToDelete.length; i++) {
      topicAssocSheet.deleteRow(topicRowsToDelete[i]);
    }

    // Do the same for policy associations
    const policyAssocData = policyAssocSheet.getDataRange().getValues();
    const policyRowsToDelete = [];

    // Skip header row, and start from the bottom to avoid index shifting
    for (let i = policyAssocData.length - 1; i >= 1; i--) {
      if (policyAssocData[i][0] === questionId) {
        policyRowsToDelete.push(i + 1); // +1 because array is 0-based but rows are 1-based
      }
    }

    // Delete rows in reverse order to avoid index shifting
    for (let i = 0; i < policyRowsToDelete.length; i++) {
      policyAssocSheet.deleteRow(policyRowsToDelete[i]);
    }

    // Add new topic associations
    for (const topicId of selectedTopics) {
      topicAssocSheet.appendRow([questionId, topicId]);
    }

    // Add new policy associations
    for (const policyId of selectedPolicies) {
      policyAssocSheet.appendRow([questionId, policyId]);
    }

    return {
      success: true,
      questionId: questionId,
      topicCount: selectedTopics.length,
      policyCount: selectedPolicies.length
    };
  } catch (error) {
    console.error("Error saving question assignments:", error.message);
    logError('Save Question Assignments', error.message);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Bulk assigns a topic to multiple questions
 */
function bulkAssignTopicToQuestions(topicId, questionIds) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const associationsSheet = ss.getSheetByName('Question-Topic Associations');

    if (!associationsSheet) {
      throw new Error("Question-Topic Associations sheet not found.");
    }

    // Get existing associations
    const existingAssociations = getQuestionTopicAssociations();

    // Count new associations added
    let addedCount = 0;

    // Add new associations if they don't already exist
    for (const questionId of questionIds) {
      // Check if this association already exists
      const exists = existingAssociations.some(a =>
        a.questionId === questionId && a.topicId === topicId
      );

      if (!exists) {
        associationsSheet.appendRow([questionId, topicId]);
        addedCount++;
      }
    }

    return {
      success: true,
      topicId: topicId,
      addedCount: addedCount
    };
  } catch (error) {
    console.error("Error bulk assigning topic:", error.message);
    logError('Bulk Assign Topic', error.message);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Bulk assigns a policy to multiple questions
 */
function bulkAssignPolicyToQuestions(policyId, questionIds) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const associationsSheet = ss.getSheetByName('Question-Policy Associations');

    if (!associationsSheet) {
      throw new Error("Question-Policy Associations sheet not found.");
    }

    // Get existing associations
    const existingAssociations = getQuestionPolicyAssociations();

    // Count new associations added
    let addedCount = 0;

    // Add new associations if they don't already exist
    for (const questionId of questionIds) {
      // Check if this association already exists
      const exists = existingAssociations.some(a =>
        a.questionId === questionId && a.policyId === policyId
      );

      if (!exists) {
        associationsSheet.appendRow([questionId, policyId]);
        addedCount++;
      }
    }

    return {
      success: true,
      policyId: policyId,
      addedCount: addedCount
    };
  } catch (error) {
    console.error("Error bulk assigning policy:", error.message);
    logError('Bulk Assign Policy', error.message);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Gets all questions for UI lists
 */
function getAllQuestions() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.QUESTION_BANK);
  const data = sheet.getDataRange().getValues();
  const questions = [];

  // Find column indexes
  const headers = data[0];
  const idCol = headers.indexOf("QuestionID") >= 0 ? headers.indexOf("QuestionID") : 1;
  const textCol = headers.indexOf("Question") >= 0 ? headers.indexOf("Question") : 2;
  const roleCol = headers.indexOf("Target Role") >= 0 ? headers.indexOf("Target Role") : 11;

  // Skip header row
  for (let i = 1; i < data.length; i++) {
    if (data[i][idCol]) {
      questions.push({
        id: data[i][idCol],
        text: truncateText(data[i][textCol], 100),
        role: data[i][roleCol]
      });
    }
  }

  // Sort by ID
  return questions.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * @public
 * Creates standard classification topics and policies if they don't exist
 * This function is called from reportsManager.gs
 */
function createStandardClassifications() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const topicsSheet = ss.getSheetByName('Topics');
  const policiesSheet = ss.getSheetByName('Policies');

  // Only create defaults if the sheets are empty (just headers)
  if (topicsSheet && topicsSheet.getLastRow() <= 1) {
    // Default topics
    const defaultTopics = [
      { id: 'T001', name: 'Patient Safety', description: 'Topics related to patient safety practices and protocols' },
      { id: 'T002', name: 'Infection Control', description: 'Infection prevention and control measures' },
      { id: 'T003', name: 'Medication Safety', description: 'Proper medication administration and safety' },
      { id: 'T004', name: 'Fall Prevention', description: 'Fall risk assessment and prevention' },
      { id: 'T005', name: 'Documentation', description: 'Proper clinical documentation practices' },
      { id: 'T006', name: 'Communication', description: 'Effective communication in healthcare settings' },
      { id: 'T007', name: 'Pain Management', description: 'Assessment and management of patient pain' }
    ];

    for (const topic of defaultTopics) {
      topicsSheet.appendRow([topic.id, topic.name, topic.description]);
    }
  }

  if (policiesSheet && policiesSheet.getLastRow() <= 1) {
    // Default policies
    const defaultPolicies = [
      { id: 'P001', name: 'CAUTI Prevention', description: 'Catheter-Associated Urinary Tract Infection Prevention' },
      { id: 'P002', name: 'CLABSI Prevention', description: 'Central Line-Associated Bloodstream Infection Prevention' },
      { id: 'P003', name: 'CDI Prevention', description: 'Clostridioides difficile Infection Prevention' },
      { id: 'P004', name: 'Falls Prevention', description: 'Protocols for preventing patient falls' },
      { id: 'P005', name: 'HAPI Prevention', description: 'Hospital-Acquired Pressure Injury Prevention' },
      { id: 'P006', name: 'Patient Identification', description: 'Proper patient identification procedures' },
      { id: 'P007', name: 'Handoff Communication', description: 'Safe handoff communication between caregivers' }
    ];

    for (const policy of defaultPolicies) {
      policiesSheet.appendRow([policy.id, policy.name, policy.description]);
    }
  }
}
