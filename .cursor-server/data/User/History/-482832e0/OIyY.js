#!/usr/bin/env node

/**
 * Test script to verify scan lock mechanism
 * This script attempts to trigger multiple scans simultaneously
 * to ensure only one scan runs at a time
 */

const { spawn } = require('child_process');

console.log('🧪 Testing Scan Lock Mechanism');
console.log('==============================');
console.log();

// Function to start a scanner process
function startScanner(processId) {
  return new Promise((resolve, reject) => {
    console.log(`🚀 Starting scanner process ${processId}...`);
    
    const scanner = spawn('node', ['scripts/scanner.js'], {
      cwd: process.cwd(),
      stdio: 'pipe'
    });

    let output = '';
    let hasStarted = false;

    scanner.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      
      // Look for scan start/skip messages
      if (text.includes('Starting scan') || text.includes('Scan already in progress')) {
        if (!hasStarted) {
          hasStarted = true;
          console.log(`📊 Process ${processId}: ${text.trim()}`);
        }
      }
    });

    scanner.stderr.on('data', (data) => {
      console.log(`❌ Process ${processId} error: ${data.toString().trim()}`);
    });

    scanner.on('close', (code) => {
      console.log(`✅ Process ${processId} finished with code ${code}`);
      resolve({ processId, code, output });
    });

    scanner.on('error', (error) => {
      console.log(`❌ Process ${processId} failed to start: ${error.message}`);
      reject(error);
    });

    // Kill the process after 30 seconds
    setTimeout(() => {
      scanner.kill();
      resolve({ processId, code: 'timeout', output });
    }, 30000);
  });
}

// Test function
async function testScanLock() {
  console.log('🎯 Test Plan:');
  console.log('1. Start multiple scanner processes simultaneously');
  console.log('2. Verify only one scan runs at a time');
  console.log('3. Check that other processes skip with "already in progress" message');
  console.log();

  try {
    // Start 3 scanner processes simultaneously
    const processes = await Promise.allSettled([
      startScanner(1),
      startScanner(2), 
      startScanner(3)
    ]);

    console.log();
    console.log('📋 Test Results:');
    console.log('================');

    let runningCount = 0;
    let skippedCount = 0;

    processes.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const { processId, output } = result.value;
        
        if (output.includes('Starting scan')) {
          runningCount++;
          console.log(`✅ Process ${processId}: Successfully started scan`);
        } else if (output.includes('Scan already in progress')) {
          skippedCount++;
          console.log(`⏸️  Process ${processId}: Correctly skipped (lock active)`);
        } else {
          console.log(`❓ Process ${processId}: Unknown behavior`);
        }
      } else {
        console.log(`❌ Process ${index + 1}: Failed to start`);
      }
    });

    console.log();
    console.log('🎯 Lock Mechanism Test:');
    console.log(`  - Processes that started scans: ${runningCount}`);
    console.log(`  - Processes that skipped (locked): ${skippedCount}`);
    
    if (runningCount === 1 && skippedCount >= 1) {
      console.log('✅ TEST PASSED: Scan lock mechanism working correctly!');
      console.log('   Only one scan ran at a time, others were properly blocked.');
    } else {
      console.log('❌ TEST FAILED: Scan lock mechanism not working properly');
      console.log('   Multiple scans may have run simultaneously.');
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

// Run the test
testScanLock();
