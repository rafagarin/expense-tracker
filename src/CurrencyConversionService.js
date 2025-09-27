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
   * Get all currency values for a given amount and currency
   * @param {number} amount - The amount to convert
   * @param {string} currency - Source currency
   * @returns {Object} Object with clpValue, usdValue, gbpValue
   */
  getAllCurrencyValues(amount, currency) {
    const clpValue = this.convertToClp(amount, currency);
    const usdValue = this.convertFromClp(clpValue, CURRENCIES.USD);
    const gbpValue = this.convertFromClp(clpValue, CURRENCIES.GBP);

    return {
      clpValue: Math.round(clpValue * 100) / 100, // Round to 2 decimal places
      usdValue: Math.round(usdValue * 100) / 100,
      gbpValue: Math.round(gbpValue * 100) / 100
    };
  }

  /**
   * Refresh conversion rates from the Values sheet
   * Call this if rates have been updated
   */
  refreshRates() {
    this.loadConversionRates();
    Logger.log('Conversion rates refreshed');
  }
}
