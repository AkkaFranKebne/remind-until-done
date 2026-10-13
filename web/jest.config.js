// Same time zone on every machine (CI runs in UTC): a test must not pass on one laptop
// and fail on another. Tests that need another zone mock it.
process.env.TZ = 'UTC'

/** @type {import('jest').Config} */
export default {
  testEnvironment: 'jest-fixed-jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
  transform: {
    // ts-jest compiles TypeScript for Jest, using tsconfig.test.json.
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
    // A few of MSW's dependencies ship only as ES modules; compile them to CommonJS too.
    '^.+\\.m?js$': ['ts-jest', { tsconfig: { allowJs: true } }],
  },
  transformIgnorePatterns: ['/node_modules/(?!(rettime|until-async|@open-draft|@faker-js/faker)/)'],
  moduleNameMapper: {
    // Jest can't import CSS; replace it with an empty object.
    '\\.css$': '<rootDir>/jest.style-mock.cjs',
  },
}
