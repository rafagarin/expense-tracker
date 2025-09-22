/**
 * Main expense tracker service that orchestrates the entire workflow
 */

class ExpenseTracker {
  constructor() {
    this.database = new Database();
    this.gmailService = new GmailService();
    this.emailParser = new EmailParser();
  }

  /**
   * Main function to process bank emails and add movements to the database
   */
  processBankEmails() {
    try {
      Logger.log('Starting bank email processing...');

      // 1. Get existing Gmail IDs for idempotency check
      const existingGmailIds = this.database.getExistingGmailIds();

      // 2. Get unprocessed messages from Gmail
      const unprocessedMessages = this.gmailService.getUnprocessedMessages(existingGmailIds);

      if (unprocessedMessages.length === 0) {
        Logger.log('No new messages to process.');
        return;
      }

      // 3. Parse messages and extract transaction data
      const batchMovements = [];
      let nextId = this.database.getNextId();

      unprocessedMessages.forEach(message => {
        const transactions = this.emailParser.parseEmail(message);
        
        transactions.forEach(transaction => {
          const movementRow = this.emailParser.createMovementRow(transaction, nextId);
          batchMovements.push({
            ts: transaction.timestamp,
            row: movementRow,
            gmailId: transaction.gmailId
          });
          nextId++;
        });
      });

      // 4. Add all movements to the database
      if (batchMovements.length > 0) {
        this.database.addMovementsBatch(batchMovements);
        Logger.log(`Successfully processed ${batchMovements.length} movement(s).`);
      } else {
        Logger.log('No valid transactions found in the processed messages.');
      }

    } catch (error) {
      Logger.log(`Error processing bank emails: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all movements from the database
   * @returns {Array} Array of all movements
   */
  getAllMovements() {
    return this.database.getAllMovements();
  }

  /**
   * Get movements by Gmail ID
   * @param {string} gmailId - Gmail ID to search for
   * @returns {Array} Array of matching movements
   */
  getMovementsByGmailId(gmailId) {
    return this.database.getMovementsByGmailId(gmailId);
  }

  /**
   * Get movements by accounting system ID
   * @param {string} accountingSystemId - Accounting system ID to search for
   * @returns {Array} Array of matching movements
   */
  getMovementsByAccountingSystemId(accountingSystemId) {
    return this.database.getMovementsByAccountingSystemId(accountingSystemId);
  }
}
