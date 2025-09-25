/**
 * Main expense tracker service that orchestrates the entire workflow
 */

class ExpenseTracker {
  constructor() {
    this.database = new Database();
    this.gmailService = new GmailService();
    this.googleAIStudioService = new GoogleAIStudioService();
    this.splitwiseService = new SplitwiseService();
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
   * Process movements that have user_description but no category
   * Uses AI to analyze and categorize movements automatically, and splits them if needed
   */
  async processUncategorizedMovements() {
    try {
      Logger.log('Starting AI analysis and split processing...');

      // 1. Get movements that need category analysis
      const uncategorizedMovements = this.database.getMovementsNeedingCategoryAnalysis();

      if (uncategorizedMovements.length === 0) {
        Logger.log('No movements need category analysis.');
        return;
      }

      Logger.log(`Found ${uncategorizedMovements.length} movement(s) needing category analysis.`);

      // 2. Process each movement
      let analyzedCount = 0;
      let splitCount = 0;
      let errorCount = 0;

      for (const movement of uncategorizedMovements) {
        try {
          const movementId = movement[COLUMNS.ID];
          const userDescription = movement[COLUMNS.USER_DESCRIPTION];
          const comment = movement[COLUMNS.COMMENT];
          
          // Prepare movement context for AI analysis
          const movementData = {
            amount: movement[COLUMNS.AMOUNT],
            currency: movement[COLUMNS.CURRENCY],
            sourceDescription: movement[COLUMNS.SOURCE_DESCRIPTION],
            type: movement[COLUMNS.TYPE],
            direction: movement[COLUMNS.DIRECTION]
          };

          // 3. Use AI to analyze the category and split requirements
          // Combine user description and comment for analysis
          const fullDescription = [userDescription, comment].filter(Boolean).join(' ');
          const analysisResult = await this.googleAIStudioService.analyzeCategory(fullDescription, movementData);

          if (analysisResult) {
            // 4. Update the movement with the analysis results
            this.database.updateMovementWithAnalysis(movementId, analysisResult);
            analyzedCount++;
            Logger.log(`Analyzed movement ID ${movementId}: "${userDescription}" -> category: ${analysisResult.category}, needs_split: ${analysisResult.needs_split}`);

            // 5. If the movement needs to be split, split it immediately
            if (analysisResult.needs_split) {
              const splitInfo = {
                split_amount: analysisResult.split_amount,
                split_category: analysisResult.split_category,
                split_description: analysisResult.split_description
              };

              const newDebitMovementId = this.database.splitMovement(movementId, splitInfo);
              
              if (newDebitMovementId) {
                splitCount++;
                Logger.log(`Split movement ID ${movementId}: modified original to personal portion, created debit movement ${newDebitMovementId} for shared portion`);
              } else {
                Logger.log(`Failed to split movement ID ${movementId}`);
                errorCount++;
              }
            }
          } else {
            Logger.log(`Could not analyze movement ID ${movementId}: "${userDescription}"`);
            errorCount++;
          }

          // Add a small delay to avoid hitting API rate limits
          Utilities.sleep(1000);

        } catch (error) {
          Logger.log(`Error processing movement ID ${movement[COLUMNS.ID]}: ${error.message}`);
          errorCount++;
        }
      }

      Logger.log(`AI analysis and split processing complete. Analyzed: ${analyzedCount}, Split: ${splitCount}, Errors: ${errorCount}`);

    } catch (error) {
      Logger.log(`Error processing uncategorized movements: ${error.message}`);
      throw error;
    }
  }


  /**
   * Push pending Splitwise settlement movements to Splitwise
   * Creates expenses in Splitwise for movements marked as "pending splitwise settlement"
   */
  async pushToSplitwise() {
    try {
      Logger.log('Starting push to Splitwise...');

      // 1. Test Splitwise connection first
      const connectionTest = await this.splitwiseService.testConnection();
      if (!connectionTest) {
        Logger.log('Splitwise connection test failed. Please check your API key.');
        return;
      }

      // 2. Get movements pending Splitwise settlement
      const pendingMovements = this.database.getMovementsPendingSplitwiseSettlement();

      if (pendingMovements.length === 0) {
        Logger.log('No movements pending Splitwise settlement.');
        return;
      }

      Logger.log(`Found ${pendingMovements.length} movement(s) pending Splitwise settlement.`);

      // 3. Process each movement
      let processedCount = 0;
      let errorCount = 0;

      for (const movement of pendingMovements) {
        try {
          const movementId = movement[COLUMNS.ID];
          const amount = movement[COLUMNS.AMOUNT];
          const currency = movement[COLUMNS.CURRENCY];
          const description = movement[COLUMNS.USER_DESCRIPTION] || movement[COLUMNS.SOURCE_DESCRIPTION];
          const timestamp = movement[COLUMNS.TIMESTAMP];
          
          // Convert timestamp to Splitwise date format (YYYY-MM-DD)
          const date = new Date(timestamp).toISOString().split('T')[0];

          // For debit movements, the amount represents what others owe us
          // We need to find the personal portion (what we actually spent) to calculate the total
          let totalAmount = amount; // What others owe us
          let personalAmount = 0; // What we actually spent
          
          // Try to find the personal portion by looking for the expense movement with same timestamp and description
          const allMovements = this.database.getAllMovements();
          const personalMovement = allMovements.find(m => 
            m[COLUMNS.TIMESTAMP] === movement[COLUMNS.TIMESTAMP] && 
            m[COLUMNS.USER_DESCRIPTION] === movement[COLUMNS.USER_DESCRIPTION] &&
            m[COLUMNS.TYPE] === MOVEMENT_TYPES.EXPENSE &&
            m[COLUMNS.ID] !== movement[COLUMNS.ID] // Different from this debit movement
          );
          
          if (personalMovement) {
            personalAmount = personalMovement[COLUMNS.AMOUNT];
            totalAmount = personalAmount + amount; // Total = personal + what others owe
            Logger.log(`Found personal movement: personal=${personalAmount}, total=${totalAmount}`);
          } else {
            Logger.log(`Could not find personal movement for debit ${movement[COLUMNS.ID]}`);
            // If we can't find the personal portion, assume the debit amount is the full amount
            totalAmount = amount;
            personalAmount = 0;
          }
          
          Logger.log(`Debit movement: amount=${amount}, totalAmount=${totalAmount}, personalAmount=${personalAmount}`);
          
          // Prepare expense data for Splitwise
          const expenseData = {
            amount: totalAmount, // Total amount paid
            personalAmount: personalAmount, // Personal portion
            currency: currency,
            description: description,
            date: date,
            groupId: null, // You may want to add group support later
            otherUsers: [] // For now, we'll create simple expenses
          };

          // 4. Create expense in Splitwise
          const splitwiseId = await this.splitwiseService.createExpense(expenseData);
          
          if (splitwiseId) {
            // 5. Update the movement with Splitwise information
            this.database.updateMovementWithSplitwiseInfo(movementId, splitwiseId);
            processedCount++;
            Logger.log(`Pushed movement ID ${movementId} to Splitwise with ID ${splitwiseId}`);
          } else {
            Logger.log(`Failed to create Splitwise expense for movement ID ${movementId}`);
            errorCount++;
          }

          // Add a small delay to avoid hitting API rate limits
          Utilities.sleep(1000);

        } catch (error) {
          Logger.log(`Error processing movement ID ${movement[COLUMNS.ID]}: ${error.message}`);
          errorCount++;
        }
      }

      Logger.log(`Push to Splitwise complete. Processed: ${processedCount}, Errors: ${errorCount}`);

    } catch (error) {
      Logger.log(`Error pushing to Splitwise: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process Splitwise movements and add them to the database
   * Uses Splitwise API to fetch both credit and debit movements
   */
  async processSplitwiseMovements() {
    try {
      Logger.log('Starting Splitwise movements processing...');

      // 1. Test Splitwise connection first
      const connectionTest = await this.splitwiseService.testConnection();
      if (!connectionTest) {
        Logger.log('Splitwise connection test failed. Please check your API key.');
        return;
      }

      // 2. Get existing accounting system IDs for idempotency check
      const existingAccountingSystemIds = this.database.getExistingAccountingSystemIds();

      // 3. Get both credit and debit movements from Splitwise
      const creditMovements = await this.splitwiseService.getCreditMovements();
      const debitMovements = await this.splitwiseService.getDebitMovements();

      const allMovements = [...creditMovements, ...debitMovements];

      if (allMovements.length === 0) {
        Logger.log('No Splitwise movements found.');
        return;
      }

      Logger.log(`Found ${creditMovements.length} credit movement(s) and ${debitMovements.length} debit movement(s) from Splitwise`);

      // 4. Filter out movements that already exist (idempotency)
      const newMovements = allMovements.filter(movement => 
        !existingAccountingSystemIds.has(movement.splitwiseId)
      );

      if (newMovements.length === 0) {
        Logger.log('All Splitwise movements already exist in database.');
        return;
      }

      Logger.log(`${newMovements.length} new movement(s) to add from Splitwise`);

      // 5. Convert Splitwise movements to our database format and add them
      let nextId = this.database.getNextId();
      const batchMovements = [];

      for (const movement of newMovements) {
        const movementRow = this.createSplitwiseMovementRow(movement, nextId);
        batchMovements.push({
          ts: movement.date,
          row: movementRow,
          accountingSystemId: movement.splitwiseId
        });
        nextId++;
      }

      // 6. Add all movements to the database
      if (batchMovements.length > 0) {
        this.database.addMovementsBatch(batchMovements);
        Logger.log(`Successfully processed ${batchMovements.length} Splitwise movement(s).`);
      }

    } catch (error) {
      Logger.log(`Error processing Splitwise movements: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a movement row for the database from Splitwise movement data
   * @param {Object} splitwiseMovement - Splitwise movement object
   * @param {number} nextId - Next available ID for the movement
   * @returns {Array} Movement row array for database insertion
   */
  createSplitwiseMovementRow(splitwiseMovement, nextId) {
    // Convert Splitwise date to ISO format
    const timestamp = new Date(splitwiseMovement.date).toISOString();

    // Determine if this is a credit or debit movement
    const isCreditMovement = splitwiseMovement.paidBy !== undefined;
    const isDebitMovement = splitwiseMovement.owedBy !== undefined;

    let direction, type, userDescription;

    if (isCreditMovement) {
      // Credit movement: someone paid for me, I owe them
      direction = DIRECTIONS.OUTFLOW; // Money will leave my account
      type = MOVEMENT_TYPES.CREDIT;
      userDescription = null; // Will be filled by user later
    } else if (isDebitMovement) {
      // Debit movement: I paid for others, they owe me
      direction = DIRECTIONS.NEUTRAL; // Neutral because the actual expense is tracked separately
      type = MOVEMENT_TYPES.DEBIT_REPAYMENT;
      userDescription = null; // Will be filled by user later
    } else {
      // Fallback (shouldn't happen)
      direction = DIRECTIONS.OUTFLOW;
      type = MOVEMENT_TYPES.EXPENSE;
      userDescription = null;
    }

    // Don't set status for Splitwise movements
    const status = null;

    return [
      nextId,                                    // id
      null,                                      // gmail_id
      splitwiseMovement.splitwiseId,             // accounting_system_id
      timestamp,                                 // timestamp
      splitwiseMovement.amount,                  // amount
      splitwiseMovement.currency,                // currency
      splitwiseMovement.description,                // source_description
      userDescription,                           // user_description
      splitwiseMovement.category,                // category
      direction,                                 // direction
      type,                                      // type
      status,                                    // status (settled or unsettled)
      null,                                      // comment
      null,                                      // settled_movement_id
      ACCOUNTING_SYSTEMS.SPLITWISE,              // accounting_system
      SOURCES.ACCOUNTING                         // source
    ];
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
      null,                                      // accounting_system
      SOURCES.GMAIL                              // source
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
