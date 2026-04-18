/**
 * Main expense tracker service that orchestrates the entire workflow
 */

class ExpenseTracker {
  constructor(clientProperties = null) {
    this.clientProperties = clientProperties;
    this.database = new Database();
    this.gmailService = new GmailService(clientProperties);
    this.googleAIStudioService = new GoogleAIStudioService(clientProperties);
    this.monzoService = new MonzoService(clientProperties);
    this.currencyConversionService = new CurrencyConversionService();
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
            // If AI flags as earning, programmatically set direction, type, and category.
            if (analysisResult.is_earning) {
              analysisResult.direction = DIRECTIONS.INFLOW;
              analysisResult.type = MOVEMENT_TYPES.EARNING;
            }

            // If AI flags as neutral, programmatically set direction, type, and category.
            if (analysisResult.is_neutral) {
              analysisResult.direction = DIRECTIONS.NEUTRAL;
              analysisResult.type = MOVEMENT_TYPES.NEUTRAL;
            }

            // If the AI suggests splitting an expense for categorization purposes,
            // we perform that split instead of assigning a category now. The resulting
            // movements will be uncategorized for the user to detail further.
            if (analysisResult.needs_split && analysisResult.split_type === 'EXPENSE') {
              const splitInfo = {
                split_amount: analysisResult.split_amount,
                split_description: analysisResult.split_description,
              };

              // This new function splits one expense into two, leaving both uncategorized.
              const newMovementId = this.database.splitExpenseForRecategorization(movementId, splitInfo);
              
              if (newMovementId) {
                splitCount++;
                Logger.log(`Split movement ID ${movementId} into two uncategorized parts. New movement ID: ${newMovementId}`);
              } else {
                Logger.log(`Failed to split expense movement ID ${movementId}`);
                errorCount++;
              }
              analyzedCount++;
            } else {
              // 4. Original Logic: Update the movement with the analysis results
              this.database.updateMovementWithAnalysis(movementId, analysisResult);
              analyzedCount++;
              Logger.log(`Analyzed movement ID ${movementId}: "${userDescription}" -> category: ${analysisResult.category || 'none'}, direction: ${analysisResult.direction || 'unchanged'}, type: ${analysisResult.type || 'unchanged'}, needs_split: ${analysisResult.needs_split}`);

              // 5. If the movement needs to be split into a personal expense and a debit
              if (analysisResult.needs_split) {
                // When split_amount is 0 the user has no personal portion — convert
                // the whole movement to a DEBIT in place instead of splitting.
                if (analysisResult.split_amount === 0) {
                  this.database.convertMovementToDebit(movementId);
                  splitCount++;
                  Logger.log(`Converted movement ID ${movementId} to full DEBIT (no personal portion)`);
                } else {
                  const splitInfo = {
                    split_amount: analysisResult.split_amount,
                    split_category: analysisResult.split_category,
                    split_description: analysisResult.split_description,
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
   * Applies autofill rules from the "Rules" sheet to new movements.
   * It matches movements by source_description and sets the user_description and comment.
   * Rule patterns support regex: wrap the pattern in /.../ or /.../flags (e.g. /costa.+/i).
   * Plain strings without slashes are matched exactly (case-sensitive).
   */
  async applyAutofillRules() {
    try {
      Logger.log('Starting autofill rule processing...');

      // 1. Get rules from the "Rules" sheet
      const rules = this.database.getAutofillRules();
      if (rules.length === 0) {
        Logger.log('No autofill rules found or "Rules" sheet is empty.');
        return;
      }

      // 2. Get movements that are candidates for autofill
      const movementsToProcess = this.database.getMovementsToAutofill();
      if (movementsToProcess.length === 0) {
        Logger.log('No new movements to apply rules to.');
        return;
      }

      Logger.log(`Found ${rules.length} rule(s) and ${movementsToProcess.length} movement(s) to process.`);

      // 3. Pre-compile regex rules once
      const compiledRules = rules.map(rule => {
        const regexMatch = rule.sourceDescription.match(/^\/(.+)\/([gimsuy]*)$/);
        if (regexMatch) {
          try {
            return { ...rule, regex: new RegExp(regexMatch[1], regexMatch[2]) };
          } catch (e) {
            Logger.log(`Invalid regex in rule "${rule.sourceDescription}": ${e.message}`);
            return null;
          }
        }
        return { ...rule, regex: null };
      }).filter(Boolean);

      let appliedCount = 0;

      // 4. Iterate through movements and apply the first matching rule
      for (const movement of movementsToProcess) {
        const sourceDescription = movement[COLUMNS.SOURCE_DESCRIPTION];
        if (!sourceDescription) continue;

        const matchedRule = compiledRules.find(rule => {
          if (rule.regex) {
            return rule.regex.test(sourceDescription);
          }
          return sourceDescription.trim() === rule.sourceDescription.trim();
        });

        if (matchedRule) {
          this.database.updateMovementWithRule(movement[COLUMNS.ID], matchedRule.userDescription, matchedRule.comment);
          appliedCount++;
        }
      }
      Logger.log(`Autofill rule processing complete. Applied rules to ${appliedCount} movement(s).`);
    } catch (error) {
      Logger.log(`Error applying autofill rules: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process Monzo transactions and add them to the database
   * Fetches transactions from the last 8 days and adds them with idempotency
   */
  async processMonzoTransactions() {
    try {
      Logger.log('Starting Monzo transactions processing...');

      // 1. Refresh access token first (tokens expire after 6 hours)
      Logger.log('Refreshing Monzo access token...');
      const tokenRefreshResult = await this.monzoService.refreshAccessToken();
      if (!tokenRefreshResult) {
        Logger.log('Warning: Failed to refresh Monzo access token. Continuing with existing token if available.');
      }

      // 2. Test Monzo connection
      const connectionTest = await this.monzoService.testConnection();
      if (!connectionTest) {
        Logger.log('Monzo connection test failed. Please check your API credentials.');
        return;
      }

      // 3. Get existing Monzo transaction IDs for idempotency check
      const existingMonzoIds = this.database.getExistingSourceIds(SOURCES.MONZO);

      // 4. Get recent transactions from Monzo (last 8 days)
      const transactions = await this.monzoService.getRecentTransactions();

      if (transactions.length === 0) {
        Logger.log('No recent Monzo transactions found.');
        return;
      }

      Logger.log(`Found ${transactions.length} recent transaction(s) from Monzo`);

      // 5. Filter out transactions that already exist (idempotency)
      const newTransactions = transactions.filter(transaction => {
        const exists = existingMonzoIds.has(transaction.id);
        if (exists) {
          Logger.log(`Skipping transaction ${transaction.id} - already exists in database`);
        }
        return !exists;
      });

      if (newTransactions.length === 0) {
        Logger.log('All Monzo transactions already exist in database.');
        return;
      }

      Logger.log(`${newTransactions.length} new transaction(s) to add from Monzo`);

      // 6. Convert Monzo transactions to our database format and add them
      let nextId = this.database.getNextId();
      const batchMovements = [];

      for (const transaction of newTransactions) {
        const movementRow = this.createMonzoMovementRow(transaction, nextId);
        if (movementRow) {
          batchMovements.push({
            ts: transaction.settled || transaction.created,
            row: movementRow,
            monzoId: transaction.id
          });
          nextId++;
        }
      }

      // 7. Add all movements to the database
      if (batchMovements.length > 0) {
        this.database.addMovementsBatch(batchMovements);
        Logger.log(`Successfully processed ${batchMovements.length} Monzo transaction(s).`);
      }

    } catch (error) {
      Logger.log(`Error processing Monzo transactions: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a movement row for the database from Monzo transaction data
   * @param {Object} transaction - Monzo transaction object
   * @param {number} nextId - Next available ID for the movement
   * @returns {Array} Movement row array for database insertion
   */
  createMonzoMovementRow(transaction, nextId) {
    try {
      // Convert Monzo transaction to our movement format
      const movement = this.monzoService.convertTransactionToMovement(transaction, nextId);
      
      if (!movement) {
        return null;
      }

      // Get currency conversions
      const currencyValues = this.currencyConversionService.getAllCurrencyValues(
        movement.amount, 
        movement.currency,
        3 // maxRetries
      );

      return [
        new Date(movement.timestamp),           // timestamp (as Date object)
        movement.direction,                     // direction
        movement.type,                          // type
        movement.amount,                        // amount
        movement.currency,                      // currency
        movement.sourceDescription,            // source_description
        movement.userDescription,              // user_description
        movement.comment,                      // comment
        movement.aiComment,                    // ai_comment
        movement.category,                     // category
        movement.status,                       // status
        movement.settledMovementId,            // settled_movement_id
        currencyValues.clpValue,              // clp_value
        currencyValues.usdValue,              // usd_value
        currencyValues.gbpValue,              // gbp_value
        movement.originalAmount,               // original_amount
        movement.id,                           // id
        SOURCES.MONZO,                         // source
        movement.sourceId,                      // source_id
        movement.accountingSystemId            // accounting_system_id
      ];
    } catch (error) {
      Logger.log(`Failed to create Monzo movement row for transaction ${transaction.id}: ${error.message}`);
      return null;
    }
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

    // Get currency conversions
    const currencyValues = this.currencyConversionService.getAllCurrencyValues(
      transaction.amount, 
      transaction.currency,
      3 // maxRetries
    );

    return [
      new Date(transaction.timestamp),           // timestamp (as Date object)
      direction,                                 // direction
      transaction.transactionType,               // type
      transaction.amount,                        // amount
      transaction.currency,                      // currency
      transaction.sourceDescription,             // source_description
      null,                                      // user_description
      null,                                      // comment
      null,                                      // ai_comment
      null,                                      // category
      status,                                    // status
      null,                                      // settled_movement_id
      currencyValues.clpValue,                   // clp_value
      currencyValues.usdValue,                   // usd_value
      currencyValues.gbpValue,                   // gbp_value
      null,                                      // original_amount
      nextId,                                    // id
      SOURCES.GMAIL,                             // source
      transaction.gmailId,                       // source_id
      null                                       // accounting_system_id
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
        return DIRECTIONS.OUTFLOW;
      case MOVEMENT_TYPES.CREDIT:
        return DIRECTIONS.INFLOW;
      case MOVEMENT_TYPES.DEBIT_REPAYMENT:
        return DIRECTIONS.NEUTRAL;
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
        return STATUS.PENDING_DIRECT_SETTLEMENT;
      case MOVEMENT_TYPES.DEBIT_REPAYMENT:
        return null;
      default:
        return null;
    }
  }

  /**
   * Fix all movements that have failed currency conversions
   * This method is called as part of the main workflow to ensure all movements have proper currency values
   */
  async fixFailedCurrencyConversions() {
    try {
      Logger.log('Starting currency conversion fix process...');
      
      const result = this.database.fixAllFailedCurrencyConversions();
      
      if (result.successCount > 0) {
        Logger.log(`Successfully fixed ${result.successCount} movements with failed currency conversions`);
      }
      
      if (result.failureCount > 0) {
        Logger.log(`Warning: ${result.failureCount} movements could not be fixed. Check the logs for details.`);
      }
      
      if (result.successCount === 0 && result.failureCount === 0) {
        Logger.log('No movements with failed currency conversions found.');
      }
      
    } catch (error) {
      Logger.log(`Error fixing currency conversions: ${error.message}`);
      throw error;
    }
  }
}
