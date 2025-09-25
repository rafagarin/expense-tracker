/**
 * Configuration constants for the expense tracker
 */

// Spreadsheet configuration
const SPREADSHEET_TAB_NAME = 'Movements';

// Gmail search configuration
const GMAIL_QUERY = 'label:Expenses newer_than:5d';

// Database column indices (0-based)
const COLUMNS = {
  ID: 0,
  GMAIL_ID: 1,
  ACCOUNTING_SYSTEM_ID: 2,
  TIMESTAMP: 3,
  AMOUNT: 4,
  CURRENCY: 5,
  SOURCE_DESCRIPTION: 6,
  USER_DESCRIPTION: 7,
  CATEGORY: 8,
  DIRECTION: 9,
  TYPE: 10,
  STATUS: 11,
  COMMENT: 12,
  SETTLED_MOVEMENT_ID: 13,
  ACCOUNTING_SYSTEM: 14
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

// Categories
const CATEGORIES = {
  HOUSING: 'housing',
  FOOD: 'food',
  TRANSPORTATION: 'transportation',
  HEALTH: 'health',
  PERSONAL: 'personal',
  HOUSEHOLD: 'household',
  ENTERTAINMENT: 'entertainment',
  WORK: 'work',
  MISCELLANEOUS: 'miscellaneous'
};

// Status values
const STATUS = {
  UNSETTLED: 'unsettled',
  SETTLED: 'settled'
};

// Accounting systems
const ACCOUNTING_SYSTEMS = {
  SPLITWISE: 'splitwise'
};

// API Configuration
const API_CONFIG = {
  // Google AI Studio API configuration
  GOOGLE_AI_STUDIO: {
    BASE_URL: 'https://generativelanguage.googleapis.com/v1beta',
    MODEL: 'gemini-2.0-flash',
    API_KEY_PROPERTY: 'GOOGLE_AI_STUDIO_API_KEY'
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
