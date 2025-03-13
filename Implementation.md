# March Madness Quiz Implementation Guide

This guide will walk you through setting up the March Madness Quiz system for healthcare education. This system allows you to create daily quiz questions for healthcare professionals, automate grading, track scores, and create a competition-style leaderboard.

## Overview

The March Madness Quiz system consists of:

1. Google Form - For quiz questions
2. Google Sheets - For data storage and processing
3. Google Apps Script - For automation
4. Google Sites (optional) - For displaying leaderboards and comments

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
   - Bracket Visualization (for tournament format)

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
   - For Short Answer questions, consider using pipe characters to separate acceptable variations (e.g., "SBAR|S.B.A.R.|SBAR communication")

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

5. **Important**: When creating quiz questions in the form, include the question ID in brackets in the question title. For example: "[Q001] What is the correct procedure for..."

6. Create page breaks to separate questions for different roles and name them exactly:
   - "RN Section"
   - "PCA Section"
   - (or modify the `SECTIONS` object in `utilities.gs` to match your section names)

## Step 6: Set Up Apps Script

1. In your Google Sheet, go to Extensions > Apps Script
2. Create the following script files based on your repository structure:

### Core Files
   - `utilities.gs`: Common functions, constants, and configuration
   - `updateDailyQuestion.gs`: Updates daily questions based on dates in Question Bank
   - `gradeResponses.gs`: Handles grading of quiz submissions
   - `leaderboard.gs`: Updates individual and team leaderboards
   - `manualPoints.gs`: Allows adding manual points or bonus points
   - `backup.gs`: Creates backups of your spreadsheet

### Additional Files
   - `questionBankEditor.gs`: UI for adding/editing questions
   - `determineWeeklyWinners.gs`: Handles tournament advancement logic
   - `tournamentAdvancement.gs`: Additional tournament functions
   - `pointsLookup.gs`: Functions for looking up participant points
   - `appsscript.json`: Project configuration file

3. Open `utilities.gs` and update the `FORM_ID` constant with your Google Form ID (found in the form URL)

4. Update any other configuration settings in `utilities.gs` to match your setup

## Step 7: PointsLookup HTML Page

1. Create a new HTML file called `PointsLookup.html` 
2. This file will provide a web interface for participants to look up their scores
3. Implement the HTML with:
   - A search box for entering mnemonics
   - Display areas for showing scores and rankings
   - Styling to match your organization's branding

## Step 8: Set Up Comments Page

1. Create a second Google Form for comments and feedback
2. Include fields for:
   - Participant mnemonic
   - Comment/feedback text
   - Rating or satisfaction score (optional)
   - Category of feedback (optional)

3. Connect this form to a separate Google Sheet for comments
4. Create a Google Sites page to:
   - Embed the comments form
   - Display approved comments from the sheet
   - Link to the quiz form

5. To embed the comments on a Google Site:
   - Publish the comments sheet as a web page (File > Share > Publish to web)
   - On your Google Site, insert an Embed element
   - Use the published URL with embedded parameters

## Step 9: Set Up Triggers

1. In the Apps Script editor, go to Triggers in the left sidebar
2. Add the following triggers:
   - `updateDailyQuestions`: Time-driven, daily at midnight
   - `processQueue`: Time-driven, every 5 minutes
   - `onFormSubmit`: Form-driven, on form submit
   - `createSpreadsheetBackup`: Time-driven, weekly
   - `archiveOldData`: Time-driven, every 12 hours

## Step 10: Initial Setup

1. Run the `setupTriggers` function to create all required triggers
2. Run the `updateDailyQuestions` function to populate your form with the first set of questions
3. Test the form by submitting a response and verify it appears in your Form Responses sheet
4. Run the `syncResponses` function to transfer the response to the raw data sheet
5. Run the `gradeResponses` function to grade the submission
6. Check the Audit Log to verify the grading worked correctly

## Step 11: Tournament Setup (Optional)

If you want to run this as a tournament-style competition:

1. Set up the Bracket Visualization sheet with appropriate formatting
2. Configure the `determineWeeklyWinners.gs` script with your elimination dates
3. Test the tournament advancement functions
4. Schedule weekly advancement to occur automatically

## Detailed Script Descriptions

### utilities.gs
Contains constants, configuration settings, and helper functions used throughout the application. This is the core file that defines:
- Form and sheet IDs
- Section names
- Logging functions
- Answer parsing and normalization
- Grading logic for different question types

