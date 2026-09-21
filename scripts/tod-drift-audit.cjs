/*
 * ToD deliverable 2 - drift audit (Phase 3 mandate)
 *
 * Verifies three independent sources of truth agree:
 *   A. schema.sql  -> the 6 CREATE TABLE names
 *   B. db.js       -> REQUIRED_TABLES list
 *   C. store.js    -> every referenced `tod_*` table
 *
 * Contract: A == B == 6 tables, C subset of A.
 * Prints exact mismatch on failure; exit code 1 on FAIL, 0 on PASS.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'src', 'utils', 'tod');

const schema = fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8');
const db = fs.readFileSync(path.join(dir, 'db.js'), 'utf8');
const store = fs.readFileSync(path.join(dir, 'store.js'), 'utf8');

const schemaTables = [...schema.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)]
  .map((m) => m[1])
  .sort();

const requiredBlock = db.match(/REQUIRED_TABLES\s*=\s*\[([\s\S]*?)\];/);
const dbTables = [...(requiredBlock ? requiredBlock[1] : '').matchAll(/'([^']+)'/g)]
  .map((m) => m[1])
  .sort();

const storeTables = [...store.matchAll(/(?:FROM|INTO|UPDATE)\s+(tod_\w+)/g)]
  .map((m) => m[1])
  .filter((v, i, a) => a.indexOf(v) === i)
  .sort();

const schemaSet = new Set(schemaTables);
const dbSet = new Set(dbTables);
const storeSet = new Set(storeTables);

const missingFromSchema = storeTables.filter((t) => !schemaSet.has(t));
const missingFromRequired = schemaTables.filter((t) => !dbSet.has(t));

console.log('SCHEMA tables :', schemaTables.join(', '), `(${schemaTables.length})`);
console.log('REQUIRED      :', dbTables.join(', '), `(${dbTables.length})`);
console.log('STORE refs    :', storeTables.join(', '), `(${storeTables.length})`);
console.log('');
console.log('store refs missing from schema :', missingFromSchema.length ? missingFromSchema.join(', ') : 'none');
console.log('schema tables missing from required:', missingFromRequired.length ? missingFromRequired.join(', ') : 'none');

const pass =
  schemaTables.length === 6 &&
  dbTables.length === 6 &&
  schemaTables.every((t) => dbSet.has(t)) &&
  missingFromSchema.length === 0;

if (pass) {
  console.log('PASS: REQUIRED_TABLES == schema == 6 tables, store refs subset of schema');
  process.exit(0);
} else {
  console.log('FAIL: drift detected (see mismatch above)');
  process.exit(1);
}