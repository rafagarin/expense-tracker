/**
 * Reminder service for the expense tracker
 * Handles reading reminder configurations from the "Reminder Settings" sheet.
 */
class ReminderService {
  constructor() {
    this.remindersSheet = null;
    this.initializeSheet();
  }

  /**
   * Initialize the Reminders sheet.
   */
  initializeSheet() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    this.remindersSheet = ss.getSheetByName(SHEET_NAMES.REMINDER_SETTINGS);
  }

  /**
   * Get all configured reminders from the "Reminder Settings" sheet.
   * @returns {Array<Object>} Array of reminder objects with {description, dayOfMonth}.
   */
  getReminders() {
    if (!this.remindersSheet) {
      Logger.log(`Warning: "${SHEET_NAMES.REMINDER_SETTINGS}" sheet not found. Skipping reminder processing.`);
      return [];
    }

    const lastRow = this.remindersSheet.getLastRow();
    if (lastRow < 3) {
      Logger.log(`No reminders found in "${SHEET_NAMES.REMINDER_SETTINGS}" sheet.`);
      return [];
    }

    // Assumes headers are in row 2 and data starts in row 3.
    // "Description" is in column A and "Day of the month" is in column B.
    const range = this.remindersSheet.getRange(3, 1, lastRow - 2, 2);
    const values = range.getValues();

    const reminders = values
      .map(row => {
        const description = row[0];
        const dayOfMonth = parseInt(row[1], 10);

        if (description && !isNaN(dayOfMonth) && dayOfMonth >= 1 && dayOfMonth <= 31) {
          return { description, dayOfMonth };
        }
        return null;
      })
      .filter(Boolean);

    Logger.log(`Loaded ${reminders.length} reminder(s) from "${SHEET_NAMES.REMINDER_SETTINGS}" sheet.`);
    return reminders;
  }
}
