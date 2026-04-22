import { describe, it, expect, vi, beforeEach } from 'vitest';

// Build a minimal movement row that has a user_description but no amount —
// the shape getMovementsNeedingFieldInference returns.
function makeDescriptionOnlyMovement({ id = 1, userDescription = 'paid £42.50 at Costa Coffee' } = {}) {
  const row = new Array(21).fill(null);
  row[COLUMNS.ID] = id;
  row[COLUMNS.USER_DESCRIPTION] = userDescription;
  return row;
}

// Minimal AI result for a successfully parsed manual entry.
function makeTransaction(overrides = {}) {
  return {
    description: 'paid £42.50 at Costa Coffee',
    amount: 42.5,
    currency: 'GBP',
    transactionType: MOVEMENT_TYPES.EXPENSE,
    ...overrides,
  };
}

describe('processDescriptionOnlyMovements', () => {
  let tracker;

  beforeEach(() => {
    tracker = new ExpenseTracker();
    tracker.database.getMovementsNeedingFieldInference = vi.fn();
    tracker.database.updateMovementWithInferredFields = vi.fn();
    tracker.googleAIStudioService.parseManualEntry = vi.fn();
    tracker.currencyConversionService.getAllCurrencyValues = vi.fn().mockReturnValue({
      clpValue: 42500,
      usdValue: 53,
      gbpValue: 42.5,
    });
  });

  // --- early exit ---

  it('returns early without calling AI when there are no description-only movements', async () => {
    tracker.database.getMovementsNeedingFieldInference.mockReturnValue([]);

    await tracker.processDescriptionOnlyMovements();

    expect(tracker.googleAIStudioService.parseManualEntry).not.toHaveBeenCalled();
    expect(tracker.database.updateMovementWithInferredFields).not.toHaveBeenCalled();
  });

  // --- happy path ---

  it('passes the user description to parseManualEntry', async () => {
    tracker.database.getMovementsNeedingFieldInference.mockReturnValue([
      makeDescriptionOnlyMovement({ id: 1, userDescription: 'paid £42.50 at Costa Coffee' }),
    ]);
    tracker.googleAIStudioService.parseManualEntry.mockResolvedValue(makeTransaction());

    await tracker.processDescriptionOnlyMovements();

    expect(tracker.googleAIStudioService.parseManualEntry).toHaveBeenCalledWith('paid £42.50 at Costa Coffee');
  });

  it('calls updateMovementWithInferredFields with correct fields for an expense', async () => {
    tracker.database.getMovementsNeedingFieldInference.mockReturnValue([
      makeDescriptionOnlyMovement({ id: 5, userDescription: 'paid £42.50 at Costa Coffee' }),
    ]);
    tracker.googleAIStudioService.parseManualEntry.mockResolvedValue(
      makeTransaction({ amount: 42.5, currency: 'GBP', transactionType: MOVEMENT_TYPES.EXPENSE })
    );

    await tracker.processDescriptionOnlyMovements();

    expect(tracker.database.updateMovementWithInferredFields).toHaveBeenCalledOnce();
    const [id, data] = tracker.database.updateMovementWithInferredFields.mock.calls[0];
    expect(id).toBe(5);
    expect(data.amount).toBe(42.5);
    expect(data.currency).toBe('GBP');
    expect(data.direction).toBe(DIRECTIONS.OUTFLOW);
    expect(data.type).toBe(MOVEMENT_TYPES.EXPENSE);
    expect(data.status).toBeNull();
    expect(data.clpValue).toBe(42500);
    expect(data.usdValue).toBe(53);
    expect(data.gbpValue).toBe(42.5);
  });

  it('sets source_description to the user description', async () => {
    tracker.database.getMovementsNeedingFieldInference.mockReturnValue([
      makeDescriptionOnlyMovement({ userDescription: 'paid £42.50 at Costa Coffee' }),
    ]);
    tracker.googleAIStudioService.parseManualEntry.mockResolvedValue(makeTransaction());

    await tracker.processDescriptionOnlyMovements();

    const [, data] = tracker.database.updateMovementWithInferredFields.mock.calls[0];
    expect(data.sourceDescription).toBe('paid £42.50 at Costa Coffee');
  });

  // --- direction / status mapping ---

  it('sets direction=Inflow and no status for an earning', async () => {
    tracker.database.getMovementsNeedingFieldInference.mockReturnValue([
      makeDescriptionOnlyMovement({ userDescription: 'salary £2500' }),
    ]);
    tracker.googleAIStudioService.parseManualEntry.mockResolvedValue(
      makeTransaction({ transactionType: MOVEMENT_TYPES.EARNING })
    );

    await tracker.processDescriptionOnlyMovements();

    const [, data] = tracker.database.updateMovementWithInferredFields.mock.calls[0];
    expect(data.direction).toBe(DIRECTIONS.INFLOW);
    expect(data.status).toBeNull();
  });

  it('sets direction=Neutral and no status for a neutral transfer', async () => {
    tracker.database.getMovementsNeedingFieldInference.mockReturnValue([
      makeDescriptionOnlyMovement({ userDescription: 'transfer to savings' }),
    ]);
    tracker.googleAIStudioService.parseManualEntry.mockResolvedValue(
      makeTransaction({ transactionType: MOVEMENT_TYPES.NEUTRAL })
    );

    await tracker.processDescriptionOnlyMovements();

    const [, data] = tracker.database.updateMovementWithInferredFields.mock.calls[0];
    expect(data.direction).toBe(DIRECTIONS.NEUTRAL);
    expect(data.status).toBeNull();
  });

  it('sets status=Pending Settlement for a credit', async () => {
    tracker.database.getMovementsNeedingFieldInference.mockReturnValue([
      makeDescriptionOnlyMovement({ userDescription: 'John paid for me £30' }),
    ]);
    tracker.googleAIStudioService.parseManualEntry.mockResolvedValue(
      makeTransaction({ transactionType: MOVEMENT_TYPES.CREDIT })
    );

    await tracker.processDescriptionOnlyMovements();

    const [, data] = tracker.database.updateMovementWithInferredFields.mock.calls[0];
    expect(data.direction).toBe(DIRECTIONS.INFLOW);
    expect(data.status).toBe(STATUS.PENDING_DIRECT_SETTLEMENT);
  });

  // --- error handling ---

  it('skips a movement when AI returns null and still processes the next one', async () => {
    tracker.database.getMovementsNeedingFieldInference.mockReturnValue([
      makeDescriptionOnlyMovement({ id: 1, userDescription: 'unclear' }),
      makeDescriptionOnlyMovement({ id: 2, userDescription: 'paid £10 for coffee' }),
    ]);
    tracker.googleAIStudioService.parseManualEntry
      .mockResolvedValueOnce(null)
      .mockResolvedValue(makeTransaction());

    await tracker.processDescriptionOnlyMovements();

    expect(tracker.database.updateMovementWithInferredFields).toHaveBeenCalledOnce();
    expect(tracker.database.updateMovementWithInferredFields.mock.calls[0][0]).toBe(2);
  });

  it('continues processing remaining movements when one throws an error', async () => {
    tracker.database.getMovementsNeedingFieldInference.mockReturnValue([
      makeDescriptionOnlyMovement({ id: 1, userDescription: 'broken' }),
      makeDescriptionOnlyMovement({ id: 2, userDescription: 'paid £10 for coffee' }),
    ]);
    tracker.googleAIStudioService.parseManualEntry
      .mockRejectedValueOnce(new Error('API timeout'))
      .mockResolvedValue(makeTransaction());

    await tracker.processDescriptionOnlyMovements();

    expect(tracker.database.updateMovementWithInferredFields).toHaveBeenCalledOnce();
    expect(tracker.database.updateMovementWithInferredFields.mock.calls[0][0]).toBe(2);
  });
});
