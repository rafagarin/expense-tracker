import { describe, it, expect, vi, beforeEach } from 'vitest';

// Build a movement row with sensible defaults, overridable per-test.
function makeMovement({
  id = 1,
  userDescription = 'Lunch',
  comment = null,
  amount = 50,
  currency = 'GBP',
  sourceDescription = 'Costa Coffee',
  type = 'Expense',
  direction = 'Outflow',
} = {}) {
  const row = new Array(21).fill(null);
  row[COLUMNS.ID] = id;
  row[COLUMNS.USER_DESCRIPTION] = userDescription;
  row[COLUMNS.COMMENT] = comment;
  row[COLUMNS.AMOUNT] = amount;
  row[COLUMNS.CURRENCY] = currency;
  row[COLUMNS.SOURCE_DESCRIPTION] = sourceDescription;
  row[COLUMNS.TYPE] = type;
  row[COLUMNS.DIRECTION] = direction;
  return row;
}

// Minimal valid AI result for a plain categorization (no split).
function makeAnalysisResult(overrides = {}) {
  return {
    category: 'restaurants',
    is_earning: false,
    is_neutral: false,
    needs_split: false,
    split_type: null,
    split_amount: null,
    split_description: null,
    split_category: null,
    ...overrides,
  };
}

describe('processUncategorizedMovements', () => {
  let tracker;

  beforeEach(() => {
    tracker = new ExpenseTracker();
    tracker.database.getMovementsNeedingCategoryAnalysis = vi.fn();
    tracker.database.updateMovementWithAnalysis = vi.fn();
    tracker.database.splitMovement = vi.fn().mockReturnValue(2);
    tracker.database.splitExpenseForRecategorization = vi.fn().mockReturnValue(2);
    tracker.database.convertMovementToDebit = vi.fn();
    tracker.googleAIStudioService.analyzeCategory = vi.fn();
  });

  // --- early exit ---

  it('returns early and never calls AI when there are no movements to analyze', async () => {
    tracker.database.getMovementsNeedingCategoryAnalysis.mockReturnValue([]);

    await tracker.processUncategorizedMovements();

    expect(tracker.googleAIStudioService.analyzeCategory).not.toHaveBeenCalled();
  });

  // --- simple categorization ---

  it('calls updateMovementWithAnalysis with the AI result for a plain categorization', async () => {
    tracker.database.getMovementsNeedingCategoryAnalysis.mockReturnValue([
      makeMovement({ id: 1 }),
    ]);
    tracker.googleAIStudioService.analyzeCategory.mockResolvedValue(
      makeAnalysisResult({ category: 'restaurants' })
    );

    await tracker.processUncategorizedMovements();

    expect(tracker.database.updateMovementWithAnalysis).toHaveBeenCalledOnce();
    expect(tracker.database.updateMovementWithAnalysis).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ category: 'restaurants', needs_split: false })
    );
    expect(tracker.database.splitMovement).not.toHaveBeenCalled();
  });

  it('passes the correct movement context to the AI', async () => {
    tracker.database.getMovementsNeedingCategoryAnalysis.mockReturnValue([
      makeMovement({ id: 1, amount: 75, currency: 'USD', sourceDescription: 'Amazon', type: 'Expense', direction: 'Outflow' }),
    ]);
    tracker.googleAIStudioService.analyzeCategory.mockResolvedValue(makeAnalysisResult());

    await tracker.processUncategorizedMovements();

    expect(tracker.googleAIStudioService.analyzeCategory).toHaveBeenCalledWith(
      'Lunch',
      { amount: 75, currency: 'USD', sourceDescription: 'Amazon', type: 'Expense', direction: 'Outflow' }
    );
  });

  it('combines userDescription and comment into a single string for the AI', async () => {
    tracker.database.getMovementsNeedingCategoryAnalysis.mockReturnValue([
      makeMovement({ id: 1, userDescription: 'Supermarket', comment: 'split 15 for household' }),
    ]);
    tracker.googleAIStudioService.analyzeCategory.mockResolvedValue(makeAnalysisResult());

    await tracker.processUncategorizedMovements();

    expect(tracker.googleAIStudioService.analyzeCategory).toHaveBeenCalledWith(
      'Supermarket split 15 for household',
      expect.anything()
    );
  });

  it('omits a null comment from the AI description string', async () => {
    tracker.database.getMovementsNeedingCategoryAnalysis.mockReturnValue([
      makeMovement({ id: 1, userDescription: 'Lunch', comment: null }),
    ]);
    tracker.googleAIStudioService.analyzeCategory.mockResolvedValue(makeAnalysisResult());

    await tracker.processUncategorizedMovements();

    expect(tracker.googleAIStudioService.analyzeCategory).toHaveBeenCalledWith(
      'Lunch',
      expect.anything()
    );
  });

  // --- earning / neutral flags ---

  it('sets direction=Inflow and type=Earning when is_earning is true', async () => {
    tracker.database.getMovementsNeedingCategoryAnalysis.mockReturnValue([
      makeMovement({ id: 1, userDescription: 'Monthly salary' }),
    ]);
    tracker.googleAIStudioService.analyzeCategory.mockResolvedValue(
      makeAnalysisResult({ category: 'None', is_earning: true })
    );

    await tracker.processUncategorizedMovements();

    expect(tracker.database.updateMovementWithAnalysis).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ direction: DIRECTIONS.INFLOW, type: MOVEMENT_TYPES.EARNING })
    );
  });

  it('sets direction=Neutral and type=Neutral when is_neutral is true', async () => {
    tracker.database.getMovementsNeedingCategoryAnalysis.mockReturnValue([
      makeMovement({ id: 1, userDescription: 'Transfer to savings' }),
    ]);
    tracker.googleAIStudioService.analyzeCategory.mockResolvedValue(
      makeAnalysisResult({ category: 'None', is_neutral: true })
    );

    await tracker.processUncategorizedMovements();

    expect(tracker.database.updateMovementWithAnalysis).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ direction: DIRECTIONS.NEUTRAL, type: MOVEMENT_TYPES.NEUTRAL })
    );
  });

  // --- EXPENSE split ---

  it('calls splitExpenseForRecategorization for an EXPENSE split and does NOT call updateMovementWithAnalysis', async () => {
    tracker.database.getMovementsNeedingCategoryAnalysis.mockReturnValue([
      makeMovement({ id: 1, userDescription: 'Supermarket' }),
    ]);
    tracker.googleAIStudioService.analyzeCategory.mockResolvedValue(
      makeAnalysisResult({
        category: null,
        needs_split: true,
        split_type: 'EXPENSE',
        split_amount: 20,
        split_description: 'household items',
      })
    );

    await tracker.processUncategorizedMovements();

    expect(tracker.database.splitExpenseForRecategorization).toHaveBeenCalledOnce();
    expect(tracker.database.splitExpenseForRecategorization).toHaveBeenCalledWith(1, {
      split_amount: 20,
      split_description: 'household items',
    });
    expect(tracker.database.updateMovementWithAnalysis).not.toHaveBeenCalled();
  });

  // --- DEBIT split ---

  it('calls updateMovementWithAnalysis then splitMovement for a DEBIT split with a personal portion', async () => {
    tracker.database.getMovementsNeedingCategoryAnalysis.mockReturnValue([
      makeMovement({ id: 1, userDescription: 'Dinner with John' }),
    ]);
    tracker.googleAIStudioService.analyzeCategory.mockResolvedValue(
      makeAnalysisResult({
        needs_split: true,
        split_type: 'DEBIT',
        split_amount: 25,
        split_description: "John's part",
        split_category: 'restaurants',
      })
    );

    await tracker.processUncategorizedMovements();

    expect(tracker.database.updateMovementWithAnalysis).toHaveBeenCalledOnce();
    expect(tracker.database.splitMovement).toHaveBeenCalledOnce();
    expect(tracker.database.splitMovement).toHaveBeenCalledWith(1, {
      split_amount: 25,
      split_category: 'restaurants',
      split_description: "John's part",
    });
    expect(tracker.database.convertMovementToDebit).not.toHaveBeenCalled();
  });

  it('calls convertMovementToDebit (not splitMovement) when split_amount is 0', async () => {
    tracker.database.getMovementsNeedingCategoryAnalysis.mockReturnValue([
      makeMovement({ id: 1, userDescription: 'Paid for whole team lunch' }),
    ]);
    tracker.googleAIStudioService.analyzeCategory.mockResolvedValue(
      makeAnalysisResult({
        category: null,
        needs_split: true,
        split_type: 'DEBIT',
        split_amount: 0,
        split_description: 'Team lunch',
      })
    );

    await tracker.processUncategorizedMovements();

    expect(tracker.database.convertMovementToDebit).toHaveBeenCalledOnce();
    expect(tracker.database.convertMovementToDebit).toHaveBeenCalledWith(1);
    expect(tracker.database.splitMovement).not.toHaveBeenCalled();
  });

  // --- error handling ---

  it('skips a movement when AI returns null and still processes the next one', async () => {
    tracker.database.getMovementsNeedingCategoryAnalysis.mockReturnValue([
      makeMovement({ id: 1, userDescription: 'Unclear transaction' }),
      makeMovement({ id: 2, userDescription: 'Coffee' }),
    ]);
    tracker.googleAIStudioService.analyzeCategory
      .mockResolvedValueOnce(null)
      .mockResolvedValue(makeAnalysisResult());

    await tracker.processUncategorizedMovements();

    expect(tracker.database.updateMovementWithAnalysis).toHaveBeenCalledOnce();
    expect(tracker.database.updateMovementWithAnalysis).toHaveBeenCalledWith(2, expect.anything());
  });

  it('continues processing remaining movements when one throws an error', async () => {
    tracker.database.getMovementsNeedingCategoryAnalysis.mockReturnValue([
      makeMovement({ id: 1, userDescription: 'Broken movement' }),
      makeMovement({ id: 2, userDescription: 'Fine movement' }),
    ]);
    tracker.googleAIStudioService.analyzeCategory
      .mockRejectedValueOnce(new Error('API timeout'))
      .mockResolvedValue(makeAnalysisResult());

    await tracker.processUncategorizedMovements();

    expect(tracker.database.updateMovementWithAnalysis).toHaveBeenCalledOnce();
    expect(tracker.database.updateMovementWithAnalysis).toHaveBeenCalledWith(2, expect.anything());
  });
});
