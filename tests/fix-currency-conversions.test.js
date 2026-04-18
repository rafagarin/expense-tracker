import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Build a movement row with currency fields set to null by default
// (simulating a failed conversion) or overridable per-test.
function makeMovement({
  id = 1,
  amount = 50,
  currency = 'GBP',
  clpValue = null,
  usdValue = null,
  gbpValue = null,
} = {}) {
  const row = new Array(21).fill(null);
  row[COLUMNS.ID] = id;
  row[COLUMNS.AMOUNT] = amount;
  row[COLUMNS.CURRENCY] = currency;
  row[COLUMNS.CLP_VALUE] = clpValue;
  row[COLUMNS.USD_VALUE] = usdValue;
  row[COLUMNS.GBP_VALUE] = gbpValue;
  return row;
}

describe('fixFailedCurrencyConversions', () => {
  let tracker;
  let setValueSpy;

  beforeEach(() => {
    tracker = new ExpenseTracker();

    // Replace the database sheet with a spy-enabled stub so we can assert
    // on which values get written back.
    setValueSpy = vi.fn();
    tracker.database.sheet = {
      getLastRow: () => 4,
      getLastColumn: () => 21,
      getRange: vi.fn(() => ({
        setValue: setValueSpy,
        getValue: () => 1000,
        getValues: () => [],
        setValues: () => {},
      })),
      appendRow: () => {},
    };

    // Mock the two database query methods so tests control the data.
    tracker.database.getMovementsWithFailedCurrencyConversion = vi.fn();
    tracker.database.getAllMovements = vi.fn();

    // Stub currency conversion so tests don't touch real rate APIs.
    vi.spyOn(CurrencyConversionService.prototype, 'getAllCurrencyValues').mockReturnValue({
      clpValue: 50000,
      usdValue: 62,
      gbpValue: 50,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('makes no sheet writes when there are no failed conversions', async () => {
    tracker.database.getMovementsWithFailedCurrencyConversion.mockReturnValue([]);

    await tracker.fixFailedCurrencyConversions();

    expect(setValueSpy).not.toHaveBeenCalled();
  });

  it('writes the converted currency values to the correct sheet row', async () => {
    const movement = makeMovement({ id: 1, amount: 50, currency: 'GBP' });
    tracker.database.getMovementsWithFailedCurrencyConversion.mockReturnValue([movement]);
    tracker.database.getAllMovements.mockReturnValue([movement]);

    await tracker.fixFailedCurrencyConversions();

    expect(CurrencyConversionService.prototype.getAllCurrencyValues).toHaveBeenCalled();
    expect(setValueSpy).toHaveBeenCalledTimes(3);
    expect(setValueSpy).toHaveBeenCalledWith(50000);
    expect(setValueSpy).toHaveBeenCalledWith(62);
    expect(setValueSpy).toHaveBeenCalledWith(50);
  });

  it('leaves the movement unchanged when getAllCurrencyValues returns null', async () => {
    const movement = makeMovement({ id: 1, amount: 50, currency: 'GBP' });
    tracker.database.getMovementsWithFailedCurrencyConversion.mockReturnValue([movement]);
    tracker.database.getAllMovements.mockReturnValue([movement]);
    vi.spyOn(CurrencyConversionService.prototype, 'getAllCurrencyValues').mockReturnValue(null);

    await tracker.fixFailedCurrencyConversions();

    expect(setValueSpy).not.toHaveBeenCalled();
  });
});
