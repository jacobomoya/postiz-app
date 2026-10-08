export default {
  displayName: 'frontend',
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/src/**/*.spec.tsx'],
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', {
      tsconfig: { jsx: 'react-jsx', esModuleInterop: true, module: 'commonjs' },
      isolatedModules: true,
    }],
  },
  moduleNameMapper: {
    // jsdom optionally loads `canvas`; the native binary is unavailable in this
    // environment (no prebuilt for Node 22 arm64), so stub it for unit tests.
    '^canvas$': '<rootDir>/test/mocks/canvas.stub.ts',
    '^@gitroom/frontend/(.*)$': '<rootDir>/src/$1',
    '^@gitroom/helpers/(.*)$': '<rootDir>/../../libraries/helpers/src/$1',
  },
};
