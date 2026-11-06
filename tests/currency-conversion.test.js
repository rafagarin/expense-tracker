import { describe, it, expect, vi } from 'vitest';

describe('CurrencyConversionService', () => {
  it('loads the EUR-to-CLP rate from Values cell C6', () => {
    const service = new CurrencyConversionService();
    const rates = { C3: 1000, C4: 1.25, C5: 1250, C6: 1100 };
    service.settingsSheet = {
      getRange: vi.fn(cell => ({ getValue: () => rates[cell] })),
    };

    service.loadConversionRates();

    expect(service.conversionRates['EUR/CLP']).toBe(1100);
    expect(service.settingsSheet.getRange).toHaveBeenCalledWith('C6');
  });

  it('converts EUR amounts into CLP, USD, GBP, and EUR values', () => {
    const service = new CurrencyConversionService();
    service.conversionRates = {
      'USD/CLP': 1000,
      'GBP/USD': 1.25,
      'GBP/CLP': 1250,
      'EUR/CLP': 1100,
    };

    expect(service.isSupportedCurrency('EUR')).toBe(true);
    expect(service.getAllCurrencyValues(10, 'EUR')).toEqual({
      clpValue: 11000,
      usdValue: 11,
      gbpValue: 8.8,
      eurValue: 10,
    });
  });

  it('splits EUR values proportionally', () => {
    const service = new CurrencyConversionService();

    expect(service.splitCurrencyValues(20, 5, {
      clpValue: 22000,
      usdValue: 22,
      gbpValue: 17.6,
      eurValue: 20,
    })).toEqual({
      clpValue: 5500,
      usdValue: 5.5,
      gbpValue: 4.4,
      eurValue: 5,
    });
  });

  it('preserves missing conversion values when splitting legacy rows', () => {
    const service = new CurrencyConversionService();

    expect(service.splitCurrencyValues(20, 5, {
      clpValue: 22000,
      usdValue: 22,
      gbpValue: 17.6,
      eurValue: null,
    }).eurValue).toBeNull();
  });
});
