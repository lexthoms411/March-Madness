// NOTE: showReportsManager is defined in reportsManager.gs.
// NOTE: createStandardClassifications has been moved to reportsManager-TopicManagement.gs


/**
 * Shows the Topic Manager tab directly
 */
function showTopicManager() {
  const html = HtmlService.createHtmlOutput(getReportsManagerHtml())
    .setWidth(800)
    .setHeight(650)
    .setTitle('Topic Manager');
  
  // Add script to auto-select the Topic Manager tab
  const htmlContent = html.getContent();
  const scriptToAdd = `
    <script>
      window.addEventListener('load', function() {
        // Simulate click on Topic Manager tab
        document.querySelector('.tab[data-tab="topic-manager"]').click();
      });
    </script>
  `;
  
  const updatedHtml = htmlContent.replace('</body>', scriptToAdd + '</body>');
  html.setContent(updatedHtml);
  
  SpreadsheetApp.getUi().showModalDialog(html, 'Topic Manager');
}

/**
 * Shows the Question Assignment tab directly
 */
function showQuestionAssignment() {
  const html = HtmlService.createHtmlOutput(getReportsManagerHtml())
    .setWidth(800)
    .setHeight(650)
    .setTitle('Question Assignment');
  
  // Add script to auto-select the Question Assignment tab
  const htmlContent = html.getContent();
  const scriptToAdd = `
    <script>
      window.addEventListener('load', function() {
        // Simulate click on Question Assignment tab
        document.querySelector('.tab[data-tab="question-assignment"]').click();
      });
    </script>
  `;
  
  const updatedHtml = htmlContent.replace('</body>', scriptToAdd + '</body>');
  html.setContent(updatedHtml);
  
  SpreadsheetApp.getUi().showModalDialog(html, 'Question Assignment');
}
