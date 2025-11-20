// Test setup file - runs before all tests
// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = 5001;

// Suppress console logs during tests (optional)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };

// Global test timeout
jest.setTimeout(10000);
