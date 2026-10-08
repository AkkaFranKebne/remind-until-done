/** @type {import('jest').Config} */
export default {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
  transform: {
    // ts-jest compiles TypeScript for Jest, using tsconfig.test.json.
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
  moduleNameMapper: {
    // Jest can't import CSS; replace it with an empty object.
    '\\.css$': '<rootDir>/jest.style-mock.cjs',
  },
}
