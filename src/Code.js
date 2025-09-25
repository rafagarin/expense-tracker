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
    .addItem('Push to Splitwise', 'pushToSplitwise')
    .addSeparator()
    .addItem('Fix Split Movement (ID 25)', 'fixMovement25')
    .addToUi();
}

function fixMovement25() {
  // Quick fix for movement ID 25 - adjust the amount as needed
  fixSplitMovement(25, 10000); // Change 10000 to the actual original total amount
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
 * Analyze categories and process splits for movements that have user_description but no category
 * This function uses AI to automatically categorize movements and split them if needed
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
 * Push pending Splitwise settlement movements to Splitwise
 * This function creates expenses in Splitwise for movements marked as "pending splitwise settlement"
 */
async function pushToSplitwise() {
  const expenseTracker = new ExpenseTracker();
  await expenseTracker.pushToSplitwise();
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

/**
 * Set up Splitwise group ID
 * Call this function once to set your default group ID for expenses
 * @param {number} groupId - Your Splitwise group ID (use 0 for personal expenses)
 */
function setupSplitwiseGroupId(groupId) {
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty('SPLITWISE_GROUP_ID', groupId.toString());
  Logger.log(`Splitwise group ID has been set to: ${groupId}`);
}

/**
 * Log all Splitwise user IDs
 * This function fetches all users from your Splitwise expenses and logs their IDs
 * Use this to identify user IDs for proper expense splitting
 */
async function logSplitwiseUserIds() {
  const splitwiseService = new SplitwiseService();
  await splitwiseService.logSplitwiseUserIds();
}

/**
 * Set up other user ID for Splitwise splitting
 * Call this function with the user ID of the person you commonly split expenses with
 * @param {number} userId - User ID of the person you split expenses with
 */
function setupSplitwiseOtherUserId(userId) {
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty('SPLITWISE_OTHER_USER_ID', userId.toString());
  Logger.log(`Splitwise other user ID has been set to: ${userId}`);
}

function fixSplitMovement(movementId, originalTotalAmount) {
  // This function helps fix a movement that was split incorrectly
  // by manually setting the original total in the comment
  const database = new Database();
  const allMovements = database.getAllMovements();
  const movementIndex = allMovements.findIndex(m => m[COLUMNS.ID] === movementId);
  
  if (movementIndex === -1) {
    Logger.log(`Movement with ID ${movementId} not found`);
    return;
  }
  
  const sheetRowIndex = movementIndex + 2;
  const comment = `Original total: ${originalTotalAmount}`;
  database.sheet.getRange(sheetRowIndex, COLUMNS.COMMENT + 1).setValue(comment);
  Logger.log(`Fixed movement ID ${movementId} with original total: ${originalTotalAmount}`);
}

