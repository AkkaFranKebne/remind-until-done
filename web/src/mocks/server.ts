import { setupServer } from 'msw/node'
import { getUserMock } from '../lib/api/generated/user/user.msw'

/**
 * The fake API for Jest tests (MSW). It answers every call the app makes with the
 * mocks orval generated from swagger.json. A test changes one answer with
 * `server.use(handler)`; jest.setup.ts resets that after each test.
 */
export const server = setupServer(...getUserMock())
