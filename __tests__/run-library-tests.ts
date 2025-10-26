#!/usr/bin/env tsx
import { glob } from 'glob';
import * as path from 'path';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

interface TestSuiteResult {
  file: string;
  passed: boolean;
  tests: TestResult[];
  totalTests: number;
  passedTests: number;
  duration: number;
}

async function runTestSuite(file: string): Promise<TestSuiteResult> {
  const startTime = Date.now();
  const tests: TestResult[] = [];
  
  try {
    // Import and run the test file
    const testModule = await import(file);
    const results = await testModule.runAllTests?.();
    
    if (results) {
      results.forEach((result: any) => {
        tests.push({
          name: result.name,
          passed: result.passed,
          duration: result.duration || 0,
          error: result.error
        });
      });
    }
  } catch (error) {
    console.error(`❌ Error running test suite ${file}:`, error);
    tests.push({
      name: 'Test Suite',
      passed: false,
      duration: 0,
      error: error instanceof Error ? error.message : String(error)
    });
  }
  
  const duration = Date.now() - startTime;
  const passedTests = tests.filter(t => t.passed).length;
  
  return {
    file: path.basename(file),
    passed: passedTests === tests.length && tests.length > 0,
    tests,
    totalTests: tests.length,
    passedTests,
    duration
  };
}

async function runAllLibraryTests() {
  console.log('🧪 Running Library Tests\n');
  console.log('='.repeat(80) + '\n');
  
  // Find all test files in __tests__/lib
  const testFiles = await glob('__tests__/lib/**/*.test.ts', { 
    absolute: true,
    cwd: process.cwd()
  });
  
  if (testFiles.length === 0) {
    console.log('❌ No test files found in __tests__/lib');
    return;
  }
  
  const results: TestSuiteResult[] = [];
  
  // Run each test file
  for (const file of testFiles) {
    const result = await runTestSuite(file);
    results.push(result);
  }
  
  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 Test Summary\n');
  
  let totalTests = 0;
  let totalPassed = 0;
  let totalDuration = 0;
  
  results.forEach(result => {
    const status = result.passed ? '✅' : '❌';
    console.log(`${status} ${result.file}`);
    console.log(`   Tests: ${result.passedTests}/${result.totalTests} passed`);
    console.log(`   Duration: ${result.duration}ms\n`);
    
    totalTests += result.totalTests;
    totalPassed += result.passedTests;
    totalDuration += result.duration;
    
    // Print individual test results
    result.tests.forEach(test => {
      const status = test.passed ? '✓' : '✗';
      console.log(`   ${status} ${test.name}${test.error ? ' - ' + test.error : ''}`);
    });
    console.log('');
  });
  
  // Print overall summary
  console.log('='.repeat(80));
  console.log(`\nTotal: ${totalPassed}/${totalTests} tests passed`);
  console.log(`Duration: ${totalDuration}ms`);
  console.log(`Result: ${totalPassed === totalTests ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}\n`);
  
  process.exit(totalPassed === totalTests ? 0 : 1);
}

// Run tests
runAllLibraryTests().catch(console.error);
