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
    .addItem('Run All (Main)', 'main')
    .addSeparator()
    .addItem('Process From Bank Emails', 'processBankEmails')
    .addItem('Process From Splitwise', 'processSplitwise')
    .addItem('Analyze Movements', 'analyzeMovements')
    .addItem('Push to Splitwise', 'pushToSplitwise')
    .addItem('Fix Currency Conversions', 'fixCurrencyConversions')
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
 * Push movements awaiting Splitwise upload to Splitwise
 * This function creates expenses in Splitwise for movements marked as "Awaiting Splitwise Upload"
 */
async function pushToSplitwise() {
  const expenseTracker = new ExpenseTracker();
  await expenseTracker.pushToSplitwise();
}

/**
 * Fix failed currency conversions for all movements
 * This function can be called manually to fix #NUM! errors in currency conversion columns
 */
async function fixCurrencyConversions() {
  try {
    Logger.log('Starting currency conversion fix...');
    const expenseTracker = new ExpenseTracker();
    await expenseTracker.fixFailedCurrencyConversions();
    Logger.log('Currency conversion fix completed.');
  } catch (error) {
    Logger.log(`Error in currency conversion fix: ${error.message}`);
    throw error;
  }
}

/**
 * Main function that performs all expense tracking actions with proper conditions
 * This is the primary entry point that orchestrates the entire workflow
 * @param {Object} clientProperties - Optional client properties object
 */
async function main(clientProperties = null) {
  try {
    Logger.log('Starting main expense tracking workflow...');
    const expenseTracker = new ExpenseTracker(clientProperties);
    
    // Step 1: Process bank emails (with idempotency - only new emails)
    Logger.log('=== Step 1: Processing bank emails ===');
    await expenseTracker.processBankEmails();
    
    // Step 2: Process Splitwise movements (with idempotency - only new movements)
    Logger.log('=== Step 2: Processing Splitwise movements ===');
    await expenseTracker.processSplitwiseMovements();
    
    // Step 3: Analyze movements with AI (only movements with user_description)
    Logger.log('=== Step 3: Analyzing movements with AI ===');
    await expenseTracker.processUncategorizedMovements();
    
    // Step 4: Push to Splitwise (only movements with "Awaiting Splitwise Upload" status)
    Logger.log('=== Step 4: Pushing to Splitwise ===');
    await expenseTracker.pushToSplitwise();
    
    // Step 5: Fix failed currency conversions
    Logger.log('=== Step 5: Fixing failed currency conversions ===');
    await expenseTracker.fixFailedCurrencyConversions();
    
    Logger.log('Main expense tracking workflow completed successfully.');
    
  } catch (error) {
    Logger.log(`Error in main workflow: ${error.message}`);
    throw error;
  }
}


