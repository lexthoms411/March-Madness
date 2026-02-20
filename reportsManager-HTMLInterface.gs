/**
 * Returns the HTML content for the Reports Manager dialog
 */
function getReportsManagerHtml() {
  return `<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; color: #333; font-size: 14px; }
    .container { padding: 16px; }
    .tabs { display: flex; border-bottom: 1px solid #ccc; margin-bottom: 16px; }
    .tab { padding: 8px 16px; cursor: pointer; border: 1px solid transparent; border-bottom: none; margin-right: 4px; border-radius: 4px 4px 0 0; }
    .tab.active { background-color: #f8f8f8; border-color: #ccc; font-weight: bold; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    h2 { margin-top: 0; margin-bottom: 16px; color: #4285f4; font-size: 18px; }
    .form-group { margin-bottom: 12px; }
    label { display: block; margin-bottom: 4px; font-weight: bold; }
    input[type="text"], input[type="date"], select, textarea { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
    .checkbox-group { margin: 8px 0; }
    .checkbox-label { font-weight: normal; display: flex; align-items: center; }
    .checkbox-label input { margin-right: 8px; }
    .button-container { margin-top: 16px; text-align: right; }
    button { padding: 8px 16px; background-color: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
    button:hover { background-color: #2a75f3; }
    .loading { display: none; text-align: center; padding: 20px; }
    .loading-spinner { border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 30px; height: 30px; animation: spin 2s linear infinite; margin: 0 auto 10px; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .alert { padding: 8px 16px; border-radius: 4px; margin-bottom: 16px; display: none; }
    .alert-success { background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
    .alert-error { background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
    .sub-section { background-color: #f8f8f8; padding: 12px; border-radius: 4px; margin-bottom: 16px; border: 1px solid #eee; }
    .sub-section h3 { margin-top: 0; margin-bottom: 12px; font-size: 16px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th, td { padding: 8px; text-align: left; border: 1px solid #ddd; }
    th { background-color: #f2f2f2; font-weight: bold; }
    tr:nth-child(even) { background-color: #f9f9f9; }
    .action-buttons { display: flex; gap: 8px; }
    .edit-btn { background-color: #ffc107; color: #333; padding: 4px 8px; border-radius: 4px; cursor: pointer; }
    .delete-btn { background-color: #dc3545; color: white; padding: 4px 8px; border-radius: 4px; cursor: pointer; }
    .dialog-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(0,0,0,0.5); z-index: 1000; }
    .dialog { background-color: white; padding: 20px; border-radius: 8px; max-width: 500px; margin: 100px auto; }
    .dialog-buttons { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
    .two-columns { display: flex; gap: 16px; }
    .column { flex: 1; }
    .question-list { max-height: 300px; overflow-y: auto; border: 1px solid #ddd; padding: 8px; margin-bottom: 16px; }
    .question-item { padding: 6px; border-bottom: 1px solid #eee; cursor: pointer; }
    .question-item:hover { background-color: #f5f5f5; }
    .question-item.selected { background-color: #e6f7ff; border-left: 3px solid #1890ff; }
  </style>
</head>
<body>
  <div class="container">
    <div class="tabs">
      <div class="tab active" data-tab="report-generator">Generate Reports</div>
      <div class="tab" data-tab="topic-manager">Manage Topics</div>
      <div class="tab" data-tab="question-assignment">Question Assignment</div>
    </div>

    <!-- Report Generator Tab -->
    <div id="report-generator" class="tab-content active">
      <h2>Generate Quiz Report</h2>

      <div id="report-success-alert" class="alert alert-success"></div>
      <div id="report-error-alert" class="alert alert-error"></div>

      <div class="form-group">
        <label for="report-name">Report Name:</label>
        <input type="text" id="report-name" placeholder="March Madness Quiz Report" value="March Madness Quiz Report">
      </div>

      <div class="form-group">
        <label for="role-filter">Filter by Role:</label>
        <select id="role-filter">
          <option value="All">All Roles</option>
          <option value="RN">RN Only</option>
          <option value="PCA">PCA Only</option>
          <option value="LPN">LPN Only</option>
        </select>
      </div>

      <div class="form-group">
        <label for="excluded-mnemonics">Exclude Mnemonics (comma separated):</label>
        <input type="text" id="excluded-mnemonics" placeholder="e.g., athoms,amoyer1" value="athoms,amoyer1">
        <div style="font-size: 12px; color: #666; margin-top: 4px;">
          Admin mnemonics will be excluded from calculations
        </div>
      </div>

      <div class="form-group">
        <label for="excluded-questions">Exclude Questions (comma separated):</label>
        <input type="text" id="excluded-questions" placeholder="e.g., Q063,Q064,Q065,Q066,Q998,Q999" value="Q063,Q064,Q065,Q066,Q998,Q999">
        <div style="font-size: 12px; color: #666; margin-top: 4px;">
          Questions to exclude from all calculations
        </div>
      </div>

      <div class="sub-section">
        <h3>Report Sections to Include:</h3>

        <div class="checkbox-group">
          <label class="checkbox-label">
            <input type="checkbox" id="include-overall-stats" checked>
            Overall Statistics
          </label>
        </div>

        <div class="checkbox-group">
          <label class="checkbox-label">
            <input type="checkbox" id="include-participation-trend" checked>
            Participation Trend Analysis
          </label>
        </div>

        <div class="checkbox-group">
          <label class="checkbox-label">
            <input type="checkbox" id="include-question-stats" checked>
            Question Performance Statistics
          </label>
        </div>

        <div class="checkbox-group">
          <label class="checkbox-label">
            <input type="checkbox" id="include-topic-analysis" checked>
            Topic/Policy Analysis
          </label>
        </div>

        <div class="checkbox-group">
          <label class="checkbox-label">
            <input type="checkbox" id="include-problem-areas" checked>
            Problem Areas Identification
          </label>
        </div>

        <div class="checkbox-group">
          <label class="checkbox-label">
            <input type="checkbox" id="flag-duplicates" checked>
            Flag Questions with Duplicate Responses
          </label>
        </div>

        <div class="checkbox-group">
          <label class="checkbox-label">
            <input type="checkbox" id="include-visualizations" checked>
            Include Visualizations (Charts)
          </label>
        </div>
      </div>

      <div class="button-container">
        <button id="generate-report-btn">Generate Report</button>
      </div>
    </div>

    <!-- Topic Manager Tab -->
    <div id="topic-manager" class="tab-content">
      <h2>Manage Topics & Policies</h2>
      
      <div id="topic-success-alert" class="alert alert-success"></div>
      <div id="topic-error-alert" class="alert alert-error"></div>
      
      <div class="two-columns">
        <div class="column">
          <h3>Topics</h3>
          <table id="topics-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="topics-list">
              <!-- Topics will be populated here -->
              <tr><td colspan="4">Loading topics...</td></tr>
            </tbody>
          </table>
          
          <div class="button-container">
            <button id="add-topic-btn">Add New Topic</button>
          </div>
        </div>
        
        <div class="column">
          <h3>Policies</h3>
          <table id="policies-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="policies-list">
              <!-- Policies will be populated here -->
              <tr><td colspan="4">Loading policies...</td></tr>
            </tbody>
          </table>
          
          <div class="button-container">
            <button id="add-policy-btn">Add New Policy</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Question Assignment Tab -->
    <div id="question-assignment" class="tab-content">
      <h2>Assign Topics & Policies to Questions</h2>
      
      <div id="assignment-success-alert" class="alert alert-success"></div>
      <div id="assignment-error-alert" class="alert alert-error"></div>
      
      <div class="two-columns">
        <div class="column">
          <h3>Select Question</h3>
          <div class="form-group">
            <label for="role-filter-qa">Filter by Role:</label>
            <select id="role-filter-qa">
              <option value="All">All Roles</option>
              <option value="RN">RN Only</option>
              <option value="PCA">PCA Only</option>
              <option value="LPN">LPN Only</option>
            </select>
          </div>
          
          <div class="question-list" id="question-list">
            <!-- Questions will be populated here -->
            <div class="question-item">Loading questions...</div>
          </div>
        </div>
        
        <div class="column">
          <h3>Assign Classifications</h3>
          <div id="question-details">
            <p>Select a question to see its details and assign topics/policies.</p>
          </div>
          
          <div id="question-assignments" style="display: none;">
            <div class="form-group">
              <label>Topics:</label>
              <div id="topic-options" class="sub-section">
                <!-- Topics will be populated here as checkboxes -->
                <p>Loading topics...</p>
              </div>
            </div>
            
            <div class="form-group">
              <label>Policies:</label>
              <div id="policy-options" class="sub-section">
                <!-- Policies will be populated here as checkboxes -->
                <p>Loading policies...</p>
              </div>
            </div>
            
            <div class="button-container">
              <button id="save-assignments-btn">Save Assignments</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Loading Overlay -->
    <div id="loading" class="loading">
      <div class="loading-spinner"></div>
      <p>Processing request...</p>
    </div>

    <!-- Topic Dialog -->
    <div id="topic-dialog-overlay" class="dialog-overlay">
      <div class="dialog">
        <h3 id="topic-dialog-title">Add New Topic</h3>
        
        <div class="form-group">
          <label for="topic-name">Topic Name:</label>
          <input type="text" id="topic-name" placeholder="Enter topic name">
        </div>
        
        <div class="form-group">
          <label for="topic-description">Description:</label>
          <textarea id="topic-description" placeholder="Enter topic description" rows="3"></textarea>
        </div>
        
        <input type="hidden" id="topic-id">
        
        <div class="dialog-buttons">
          <button id="cancel-topic-btn">Cancel</button>
          <button id="save-topic-btn">Save</button>
        </div>
      </div>
    </div>
    
    <!-- Policy Dialog -->
    <div id="policy-dialog-overlay" class="dialog-overlay">
      <div class="dialog">
        <h3 id="policy-dialog-title">Add New Policy</h3>
        
        <div class="form-group">
          <label for="policy-name">Policy Name:</label>
          <input type="text" id="policy-name" placeholder="Enter policy name">
        </div>
        
        <div class="form-group">
          <label for="policy-description">Description:</label>
          <textarea id="policy-description" placeholder="Enter policy description" rows="3"></textarea>
        </div>
        
        <input type="hidden" id="policy-id">
        
        <div class="dialog-buttons">
          <button id="cancel-policy-btn">Cancel</button>
          <button id="save-policy-btn">Save</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    // Variables to store data
    let topics = [];
    let policies = [];
    let questions = [];
    let currentQuestionId = null;
    
    // Tab navigation
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        // Hide all tab contents
        document.querySelectorAll('.tab-content').forEach(content => {
          content.classList.remove('active');
        });

        // Remove active class from all tabs
        document.querySelectorAll('.tab').forEach(t => {
          t.classList.remove('active');
        });

        // Show the selected tab content
        const tabId = tab.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');

        // Mark the clicked tab as active
        tab.classList.add('active');

        // Handle tab-specific initialization
        if (tabId === 'topic-manager') {
          loadTopicsAndPolicies();
        } else if (tabId === 'question-assignment') {
          loadQuestionsAndClassifications();
        }
      });
    });

    // Generate Report
    document.getElementById('generate-report-btn').addEventListener('click', generateReport);

    function generateReport() {
      showLoading(true);
      
      // Clear any existing alerts
      document.getElementById('report-success-alert').style.display = 'none';
      document.getElementById('report-error-alert').style.display = 'none';

      // Get form values
      const options = {
        reportName: document.getElementById('report-name').value,
        roleFilter: document.getElementById('role-filter').value,
        excludedMnemonics: document.getElementById('excluded-mnemonics').value,
        excludedQuestions: document.getElementById('excluded-questions').value,
        includeOverallStats: document.getElementById('include-overall-stats').checked,
        includeParticipationTrend: document.getElementById('include-participation-trend').checked,
        includeQuestionStats: document.getElementById('include-question-stats').checked,
        includeTopicAnalysis: document.getElementById('include-topic-analysis').checked,
        includeProblemAreas: document.getElementById('include-problem-areas').checked,
        flagDuplicates: document.getElementById('flag-duplicates').checked,
        includeVisualizations: document.getElementById('include-visualizations').checked
      };

      // Call server-side function
      google.script.run
        .withSuccessHandler(function(result) {
          showLoading(false);
          if (result.success) {
            showAlert('report-success-alert', result.message);
          } else {
            showAlert('report-error-alert', result.message || 'An error occurred');
          }
        })
        .withFailureHandler(function(error) {
          showLoading(false);
          showAlert('report-error-alert', 'Error: ' + (error.message || error));
        })
        .generateReport(options);
    }
    
    // Topic Manager Functions
    function loadTopicsAndPolicies() {
      showLoading(true);
      
      google.script.run
        .withSuccessHandler(function(result) {
          topics = result.topics || [];
          policies = result.policies || [];
          
          renderTopics();
          renderPolicies();
          showLoading(false);
        })
        .withFailureHandler(function(error) {
          showLoading(false);
          showAlert('topic-error-alert', 'Error loading topics and policies: ' + (error.message || error));
        })
        .getTopicsAndPolicies();
    }
    
    function renderTopics() {
      const topicsList = document.getElementById('topics-list');
  
      if (topics.length === 0) {
        topicsList.innerHTML = '<tr><td colspan="4">No topics found. Click "Add New Topic" to create one.</td></tr>';
        return;
      }
  
      topicsList.innerHTML = topics.map(topic => 
        '<tr>' +
          '<td>' + topic.id + '</td>' +
          '<td>' + topic.name + '</td>' +
          '<td>' + truncateText(topic.description || '', 50) + '</td>' +
          '<td class="action-buttons">' +
            '<span class="edit-btn" data-id="' + topic.id + '">Edit</span> ' +
            '<span class="delete-btn" data-id="' + topic.id + '">Delete</span>' +
          '</td>' +
        '</tr>'
      ).join('');
  
      // Add event listeners using event delegation
      topicsList.addEventListener('click', function(event) {
        if (event.target.classList.contains('edit-btn')) {
          editTopic(event.target.getAttribute('data-id'));
        } else if (event.target.classList.contains('delete-btn')) {
          deleteTopic(event.target.getAttribute('data-id'));
        }
      });
    }

    function renderPolicies() {
      const policiesList = document.getElementById('policies-list');
  
      if (policies.length === 0) {
        policiesList.innerHTML = '<tr><td colspan="4">No policies found. Click "Add New Policy" to create one.</td></tr>';
        return;
      }
  
      policiesList.innerHTML = policies.map(policy => 
        '<tr>' +
          '<td>' + policy.id + '</td>' +
          '<td>' + policy.name + '</td>' +
          '<td>' + truncateText(policy.description || '', 50) + '</td>' +
          '<td class="action-buttons">' +
            '<span class="edit-btn" data-id="' + policy.id + '">Edit</span> ' +
            '<span class="delete-btn" data-id="' + policy.id + '">Delete</span>' +
          '</td>' +
        '</tr>'
      ).join('');
  
      // Add event listeners using event delegation
      policiesList.addEventListener('click', function(event) {
        if (event.target.classList.contains('edit-btn')) {
          editPolicy(event.target.getAttribute('data-id'));
        } else if (event.target.classList.contains('delete-btn')) {
          deletePolicy(event.target.getAttribute('data-id'));
        }
      });
    }
    
    // Add/Edit Topic Functions
    document.getElementById('add-topic-btn').addEventListener('click', () => {
      document.getElementById('topic-dialog-title').textContent = 'Add New Topic';
      document.getElementById('topic-id').value = '';
      document.getElementById('topic-name').value = '';
      document.getElementById('topic-description').value = '';
      document.getElementById('topic-dialog-overlay').style.display = 'block';
    });
    
    window.editTopic = function(topicId) {
      const topic = topics.find(t => t.id === topicId);
      if (!topic) return;
      
      document.getElementById('topic-dialog-title').textContent = 'Edit Topic';
      document.getElementById('topic-id').value = topic.id;
      document.getElementById('topic-name').value = topic.name;
      document.getElementById('topic-description').value = topic.description || '';
      document.getElementById('topic-dialog-overlay').style.display = 'block';
    };
    
    window.deleteTopic = function(topicId) {
      if (confirm('Are you sure you want to delete this topic? This will also remove all associated question assignments.')) {
        showLoading(true);
        
        google.script.run
          .withSuccessHandler(function(result) {
            if (result.success) {
              // Remove topic from local array
              topics = topics.filter(t => t.id !== topicId);
              renderTopics();
              showAlert('topic-success-alert', 'Topic deleted successfully');
            } else {
              showAlert('topic-error-alert', result.message || 'Failed to delete topic');
            }
            showLoading(false);
          })
          .withFailureHandler(function(error) {
            showLoading(false);
            showAlert('topic-error-alert', 'Error: ' + (error.message || error));
          })
          .deleteTopic(topicId);
      }
    };
    
    document.getElementById('cancel-topic-btn').addEventListener('click', () => {
      document.getElementById('topic-dialog-overlay').style.display = 'none';
    });
    
    document.getElementById('save-topic-btn').addEventListener('click', () => {
      const topicId = document.getElementById('topic-id').value;
      const name = document.getElementById('topic-name').value;
      const description = document.getElementById('topic-description').value;
      
      if (!name) {
        alert('Please enter a topic name');
        return;
      }
      
      showLoading(true);
      
      if (topicId) {
        // Update existing topic
        google.script.run
          .withSuccessHandler(function(result) {
            if (result.success) {
              // Update topic in local array
              const index = topics.findIndex(t => t.id === topicId);
              if (index >= 0) {
                topics[index] = result;
              }
              renderTopics();
              document.getElementById('topic-dialog-overlay').style.display = 'none';
              showAlert('topic-success-alert', 'Topic updated successfully');
            } else {
              showAlert('topic-error-alert', result.message || 'Failed to update topic');
            }
            showLoading(false);
          })
          .withFailureHandler(function(error) {
            showLoading(false);
            showAlert('topic-error-alert', 'Error: ' + (error.message || error));
          })
          .updateTopic(topicId, name, description);
      } else {
        // Add new topic
        google.script.run
          .withSuccessHandler(function(result) {
            if (result.success) {
              // Add topic to local array
              topics.push(result);
              renderTopics();
              document.getElementById('topic-dialog-overlay').style.display = 'none';
              showAlert('topic-success-alert', 'Topic added successfully');
            } else {
              showAlert('topic-error-alert', result.message || 'Failed to add topic');
            }
            showLoading(false);
          })
          .withFailureHandler(function(error) {
            showLoading(false);
            showAlert('topic-error-alert', 'Error: ' + (error.message || error));
          })
          .addNewTopic(name, description);
      }
    });
    
    // Add/Edit Policy Functions
    document.getElementById('add-policy-btn').addEventListener('click', () => {
      document.getElementById('policy-dialog-title').textContent = 'Add New Policy';
      document.getElementById('policy-id').value = '';
      document.getElementById('policy-name').value = '';
      document.getElementById('policy-description').value = '';
      document.getElementById('policy-dialog-overlay').style.display = 'block';
    });
    
    window.editPolicy = function(policyId) {
      const policy = policies.find(p => p.id === policyId);
      if (!policy) return;
      
      document.getElementById('policy-dialog-title').textContent = 'Edit Policy';
      document.getElementById('policy-id').value = policy.id;
      document.getElementById('policy-name').value = policy.name;
      document.getElementById('policy-description').value = policy.description || '';
      document.getElementById('policy-dialog-overlay').style.display = 'block';
    };
    
    window.deletePolicy = function(policyId) {
      if (confirm('Are you sure you want to delete this policy? This will also remove all associated question assignments.')) {
        showLoading(true);
        
        google.script.run
          .withSuccessHandler(function(result) {
            if (result.success) {
              // Remove policy from local array
              policies = policies.filter(p => p.id !== policyId);
              renderPolicies();
              showAlert('topic-success-alert', 'Policy deleted successfully');
            } else {
              showAlert('topic-error-alert', result.message || 'Failed to delete policy');
            }
            showLoading(false);
          })
          .withFailureHandler(function(error) {
            showLoading(false);
            showAlert('topic-error-alert', 'Error: ' + (error.message || error));
          })
          .deletePolicy(policyId);
      }
    };
    
    document.getElementById('cancel-policy-btn').addEventListener('click', () => {
      document.getElementById('policy-dialog-overlay').style.display = 'none';
    });
    
    document.getElementById('save-policy-btn').addEventListener('click', () => {
      const policyId = document.getElementById('policy-id').value;
      const name = document.getElementById('policy-name').value;
      const description = document.getElementById('policy-description').value;
      
      if (!name) {
        alert('Please enter a policy name');
        return;
      }
      
      showLoading(true);
      
      if (policyId) {
        // Update existing policy
        google.script.run
          .withSuccessHandler(function(result) {
            if (result.success) {
              // Update policy in local array
              const index = policies.findIndex(p => p.id === policyId);
              if (index >= 0) {
                policies[index] = result;
              }
              renderPolicies();
              document.getElementById('policy-dialog-overlay').style.display = 'none';
              showAlert('topic-success-alert', 'Policy updated successfully');
            } else {
              showAlert('topic-error-alert', result.message || 'Failed to update policy');
            }
            showLoading(false);
          })
          .withFailureHandler(function(error) {
            showLoading(false);
            showAlert('topic-error-alert', 'Error: ' + (error.message || error));
          })
          .updatePolicy(policyId, name, description);
      } else {
        // Add new policy
        google.script.run
          .withSuccessHandler(function(result) {
            if (result.success) {
              // Add policy to local array
              policies.push(result);
              renderPolicies();
              document.getElementById('policy-dialog-overlay').style.display = 'none';
              showAlert('topic-success-alert', 'Policy added successfully');
            } else {
              showAlert('topic-error-alert', result.message || 'Failed to add policy');
            }
            showLoading(false);
          })
          .withFailureHandler(function(error) {
            showLoading(false);
            showAlert('topic-error-alert', 'Error: ' + (error.message || error));
          })
          .addNewPolicy(name, description);
      }
    });
    
    // Question Assignment Functions
    function loadQuestionsAndClassifications() {
      showLoading(true);
      
      // Load topics and policies if not already loaded
      if (topics.length === 0 || policies.length === 0) {
        google.script.run
          .withSuccessHandler(function(result) {
            topics = result.topics || [];
            policies = result.policies || [];
            loadQuestions();
          })
          .withFailureHandler(function(error) {
            showLoading(false);
            showAlert('assignment-error-alert', 'Error loading topics and policies: ' + (error.message || error));
          })
          .getTopicsAndPolicies();
      } else {
        loadQuestions();
      }
    }
    
    function loadQuestions() {
      const roleFilter = document.getElementById('role-filter-qa').value;
      
      google.script.run
        .withSuccessHandler(function(allQuestions) {
          questions = allQuestions;
          
          // Filter by role if needed
          if (roleFilter !== 'All') {
            questions = questions.filter(q => q.role === roleFilter);
          }
          
          renderQuestionList();
          showLoading(false);
        })
        .withFailureHandler(function(error) {
          showLoading(false);
          showAlert('assignment-error-alert', 'Error loading questions: ' + (error.message || error));
        })
        .getAllQuestions();
    }
    
    function renderQuestionList() {
      const questionList = document.getElementById('question-list');
  
      if (questions.length === 0) {
        questionList.innerHTML = '<div class="question-item">No questions found with the selected filter.</div>';
        return;
      }
  
      // Replace problematic template string with concatenated strings
      questionList.innerHTML = questions.map(question => 
        '<div class="question-item" data-id="' + question.id + '">' +
          '<strong>' + question.id + '</strong> - ' + question.role + '<br>' +
          truncateText(question.text, 100) +
        '</div>'
      ).join('');
  
      // Add event listeners for the question items
      const questionItems = document.querySelectorAll('.question-item');
      questionItems.forEach(item => {
        item.addEventListener('click', function() {
          const questionId = this.getAttribute('data-id');
          selectQuestion(questionId);
        });
      });
    }
    
    window.selectQuestion = function(questionId) {
      // Remove selection from all questions
      document.querySelectorAll('.question-item').forEach(item => {
        item.classList.remove('selected');
      });
      
      // Add selection to clicked question
      const questionElement = document.querySelector(".question-item[data-id='" + questionId + "']");
      if (questionElement) {
        questionElement.classList.add('selected');
      }
      
      currentQuestionId = questionId;
      const question = questions.find(q => q.id === questionId);
      
      if (!question) return;
      
      // Show question details
      const questionDetails = document.getElementById('question-details');
      questionDetails.innerHTML =
        '<h4>' + question.id + ' - ' + question.role + '</h4>' +
        '<p>' + question.text + '</p>';
      
      // Show assignments section
      document.getElementById('question-assignments').style.display = 'block';
      
      // Load existing assignments for this question
      showLoading(true);
      
      google.script.run
        .withSuccessHandler(function(assignments) {
          if (assignments.success) {
            renderAssignmentOptions(assignments.topicIds, assignments.policyIds);
          } else {
            showAlert('assignment-error-alert', assignments.message || 'Failed to load question assignments');
          }
          showLoading(false);
        })
        .withFailureHandler(function(error) {
          showLoading(false);
          showAlert('assignment-error-alert', 'Error: ' + (error.message || error));
        })
        .getQuestionAssignments(questionId);
    };
    
    function renderAssignmentOptions(selectedTopicIds, selectedPolicyIds) {
      // Render topic checkboxes
      const topicOptions = document.getElementById('topic-options');
      
      if (topics.length === 0) {
        topicOptions.innerHTML = '<p>No topics available. Please add topics in the Topic Manager tab.</p>';
      } else {
        topicOptions.innerHTML = topics.map(topic => {
          const isChecked = selectedTopicIds && selectedTopicIds.includes(String(topic.id));
          return (
            '<div class="checkbox-group">' +
              '<label class="checkbox-label">' +
                '<input type="checkbox" name="topic-checkbox" value="' + topic.id + '" ' +
                (isChecked ? 'checked' : '') + '>' +
                topic.name +
              '</label>' +
            '</div>'
          );
        }).join('');
      }
      
      // Render policy checkboxes
      const policyOptions = document.getElementById('policy-options');
      
      if (policies.length === 0) {
        policyOptions.innerHTML = '<p>No policies available. Please add policies in the Topic Manager tab.</p>';
      } else {
        policyOptions.innerHTML = policies.map(policy => {
          const isChecked = selectedPolicyIds && selectedPolicyIds.includes(String(policy.id));
          return (
            '<div class="checkbox-group">' +
              '<label class="checkbox-label">' +
                '<input type="checkbox" name="policy-checkbox" value="' + policy.id + '" ' +
                (isChecked ? 'checked' : '') + '>' +
                policy.name +
              '</label>' +
            '</div>'
          );
        }).join('');
      }
    }
    
    // Save question assignments
    document.getElementById('save-assignments-btn').addEventListener('click', function() {
      if (!currentQuestionId) {
        showAlert('assignment-error-alert', 'Please select a question first');
        return;
      }
      
      // Get selected topics
      const selectedTopics = Array.from(document.querySelectorAll('input[name="topic-checkbox"]:checked'))
        .map(checkbox => checkbox.value);
      
      // Get selected policies
      const selectedPolicies = Array.from(document.querySelectorAll('input[name="policy-checkbox"]:checked'))
        .map(checkbox => checkbox.value);
      
      showLoading(true);
      
      google.script.run
        .withSuccessHandler(function(result) {
          if (result.success) {
            showAlert('assignment-success-alert', 'Assignments saved for question ' + currentQuestionId);
          } else {
            showAlert('assignment-error-alert', result.message || 'Failed to save assignments');
          }
          showLoading(false);
        })
        .withFailureHandler(function(error) {
          showLoading(false);
          showAlert('assignment-error-alert', 'Error: ' + (error.message || error));
        })
        .saveQuestionAssignments(currentQuestionId, selectedTopics, selectedPolicies);
    });
    
    // Role filter change for question assignment
    document.getElementById('role-filter-qa').addEventListener('change', function() {
      // Reset current selection
      currentQuestionId = null;
      document.getElementById('question-details').innerHTML = '<p>Select a question to see its details and assign topics/policies.</p>';
      document.getElementById('question-assignments').style.display = 'none';
      
      // Reload questions with new filter
      loadQuestions();
    });
    
    // Utility Functions
    function showLoading(show) {
      document.getElementById('loading').style.display = show ? 'block' : 'none';
    }

    function showAlert(elementId, message) {
      const alert = document.getElementById(elementId);
      alert.textContent = message;
      alert.style.display = 'block';
      
      // Hide alert after 5 seconds
      setTimeout(() => {
        alert.style.display = 'none';
      }, 5000);
    }
    
    /**
     * Helper function to truncate long text for display
     */
    function truncateText(text, maxLength) {
      if (!text) return '';
      text = text.toString();
      if (text.length <= maxLength) return text;
      return text.substring(0, maxLength) + '...';
    }
  </script>
</body>
</html>`;
}
