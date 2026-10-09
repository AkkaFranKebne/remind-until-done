import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge, taught our custom classes from src/index.css. Without this it would
 * guess wrong: e.g. it would treat text-display as a colour and drop it next to text-accent.
 * Add every new custom utility or size token here (cn.test.ts checks the tricky ones).
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['display'] }],
      'border-w': [{ border: ['strong'] }],
      animate: [{ animate: ['spin-fast'] }],
    },
  },
})

/**
 * Combines class names. Falsy values are skipped (clsx), and when two classes set the same
 * thing, the later one wins (tailwind-merge): cn('px-5', 'px-6') → 'px-6'.
 * Use it whenever a component accepts a className from outside.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
