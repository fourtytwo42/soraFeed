// Simple test helper for running tests with tsx
// This file must be imported FIRST in any test file

export interface TestCase {
  name: string;
  fn: () => void | Promise<void>;
}

export interface TestSuite {
  name: string;
  tests: TestCase[];
}

const suites: TestSuite[] = [];
let currentSuiteName: string | null = null;
let currentTests: TestCase[] = [];

export function describe(name: string, fn: () => void) {
  currentSuiteName = name;
  currentTests = [];
  fn();
  if (currentTests.length > 0) {
    suites.push({ name, tests: [...currentTests] });
  }
  currentSuiteName = null;
  currentTests = [];
}

export function it(name: string, fn: () => void | Promise<void>) {
  if (currentSuiteName) {
    currentTests.push({ name, fn });
  }
}

export function expect(value: any) {
  return {
    toBe: (expected: any) => {
      if (value !== expected) {
        throw new Error(`Expected ${value} to be ${expected}`);
      }
    },
    toBeDefined: () => {
      if (value === undefined || value === null) {
        throw new Error(`Expected value to be defined, but got ${value}`);
      }
    },
    toBeNull: () => {
      if (value !== null) {
        throw new Error(`Expected value to be null, but got ${value}`);
      }
    },
    toBeGreaterThan: (expected: number) => {
      if (value <= expected) {
        throw new Error(`Expected ${value} to be greater than ${expected}`);
      }
    },
    toBeLessThan: (expected: number) => {
      if (value >= expected) {
        throw new Error(`Expected ${value} to be less than ${expected}`);
      }
    },
    toBeLessThanOrEqual: (expected: number) => {
      if (value > expected) {
        throw new Error(`Expected ${value} to be less than or equal to ${expected}`);
      }
    },
    toBeGreaterThanOrEqual: (expected: number) => {
      if (value < expected) {
        throw new Error(`Expected ${value} to be greater than or equal to ${expected}`);
      }
    },
    toHaveLength: (expected: number) => {
      if (value.length !== expected) {
        throw new Error(`Expected array/string to have length ${expected}, but got ${value.length}`);
      }
    },
    toContain: (expected: any) => {
      if (!value.includes(expected)) {
        throw new Error(`Expected array/string to contain ${expected}`);
      }
    },
  };
}

export async function runTests(): Promise<any[]> {
  const results: any[] = [];
  
  for (const suite of suites) {
    for (const test of suite.tests) {
      const startTime = Date.now();
      let passed = false;
      let error: string | undefined;
      
      try {
        // Run before hook if it exists
        if (beforeHook) {
          await beforeHook();
        }
        
        // Run the test
        await test.fn();
        
        passed = true;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      } finally {
        // Run after hook if it exists
        if (afterHook) {
          try {
            await afterHook();
          } catch (e) {
            // Ignore errors in after hook
          }
        }
      }
      
      const duration = Date.now() - startTime;
      results.push({
        name: `${suite.name} > ${test.name}`,
        passed,
        duration,
        error
      });
    }
  }
  
  return results;
}

// Store beforeEach and afterEach hooks
let beforeHook: (() => void | Promise<void>) | null = null;
let afterHook: (() => void | Promise<void>) | null = null;

// Export common test utilities
export const beforeEach = (fn: () => void | Promise<void>) => {
  beforeHook = fn;
};

export const afterEach = (fn: () => void | Promise<void>) => {
  afterHook = fn;
};
