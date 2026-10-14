import { countCharacters } from './text'

test('counts characters like the API: ä and emoji are 1 each', () => {
  expect(countCharacters('')).toBe(0)
  expect(countCharacters('abc')).toBe(3)
  expect(countCharacters('ä😀b')).toBe(3)
  expect('ä😀b'.length).toBe(4) // what .length would have said
})
