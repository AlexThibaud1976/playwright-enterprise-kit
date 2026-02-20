#!/usr/bin/env node
/**
 * Post-traitement du rapport Xray JUnit XML
 * - Ajoute les attributs started-at et finished-at sur chaque testcase
 * - Intègre les captures d'écran (evidence) en Base64
 * 
 * Usage: node scripts/add-timestamps-to-xray-report.js [input-file] [output-file]
 * 
 * Par défaut: 
 *   input-file = xray-report.xml
 *   output-file = xray-report.xml (écrase le fichier)
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

// Charger les screenshots par test_key
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

// Regex pour trouver chaque testsuite avec son timestamp
const testsuiteRegex = /<testsuite[^>]*timestamp="([^"]+)"[^>]*>([\s\S]*?)<\/testsuite>/g;

let match;
let modifiedXml = xml;

while ((match = testsuiteRegex.exec(xml)) !== null) {
  const testsuiteTimestamp = match[1];
  const testsuiteContent = match[2];
  
  // Parse le timestamp du testsuite comme point de départ
  let currentTime = new Date(testsuiteTimestamp);
  
  if (isNaN(currentTime.getTime())) {
    console.warn(`⚠️  Invalid testsuite timestamp: ${testsuiteTimestamp}`);
    continue;
  }
  
  // Trouver tous les testcases dans ce testsuite
  const testcaseRegex = /<testcase\s+name="([^"]+)"\s+classname="([^"]+)"\s+time="([^"]+)">/g;
  let testcaseMatch;
  let modifiedContent = testsuiteContent;
  
  // On doit parcourir les testcases séquentiellement pour calculer les timestamps
  const testcases = [];
  while ((testcaseMatch = testcaseRegex.exec(testsuiteContent)) !== null) {
    testcases.push({
      fullMatch: testcaseMatch[0],
      name: testcaseMatch[1],
      classname: testcaseMatch[2],
      time: parseFloat(testcaseMatch[3])
    });
  }
  
  // Calculer et ajouter les timestamps pour chaque testcase
  for (const tc of testcases) {
    const startedAt = currentTime.toISOString();
    const durationMs = tc.time * 1000;
    const finishedAt = new Date(currentTime.getTime() + durationMs).toISOString();
    
    // Créer le nouveau tag testcase avec les attributs started-at et finished-at
    const newTestcaseTag = `<testcase name="${tc.name}" classname="${tc.classname}" time="${tc.time}" started-at="${startedAt}" finished-at="${finishedAt}">`;
    
    // Remplacer dans le contenu modifié
    modifiedContent = modifiedContent.replace(tc.fullMatch, newTestcaseTag);
    
    // Avancer le temps pour le prochain test
    currentTime = new Date(currentTime.getTime() + durationMs);
  }
  
  // Remplacer le contenu du testsuite dans le XML global
  modifiedXml = modifiedXml.replace(testsuiteContent, modifiedContent);
}

// Ajouter les evidences (screenshots) en Base64 dans les testrun_evidence
for (const testKey of Object.keys(evidenceByTestKey)) {
  const evidences = evidenceByTestKey[testKey];
  
  // Construire les items XML pour les evidences
  let evidenceItems = '';
  for (const ev of evidences) {
    evidenceItems += `\n<item name="${ev.filename}">${ev.base64}</item>`;
  }
  
  // Trouver le test_key dans le XML et ajouter les evidences
  const testKeyPattern = new RegExp(
    `(<property name="test_key" value="${testKey}">\\s*</property>[\\s\\S]*?<property name="testrun_evidence">)\\s*(</property>)`,
    'g'
  );
  
  modifiedXml = modifiedXml.replace(testKeyPattern, `$1${evidenceItems}\n$2`);
}

// Écrire le fichier modifié
fs.writeFileSync(outputFile, modifiedXml, 'utf-8');

console.log(`\n✅ Report processed successfully!`);
console.log(`   - Timestamps added to testcases`);
console.log(`   - ${Object.keys(evidenceByTestKey).length} tests with evidence`);

// Afficher un aperçu
const preview = modifiedXml.substring(0, 1000);
console.log(`\n📄 Preview (first 1000 chars):`);
console.log(preview);
