// Checks the "enforced" UI rules from web/AGENTS.md. Runs as part of `npm run lint`.
// Each rule id here matches an id in web/AGENTS.md.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, relative } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const src = join(root, 'src')
const tokensFile = join(src, 'index.css')

function filesIn(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? filesIn(path) : [path]
  })
}

const tailwindPalette =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'

// Line rules: [rule id, regex, message]
const lineRules = [
  ['ui-tokens-only', /#[0-9a-fA-F]{3,8}\b/, 'raw hex colour; use a token from src/index.css'],
  [
    'ui-tokens-only',
    /\b(rgba?|hsla?|oklch)\(/,
    'raw colour function; use a token from src/index.css',
  ],
  [
    'ui-tokens-only',
    new RegExp(`\\b[a-z-]+-(${tailwindPalette})-\\d{2,3}\\b`),
    "Tailwind's own palette colour; use a token (e.g. text-fg2, bg-accent-bg)",
  ],
  [
    'ui-tokens-only',
    // Any utility: text-white, border-t-white, shadow-black/20 ... (whitespace-* is safe: no '-' before 'white').
    /\b[a-z][a-z-]*-(white|black)(\/\d+)?\b/,
    'named colour; use a token (e.g. text-on-solid)',
  ],
  [
    'ui-tokens-only',
    /\b(text|rounded(-[a-z]{1,2})?)-\[[0-9.]+(px|rem|em)\]/,
    'fixed size; use the type scale (text-xs … text-xl, text-display) or radii (rounded-sm/md/lg)',
  ],
  [
    'ui-tokens-only',
    /\btext-([2-9]xl)\b|\brounded(-[a-z]{1,2})?-([2-4]?xl|xs)\b/,
    "Tailwind's own size; it doesn't exist here. Use our type scale or radii",
  ],
  [
    'ui-no-transition-all',
    /\btransition-all\b|transition:\s*all\b/,
    'name the properties that animate',
  ],
  ['ui-icons-lucide', /<svg[\s>]/, 'inline <svg>; use an icon from lucide-react'],
  [
    'ui-base-ui-first',
    /<(button|input|select|textarea|dialog)[\s>]/,
    'raw form/dialog element; use our components built on Base UI (Button, IconButton ...) or a Base UI component',
  ],
]

const problems = []
const sourceFiles = filesIn(src).filter((f) => /\.(tsx?|css)$/.test(f) && f !== tokensFile)

for (const file of sourceFiles) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const [id, regex, message] of lineRules) {
        if (regex.test(line)) problems.push(`${relative(root, file)}:${i + 1}  [${id}] ${message}`)
      }
    })
}

// ui-component-story-and-test: every shared component has a story and a test.
const uiDir = join(src, 'components', 'ui')
for (const file of filesIn(uiDir)) {
  if (!/\.tsx$/.test(file) || /\.(stories|test)\.tsx$/.test(file)) continue
  const name = basename(file, '.tsx')
  for (const kind of ['stories', 'test']) {
    if (!existsSync(join(uiDir, `${name}.${kind}.tsx`))) {
      problems.push(
        `${relative(root, file)}  [ui-component-story-and-test] missing ${name}.${kind}.tsx`,
      )
    }
  }
}

if (problems.length > 0) {
  console.error(`UI rules (web/AGENTS.md) broken:\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
console.log('UI rules: ok')
