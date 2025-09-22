// --- CONFIGURATION ---
// Set the exact name of your spreadsheet tab.
const SPREADSHEET_TAB_NAME = 'Movements';

/**
 * The main function that will be triggered to process bank emails.
 */
function processBankEmails() {
  // 1. Get a reference to the active spreadsheet and the 'Movements' tab.
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SPREADSHEET_TAB_NAME);
  if (!sheet) {
    Logger.log(`Error: Sheet named "${SPREADSHEET_TAB_NAME}" not found.`);
    return;
  }

  // 2. Get all existing gmail_id values for the idempotency check.
  const existingGmailIds = new Set();
  if (sheet.getLastRow() > 1) {
    const gmailIdRange = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1);
    const gmailIdValues = gmailIdRange.getValues();
    gmailIdValues.forEach(row => {
      if (row[0]) {
        existingGmailIds.add(row[0]);
      }
    });
  }
  Logger.log(`Found ${existingGmailIds.size} existing movement(s) in the sheet.`);

  // 3. Search Gmail for recent emails with the "Expenses" label
  const query = 'label:Expenses newer_than:5d';
  const threads = GmailApp.search(query);
  Logger.log(`Found ${threads.length} email thread(s) matching the query.`);

  const batchMovements = [];

  // 4. Loop through each email thread found.
  threads.forEach(thread => {
    const messages = thread.getMessages();
    messages.forEach(message => {
      const gmailId = message.getId();

      // 5. IDEMPOTENCY CHECK: If we have already processed this email, skip it.
      if (existingGmailIds.has(gmailId)) {
        Logger.log(`Skipping already processed email with ID: ${gmailId}`);
        return;
      }

      // 6. PARSE THE EMAIL: Extract information from the email body.
      const body = message.getPlainBody();

      // Examples handled:
      // "Te informamos que se ha realizado una compra por $23.320 ... en LAS LOMAS SANTIAGO CL el 16/09/2025 14:48."
      // "Te informamos ... $12.990 ... en DOS CARACOLES, LOCAL 36-BSANTIAGO CL el 16/09/2025 18:13."
      // "Te informamos ... $4.492 ... en PAYU *UBER TRIP SANTIAGO CL el 16/09/2025 23:40."
      //
      // Captures:
      //   1) currency symbol (US$, $, £)
      //   2) amount
      //   3) description after "en " (non-greedy up to " el dd/MM/yyyy HH:mm")
      //   4) timestamp "dd/MM/yyyy HH:mm"
      const regex = /compra por\s+(US?\$|GBP?£|\$)\s*([\d\.,]+)[\s\S]*?\ben\s+(.+?)\s+el\s+(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2})/gi;

      let match;
      let anyMatch = false;
      while ((match = regex.exec(body)) !== null) {
        anyMatch = true;

        const currencyIndicator = match[1];
        const amountStr = match[2];
        const sourceDescription = match[3].trim();
        const tsStr = match[4]; // dd/MM/yyyy HH:mm

        // Determine currency
        let currency;
        let cleanedAmountStr;
        if (currencyIndicator.toUpperCase().includes('US')) {
          currency = 'USD';
        } else if (currencyIndicator.toUpperCase().includes('GBP') || currencyIndicator.includes('£')) {
          currency = 'GBP';
        } else {
          currency = 'CLP'; // Default currency
        }

        // Clean the amount string based on the determined currency.
        if (currency === 'USD' || currency === 'GBP') {
          cleanedAmountStr = amountStr.replace(/\./g, '').replace(',', '.');
        } else { // CLP
          cleanedAmountStr = amountStr.replace(/\./g, '');
        }
        const amount = parseFloat(cleanedAmountStr);

        // Parse timestamp from "dd/MM/yyyy HH:mm" → ISO 8601 UTC (YYYY-MM-DDTHH:mm:ss.sssZ)
        const tsMatch = tsStr.match(/(\d{2})\/(\d{2})\/(20\d{2})\s+(\d{2}):(\d{2})/);
        let emailTimestamp = null;
        if (tsMatch) {
          const day = parseInt(tsMatch[1], 10);
          const month = parseInt(tsMatch[2], 10) - 1; // JS months 0-11
          const year = parseInt(tsMatch[3], 10);
          const hour = parseInt(tsMatch[4], 10);
          const minute = parseInt(tsMatch[5], 10);
          const localDate = new Date(year, month, day, hour, minute, 0, 0);
          emailTimestamp = localDate.toISOString();
        }

        // Prepare the new row for the spreadsheet.
        const newRow = [
          sheet.getLastRow() + 1,  // 1. id (use next row number for a simple unique ID)
          gmailId,                 // 2. gmail_id (same email can have multiple rows if multiple purchases)
          null,                    // 3. accounting_system_id
          emailTimestamp,          // 4. timestamp (ISO 8601 UTC from email)
          amount,                  // 5. amount
          currency,                // 6. currency
          sourceDescription,       // 7. source description (merchant/location)
          null,                    // 8. user description
          null,                    // 9. category
          'outflow',               // 10. direction
          'expense',               // 11. type
          null,                    // 12. status
          null,                    // 13. comment
          null,                    // 14. settled_movement_id
          null                     // 15. accounting_system
        ];

        batchMovements.push({ ts: emailTimestamp, row: newRow, gmailId });
      }

      if (!anyMatch) {
        Logger.log(`Email with ID ${gmailId} did not match the expected format. Skipping.`);
      }
    });
  });

  // Sort by timestamp and append to sheet
  batchMovements
    .sort((a, b) => {
      const ta = a.ts ? Date.parse(a.ts) : 0;
      const tb = b.ts ? Date.parse(b.ts) : 0;
      return ta - tb;
    })
    .forEach(item => {
      sheet.appendRow(item.row);
      Logger.log(`Added movement from email ID: ${item.gmailId} for ${item.row[5]} ${item.row[4]} at ${item.row[3]} — ${item.row[6]}`);
    });
}
