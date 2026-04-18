import { describe, it, expect, vi, beforeEach } from 'vitest';

// Raw Monzo transaction in the format the API returns.
// Amounts are in minor units (pennies); negative = spending.
function makeMonzoTransaction(overrides = {}) {
  return {
    id: 'tx_001',
    amount: -4250,            // -£42.50
    currency: 'GBP',
    created: '2026-01-15T10:00:00Z',
    settled: '2026-01-15T12:00:00Z',
    description: 'COSTA COFFEE LONDON',
    merchant: { name: 'Costa Coffee' },
    notes: '',
    is_load: false,
    ...overrides,
  };
}

describe('processMonzoTransactions', () => {
  let tracker;

  beforeEach(() => {
    tracker = new ExpenseTracker();
    tracker.monzoService.refreshAccessToken = vi.fn().mockResolvedValue(true);
    tracker.monzoService.testConnection = vi.fn().mockResolvedValue(true);
    tracker.monzoService.getRecentTransactions = vi.fn().mockResolvedValue([]);
    tracker.database.getExistingSourceIds = vi.fn().mockReturnValue(new Set());
    tracker.database.getNextId = vi.fn().mockReturnValue(1);
    tracker.database.addMovementsBatch = vi.fn();
    tracker.currencyConversionService.getAllCurrencyValues = vi.fn().mockReturnValue({
      clpValue: 42500,
      usdValue: 53,
      gbpValue: 42.5,
    });
  });

  // --- early exit ---

  it('returns early and never adds movements when testConnection fails', async () => {
    tracker.monzoService.testConnection.mockResolvedValue(false);

    await tracker.processMonzoTransactions();

    expect(tracker.database.addMovementsBatch).not.toHaveBeenCalled();
  });

  it('returns early when there are no recent transactions', async () => {
    tracker.monzoService.getRecentTransactions.mockResolvedValue([]);

    await tracker.processMonzoTransactions();

    expect(tracker.database.addMovementsBatch).not.toHaveBeenCalled();
  });

  it('returns early when all transactions already exist in the database', async () => {
    tracker.database.getExistingSourceIds.mockReturnValue(new Set(['tx_001', 'tx_002']));
    tracker.monzoService.getRecentTransactions.mockResolvedValue([
      makeMonzoTransaction({ id: 'tx_001' }),
      makeMonzoTransaction({ id: 'tx_002' }),
    ]);

    await tracker.processMonzoTransactions();

    expect(tracker.database.addMovementsBatch).not.toHaveBeenCalled();
  });

  // --- idempotency ---

  it('skips already-processed IDs and only adds new ones', async () => {
    tracker.database.getExistingSourceIds.mockReturnValue(new Set(['tx_old']));
    tracker.monzoService.getRecentTransactions.mockResolvedValue([
      makeMonzoTransaction({ id: 'tx_old' }),
      makeMonzoTransaction({ id: 'tx_new' }),
    ]);

    await tracker.processMonzoTransactions();

    const [batch] = tracker.database.addMovementsBatch.mock.calls[0];
    expect(batch).toHaveLength(1);
    expect(batch[0].monzoId).toBe('tx_new');
  });

  // --- decline filtering ---
  // Mock one level deeper so getRecentTransactions runs for real and its filter is tested.

  it('filters out declined transactions', async () => {
    // Restore the real getRecentTransactions so the decline_reason filter runs,
    // then mock one level deeper (getTransactions) to control the raw API response.
    tracker.monzoService.getRecentTransactions =
      MonzoService.prototype.getRecentTransactions.bind(tracker.monzoService);
    tracker.monzoService.getTransactions = vi.fn().mockResolvedValue([
      makeMonzoTransaction({ id: 'tx_ok' }),
      makeMonzoTransaction({ id: 'tx_declined', decline_reason: 'INSUFFICIENT_FUNDS' }),
    ]);

    await tracker.processMonzoTransactions();

    const [batch] = tracker.database.addMovementsBatch.mock.calls[0];
    expect(batch).toHaveLength(1);
    expect(batch[0].monzoId).toBe('tx_ok');
  });

  // --- conversion logic (let convertTransactionToMovement run for real) ---

  it('converts a negative amount to an Expense with direction=Outflow', async () => {
    tracker.monzoService.getRecentTransactions.mockResolvedValue([
      makeMonzoTransaction({ id: 'tx_001', amount: -4250 }),
    ]);

    await tracker.processMonzoTransactions();

    const [batch] = tracker.database.addMovementsBatch.mock.calls[0];
    const row = batch[0].row;
    expect(row[COLUMNS.TYPE]).toBe(MOVEMENT_TYPES.EXPENSE);
    expect(row[COLUMNS.DIRECTION]).toBe(DIRECTIONS.OUTFLOW);
  });

  it('converts a negative is_load transaction to Cash with direction=Inflow', async () => {
    tracker.monzoService.getRecentTransactions.mockResolvedValue([
      makeMonzoTransaction({ id: 'tx_001', amount: -5000, is_load: true, merchant: null, notes: 'Top up' }),
    ]);

    await tracker.processMonzoTransactions();

    const [batch] = tracker.database.addMovementsBatch.mock.calls[0];
    const row = batch[0].row;
    expect(row[COLUMNS.TYPE]).toBe(MOVEMENT_TYPES.CASH);
    expect(row[COLUMNS.DIRECTION]).toBe(DIRECTIONS.INFLOW);
  });

  it('converts a positive amount to Debit Repayment with direction=Inflow', async () => {
    tracker.monzoService.getRecentTransactions.mockResolvedValue([
      makeMonzoTransaction({ id: 'tx_001', amount: 2000 }),
    ]);

    await tracker.processMonzoTransactions();

    const [batch] = tracker.database.addMovementsBatch.mock.calls[0];
    const row = batch[0].row;
    expect(row[COLUMNS.TYPE]).toBe(MOVEMENT_TYPES.DEBIT_REPAYMENT);
    expect(row[COLUMNS.DIRECTION]).toBe(DIRECTIONS.INFLOW);
  });

  it('divides amount by 100 and makes it positive', async () => {
    tracker.monzoService.getRecentTransactions.mockResolvedValue([
      makeMonzoTransaction({ id: 'tx_001', amount: -4250 }),
    ]);

    await tracker.processMonzoTransactions();

    const [batch] = tracker.database.addMovementsBatch.mock.calls[0];
    expect(batch[0].row[COLUMNS.AMOUNT]).toBe(42.5);
  });

  // --- source description priority ---

  it('uses merchant name as source description when present', async () => {
    tracker.monzoService.getRecentTransactions.mockResolvedValue([
      makeMonzoTransaction({ merchant: { name: 'Costa Coffee' }, notes: 'Some note', description: 'Costa Coffee' }),
    ]);

    await tracker.processMonzoTransactions();

    const [batch] = tracker.database.addMovementsBatch.mock.calls[0];
    expect(batch[0].row[COLUMNS.SOURCE_DESCRIPTION]).toBe('Costa Coffee');
  });

  it('falls back to notes when there is no merchant', async () => {
    tracker.monzoService.getRecentTransactions.mockResolvedValue([
      makeMonzoTransaction({ merchant: null, notes: 'Rent payment', description: 'Rent payment' }),
    ]);

    await tracker.processMonzoTransactions();

    const [batch] = tracker.database.addMovementsBatch.mock.calls[0];
    expect(batch[0].row[COLUMNS.SOURCE_DESCRIPTION]).toBe('Rent payment');
  });

  it('falls back to description when there is no merchant and no notes', async () => {
    tracker.monzoService.getRecentTransactions.mockResolvedValue([
      makeMonzoTransaction({ merchant: null, notes: '', description: 'BACS TRANSFER' }),
    ]);

    await tracker.processMonzoTransactions();

    const [batch] = tracker.database.addMovementsBatch.mock.calls[0];
    expect(batch[0].row[COLUMNS.SOURCE_DESCRIPTION]).toBe('BACS TRANSFER');
  });

  it('appends the raw description in parens when it differs from the base description', async () => {
    tracker.monzoService.getRecentTransactions.mockResolvedValue([
      makeMonzoTransaction({ merchant: { name: 'Costa Coffee' }, description: 'COSTA COFFEE LONDON GBR' }),
    ]);

    await tracker.processMonzoTransactions();

    const [batch] = tracker.database.addMovementsBatch.mock.calls[0];
    expect(batch[0].row[COLUMNS.SOURCE_DESCRIPTION]).toBe('Costa Coffee (COSTA COFFEE LONDON GBR)');
  });

  // --- timestamp and metadata ---

  it('prefers settled date over created date for the timestamp', async () => {
    tracker.monzoService.getRecentTransactions.mockResolvedValue([
      makeMonzoTransaction({ created: '2026-01-15T10:00:00Z', settled: '2026-01-15T14:00:00Z' }),
    ]);

    await tracker.processMonzoTransactions();

    const [batch] = tracker.database.addMovementsBatch.mock.calls[0];
    expect(batch[0].ts).toBe('2026-01-15T14:00:00Z');
  });

  it('falls back to created date when settled is not set', async () => {
    tracker.monzoService.getRecentTransactions.mockResolvedValue([
      makeMonzoTransaction({ created: '2026-01-15T10:00:00Z', settled: null }),
    ]);

    await tracker.processMonzoTransactions();

    const [batch] = tracker.database.addMovementsBatch.mock.calls[0];
    expect(batch[0].ts).toBe('2026-01-15T10:00:00Z');
  });

  it('sets source=Monzo and source_id=transaction.id on the row', async () => {
    tracker.monzoService.getRecentTransactions.mockResolvedValue([
      makeMonzoTransaction({ id: 'tx_abc' }),
    ]);

    await tracker.processMonzoTransactions();

    const [batch] = tracker.database.addMovementsBatch.mock.calls[0];
    const row = batch[0].row;
    expect(row[COLUMNS.SOURCE]).toBe(SOURCES.MONZO);
    expect(row[COLUMNS.SOURCE_ID]).toBe('tx_abc');
  });

  it('assigns sequential IDs across multiple transactions', async () => {
    tracker.database.getNextId.mockReturnValue(10);
    tracker.monzoService.getRecentTransactions.mockResolvedValue([
      makeMonzoTransaction({ id: 'tx_001' }),
      makeMonzoTransaction({ id: 'tx_002' }),
    ]);

    await tracker.processMonzoTransactions();

    const [batch] = tracker.database.addMovementsBatch.mock.calls[0];
    expect(batch[0].row[COLUMNS.ID]).toBe(10);
    expect(batch[1].row[COLUMNS.ID]).toBe(11);
  });
});
