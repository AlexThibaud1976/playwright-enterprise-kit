#!/usr/bin/env node
/**
 * Supprime les propriétés test_key du rapport Xray JUnit XML
 * pour éviter les erreurs avec des tests non existants dans Jira
 * 
 * Usage: node scripts/remove-test-keys.js [input-file]
 * 
 * Par défaut: 
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

// Compter les occurrences avant suppression
const beforeCount = (xml.match(/<property name="test_key"/g) || []).length;
console.log(`   Found ${beforeCount} test_key properties`);

// Supprimer toutes les lignes contenant <property name="test_key"
xml = xml.replace(/<property name="test_key"[^>]*>[\s\S]*?<\/property>\s*/g, '');

// Compter après suppression
const afterCount = (xml.match(/<property name="test_key"/g) || []).length;
console.log(`   Removed ${beforeCount - afterCount} test_key properties`);
console.log(`   Remaining: ${afterCount}`);

// Écrire le fichier modifié
fs.writeFileSync(inputFile, xml, 'utf-8');

console.log(`✅ Test keys removed successfully`);
