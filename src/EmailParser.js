/**
 * Email parsing utilities for extracting transaction data from bank emails
 */

class EmailParser {
  constructor() {
    // Regex pattern for parsing bank email content
    // Examples handled:
    // "Te informamos que se ha realizado una compra por $23.320 ... en LAS LOMAS SANTIAGO CL el 16/09/2025 14:48."
    // "Te informamos ... $12.990 ... en DOS CARACOLES, LOCAL 36-BSANTIAGO CL el 16/09/2025 18:13."
    // "Te informamos ... $4.492 ... en PAYU *UBER TRIP SANTIAGO CL el 16/09/2025 23:40."
    this.transactionRegex = /compra por\s+(US?\$|GBP?£|\$)\s*([\d\.,]+)[\s\S]*?\ben\s+(.+?)\s+el\s+(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2})/gi;
  }

  /**
   * Parse a single email and extract transaction data
   * @param {Object} message - Gmail message object
   * @returns {Array} Array of parsed transaction objects
   */
  parseEmail(message) {
    const gmailId = message.getId();
    const body = message.getPlainBody();
    const transactions = [];

    let match;
    let anyMatch = false;

    while ((match = this.transactionRegex.exec(body)) !== null) {
      anyMatch = true;
      
      const transaction = this.parseTransactionMatch(match, gmailId);
      if (transaction) {
        transactions.push(transaction);
      }
    }

    if (!anyMatch) {
      Logger.log(`Email with ID ${gmailId} did not match the expected format. Skipping.`);
    }

    return transactions;
  }

  /**
   * Parse a single transaction match from regex
   * @param {Array} match - Regex match result
   * @param {string} gmailId - Gmail ID for the email
   * @returns {Object|null} Parsed transaction object or null if invalid
   */
  parseTransactionMatch(match, gmailId) {
    try {
      const currencyIndicator = match[1];
      const amountStr = match[2];
      const sourceDescription = match[3].trim();
      const tsStr = match[4]; // dd/MM/yyyy HH:mm

      // Determine currency and clean amount
      const { currency, amount } = this.parseCurrencyAndAmount(currencyIndicator, amountStr);
      
      // Parse timestamp
      const timestamp = this.parseTimestamp(tsStr);
      
      if (!timestamp) {
        Logger.log(`Failed to parse timestamp: ${tsStr}`);
        return null;
      }

      return {
        gmailId,
        timestamp,
        amount,
        currency,
        sourceDescription
      };
    } catch (error) {
      Logger.log(`Error parsing transaction match: ${error.message}`);
      return null;
    }
  }

  /**
   * Parse currency and amount from the raw strings
   * @param {string} currencyIndicator - Currency symbol from email
   * @param {string} amountStr - Raw amount string
   * @returns {Object} Object with currency and amount
   */
  parseCurrencyAndAmount(currencyIndicator, amountStr) {
    let currency;
    let cleanedAmountStr;

    if (currencyIndicator.toUpperCase().includes('US')) {
      currency = CURRENCIES.USD;
    } else if (currencyIndicator.toUpperCase().includes('GBP') || currencyIndicator.includes('£')) {
      currency = CURRENCIES.GBP;
    } else {
      currency = CURRENCIES.CLP; // Default currency
    }

    // Clean the amount string based on the determined currency
    if (currency === CURRENCIES.USD || currency === CURRENCIES.GBP) {
      // For USD/GBP: remove thousands separators (.) and replace decimal comma with dot
      cleanedAmountStr = amountStr.replace(/\./g, '').replace(',', '.');
    } else { // CLP
      // For CLP: remove thousands separators (.)
      cleanedAmountStr = amountStr.replace(/\./g, '');
    }

    const amount = parseFloat(cleanedAmountStr);
    
    if (isNaN(amount)) {
      throw new Error(`Invalid amount: ${amountStr}`);
    }

    return { currency, amount };
  }

  /**
   * Parse timestamp from "dd/MM/yyyy HH:mm" format to ISO 8601 UTC
   * @param {string} tsStr - Timestamp string in dd/MM/yyyy HH:mm format
   * @returns {string|null} ISO 8601 timestamp or null if parsing fails
   */
  parseTimestamp(tsStr) {
    const tsMatch = tsStr.match(/(\d{2})\/(\d{2})\/(20\d{2})\s+(\d{2}):(\d{2})/);
    
    if (!tsMatch) {
      return null;
    }

    const day = parseInt(tsMatch[1], 10);
    const month = parseInt(tsMatch[2], 10) - 1; // JS months are 0-11
    const year = parseInt(tsMatch[3], 10);
    const hour = parseInt(tsMatch[4], 10);
    const minute = parseInt(tsMatch[5], 10);

    const localDate = new Date(year, month, day, hour, minute, 0, 0);
    return localDate.toISOString();
  }

  /**
   * Create a movement row for the database from parsed transaction data
   * @param {Object} transaction - Parsed transaction object
   * @param {number} nextId - Next available ID for the movement
   * @returns {Array} Movement row array for database insertion
   */
  createMovementRow(transaction, nextId) {
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
      DIRECTIONS.OUTFLOW,                        // direction
      MOVEMENT_TYPES.EXPENSE,                    // type
      null,                                      // status
      null,                                      // comment
      null,                                      // settled_movement_id
      null                                       // accounting_system
    ];
  }
}
