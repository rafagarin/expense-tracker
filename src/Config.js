/**
 * Configuration constants for the expense tracker
 */

// Spreadsheet configuration
const SPREADSHEET_TAB_NAME = 'Movements';

// Gmail search configuration
const GMAIL_QUERY = '(label:expenses newer_than:8d) OR label:expenses/manual ';

// Database column indices (0-based)
const COLUMNS = {
  USER_DESCRIPTION: 0,
  COMMENT: 1,
  TIMESTAMP: 2,
  SOURCE: 3,
  AMOUNT: 4,
  CURRENCY: 5,
  SOURCE_DESCRIPTION: 6,
  DIRECTION: 7,
  TYPE: 8,
  CATEGORY: 9,
  STATUS: 10,
  ID: 11,
  GMAIL_ID: 12,
  ACCOUNTING_SYSTEM_ID: 13,
  ACCOUNTING_SYSTEM: 14,
  SETTLED_MOVEMENT_ID: 15,
  CLP_VALUE: 16,
  USD_VALUE: 17,
  GBP_VALUE: 18
};

// Supported currencies
const CURRENCIES = {
  CLP: 'CLP',
  USD: 'USD',
  GBP: 'GBP'
};

// Movement types
const MOVEMENT_TYPES = {
  EXPENSE: 'expense',
  CASH: 'cash',
  DEBIT: 'debit',
  CREDIT: 'credit',
  DEBIT_REPAYMENT: 'debit repayment',
  CREDIT_REPAYMENT: 'credit repayment'
};

// Movement directions
const DIRECTIONS = {
  OUTFLOW: 'outflow',
  INFLOW: 'inflow',
  NEUTRAL: 'neutral'
};


// Status values
const STATUS = {
  UNSETTLED: 'unsettled',
  SETTLED: 'settled',
  PENDING_DIRECT_SETTLEMENT: 'pending direct settlement',
  PENDING_SPLITWISE_SETTLEMENT: 'pending splitwise settlement',
  IN_SPLITWISE: 'in splitwise'
};

// Accounting systems
const ACCOUNTING_SYSTEMS = {
  SPLITWISE: 'splitwise'
};

// Source values
const SOURCES = {
  GMAIL: 'gmail',
  ACCOUNTING: 'accounting'
};

// Splitwise configuration
const SPLITWISE_CONFIG = {
  DEFAULT_GROUP_ID: 0, // Set this to your default group ID, or 0 for personal expenses
  OTHER_USER_ID: null // User ID of the person you commonly split expenses with
};

// API Configuration
const API_CONFIG = {
  // Google AI Studio API configuration
  GOOGLE_AI_STUDIO: {
    BASE_URL: 'https://generativelanguage.googleapis.com/v1beta',
    MODEL: 'gemini-2.0-flash',
    API_KEY_PROPERTY: 'GOOGLE_AI_STUDIO_API_KEY'
  },
  // Splitwise API configuration
  SPLITWISE: {
    BASE_URL: 'https://secure.splitwise.com/api/v3.0',
    API_KEY_PROPERTY: 'SPLITWISE_API_KEY'
  }
};

/**
 * Get API key from PropertiesService
 * This is the secure way to store API keys in Google Apps Script
 * @param {string} keyName - The property name for the API key
 * @returns {string} The API key
 */
function getApiKey(keyName) {
  const properties = PropertiesService.getScriptProperties();
  const apiKey = properties.getProperty(keyName);
  
  if (!apiKey) {
    throw new Error(`API key '${keyName}' not found. Please set it in the script properties.`);
  }
  
  return apiKey;
}

/**
 * Set API key in PropertiesService
 * This should be called once to store your API key securely
 * @param {string} keyName - The property name for the API key
 * @param {string} apiKey - The API key value
 */
function setApiKey(keyName, apiKey) {
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty(keyName, apiKey);
  Logger.log(`API key '${keyName}' has been stored securely.`);
}

// Configuration is now available globally in Google Apps Script
