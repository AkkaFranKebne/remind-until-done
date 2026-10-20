import { cn } from './cn'

test('the later class wins when two set the same thing', () => {
  expect(cn('px-5', 'px-6')).toBe('px-6')
  expect(cn('text-fg2', 'text-accent')).toBe('text-accent')
  expect(cn('text-sm', 'text-lg')).toBe('text-lg')
})

test('a side margin overrides only that side', () => {
  expect(cn('-m-0.5', '-mr-2')).toBe('-m-0.5 -mr-2')
})

test('skips falsy values', () => {
  expect(cn('a', false, undefined, null, 'b')).toBe('a b')
})

// Our custom tokens (src/index.css): tailwind-merge must know what they are.
test('text-display is a font size, not a colour', () => {
  expect(cn('text-display', 'text-accent')).toBe('text-display text-accent')
  expect(cn('text-display', 'text-sm')).toBe('text-sm')
})

test('border-strong is a border width', () => {
  expect(cn('border', 'border-strong')).toBe('border-strong')
  expect(cn('border-strong', 'border-accent')).toBe('border-strong border-accent')
})

test('animate-spin-fast is an animation', () => {
  expect(cn('animate-spin', 'animate-spin-fast')).toBe('animate-spin-fast')
})

test('the sheet motions are kept next to look-alike classes', () => {
  expect(cn('bg-scrim backdrop-blur-sm', 'backdrop-fade')).toBe(
    'bg-scrim backdrop-blur-sm backdrop-fade',
  )
  expect(cn('sheet-slide', 'translate-y-0')).toBe('sheet-slide translate-y-0')
})

test('animate-shimmer and animate-nag-pulse are animations', () => {
  expect(cn('animate-spin', 'animate-shimmer')).toBe('animate-shimmer')
  expect(cn('animate-nag-pulse', 'motion-reduce:animate-none')).toBe(
    'animate-nag-pulse motion-reduce:animate-none',
  )
})

test('bg-shimmer is a background image, not a colour', () => {
  // A colour and the shimmer image don't replace each other.
  expect(cn('bg-bg3', 'bg-shimmer')).toBe('bg-bg3 bg-shimmer')
})

test('text-input is a font size, not a colour', () => {
  expect(cn('text-input', 'text-fg')).toBe('text-input text-fg')
  expect(cn('text-base', 'text-input')).toBe('text-input')
})

test('shadow-fab is a shadow (replaces shadow-md), not a shadow colour', () => {
  expect(cn('shadow-md', 'shadow-fab')).toBe('shadow-fab')
})

test('text-countdown is a font size, not a colour', () => {
  expect(cn('text-countdown', 'text-nag-mid-fg')).toBe('text-countdown text-nag-mid-fg')
  expect(cn('text-xl', 'text-countdown')).toBe('text-countdown')
})
