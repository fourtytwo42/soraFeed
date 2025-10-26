// Simple test helper for running tests with tsx
// This file must be imported FIRST in any test file

export interface TestCase {
  name: string;
  fn: () => void | Promise<void>;
}

export interface TestSuite {
  name: string;
  tests: TestCase[];
  beforeHook?: (() => void | Promise<void>) | null;
  afterHook?: (() => void | Promise<void>) | null;
}

const suites: TestSuite[] = [];
let currentSuiteName: string | null = null;
let currentTests: TestCase[] = [];
let suiteBeforeHook: (() => void | Promise<void>) | null = null;
let suiteAfterHook: (() => void | Promise<void>) | null = null;

export function describe(name: string, fn: () => void) {
  const parentSuiteName = currentSuiteName;
  const parentTests = currentTests;
  const parentBeforeHook = suiteBeforeHook;
  const parentAfterHook = suiteAfterHook;
  
  // Save hooks from parent suite if they exist
  const inheritedBeforeHook = suiteBeforeHook;
  const inheritedAfterHook = suiteAfterHook;
  
  currentSuiteName = name;
  currentTests = [];
  suiteBeforeHook = null;
  suiteAfterHook = null;
  
  fn();
  
  // For nested describes, only push if there are tests or hooks defined
  if (currentTests.length > 0 || suiteBeforeHook || suiteAfterHook) {
    // If this is a nested describe and has hooks, use them; otherwise inherit
    suites.push({ 
      name: parentSuiteName ? `${parentSuiteName} > ${name}` : name, 
      tests: [...currentTests],
      beforeHook: suiteBeforeHook || inheritedBeforeHook || null,
      afterHook: suiteAfterHook || inheritedAfterHook || null
    });
  }
  
  currentSuiteName = parentSuiteName;
  currentTests = parentTests;
  suiteBeforeHook = parentBeforeHook;
  suiteAfterHook = parentAfterHook;
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
    for (let i = 0; i < suite.tests.length; i++) {
      const test = suite.tests[i];
      const startTime = Date.now();
      let passed = false;
      let error: string | undefined;
      
      try {
        // Run suite's before hook if it exists
        if (suite.beforeHook) {
          await suite.beforeHook();
        }
        
        // Run the test
        await test.fn();
        
        passed = true;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      } finally {
        // Run suite's after hook if it exists
        if (suite.afterHook) {
          try {
            await suite.afterHook();
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

// Export common test utilities
export const beforeEach = (fn: () => void | Promise<void>) => {
  if (currentSuiteName) {
    suiteBeforeHook = fn;
  }
};

export const afterEach = (fn: () => void | Promise<void>) => {
  if (currentSuiteName) {
    suiteAfterHook = fn;
  }
};
