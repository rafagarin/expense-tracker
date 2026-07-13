import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('processReminders', () => {
  let tracker;
  let getRemindersSpy;

  beforeEach(() => {
    // Mock the current date to be the 15th of the month for consistent testing.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T12:00:00Z'));

    tracker = new ExpenseTracker();

    // Spy on the ReminderService to control its output.
    // The `processReminders` method creates its own instance, so we spy on the prototype.
    getRemindersSpy = vi.spyOn(globalThis.ReminderService.prototype, 'getReminders');

    // Mock the database methods that are called by the reminder logic.
    tracker.database.reminderExists = vi.fn();
    tracker.database.addReminderMovement = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not add any movements if no reminders are configured', async () => {
    getRemindersSpy.mockReturnValue([]);

    await tracker.processReminders();

    expect(tracker.database.addReminderMovement).not.toHaveBeenCalled();
  });

  it('does not add any movements if no reminders are scheduled for today', async () => {
    getRemindersSpy.mockReturnValue([
      { description: 'Pay rent', dayOfMonth: 1 },
      { description: 'Pay credit card', dayOfMonth: 25 },
    ]);

    await tracker.processReminders();

    expect(tracker.database.addReminderMovement).not.toHaveBeenCalled();
  });

  it('adds a movement for a reminder scheduled for today that does not exist yet', async () => {
    const reminder = { description: 'Pay phone bill', dayOfMonth: 15 };
    getRemindersSpy.mockReturnValue([reminder]);
    tracker.database.reminderExists.mockReturnValue(false);

    await tracker.processReminders();

    expect(tracker.database.reminderExists).toHaveBeenCalledOnce();
    expect(tracker.database.reminderExists).toHaveBeenCalledWith('Pay phone bill', '2026-07');
    expect(tracker.database.addReminderMovement).toHaveBeenCalledOnce();
    expect(tracker.database.addReminderMovement).toHaveBeenCalledWith('Pay phone bill');
  });

  it('does not add a movement for a reminder that already exists for the current month', async () => {
    const reminder = { description: 'Pay phone bill', dayOfMonth: 15 };
    getRemindersSpy.mockReturnValue([reminder]);
    tracker.database.reminderExists.mockReturnValue(true);

    await tracker.processReminders();

    expect(tracker.database.reminderExists).toHaveBeenCalledOnce();
    expect(tracker.database.reminderExists).toHaveBeenCalledWith('Pay phone bill', '2026-07');
    expect(tracker.database.addReminderMovement).not.toHaveBeenCalled();
  });

  it('processes multiple reminders and only adds the one that is new for today', async () => {
    const reminders = [
      { description: 'Pay rent', dayOfMonth: 1 }, // Not today
      { description: 'Pay phone bill', dayOfMonth: 15 }, // Today, new
      { description: 'Pay credit card', dayOfMonth: 15 }, // Today, existing
    ];
    getRemindersSpy.mockReturnValue(reminders);

    // Mock reminderExists to return true only for the "credit card" reminder
    tracker.database.reminderExists.mockImplementation((description, yearMonth) => {
      return description === 'Pay credit card';
    });

    await tracker.processReminders();

    expect(tracker.database.addReminderMovement).toHaveBeenCalledOnce();
    expect(tracker.database.addReminderMovement).toHaveBeenCalledWith('Pay phone bill');
  });
});