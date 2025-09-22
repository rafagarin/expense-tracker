/**
 * Database operations for the expense tracker
 * Handles all interactions with the Google Sheets database
 */

class Database {
  constructor() {
    this.sheet = null;
    this.initializeSheet();
  }

  /**
   * Initialize the spreadsheet and get the Movements sheet
   */
  initializeSheet() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    this.sheet = ss.getSheetByName(SPREADSHEET_TAB_NAME);
    
    if (!this.sheet) {
      throw new Error(`Sheet named "${SPREADSHEET_TAB_NAME}" not found.`);
    }
  }

  /**
   * Get all existing Gmail IDs for idempotency checking
   * @returns {Set} Set of existing Gmail IDs
   */
  getExistingGmailIds() {
    const existingGmailIds = new Set();
    
    if (this.sheet.getLastRow() > 1) {
      const gmailIdRange = this.sheet.getRange(2, COLUMNS.GMAIL_ID + 1, this.sheet.getLastRow() - 1, 1);
      const gmailIdValues = gmailIdRange.getValues();
      
      gmailIdValues.forEach(row => {
        if (row[0]) {
          existingGmailIds.add(row[0]);
        }
      });
    }
    
    Logger.log(`Found ${existingGmailIds.size} existing movement(s) in the sheet.`);
    return existingGmailIds;
  }

  /**
   * Add a new movement to the database
   * @param {Array} movementRow - Array representing the movement data
   */
  addMovement(movementRow) {
    this.sheet.appendRow(movementRow);
  }

  /**
   * Add multiple movements to the database in batch
   * @param {Array} movements - Array of movement objects with {ts, row, gmailId}
   */
  addMovementsBatch(movements) {
    // Sort by timestamp before adding
    const sortedMovements = movements.sort((a, b) => {
      const ta = a.ts ? Date.parse(a.ts) : 0;
      const tb = b.ts ? Date.parse(b.ts) : 0;
      return ta - tb;
    });

    sortedMovements.forEach(item => {
      this.addMovement(item.row);
      Logger.log(`Added movement from email ID: ${item.gmailId} for ${item.row[COLUMNS.CURRENCY]} ${item.row[COLUMNS.AMOUNT]} at ${item.row[COLUMNS.TIMESTAMP]} — ${item.row[COLUMNS.SOURCE_DESCRIPTION]}`);
    });
  }

  /**
   * Get the next available ID for a new movement
   * @returns {number} Next available ID
   */
  getNextId() {
    return this.sheet.getLastRow() + 1;
  }

  /**
   * Get all movements from the database
   * @returns {Array} Array of movement data
   */
  getAllMovements() {
    if (this.sheet.getLastRow() <= 1) {
      return [];
    }
    
    const dataRange = this.sheet.getRange(2, 1, this.sheet.getLastRow() - 1, this.sheet.getLastColumn());
    return dataRange.getValues();
  }

  /**
   * Get movements by Gmail ID
   * @param {string} gmailId - Gmail ID to search for
   * @returns {Array} Array of matching movements
   */
  getMovementsByGmailId(gmailId) {
    const allMovements = this.getAllMovements();
    return allMovements.filter(movement => movement[COLUMNS.GMAIL_ID] === gmailId);
  }

  /**
   * Get movements by accounting system ID
   * @param {string} accountingSystemId - Accounting system ID to search for
   * @returns {Array} Array of matching movements
   */
  getMovementsByAccountingSystemId(accountingSystemId) {
    const allMovements = this.getAllMovements();
    return allMovements.filter(movement => movement[COLUMNS.ACCOUNTING_SYSTEM_ID] === accountingSystemId);
  }
}
