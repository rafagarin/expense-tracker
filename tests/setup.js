import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(__dirname, '../apps-script-library/src');

// ---------------------------------------------------------------------------
// Apps Script global stubs
// ---------------------------------------------------------------------------

// Sheet stub: returns enough data to satisfy CategoryService (categories) and
// CurrencyConversionService (conversion rates) during construction.
const makeSheetStub = () => ({
  getLastRow: () => 4,
  getRange: () => ({
    getValues: () => [['food', 'Food expenses'], ['transport', 'Transport']],
    getValue: () => 1000, // non-zero so currency rate validation passes
    setValue: () => {},
    setValues: () => {},
  }),
  appendRow: () => {},
  insertRowAfter: () => {},
});

globalThis.SpreadsheetApp = {
  getActiveSpreadsheet: () => ({ getSheetByName: () => makeSheetStub() }),
};

globalThis.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: () => 'test-api-key',
    setProperty: () => {},
  }),
};

globalThis.Logger = { log: () => {} };
globalThis.Utilities = { sleep: () => {} };
globalThis.UrlFetchApp = {
  fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }),
};
globalThis.GmailApp = { search: () => [] };

// ---------------------------------------------------------------------------
// Source file loader
//
// Apps Script source files use top-level class/const/function declarations
// that would be scoped to the eval/vm call and not visible globally.
// We transform them into explicit globalThis assignments before executing.
// ---------------------------------------------------------------------------

function toGlobalScope(code) {
  return code
    // class Foo {  →  globalThis.Foo = class Foo {
    .replace(/^class (\w+)/gm, 'globalThis.$1 = class $1')
    // const FOO =  →  globalThis.FOO =
    .replace(/^const (\w+)/gm, 'globalThis.$1')
    // let FOO =    →  globalThis.FOO =
    .replace(/^let (\w+)/gm, 'globalThis.$1')
    // function foo(  →  globalThis.foo = function foo(
    .replace(/^function (\w+)\(/gm, 'globalThis.$1 = function $1(');
}

function loadSourceFile(filename) {
  const code = toGlobalScope(readFileSync(resolve(srcDir, filename), 'utf8'));
  vm.runInThisContext(code, { filename });
}

const sourceFiles = [
  'Config.js',
  'CategoryService.js',
  'CurrencyConversionService.js',
  'Database.js',
  'GmailService.js',
  'MonzoService.js',
  'AIStudioService.js',
  'ExpenseTracker.js',
];

for (const file of sourceFiles) {
  loadSourceFile(file);
}