### updateDailyQuestion.gs
Handles updating the form with new questions based on dates in the Question Bank:
- Finds question sections in the form
- Clears old questions
- Adds new questions based on the current date
- Creates scheduled triggers for daily updates

### gradeResponses.gs
Handles the grading logic for quiz submissions:
- Processes form submissions
- Verifies answers against the Question Bank
- Calculates scores and partial credit
- Logs results to the Audit Log
- Updates participant scores

### leaderboard.gs
Updates the leaderboards based on current scores:
- Calculates individual rankings
- Aggregates team scores
- Formats leaderboard sheets
- Applies styling for top performers

### manualPoints.gs
Allows administrators to add points manually:
- Bonus points for special achievements
- Manual grade overrides
- Recovery of missing points
- Processing form-based manual grade submissions

### backup.gs
Handles backing up the spreadsheet:
- Creates dated backup copies
- Manages backup folder
- Schedules regular backups
- Lists available backups

### questionBankEditor.gs
Provides a user interface for managing questions:
- Add new questions with a form interface
- Edit existing questions
- Preview questions before adding
- Validate question format

### determineWeeklyWinners.gs
Manages tournament advancement:
- Determines which teams advance to next rounds
- Updates bracket visualization
- Schedules elimination rounds
- Processes tournament results

### tournamentAdvancement.gs
Additional functions for tournament management:
- Handles team advancement
- Updates round scores
- Manages tournament bracket display
- Determines finalists and champions

### pointsLookup.gs
Provides functions for the points lookup interface:
- Searches for participant scores
- Formats results for display
- Handles error cases
- Returns participant rankings

## Troubleshooting

### Form Responses Not Being Processed

1. Check the Error Log sheet for any issues
2. Verify that the question IDs in your form match the format: [Q001], [Q002], etc.
3. Run `syncResponses()` and then `gradeResponses()` manually
4. Check the Processing Queue sheet to see if submissions are being queued
5. Verify that your form triggers are active in the Apps Script dashboard

### Incorrect Grading

1. For short answer questions, check that the correct answer in the Question Bank matches the expected answers
2. For multiple select questions, ensure that commas are used correctly to separate options
3. Use `clearQuestionCache()` to refresh the cache if you've made changes to the Question Bank
4. Use `regradeSpecificAnswer("mnemonic", "Q001")` to manually regrade a specific response
5. Check the Audit Log to see what answers were submitted vs. what was expected

### Missing Questions in Form

1. Verify that your questions have the correct date in the Question Bank
2. Check that the section names in your form match the SECTIONS object in `utilities.gs`
3. Run `updateDailyQuestions()` manually to refresh the form
4. Check for errors in the Error Log sheet

### Tournament Issues

1. Verify the team structure in the Teams sheet
2. Check that elimination dates are correctly set in the scripts
3. Run `testDetermineWinners()` to manually test tournament advancement
4. Verify that scores are being calculated correctly for teams

## Advanced Customization

### Quiz Questions

- **Question Types**: Add new question types by modifying the `isAnswerCorrect()` function
- **Scoring Rules**: Modify the `calculatePartialCredit()` function to change how partial credit is awarded
- **Question Rotation**: Adjust how questions are selected and rotated by modifying the `updateDailyQuestions()` function

### Tournament Structure

- **Elimination Rounds**: Customize tournament structure in the `determineWeeklyWinners.gs` file
- **Bracket Display**: Modify the bracket visualization format
- **Advancement Rules**: Change how teams advance by updating the `processWinners()` function

### Display and UI

- **Google Sites Integration**: Create a Google Sites page and embed your leaderboard sheets
- **Custom Styling**: Add conditional formatting to your sheets for better visualization
- **Points Lookup**: Customize the `PointsLookup.html` to match your branding

## Maintenance

- Run `archiveOldData()` periodically to prevent your sheets from getting too large
- Use `createSpreadsheetBackup()` to create manual backups before making major changes
- Schedule weekly backups with `createWeeklyBackupTrigger()`
- Check the Error Log regularly for issues

## Final Notes

- Always test changes in a backup copy before implementing in production
- Make sure questions include their ID in the format [Q001] in the question text
- For multiple select questions, use consistent comma formatting in the correct answer field
- For short answer questions, consider adding multiple acceptable variations separated by pipes

By following this guide, you should have a fully functional March Madness Quiz system that can be used for healthcare education and friendly competition among staff members.
