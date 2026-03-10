#!/usr/bin/env node
/**
 * Post-processing of the Xray JUnit XML report
 * - Adds started-at and finished-at attributes to each testcase
 * - Embeds screenshots (evidence) in Base64
 * 
 * Usage: node scripts/add-timestamps-to-xray-report.js [input-file] [output-file]
 * 
 * Default:
 *   input-file = xray-report.xml
 *   output-file = xray-report.xml (overwrites the file)
 */

const fs = require('fs');
const path = require('path');

const inputFile = process.argv[2] || 'xray-report.xml';
const outputFile = process.argv[3] || inputFile;
const evidenceDir = 'test-results/evidence';

console.log(`📅 Processing Xray report...`);
console.log(`   Input:  ${inputFile}`);
console.log(`   Output: ${outputFile}`);
console.log(`   Evidence dir: ${evidenceDir}`);

if (!fs.existsSync(inputFile)) {
  console.error(`❌ Error: File not found: ${inputFile}`);
  process.exit(1);
}

let xml = fs.readFileSync(inputFile, 'utf-8');

// Load screenshots by test_key
const evidenceByTestKey = {};
if (fs.existsSync(evidenceDir)) {
  const files = fs.readdirSync(evidenceDir);
  for (const file of files) {
    if (file.endsWith('.png')) {
      // Format: DEMO-XX_description_timestamp.png
      const match = file.match(/^(DEMO-\d+)_(.+)_\d+\.png$/);
      if (match) {
        const testKey = match[1];
        if (!evidenceByTestKey[testKey]) {
          evidenceByTestKey[testKey] = [];
        }
        const filepath = path.join(evidenceDir, file);
        const base64 = fs.readFileSync(filepath).toString('base64');
        evidenceByTestKey[testKey].push({
          filename: file,
          base64: base64
        });
        console.log(`   📸 Found evidence: ${file} for ${testKey}`);
      }
    }
  }
}

// Regex to find each testsuite with its timestamp
const testsuiteRegex = /<testsuite[^>]*timestamp="([^"]+)"[^>]*>([\s\S]*?)<\/testsuite>/g;

let match;
let modifiedXml = xml;

while ((match = testsuiteRegex.exec(xml)) !== null) {
  const testsuiteTimestamp = match[1];
  const testsuiteContent = match[2];
  
  // Parse the testsuite timestamp as the starting point
  let currentTime = new Date(testsuiteTimestamp);
  
  if (isNaN(currentTime.getTime())) {
    console.warn(`⚠️  Invalid testsuite timestamp: ${testsuiteTimestamp}`);
    continue;
  }
  
  // Find all testcases in this testsuite
  const testcaseRegex = /<testcase\s+name="([^"]+)"\s+classname="([^"]+)"\s+time="([^"]+)">/g;
  let testcaseMatch;
  let modifiedContent = testsuiteContent;
  
  // We must iterate testcases sequentially to compute timestamps
  const testcases = [];
  while ((testcaseMatch = testcaseRegex.exec(testsuiteContent)) !== null) {
    testcases.push({
      fullMatch: testcaseMatch[0],
      name: testcaseMatch[1],
      classname: testcaseMatch[2],
      time: parseFloat(testcaseMatch[3])
    });
  }
  
  // Compute and add timestamps for each testcase
  for (const tc of testcases) {
    const startedAt = currentTime.toISOString();
    const durationMs = tc.time * 1000;
    const finishedAt = new Date(currentTime.getTime() + durationMs).toISOString();
    
    // Build the new testcase tag with started-at and finished-at attributes
    const newTestcaseTag = `<testcase name="${tc.name}" classname="${tc.classname}" time="${tc.time}" started-at="${startedAt}" finished-at="${finishedAt}">`;
    
    // Replace in the modified content
    modifiedContent = modifiedContent.replace(tc.fullMatch, newTestcaseTag);
    
    // Advance time for the next test
    currentTime = new Date(currentTime.getTime() + durationMs);
  }
  
  // Replace the testsuite content in the global XML
  modifiedXml = modifiedXml.replace(testsuiteContent, modifiedContent);
}

// Add evidence (screenshots) as Base64 in the testrun_evidence
for (const testKey of Object.keys(evidenceByTestKey)) {
  const evidences = evidenceByTestKey[testKey];
  
  // Build XML items for the evidence
  let evidenceItems = '';
  for (const ev of evidences) {
    evidenceItems += `\n<item name="${ev.filename}">${ev.base64}</item>`;
  }
  
  // Find the test_key in the XML and attach evidence
  const testKeyPattern = new RegExp(
    `(<property name="test_key" value="${testKey}">\\s*</property>[\\s\\S]*?<property name="testrun_evidence">)\\s*(</property>)`,
    'g'
  );
  
  modifiedXml = modifiedXml.replace(testKeyPattern, `$1${evidenceItems}\n$2`);
}

// Write the modified file
fs.writeFileSync(outputFile, modifiedXml, 'utf-8');

console.log(`\n✅ Report processed successfully!`);
console.log(`   - Timestamps added to testcases`);
console.log(`   - ${Object.keys(evidenceByTestKey).length} tests with evidence`);

// Display a preview
const preview = modifiedXml.substring(0, 1000);
console.log(`\n📄 Preview (first 1000 chars):`);
console.log(preview);
