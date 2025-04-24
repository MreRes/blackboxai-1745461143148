module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // Test files pattern
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js'
  ],
  
  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'backend/**/*.js',
    '!backend/config/**',
    '!backend/scripts/**',
    '!backend/docs/**',
    '!**/node_modules/**',
    '!**/tests/**'
  ],
  coverageReporters: ['text', 'lcov', 'clover', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },

  // Test timeout
  testTimeout: 30000,

  // Setup files
  setupFiles: ['<rootDir>/tests/setup.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setupAfterEnv.js'],

  // Module file extensions
  moduleFileExtensions: ['js', 'json'],

  // Module name mapper for aliases
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/backend/$1',
    '^@utils/(.*)$': '<rootDir>/backend/utils/$1',
    '^@models/(.*)$': '<rootDir>/backend/models/$1',
    '^@routes/(.*)$': '<rootDir>/backend/routes/$1',
    '^@middleware/(.*)$': '<rootDir>/backend/middleware/$1',
    '^@config/(.*)$': '<rootDir>/backend/config/$1'
  },

  // Transform configuration
  transform: {
    '^.+\\.js$': 'babel-jest'
  },

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/dist/',
    '/docs/',
    '/logs/'
  ],

  // Watch plugins
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname'
  ],

  // Reporter configuration
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'reports/junit',
        outputName: 'jest-junit.xml',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
        ancestorSeparator: ' › ',
        usePathForSuiteName: true
      }
    ]
  ],

  // Global configuration
  globals: {
    NODE_ENV: 'test'
  },

  // Clear mocks between tests
  clearMocks: true,

  // Verbose output
  verbose: true,

  // Detect open handles
  detectOpenHandles: true,

  // Force exit after tests
  forceExit: true,

  // Maximum number of workers
  maxWorkers: '50%',

  // Error handling
  bail: 1,
  
  // Custom resolver
  resolver: undefined,

  // Root directory
  rootDir: '.',

  // Display configuration
  displayName: {
    name: 'Financial WhatsApp Bot',
    color: 'blue'
  },

  // Notification configuration
  notify: true,
  notifyMode: 'failure-change',

  // Cache configuration
  cache: true,
  cacheDirectory: '.jest-cache',

  // Projects configuration for monorepo (if needed)
  projects: undefined,

  // Global setup/teardown
  globalSetup: undefined,
  globalTeardown: undefined,

  // Error formatting
  errorOnDeprecated: true,
  prettierPath: '<rootDir>/node_modules/prettier',

  // Test sequencer
  testSequencer: '@jest/test-sequencer',

  // Snapshot configuration
  snapshotSerializers: [],
  snapshotFormat: {
    escapeString: true,
    printBasicPrototype: false
  }
};
