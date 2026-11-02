import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Contrast of the colour tokens in index.css, in both themes (design doc decision 65). A colour
 * change that makes text hard to read fails here, not on a phone. WCAG: small text 4.5:1;
 * large text (the reminder page's title and countdown) and icons or edges of controls 3:1.
 */

const css = readFileSync(join(__dirname, 'index.css'), 'utf8')

/** The custom properties of the first block that starts at `selector`. */
function tokensOf(selector: string): Record<string, string> {
  const start = css.indexOf(selector)
  if (start < 0) throw new Error(`no block ${selector}`)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  const body = css.slice(open + 1, close)
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [
      m[1],
      (m[2] ?? '').replace(/\s+/g, ' ').trim(),
    ]),
  )
}

const light = tokensOf(':root {')
const darkMedia = tokensOf(":root:not([data-theme='light']) {")
const darkToggle = tokensOf(":root[data-theme='dark'] {")

type Rgb = [number, number, number]

/** `top` at `alpha` over `under`. */
const mix = (top: Rgb, under: Rgb, alpha: number): Rgb => [
  top[0] * alpha + under[0] * (1 - alpha),
  top[1] * alpha + under[1] * (1 - alpha),
  top[2] * alpha + under[2] * (1 - alpha),
]

/** A hex colour, or an rgba colour laid over `under`. */
function rgbOf(value: string, under?: Rgb): Rgb {
  const hex = /^#([0-9a-f]{6})$/i.exec(value)
  if (hex) {
    const n = parseInt(hex[1] ?? '', 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const rgba = /^rgba?\(([^)]+)\)$/.exec(value)
  if (!rgba) throw new Error(`not a colour: ${value}`)
  const [r = 0, g = 0, b = 0, a = 1] = (rgba[1] ?? '').split(',').map(Number)
  return mix([r, g, b], under ?? [255, 255, 255], a)
}

/**
 * The colours a background can show under text: one colour, or every stop of a gradient
 * (text lower on the page sits on a later stop; var(--x) stops are looked up).
 */
function backgroundsOf(tokens: Record<string, string>, name: string): Rgb[] {
  const value = valueOf(tokens, name)
  if (!value.includes('gradient')) return [rgbOf(value)]
  return [...value.matchAll(/#[0-9a-f]{6}\b|rgba?\([^)]+\)|var\((--[\w-]+)\)/gi)].map((m) =>
    m[1] ? rgbOf(valueOf(tokens, m[1])) : rgbOf(m[0]),
  )
}

/** Text at `opacity` over the background (the row's sub-line is 90%). */
const fade = (fg: Rgb, bg: Rgb, opacity: number): Rgb => mix(fg, bg, opacity)

function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function ratio(a: Rgb, b: Rgb): number {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** A token's value in this theme; dark blocks only list what differs from light. */
function valueOf(tokens: Record<string, string>, name: string): string {
  const value = tokens[name] ?? light[name]
  if (value === undefined) throw new Error(`no token ${name}`)
  return value
}

const TEXT = 4.5
const LARGE = 3

/** [what, text token, background token, minimum, text opacity]. Every pair a component uses. */
const pairs: [string, string, string, number, number?][] = [
  // Page, cards, sheets
  ['body text on the page', '--fg', '--bg', TEXT],
  ['body text on cards and sheets', '--fg', '--bg2', TEXT],
  ['secondary text on the page', '--fg2', '--bg', TEXT],
  ['secondary text on cards and sheets', '--fg2', '--bg2', TEXT],
  ['text on quiet surfaces: settings rows, the secondary button', '--fg', '--bg3', TEXT],
  ['secondary text on quiet surfaces', '--fg2', '--bg3', TEXT],
  ['links and the logo on the page', '--accent', '--bg', TEXT],
  ['the near-limit counter on a sheet', '--accent', '--bg2', TEXT],
  ['banner, selected chip, avatar', '--accent', '--accent-bg', TEXT],
  ['banner secondary text', '--fg2', '--accent-bg', TEXT],
  ['filled button text', '--on-solid', '--accent-solid', TEXT],
  ['the + button against the page', '--fab', '--bg', LARGE],
  ['danger button and swipe-delete text', '--on-solid', '--error', TEXT],
  ['form errors on a sheet', '--error-text', '--bg2', TEXT],
  ['alerts on the page', '--error-text', '--bg', TEXT],
  ['error toast, login error, error icon tiles', '--error-text', '--error-bg', TEXT],
  ['steps card number circles', '--nag-low', '--nag-low-fg', TEXT],
  ['steps card quiet number circles', '--bg3', '--fg2', TEXT],
  ['install card title', '--install-fg', '--grad-install-card', TEXT],
  ['install card steps', '--install-fg2', '--grad-install-card', TEXT],

  // List rows: title and the 90% sub-line
  ['waiting row title', '--on-grad', '--waiting-row-bg', TEXT],
  ['waiting row sub-line', '--on-grad', '--waiting-row-bg', TEXT, 0.9],
  ['nag-low row title', '--nag-low-fg', '--nag-low', TEXT],
  ['nag-low row sub-line', '--nag-low-fg', '--nag-low', TEXT, 0.9],
  ['nag-mid row title', '--nag-mid-fg', '--nag-mid', TEXT],
  ['nag-mid row sub-line', '--nag-mid-fg', '--nag-mid', TEXT, 0.9],
  ['nag-high row title', '--nag-high-fg', '--nag-high', TEXT],
  ['nag-high row sub-line', '--nag-high-fg', '--nag-high', TEXT, 0.9],
  ['overdue row title', '--tag-overdue-fg', '--tag-overdue', TEXT],
  ['overdue row sub-line', '--tag-overdue-fg', '--tag-overdue', TEXT, 0.9],
  ['overdue row ring', '--row-overdue-ring', '--tag-overdue', LARGE],
  ['overdue tile picked ring', '--row-overdue-ring', '--tile-overdue', LARGE],
  ['done row title', '--tag-done-fg', '--tag-done', TEXT],
  ['done row sub-line', '--tag-done-fg', '--tag-done', TEXT, 0.9],

  // Chips
  ['waiting chip', '--tag-pending-fg', '--tag-pending', TEXT],
  ['waiting chip on its row', '--on-grad', '--chip-on-waiting-row', TEXT],
  ['nagging chip', '--tag-nagging-fg', '--tag-nagging', TEXT],
  ['nagging chip on a nag-high row', '--chip-on-nag-high-fg', '--chip-on-nag-high', TEXT],
  ['overdue chip', '--tag-overdue-chip-fg', '--tag-overdue-chip', TEXT],
  ['done chip', '--tag-done-fg', '--tag-done', TEXT],
  ['done chip on its row', '--tag-done-fg', '--chip-on-done-row', TEXT],

  // Tiles
  ['waiting tile', '--on-grad', '--tile-waiting', TEXT],
  ['nagging tile', '--tag-nagging-fg', '--tile-nagging', TEXT],
  ['overdue tile', '--tile-overdue-fg', '--tile-overdue', TEXT],
  ['done tile', '--tag-done-fg', '--tile-done', TEXT],
  // The picked Waiting, Nagging and Done tiles' frame (tile-ring-picked, --row-frame) is not here:
  // it is the rows' faint frame, below 3:1 on purpose (owner, design doc decision 65). The picked
  // Overdue tile's ember ring is checked above, like the overdue row's.

  // The list's gradients: the logo (large) and the context line and list label (small)
  ['context line and list label, all and waiting', '--on-grad-fg2', '--grad-shell-brand', TEXT],
  ['waiting list label', '--on-grad', '--grad-shell-brand', TEXT],
  ['nagging list label', '--on-grad-fg2', '--grad-shell-nagging', TEXT],
  ['overdue list label', '--tile-overdue-fg', '--grad-shell-overdue', TEXT],
  ['done list label', '--tag-done-fg', '--grad-shell-done', TEXT],
  ['logo on the nagging list', '--on-grad', '--grad-shell-nagging', LARGE],
  ['logo on the overdue list', '--on-grad', '--grad-shell-overdue', LARGE],
  ['logo on the done list', '--on-grad', '--grad-shell-done', LARGE],

  // The reminder page: the state's text (title, note, countdown, icons), the grey labels, the logo
  ['waiting page text', '--on-grad', '--grad-detail-waiting', TEXT],
  ['nag-low page text', '--nag-low-fg', '--grad-detail-nag-low', TEXT],
  ['nag-mid page text', '--nag-mid-fg', '--grad-detail-nag-mid', TEXT],
  ['nag-high page text', '--nag-high-fg', '--grad-detail-nag-high', TEXT],
  ['overdue page text', '--tile-overdue-fg', '--grad-detail-overdue', TEXT],
  ['done page text', '--tag-done-fg', '--grad-detail-done', TEXT],
  ['waiting page labels', '--on-grad-fg2', '--grad-detail-waiting', TEXT],
  ['nag-low page labels', '--on-grad-fg2', '--grad-detail-nag-low', TEXT],
  ['nag-mid page labels', '--on-grad-fg2', '--grad-detail-nag-mid', TEXT],
  ['nag-high page labels', '--on-grad-fg2', '--grad-detail-nag-high', TEXT],
  ['overdue page labels', '--on-grad-fg2', '--grad-detail-overdue', TEXT],
  ['done page labels', '--on-grad-fg2', '--grad-detail-done', TEXT],
  ['logo on the nag-high page', '--on-grad', '--grad-detail-nag-high', LARGE],
  ['logo on the overdue page', '--on-grad', '--grad-detail-overdue', LARGE],
  ['logo on the done page', '--on-grad', '--grad-detail-done', LARGE],
  ['stat values on the waiting page', '--fg', '--grad-detail-waiting', LARGE],
  ['stat values on the nag-mid page', '--fg', '--grad-detail-nag-mid', LARGE],
  ['stat values on the overdue page', '--fg', '--grad-detail-overdue', LARGE],
  ['empty state heading', '--on-row', '--grad-shell-brand', LARGE],
]

test('both dark blocks are the same (the phone setting and the Storybook toggle)', () => {
  expect(darkToggle).toEqual(darkMedia)
})

describe.each([
  ['light', light],
  ['dark', darkMedia],
])('%s theme', (_, tokens) => {
  test.each(pairs)('%s', (_what, fgName, bgName, min, opacity = 1) => {
    // On a gradient, the weakest stop counts.
    const worst = Math.min(
      ...backgroundsOf(tokens, bgName).map((bg) =>
        ratio(fade(rgbOf(valueOf(tokens, fgName), bg), bg, opacity), bg),
      ),
    )
    expect(worst).toBeGreaterThanOrEqual(min)
  })
})
