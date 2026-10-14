/**
 * Characters the way the API counts them (Unicode code points, Go's utf8.RuneCountInString),
 * not JavaScript's UTF-16 units: "ä" is 1, and so is an emoji like "😀".
 */
export function countCharacters(text: string): number {
  let n = 0
  for (const _ of text) n++
  return n
}
