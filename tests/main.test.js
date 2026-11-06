import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const workflowMethods = [
  'processBankEmails',
  'processMonzoTransactions',
  'processDescriptionOnlyMovements',
  'applyAutofillRules',
  'processUncategorizedMovements',
  'processReminders',
  'fixFailedCurrencyConversions',
];

describe('main', () => {
  let events;

  beforeEach(() => {
    vi.restoreAllMocks();
    events = [];
    workflowMethods.forEach(method => {
      vi.spyOn(ExpenseTracker.prototype, method).mockImplementation(async () => {
        events.push(method);
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs the optional callback after all workflow steps', async () => {
    const callback = vi.fn(() => events.push('callback'));

    await main(null, callback);

    expect(events).toEqual([...workflowMethods, 'callback']);
    expect(callback).toHaveBeenCalledOnce();
  });

  it('completes the workflow when no callback is provided', async () => {
    await main();

    expect(events).toEqual(workflowMethods);
  });
});