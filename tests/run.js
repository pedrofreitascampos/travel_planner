#!/usr/bin/env node

/**
 * Test runner — runs all test files and reports results.
 * Exit code 0 on success, 1 on failure.
 */

'use strict';

const path = require('path');

const testFiles = [
  './test-calculations.js',
  './test-persistence.js',
  './test-routing.js',
  './test-ui-logic.js',
];

let totalPass = 0;
let totalFail = 0;
const failures = [];

async function runFile(filePath) {
  const fullPath = path.join(__dirname, filePath);
  const tests = require(fullPath);
  const fileName = path.basename(filePath);

  console.log(`\n━━━ ${fileName} ━━━`);

  for (const { name, fn } of tests) {
    try {
      const result = fn();
      // Handle async tests
      if (result && typeof result.then === 'function') {
        await result;
      }
      console.log(`  ✓ ${name}`);
      totalPass++;
    } catch (err) {
      console.log(`  ✗ ${name}`);
      console.log(`    ${err.message}`);
      if (err.expected !== undefined && err.actual !== undefined) {
        console.log(`    expected: ${JSON.stringify(err.expected)}`);
        console.log(`    actual:   ${JSON.stringify(err.actual)}`);
      }
      totalFail++;
      failures.push({ file: fileName, test: name, error: err.message });
    }
  }
}

async function main() {
  console.log('Travel Planner — Test Suite');
  console.log('==========================');

  for (const file of testFiles) {
    await runFile(file);
  }

  console.log('\n==========================');
  console.log(`Results: ${totalPass} passed, ${totalFail} failed, ${totalPass + totalFail} total`);

  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach(f => {
      console.log(`  [${f.file}] ${f.test}: ${f.error}`);
    });
    process.exit(1);
  } else {
    console.log('\nAll tests passed.');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
