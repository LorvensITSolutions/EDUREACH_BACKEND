// Test script to demonstrate the new parent credential system
import { generateParentCredentialsByEmail, generateStudentCredentials } from './utils/credentialGenerator.js';

async function testCredentialGeneration() {
  console.log('🧪 Testing New Parent Credential System\n');
  
  // Test 1: Same parent email should generate same credentials
  console.log('Test 1: Same parent email generates consistent credentials');
  const parentEmail = 'john.doe@example.com';
  
  const creds1 = await generateParentCredentialsByEmail(parentEmail);
  console.log('First call:', creds1);
  
  const creds2 = await generateParentCredentialsByEmail(parentEmail);
  console.log('Second call:', creds2);
  console.log('Same credentials?', JSON.stringify(creds1) === JSON.stringify(creds2));
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test 2: Different parent emails should generate different credentials
  console.log('Test 2: Different parent emails generate different credentials');
  const parentEmail2 = 'jane.smith@example.com';
  
  const creds3 = await generateParentCredentialsByEmail(parentEmail2);
  console.log('Different parent:', creds3);
  console.log('Different from first?', JSON.stringify(creds1) !== JSON.stringify(creds3));
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test 3: Student credentials (should remain the same)
  console.log('Test 3: Student credentials (unchanged)');
  const studentCreds1 = await generateStudentCredentials('S24001');
  const studentCreds2 = await generateStudentCredentials('S24002');
  
  console.log('Student S24001:', studentCreds1);
  console.log('Student S24002:', studentCreds2);
  
  console.log('\n✅ Test completed!');
}

// Run the test
testCredentialGeneration().catch(console.error);
