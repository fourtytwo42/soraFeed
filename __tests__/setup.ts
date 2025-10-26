// Jest setup file
import dotenv from 'dotenv';
import { jest } from '@jest/globals';

// Load environment variables
dotenv.config({ path: '.env' });

// Mock Next.js specific modules
jest.mock('next/server', () => ({
  NextRequest: class MockNextRequest {},
  NextResponse: {
    json: jest.fn((data: any) => ({ data })),
  },
}));

// Setup timeout for long-running tests
jest.setTimeout(30000);
