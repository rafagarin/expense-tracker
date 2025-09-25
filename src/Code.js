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
    .addItem('Analyze Categories', 'analyzeCategories')
    .addItem('Process Splitwise', 'processSplitwise')
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

/**
 * Analyze categories for movements that have user_description but no category
 * This function uses AI to automatically categorize movements
 */
async function analyzeCategories() {
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
 * Set up Google AI Studio API key
 * Call this function once to securely store your API key
 * @param {string} apiKey - Your Google AI Studio API key
 */
function setupGoogleAIStudioAPIKey(apiKey) {
  setApiKey(API_CONFIG.GOOGLE_AI_STUDIO.API_KEY_PROPERTY, apiKey);
  Logger.log('Google AI Studio API key has been stored securely.');
}

/**
 * Set up Splitwise API key
 * Call this function once to securely store your API key
 * @param {string} apiKey - Your Splitwise API key
 */
function setupSplitwiseAPIKey(apiKey) {
  setApiKey(API_CONFIG.SPLITWISE.API_KEY_PROPERTY, apiKey);
  Logger.log('Splitwise API key has been stored securely.');
}

