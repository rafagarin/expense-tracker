/**
 * Monzo API service for fetching transactions
 * Handles authentication and transaction retrieval from Monzo API
 */

class MonzoService {
  constructor(clientProperties = null) {
    this.clientProperties = clientProperties;
    this.baseUrl = 'https://api.monzo.com';
    this.accessToken = null;
    this.refreshToken = null;
    this.clientId = null;
    this.clientSecret = null;
    this.accountId = null;
  }

  /**
   * Initialize the service with API credentials
   * @returns {boolean} True if initialization was successful
   */
  initialize() {
    try {
      this.accessToken = getApiKey('MONZO_ACCESS_TOKEN', this.clientProperties);
      this.refreshToken = getApiKey('MONZO_REFRESH_TOKEN', this.clientProperties);
      this.clientId = getApiKey('MONZO_CLIENT_ID', this.clientProperties);
      this.clientSecret = getApiKey('MONZO_CLIENT_SECRET', this.clientProperties);
      
      Logger.log('Monzo service initialized successfully');
      return true;
    } catch (error) {
      Logger.log(`Failed to initialize Monzo service: ${error.message}`);
      return false;
    }
  }

  /**
   * Test the connection to Monzo API
   * @returns {boolean} True if connection is successful
   */
  async testConnection() {
    try {
      if (!this.initialize()) {
        return false;
      }

      const response = await this.makeAuthenticatedRequest('/ping/whoami');
      
      if (response && response.authenticated) {
        Logger.log(`Monzo connection test successful. User ID: ${response.user_id}`);
        return true;
      } else {
        Logger.log('Monzo connection test failed - not authenticated');
        return false;
      }
    } catch (error) {
      Logger.log(`Monzo connection test failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Get account information
   * @returns {Object|null} Account information or null if failed
   */
  async getAccount() {
    try {
      const response = await this.makeAuthenticatedRequest('/accounts');
      
      if (response && response.accounts && response.accounts.length > 0) {
        // Use the first account (typically the main current account)
        this.accountId = response.accounts[0].id;
        Logger.log(`Found Monzo account: ${this.accountId}`);
        return response.accounts[0];
      } else {
        Logger.log('No Monzo accounts found');
        return null;
      }
    } catch (error) {
      Logger.log(`Failed to get Monzo account: ${error.message}`);
      return null;
    }
  }

  /**
   * Get transactions from Monzo API
   * @param {string} since - RFC3339 timestamp for start date (optional)
   * @returns {Array} Array of transaction objects
   */
  async getTransactions(since = null) {
    try {
      if (!this.accountId) {
        await this.getAccount();
        if (!this.accountId) {
          throw new Error('No Monzo account ID available');
        }
      }

      let url = `/transactions?account_id=${this.accountId}`;
      
      // Add since parameter if provided
      if (since) {
        url += `&since=${encodeURIComponent(since)}`;
      }

      const response = await this.makeAuthenticatedRequest(url);
      
      if (response && response.transactions) {
        Logger.log(`Retrieved ${response.transactions.length} transactions from Monzo`);
        return response.transactions;
      } else {
        Logger.log('No transactions found in Monzo response');
        return [];
      }
    } catch (error) {
      Logger.log(`Failed to get Monzo transactions: ${error.message}`);
      return [];
    }
  }

  /**
   * Get transactions from the last 8 days
   * @returns {Array} Array of transaction objects from the last 8 days
   */
  async getRecentTransactions() {
    try {
      // Calculate date 8 days ago
      const eightDaysAgo = new Date();
      eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);
      const sinceDate = eightDaysAgo.toISOString();

      Logger.log(`Fetching Monzo transactions since ${sinceDate}`);
      
      const transactions = await this.getTransactions(sinceDate);
      
      // Filter out declined transactions (only present on declined transactions)
      const successfulTransactions = transactions.filter(tx => !tx.decline_reason);
      
      Logger.log(`Found ${transactions.length} transactions from the last 8 days (${successfulTransactions.length} successful, ${transactions.length - successfulTransactions.length} declined)`);
      return successfulTransactions;
    } catch (error) {
      Logger.log(`Failed to get recent Monzo transactions: ${error.message}`);
      return [];
    }
  }

  /**
   * Convert Monzo transaction to our movement format
   * @param {Object} transaction - Monzo transaction object
   * @param {number} nextId - Next available ID for the movement
   * @returns {Object} Movement object in our format
   */
  convertTransactionToMovement(transaction, nextId) {
    try {
      // Determine transaction type based on amount and category
      let type, direction;
      
      if (transaction.amount < 0) {
        // Negative amount = spending
        if (transaction.is_load) {
          type = MOVEMENT_TYPES.CASH; // Top-up
          direction = DIRECTIONS.INFLOW;
        } else {
          type = MOVEMENT_TYPES.EXPENSE; // Regular expense
          direction = DIRECTIONS.OUTFLOW;
        }
      } else {
        // Positive amount = income/refund
        type = MOVEMENT_TYPES.DEBIT_REPAYMENT; // Treat as debit repayment
        direction = DIRECTIONS.INFLOW;
      }

      // Convert amount from minor units (pennies) to major units
      // Always make amount positive (remove negative sign)
      const amount = Math.abs(transaction.amount) / 100;
      
      // Don't set category - let AI determine it later
      const category = null;

      // Use settled date if available, otherwise use created date
      const timestamp = transaction.settled || transaction.created;

      return {
        timestamp: timestamp,
        direction: direction,
        type: type,
        amount: amount,
        currency: transaction.currency,
        sourceDescription: transaction.description,
        userDescription: null, // User fills this manually
        comment: null,
        aiComment: null,
        category: category,
        status: null,
        settledMovementId: null,
        clpValue: null, // Will be calculated by currency conversion service
        usdValue: null, // Will be calculated by currency conversion service
        gbpValue: null, // Will be calculated by currency conversion service
        originalAmount: null,
        id: nextId,
        source: 'monzo',
        sourceId: transaction.id, // Use Monzo transaction ID for idempotency
        accountingSystemId: null
      };
    } catch (error) {
      Logger.log(`Failed to convert Monzo transaction ${transaction.id}: ${error.message}`);
      return null;
    }
  }

  /**
   * Make an authenticated request to Monzo API
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Request options
   * @returns {Object} Response data
   */
  async makeAuthenticatedRequest(endpoint, options = {}) {
    try {
      if (!this.accessToken) {
        throw new Error('No access token available');
      }

      const url = `${this.baseUrl}${endpoint}`;
      
      const requestOptions = {
        method: options.method || 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        ...options
      };

      const response = UrlFetchApp.fetch(url, requestOptions);
      
      if (response.getResponseCode() !== 200) {
        throw new Error(`Monzo API request failed with status ${response.getResponseCode()}: ${response.getContentText()}`);
      }

      const responseText = response.getContentText();
      return JSON.parse(responseText);
    } catch (error) {
      Logger.log(`Monzo API request failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Refresh the access token using refresh token
   * @param {string} refreshToken - Refresh token (optional, uses stored token if not provided)
   * @returns {Object|null} New token data or null if failed
   */
  async refreshAccessToken(refreshToken = null) {
    try {
      const tokenToUse = refreshToken || this.refreshToken;
      
      if (!tokenToUse) {
        throw new Error('No refresh token available');
      }

      const url = `${this.baseUrl}/oauth2/token`;
      
      const requestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        payload: {
          'grant_type': 'refresh_token',
          'client_id': this.clientId,
          'client_secret': this.clientSecret,
          'refresh_token': tokenToUse
        }
      };

      const response = UrlFetchApp.fetch(url, requestOptions);
      
      if (response.getResponseCode() !== 200) {
        throw new Error(`Token refresh failed with status ${response.getResponseCode()}: ${response.getContentText()}`);
      }

      const responseText = response.getContentText();
      const tokenData = JSON.parse(responseText);
      
      // Update stored tokens
      this.accessToken = tokenData.access_token;
      if (tokenData.refresh_token) {
        this.refreshToken = tokenData.refresh_token;
      }
      
      Logger.log('Monzo access token refreshed successfully');
      return tokenData;
    } catch (error) {
      Logger.log(`Failed to refresh Monzo access token: ${error.message}`);
      return null;
    }
  }
}
