/**
 * Helper script to convert service account JSON file to environment variable format
 * 
 * Usage:
 *   node scripts/convert-service-account.js path/to/service-account-key.json
 * 
 * This will output the JSON as a single-line string suitable for Render environment variables
 */

const fs = require('fs');
const path = require('path');

const jsonFilePath = process.argv[2];

if (!jsonFilePath) {
  console.error('Usage: node scripts/convert-service-account.js <path-to-json-file>');
  process.exit(1);
}

if (!fs.existsSync(jsonFilePath)) {
  console.error(`Error: File not found: ${jsonFilePath}`);
  process.exit(1);
}

try {
  // Read and parse JSON to validate it
  const jsonContent = fs.readFileSync(jsonFilePath, 'utf8');
  const jsonData = JSON.parse(jsonContent);
  
  // Convert to single-line string (minified)
  const singleLine = JSON.stringify(jsonData);
  
  console.log('\n✓ Service Account JSON converted successfully!\n');
  console.log('Copy the following and paste it as SERVICE_ACCOUNT_JSON in Render:\n');
  console.log('─'.repeat(80));
  console.log(singleLine);
  console.log('─'.repeat(80));
  console.log('\n📋 Instructions:');
  console.log('1. Copy the entire line above (between the dashes)');
  console.log('2. Go to Render dashboard > Your Service > Environment');
  console.log('3. Add new variable: SERVICE_ACCOUNT_JSON');
  console.log('4. Paste the copied content as the value');
  console.log('5. Also set CALENDAR_ID with your calendar ID');
  console.log('6. Restart your service\n');
  
  // Also save to a file for easy copy-paste
  const outputFile = path.join(__dirname, 'service-account-env.txt');
  fs.writeFileSync(outputFile, singleLine);
  console.log(`✓ Also saved to: ${outputFile}\n`);
  
} catch (error) {
  console.error('Error processing JSON file:', error.message);
  process.exit(1);
}


