/**
 * Main entry point for the expense tracker
 * This file provides the public API and main functions
 */

/**
 * Creates a custom menu in the Google Sheets UI
 * This function runs automatically when the spreadsheet is opened
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Expense Tracker')
    .addItem('Process From Bank Emails', 'processBankEmails')
    .addItem('Process From Splitwise', 'processSplitwise')
    .addItem('Analyze Movements', 'analyzeMovements')
    .addItem('Push to Splitwise', 'pushToSplitwise')
    .addToUi();
}

/**
 * The main function that will be triggered to process bank emails.
 * This is the entry point that should be called by Google Apps Script triggers.
 */
async function processBankEmails() {
  const expenseTracker = new ExpenseTracker();
  await expenseTracker.processBankEmails();
}


/**
 * Analyze movements and process splits for movements that have user_description but no category
 * This function uses AI to automatically categorize movements and split them if needed
 */
async function analyzeMovements() {
  const expenseTracker = new ExpenseTracker();
  await expenseTracker.processUncategorizedMovements();
}

/**
 * Process Splitwise credit movements and add them to the database
 * This function fetches credit movements from Splitwise API
 */
async function processSplitwise() {
  const expenseTracker = new ExpenseTracker();
  await expenseTracker.processSplitwiseMovements();
}

/**
 * Push pending Splitwise settlement movements to Splitwise
 * This function creates expenses in Splitwise for movements marked as "pending splitwise settlement"
 */
async function pushToSplitwise() {
  const expenseTracker = new ExpenseTracker();
  await expenseTracker.pushToSplitwise();
}


