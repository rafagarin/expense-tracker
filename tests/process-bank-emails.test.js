import { describe, it, expect, vi, beforeEach } from 'vitest';

// Fake GmailMessage — only the methods processBankEmails calls.
function makeMessage(gmailId, body = 'Transaction email body') {
  return {
    getId: () => gmailId,
    getPlainBody: () => body,
  };
}

// Parsed transaction as returned by parseEmailWithGoogleAIStudio.
function makeTransaction(overrides = {}) {
  return {
    gmailId: 'gmail-1',
    timestamp: '2026-01-15T12:00:00.000Z',
    amount: 50,
    currency: 'GBP',
    sourceDescription: 'Costa Coffee',
    transactionType: MOVEMENT_TYPES.EXPENSE,
    ...overrides,
  };
}

describe('processBankEmails', () => {
  let tracker;

  beforeEach(() => {
    tracker = new ExpenseTracker();
    tracker.database.getExistingGmailIds = vi.fn().mockReturnValue(new Set());
    tracker.database.getNextId = vi.fn().mockReturnValue(1);
    tracker.database.addMovementsBatch = vi.fn();
    tracker.gmailService.getUnprocessedMessages = vi.fn();
    tracker.googleAIStudioService.parseEmailWithGoogleAIStudio = vi.fn();
    // Stub currency conversion so tests don't touch the spreadsheet.
    tracker.currencyConversionService.getAllCurrencyValues = vi.fn().mockReturnValue({
      clpValue: 50000,
      usdValue: 62,
      gbpValue: 50,
    });
  });

  it('returns early and never calls addMovementsBatch when there are no new messages', async () => {
    tracker.gmailService.getUnprocessedMessages.mockReturnValue([]);

    await tracker.processBankEmails();

    expect(tracker.googleAIStudioService.parseEmailWithGoogleAIStudio).not.toHaveBeenCalled();
    expect(tracker.database.addMovementsBatch).not.toHaveBeenCalled();
  });

  it('does not call addMovementsBatch when all emails fail to parse', async () => {
    tracker.gmailService.getUnprocessedMessages.mockReturnValue([makeMessage('gmail-1')]);
    tracker.googleAIStudioService.parseEmailWithGoogleAIStudio.mockResolvedValue(null);

    await tracker.processBankEmails();

    expect(tracker.database.addMovementsBatch).not.toHaveBeenCalled();
  });

  it('adds an expense movement with direction=Outflow and no status', async () => {
    tracker.gmailService.getUnprocessedMessages.mockReturnValue([makeMessage('gmail-1')]);
    tracker.googleAIStudioService.parseEmailWithGoogleAIStudio.mockResolvedValue(
      makeTransaction({ transactionType: MOVEMENT_TYPES.EXPENSE })
    );

    await tracker.processBankEmails();

    const [batch] = tracker.database.addMovementsBatch.mock.calls[0];
    const row = batch[0].row;
    expect(row[COLUMNS.DIRECTION]).toBe(DIRECTIONS.OUTFLOW);
    expect(row[COLUMNS.STATUS]).toBeNull();
    expect(row[COLUMNS.TYPE]).toBe(MOVEMENT_TYPES.EXPENSE);
  });

  it('adds a credit movement with direction=Inflow and Pending Settlement status', async () => {
    tracker.gmailService.getUnprocessedMessages.mockReturnValue([makeMessage('gmail-1')]);
    tracker.googleAIStudioService.parseEmailWithGoogleAIStudio.mockResolvedValue(
      makeTransaction({ transactionType: MOVEMENT_TYPES.CREDIT })
    );

    await tracker.processBankEmails();

    const [batch] = tracker.database.addMovementsBatch.mock.calls[0];
    const row = batch[0].row;
    expect(row[COLUMNS.DIRECTION]).toBe(DIRECTIONS.INFLOW);
    expect(row[COLUMNS.STATUS]).toBe(STATUS.PENDING_DIRECT_SETTLEMENT);
  });

  it('adds a debit repayment movement with direction=Neutral and no status', async () => {
    tracker.gmailService.getUnprocessedMessages.mockReturnValue([makeMessage('gmail-1')]);
    tracker.googleAIStudioService.parseEmailWithGoogleAIStudio.mockResolvedValue(
      makeTransaction({ transactionType: MOVEMENT_TYPES.DEBIT_REPAYMENT })
    );

    await tracker.processBankEmails();

    const [batch] = tracker.database.addMovementsBatch.mock.calls[0];
    const row = batch[0].row;
    expect(row[COLUMNS.DIRECTION]).toBe(DIRECTIONS.NEUTRAL);
    expect(row[COLUMNS.STATUS]).toBeNull();
  });

  it('skips an unparseable email and still adds the parseable one', async () => {
    tracker.gmailService.getUnprocessedMessages.mockReturnValue([
      makeMessage('gmail-fail'),
      makeMessage('gmail-ok'),
    ]);
    tracker.googleAIStudioService.parseEmailWithGoogleAIStudio
      .mockResolvedValueOnce(null)
      .mockResolvedValue(makeTransaction({ gmailId: 'gmail-ok' }));

    await tracker.processBankEmails();

    const [batch] = tracker.database.addMovementsBatch.mock.calls[0];
    expect(batch).toHaveLength(1);
    expect(batch[0].gmailId).toBe('gmail-ok');
  });

  it('assigns sequential IDs across multiple emails', async () => {
    tracker.database.getNextId.mockReturnValue(5);
    tracker.gmailService.getUnprocessedMessages.mockReturnValue([
      makeMessage('gmail-1'),
      makeMessage('gmail-2'),
    ]);
    tracker.googleAIStudioService.parseEmailWithGoogleAIStudio
      .mockResolvedValueOnce(makeTransaction({ gmailId: 'gmail-1' }))
      .mockResolvedValue(makeTransaction({ gmailId: 'gmail-2' }));

    await tracker.processBankEmails();

    const [batch] = tracker.database.addMovementsBatch.mock.calls[0];
    expect(batch[0].row[COLUMNS.ID]).toBe(5);
    expect(batch[1].row[COLUMNS.ID]).toBe(6);
  });

  it('sets source=Gmail, source_id=gmailId, and currency values on the row', async () => {
    tracker.gmailService.getUnprocessedMessages.mockReturnValue([makeMessage('gmail-xyz')]);
    tracker.googleAIStudioService.parseEmailWithGoogleAIStudio.mockResolvedValue(
      makeTransaction({ gmailId: 'gmail-xyz', amount: 50, currency: 'GBP' })
    );

    await tracker.processBankEmails();

    const [batch] = tracker.database.addMovementsBatch.mock.calls[0];
    const row = batch[0].row;
    expect(row[COLUMNS.SOURCE]).toBe(SOURCES.GMAIL);
    expect(row[COLUMNS.SOURCE_ID]).toBe('gmail-xyz');
    expect(row[COLUMNS.GBP_VALUE]).toBe(50);
    expect(row[COLUMNS.USD_VALUE]).toBe(62);
    expect(row[COLUMNS.CLP_VALUE]).toBe(50000);
  });
});
