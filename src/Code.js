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
    .addItem('Process Bank Emails', 'processBankEmails')
    .addToUi();
}

/**
 * The main function that will be triggered to process bank emails.
 * This is the entry point that should be called by Google Apps Script triggers.
 */
function processBankEmails() {
  const expenseTracker = new ExpenseTracker();
  expenseTracker.processBankEmails();
}

/**
 * Get all movements from the database
 * @returns {Array} Array of all movements
 */
function getAllMovements() {
  const expenseTracker = new ExpenseTracker();
  return expenseTracker.getAllMovements();
}

/**
 * Get movements by Gmail ID
 * @param {string} gmailId - Gmail ID to search for
 * @returns {Array} Array of matching movements
 */
function getMovementsByGmailId(gmailId) {
  const expenseTracker = new ExpenseTracker();
  return expenseTracker.getMovementsByGmailId(gmailId);
}

/**
 * Get movements by accounting system ID
 * @param {string} accountingSystemId - Accounting system ID to search for
 * @returns {Array} Array of matching movements
 */
function getMovementsByAccountingSystemId(accountingSystemId) {
  const expenseTracker = new ExpenseTracker();
  return expenseTracker.getMovementsByAccountingSystemId(accountingSystemId);
}

