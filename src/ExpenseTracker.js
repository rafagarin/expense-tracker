/**
 * Main expense tracker service that orchestrates the entire workflow
 */

class ExpenseTracker {
  constructor() {
    this.database = new Database();
    this.gmailService = new GmailService();
    this.googleAIStudioService = new GoogleAIStudioService();
  }

  /**
   * Main function to process bank emails and add movements to the database
   */
  async processBankEmails() {
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

      // 3. Parse messages and extract transaction data using AI-enhanced parsing
      const batchMovements = [];
      let nextId = this.database.getNextId();

      for (const message of unprocessedMessages) {
        const gmailId = message.getId();
        const emailBody = message.getPlainBody();
        
        // Parse email using Google AI Studio
        const transaction = await this.googleAIStudioService.parseEmailWithGoogleAIStudio(emailBody, gmailId);
        
        if (transaction) {
          const movementRow = this.createMovementRow(transaction, nextId);
          batchMovements.push({
            ts: transaction.timestamp,
            row: movementRow,
            gmailId: transaction.gmailId
          });
          nextId++;
        } else {
          Logger.log(`No transaction data extracted from email ${gmailId}`);
        }
      }

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

  /**
   * Create a movement row for the database from parsed transaction data
   * @param {Object} transaction - Parsed transaction object
   * @param {number} nextId - Next available ID for the movement
   * @returns {Array} Movement row array for database insertion
   */
  createMovementRow(transaction, nextId) {
    // Determine direction based on transaction type
    const direction = this.getDirectionForTransactionType(transaction.transactionType);
    
    // Determine status for debit/credit transactions
    const status = this.getStatusForTransactionType(transaction.transactionType);

    return [
      nextId,                                    // id
      transaction.gmailId,                       // gmail_id
      null,                                      // accounting_system_id
      transaction.timestamp,                     // timestamp
      transaction.amount,                        // amount
      transaction.currency,                      // currency
      transaction.sourceDescription,             // source_description
      null,                                      // user_description
      null,                                      // category
      direction,                                 // direction
      transaction.transactionType,               // type
      status,                                    // status
      null,                                      // comment
      null,                                      // settled_movement_id
      null                                       // accounting_system
    ];
  }

  /**
   * Get the direction for a given transaction type
   * @param {string} transactionType - The transaction type
   * @returns {string} The direction constant
   */
  getDirectionForTransactionType(transactionType) {
    switch (transactionType) {
      case MOVEMENT_TYPES.EXPENSE:
      case MOVEMENT_TYPES.CASH:
      case MOVEMENT_TYPES.DEBIT:
      case MOVEMENT_TYPES.CREDIT_REPAYMENT:
        return DIRECTIONS.OUTFLOW;
      case MOVEMENT_TYPES.CREDIT:
      case MOVEMENT_TYPES.DEBIT_REPAYMENT:
        return DIRECTIONS.INFLOW;
      default:
        return DIRECTIONS.OUTFLOW;
    }
  }

  /**
   * Get the status for a given transaction type
   * @param {string} transactionType - The transaction type
   * @returns {string|null} The status constant or null
   */
  getStatusForTransactionType(transactionType) {
    switch (transactionType) {
      case MOVEMENT_TYPES.DEBIT:
      case MOVEMENT_TYPES.CREDIT:
        return STATUS.UNSETTLED;
      case MOVEMENT_TYPES.DEBIT_REPAYMENT:
      case MOVEMENT_TYPES.CREDIT_REPAYMENT:
        return STATUS.SETTLED;
      default:
        return null;
    }
  }
}
