import { describe, it, expect, vi, beforeEach } from 'vitest';

// Build a minimal movement row that matches the COLUMNS schema.
function makeMovement(sourceDescription, id = 1) {
  const row = new Array(21).fill(null);
  row[COLUMNS.SOURCE_DESCRIPTION] = sourceDescription;
  row[COLUMNS.ID] = id;
  return row;
}

describe('applyAutofillRules', () => {
  let tracker;

  beforeEach(() => {
    tracker = new ExpenseTracker();
    // Replace DB methods so no Sheets API is touched during the test.
    tracker.database.getAutofillRules = vi.fn();
    tracker.database.getMovementsToAutofill = vi.fn();
    tracker.database.updateMovementWithRule = vi.fn();
  });

  it('applies an exact-match rule to a matching movement', async () => {
    tracker.database.getAutofillRules.mockReturnValue([
      { sourceDescription: 'Costa Coffee London', userDescription: 'Coffee', comment: '' },
    ]);
    tracker.database.getMovementsToAutofill.mockReturnValue([
      makeMovement('Costa Coffee London'),
    ]);

    await tracker.applyAutofillRules();

    expect(tracker.database.updateMovementWithRule).toHaveBeenCalledOnce();
    expect(tracker.database.updateMovementWithRule).toHaveBeenCalledWith(1, 'Coffee', '');
  });

  it('does not apply a rule when the source description does not match', async () => {
    tracker.database.getAutofillRules.mockReturnValue([
      { sourceDescription: 'Costa Coffee London', userDescription: 'Coffee', comment: '' },
    ]);
    tracker.database.getMovementsToAutofill.mockReturnValue([
      makeMovement('Costa Coffee Manchester'),
    ]);

    await tracker.applyAutofillRules();

    expect(tracker.database.updateMovementWithRule).not.toHaveBeenCalled();
  });

  it('applies a regex rule to all matching movements', async () => {
    tracker.database.getAutofillRules.mockReturnValue([
      { sourceDescription: '/Google CLOUD/i', userDescription: 'Google AI Studio', comment: '' },
    ]);
    tracker.database.getMovementsToAutofill.mockReturnValue([
      makeMovement('Google CLOUD NLRBHD    Dublin        IRL', 1),
      makeMovement('Google CLOUD ZV8XR4    Dublin        IRL', 2),
      makeMovement('Unrelated merchant', 3),
    ]);

    await tracker.applyAutofillRules();

    expect(tracker.database.updateMovementWithRule).toHaveBeenCalledTimes(2);
    expect(tracker.database.updateMovementWithRule).toHaveBeenCalledWith(1, 'Google AI Studio', '');
    expect(tracker.database.updateMovementWithRule).toHaveBeenCalledWith(2, 'Google AI Studio', '');
  });
});
