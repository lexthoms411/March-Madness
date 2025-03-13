# March Madness Quiz Implementation Guide

This guide will walk you through setting up the March Madness Quiz system for healthcare education. This system allows you to create daily quiz questions for healthcare professionals, automate grading, track scores, and create a fun competition-style leaderboard.

## Overview

The March Madness Quiz system consists of:

1. Google Form - For quiz questions
2. Google Sheets - For data storage and processing
3. Google Apps Script - For automation
4. Google Sites (optional) - For displaying leaderboards

## Prerequisites

- Google account with access to Google Forms, Sheets, and Apps Script
- Basic understanding of spreadsheets
- Familiarity with JavaScript is helpful but not required

## Step 1: Create the Google Sheet

1. Create a new Google Sheet
2. Rename the sheet to "March Madness Quiz"
3. Create the following sheets (tabs):
   - Question Bank
   - Form Responses
   - Form Responses (Raw)
   - Scores
   - Teams
   - Team Scores
   - Team Leaderboard
   - Individual Leaderboard
   - Audit Log
   - Processing Queue
   - Processed Responses
   - Manual Grade Processing Log
   - Error Log

## Step 2: Set Up the Question Bank

1. In the Question Bank sheet, create headers for the following columns:
   - Date
   - Question ID
   - Question Text
   - Option A
   - Option B
   - Option C
   - Option D
   - Option E
   - Option F
   - Correct Answer
   - Question Type
   - Target Role
   - Points
   - Image URL (optional)

2. Format the headers and freeze the first row

3. Start adding questions with the format:
   - Question IDs should follow the pattern Q001, Q002, etc.
   - Question types can be "Multiple Choice", "Multiple Select", or "Short Answer"
   - Target Role can be "RN", "PCA", or any other role designations you need
   - For Multiple Select questions, separate correct answers with commas (e.g., "A, B, D")

## Step 3: Set Up the Scores Sheet

1. In the Scores sheet, create headers for:
   - Mnemonic (unique identifier for each participant)
   - Name
   - Role
   - Total Score
   - Last Updated
   - Attempts (this will store JSON data)

2. Add your participants with their mnemonics, names, and roles

## Step 4: Set Up the Teams Sheet

1. In the Teams sheet, create headers for:
   - Team Name
   - Mnemonic (team member)

2. Add your teams and their members
   - Each mnemonic should match exactly with the Scores sheet
   - Each team can have multiple members (multiple rows with the same team name)

## Step 5: Create the Google Form

1. Create a new Google Form for your quiz
2. Add the following questions:
   - Mnemonic (Short Answer)
   - Role selection (Multiple Choice)
   - Create placeholders for daily questions

3. Make sure to enable "Collect email addresses" if you want to track respondents
4. Set the form to "Limit to 1 response" if you want to prevent multiple submissions

## Step 6: Set Up Apps Script

1. In your Google Sheet, go to Extensions > Apps Script
2. Create the following script files:
   - `utilities.gs`: For common functions and constants
   - `updateDailyQuestion.gs`: For updating daily questions
   - `gradeResponses.gs`: For grading quiz submissions
   - `leaderboard.gs`: For updating leaderboards
   - `manualPoints.gs`: For adding manual points
   - `backup.gs`: For creating backups
   - `questionBankEditor.gs`: For managing questions

3. Copy the code from each file in this project to its corresponding file in your Apps Script editor

4. Update the `FORM_ID` constant in `utilities.gs` with your Google Form ID (found in the form URL)

## Step 7: Configure Section Names in the Form

1. In your form, create page breaks to separate questions for different roles
2. Name the page breaks exactly as specified in the SECTIONS object in `utilities.gs`:
   - "RN Section"
   - "PCA Section" 
   - (or modify the code to match your section names)

## Step 8: Set Up Triggers

1. In the Apps Script editor, go to Triggers in the left sidebar
2. Add the following triggers:
   - `updateDailyQuestions`: Time-driven, daily at midnight
   - `processQueue`: Time-driven, every 5 minutes
   - `onFormSubmit`: Form-driven, on form submit

## Step 9: Initial Setup

1. Run the `setupTriggers` function to create all required triggers
2. Run the `updateDailyQuestions` function to populate your form with the first set of questions
3. Test the form by submitting a response and verify that it appears in your Form Responses sheet
4. Run the `syncResponses` function to transfer the response to the raw data sheet
5. Run the `gradeResponses` function to grade the submission
6. Check the Audit Log to verify the grading worked correctly

## Step 10: Automation Features

### Quiz Question Management

- **Daily Questions**: Questions are automatically updated daily based on the dates in the Question Bank
- **Question Bank Editor**: Use `showQuestionBankEditor()` to add or edit questions via a user interface

### Response Processing

- **Automatic Grading**: Form submissions are processed and graded automatically
- **Smart Answer Processing**: The system can handle multiple answer formats, including comma-separated answers
- **Role-Based Questions**: Different roles (RN, PCA, etc.) can receive different questions

### Score Management

- **Individual Scores**: Track scores for each participant
- **Team Scores**: Automatically calculate team scores based on individual performance
- **Manual Points**: Add bonus points or make manual corrections as needed

### Leaderboards

- **Individual Leaderboard**: Shows top performers by individual score
- **Team Leaderboard**: Shows top-performing teams

### Administration

- **Backup System**: Automatically creates backups of your data
- **Error Logging**: Tracks errors for troubleshooting
- **Queue Processing**: Handles high-volume submissions effectively

## Troubleshooting

### Form Responses Not Being Processed

1. Check the Error Log sheet for any issues
2. Verify that the question IDs in your form match the format: [Q001], [Q002], etc.
3. Run `syncResponses()` and then `gradeResponses()` manually
4. Check the Processing Queue sheet to see if submissions are being queued

### Incorrect Grading

1. For short answer questions, check that the correct answer in the Question Bank matches the expected answers
2. For multiple select questions, ensure that commas are used correctly to separate options
3. Use `clearQuestionCache()` to refresh the cache if you've made changes to the Question Bank
4. Use `regradeSpecificAnswer("mnemonic", "Q001")` to manually regrade a specific response

### Missing Questions in Form

1. Verify that your questions have the correct date in the Question Bank
2. Check that the section names in your form match the SECTIONS object in `utilities.gs`
3. Run `updateDailyQuestions()` manually to refresh the form

## Advanced Customization

### Quiz Questions

- **Question Types**: Add new question types by modifying the `isAnswerCorrect()` function
- **Scoring Rules**: Modify the `calculatePartialCredit()` function to change how partial credit is awarded

### Tournament Structure

- **Elimination Rounds**: Use functions in `determineWeeklyWinners.gs` to set up tournament-style elimination rounds
- **Bracket Visualization**: Customize the bracket visualization for your tournament

### Display and UI

- **Google Sites Integration**: Create a Google Sites page and embed your leaderboard sheets
- **Custom Styling**: Add conditional formatting to your sheets for better visualization

## Maintenance

- Run `archiveOldData()` periodically to prevent your sheets from getting too large
- Use `createSpreadsheetBackup()` to create manual backups before making major changes
- Schedule weekly backups with `createWeeklyBackupTrigger()`

## Final Notes

- Make sure questions include their ID in the format [Q001] in the question text
- For multiple select questions, use consistent comma formatting in the correct answer field
- For short answer questions, consider adding multiple acceptable variations separated by pipes

By following this guide, you should have a fully functional March Madness Quiz system that can be used for healthcare education and friendly competition among staff members.
