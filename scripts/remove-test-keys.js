#!/usr/bin/env node
/**
 * Removes test_key properties from the Xray JUnit XML report
 * to avoid errors with tests that do not yet exist in Jira
 * 
 * Usage: node scripts/remove-test-keys.js [input-file]
 * 
 * Default:
 *   input-file = xray-report.xml
 */

const fs = require('fs');

const inputFile = process.argv[2] || 'xray-report.xml';

console.log(`🔧 Removing test_key properties from Xray report...`);
console.log(`   File: ${inputFile}`);

if (!fs.existsSync(inputFile)) {
  console.error(`❌ Error: File not found: ${inputFile}`);
  process.exit(1);
}

let xml = fs.readFileSync(inputFile, 'utf-8');

// Count occurrences before removal
const beforeCount = (xml.match(/<property name="test_key"/g) || []).length;
console.log(`   Found ${beforeCount} test_key properties`);

// Remove all lines containing <property name="test_key"
xml = xml.replace(/<property name="test_key"[^>]*>[\s\S]*?<\/property>\s*/g, '');

// Count after removal
const afterCount = (xml.match(/<property name="test_key"/g) || []).length;
console.log(`   Removed ${beforeCount - afterCount} test_key properties`);
console.log(`   Remaining: ${afterCount}`);

// Write the modified file
fs.writeFileSync(inputFile, xml, 'utf-8');

console.log(`✅ Test keys removed successfully`);
