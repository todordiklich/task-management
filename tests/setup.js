import { jest } from '@jest/globals';

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-32-chars-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-chars-long';
process.env.PORT = '3000';

// Mock console methods to avoid noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};

// Setup global test timeout
jest.setTimeout(10000);
