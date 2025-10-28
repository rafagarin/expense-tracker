/**
 * Currency conversion service for the expense tracker
 * Handles conversion between CLP, USD, and GBP using rates from Values sheet
 */

class CurrencyConversionService {
  constructor() {
    this.settingsSheet = null;
    this.conversionRates = null;
    this.initializeSettingsSheet();
  }

  /**
   * Initialize the Values sheet and load conversion rates
   */
  initializeSettingsSheet() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    this.settingsSheet = ss.getSheetByName('Values');
    
    if (!this.settingsSheet) {
      throw new Error('Values sheet not found. Please create a Values sheet with conversion rates.');
    }
    
    this.loadConversionRates();
  }

  /**
   * Load conversion rates from the Values sheet
   * Expected cells:
   * - C3: USD/CLP rate
   * - C4: GBP/USD rate  
   * - C5: GBP/CLP rate
   */
  loadConversionRates() {
    try {
      const usdToClp = this.settingsSheet.getRange('C3').getValue();
      const gbpToUsd = this.settingsSheet.getRange('C4').getValue();
      const gbpToClp = this.settingsSheet.getRange('C5').getValue();

      if (!usdToClp || !gbpToUsd || !gbpToClp) {
        throw new Error('Conversion rates not found in Values sheet. Please set values in C3, C4, and C5.');
      }

      this.conversionRates = {
        'USD/CLP': usdToClp,
        'GBP/USD': gbpToUsd,
        'GBP/CLP': gbpToClp
      };

      Logger.log('Conversion rates loaded:', this.conversionRates);
    } catch (error) {
      Logger.log(`Error loading conversion rates: ${error.message}`);
      throw error;
    }
  }

  /**
   * Convert an amount from one currency to another
   * @param {number} amount - The amount to convert
   * @param {string} fromCurrency - Source currency (CLP, USD, GBP)
   * @param {string} toCurrency - Target currency (CLP, USD, GBP)
   * @returns {number} Converted amount
   */
  convertCurrency(amount, fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) {
      return amount;
    }

    if (!this.conversionRates) {
      this.loadConversionRates();
    }

    // Convert to CLP first, then to target currency
    let amountInClp = this.convertToClp(amount, fromCurrency);
    return this.convertFromClp(amountInClp, toCurrency);
  }

  /**
   * Convert any currency to CLP
   * @param {number} amount - The amount to convert
   * @param {string} currency - Source currency
   * @returns {number} Amount in CLP
   */
  convertToClp(amount, currency) {
    switch (currency) {
      case CURRENCIES.CLP:
        return amount;
      case CURRENCIES.USD:
        return amount * this.conversionRates['USD/CLP'];
      case CURRENCIES.GBP:
        return amount * this.conversionRates['GBP/CLP'];
      default:
        throw new Error(`Unsupported currency: ${currency}`);
    }
  }

  /**
   * Convert from CLP to any currency
   * @param {number} amountInClp - The amount in CLP
   * @param {string} currency - Target currency
   * @returns {number} Converted amount
   */
  convertFromClp(amountInClp, currency) {
    switch (currency) {
      case CURRENCIES.CLP:
        return amountInClp;
      case CURRENCIES.USD:
        return amountInClp / this.conversionRates['USD/CLP'];
      case CURRENCIES.GBP:
        return amountInClp / this.conversionRates['GBP/CLP'];
      default:
        throw new Error(`Unsupported currency: ${currency}`);
    }
  }

  /**
   * Split currency values proportionally based on the split ratio
   * @param {number} originalAmount - Original amount in source currency
   * @param {number} splitAmount - Amount to split out
   * @param {Object} originalCurrencyValues - Original currency values {clpValue, usdValue, gbpValue}
   * @returns {Object} Split currency values {clpValue, usdValue, gbpValue}
   */
  splitCurrencyValues(originalAmount, splitAmount, originalCurrencyValues) {
    const splitRatio = splitAmount / originalAmount;
    
    return {
      clpValue: Math.round(originalCurrencyValues.clpValue * splitRatio * 100) / 100,
      usdValue: Math.round(originalCurrencyValues.usdValue * splitRatio * 100) / 100,
      gbpValue: Math.round(originalCurrencyValues.gbpValue * splitRatio * 100) / 100
    };
  }

  /**
   * Check if a currency is supported by the internal conversion system
   * @param {string} currency - The currency code to check
   * @returns {boolean} True if the currency is supported internally
   */
  isSupportedCurrency(currency) {
    return currency === CURRENCIES.CLP || currency === CURRENCIES.USD || currency === CURRENCIES.GBP;
  }

  /**
   * Generate Google Finance formula for currency conversion
   * @param {number} amount - The amount to convert
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @returns {string} Google Finance formula
   */
  generateGoogleFinanceFormula(amount, fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) {
      return amount; // No conversion needed
    }
    
    // Google Finance format: GOOGLEFINANCE("CURRENCY:FROMTO")
    const currencyPair = `${fromCurrency}${toCurrency}`;
    return `=${amount}*GOOGLEFINANCE("CURRENCY:${currencyPair}")`;
  }

  /**
   * Get all currency values for a given amount and currency
   * @param {number} amount - The amount to convert
   * @param {string} currency - Source currency
   * @param {number} maxRetries - Maximum number of retry attempts (default: 3)
   * @returns {Object} Object with clpValue, usdValue, gbpValue (calculated values)
   */
  getAllCurrencyValues(amount, currency, maxRetries = 3) {
    // If currency is not supported, use Google Finance to calculate actual values
    if (!this.isSupportedCurrency(currency)) {
      Logger.log(`Currency ${currency} not supported internally, using Google Finance to calculate values`);
      return this.getAllCurrencyValuesWithGoogleFinanceCalculated(amount, currency);
    }
    
    // Use internal conversion for supported currencies
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Refresh rates on retry attempts
        if (attempt > 1) {
          this.refreshRates();
        }
        
        const clpValue = this.convertToClp(amount, currency);
        const usdValue = this.convertFromClp(clpValue, CURRENCIES.USD);
        const gbpValue = this.convertFromClp(clpValue, CURRENCIES.GBP);

        return {
          clpValue: Math.round(clpValue * 100) / 100, // Round to 2 decimal places
          usdValue: Math.round(usdValue * 100) / 100,
          gbpValue: Math.round(gbpValue * 100) / 100
        };
      } catch (error) {
        lastError = error;
        Logger.log(`Currency conversion attempt ${attempt} failed: ${error.message}`);
        
        if (attempt < maxRetries) {
          // Wait a bit before retrying (exponential backoff)
          Utilities.sleep(1000 * attempt);
        }
      }
    }
    
    // If all retries failed, return null values to indicate failure
    Logger.log(`Currency conversion failed after ${maxRetries} attempts. Last error: ${lastError.message}`);
    return {
      clpValue: null,
      usdValue: null,
      gbpValue: null
    };
  }

  /**
   * Get all currency values using Google Finance formulas for unsupported currencies
   * @param {number} amount - The amount to convert
   * @param {string} currency - Source currency
   * @returns {Object} Object with clpValue, usdValue, gbpValue as Google Finance formulas
   */
  getAllCurrencyValuesWithGoogleFinance(amount, currency) {
    return {
      clpValue: this.generateGoogleFinanceFormula(amount, currency, CURRENCIES.CLP),
      usdValue: this.generateGoogleFinanceFormula(amount, currency, CURRENCIES.USD),
      gbpValue: this.generateGoogleFinanceFormula(amount, currency, CURRENCIES.GBP)
    };
  }

  /**
   * Calculate Google Finance values and return actual numbers instead of formulas
   * @param {number} amount - The amount to convert
   * @param {string} currency - Source currency
   * @returns {Object} Object with clpValue, usdValue, gbpValue as calculated numbers
   */
  getAllCurrencyValuesWithGoogleFinanceCalculated(amount, currency) {
    try {
      // Create a temporary sheet to calculate the Google Finance values
      const tempSheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet('TempCurrencyCalc');
      
      // Set up the calculation
      const amountCell = tempSheet.getRange('A1');
      const clpCell = tempSheet.getRange('B1');
      const usdCell = tempSheet.getRange('C1');
      const gbpCell = tempSheet.getRange('D1');
      
      // Set the amount
      amountCell.setValue(amount);
      
      // Set up Google Finance formulas
      clpCell.setFormula(`=A1*GOOGLEFINANCE("CURRENCY:${currency}${CURRENCIES.CLP}")`);
      usdCell.setFormula(`=A1*GOOGLEFINANCE("CURRENCY:${currency}${CURRENCIES.USD}")`);
      gbpCell.setFormula(`=A1*GOOGLEFINANCE("CURRENCY:${currency}${CURRENCIES.GBP}")`);
      
      // Wait a moment for formulas to calculate
      SpreadsheetApp.flush();
      Utilities.sleep(1000);
      
      // Get the calculated values
      const clpValue = clpCell.getValue();
      const usdValue = usdCell.getValue();
      const gbpValue = gbpCell.getValue();
      
      // Clean up - delete the temporary sheet
      SpreadsheetApp.getActiveSpreadsheet().deleteSheet(tempSheet);
      
      // Check if we got valid values
      if (isNaN(clpValue) || isNaN(usdValue) || isNaN(gbpValue)) {
        Logger.log(`Google Finance calculation failed for ${amount} ${currency}`);
        return {
          clpValue: null,
          usdValue: null,
          gbpValue: null
        };
      }
      
      return {
        clpValue: Math.round(clpValue * 100) / 100,
        usdValue: Math.round(usdValue * 100) / 100,
        gbpValue: Math.round(gbpValue * 100) / 100
      };
      
    } catch (error) {
      Logger.log(`Error calculating Google Finance values: ${error.message}`);
      return {
        clpValue: null,
        usdValue: null,
        gbpValue: null
      };
    }
  }

  /**
   * Refresh conversion rates from the Values sheet
   * Call this if rates have been updated
   */
  refreshRates() {
    this.loadConversionRates();
    Logger.log('Conversion rates refreshed');
  }

  /**
   * Check if a currency value represents a failed conversion (#NUM! error)
   * @param {*} value - The value to check
   * @returns {boolean} True if the value represents a failed conversion
   */
  isFailedConversion(value) {
    // Check for various forms of error values that might appear in Google Sheets
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') {
      return value.includes('#NUM!') || value.includes('#ERROR!') || value.includes('#VALUE!') || value.trim() === '';
    }
    if (typeof value === 'number') {
      return isNaN(value) || !isFinite(value);
    }
    return false;
  }

  /**
   * Check if a value is a Google Finance formula
   * @param {*} value - The value to check
   * @returns {boolean} True if the value is a Google Finance formula
   */
  isGoogleFinanceFormula(value) {
    if (typeof value === 'string') {
      return value.includes('GOOGLEFINANCE') && value.includes('CURRENCY:');
    }
    return false;
  }

  /**
   * Fix currency conversion for a movement by recalculating all currency values
   * @param {number} amount - The original amount
   * @param {string} currency - The original currency
   * @returns {Object|null} Object with clpValue, usdValue, gbpValue or null if conversion fails
   */
  fixCurrencyConversion(amount, currency) {
    try {
      Logger.log(`Attempting to fix currency conversion for ${amount} ${currency}`);
      return this.getAllCurrencyValues(amount, currency, 3);
    } catch (error) {
      Logger.log(`Failed to fix currency conversion: ${error.message}`);
      return null;
    }
  }
}
