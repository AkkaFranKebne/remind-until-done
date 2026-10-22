import { toFirebaseOptions } from './firebaseOptions'

const initJson = {
  apiKey: 'key',
  appId: '1:123:web:abc',
  authDomain: 'rud-dev-4f7k2.firebaseapp.com',
  databaseURL: '',
  messagingSenderId: '123',
  projectId: 'rud-dev-4f7k2',
  storageBucket: '',
}

test('keeps what sign-in and push need (appId: push fails without it)', () => {
  expect(toFirebaseOptions(initJson)).toEqual({
    apiKey: 'key',
    appId: '1:123:web:abc',
    messagingSenderId: '123',
    projectId: 'rud-dev-4f7k2',
  })
})

test('a site not linked to the Web App has no appId: sign-in still works', () => {
  const { appId: _unlinked, ...withoutAppId } = initJson
  expect(toFirebaseOptions(withoutAppId)).toEqual({
    apiKey: 'key',
    messagingSenderId: '123',
    projectId: 'rud-dev-4f7k2',
  })
})

test('refuses settings without apiKey or projectId, or with non-text values', () => {
  expect(() => toFirebaseOptions({ projectId: 'p' })).toThrow('incomplete')
  expect(() => toFirebaseOptions({ apiKey: 'k', projectId: 7 })).toThrow('incomplete')
  expect(() => toFirebaseOptions(null)).toThrow('incomplete')
})

test('ignores an appId that is not text', () => {
  expect(toFirebaseOptions({ ...initJson, appId: 42 })).not.toHaveProperty('appId')
})
