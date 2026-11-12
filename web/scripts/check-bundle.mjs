// Fails if the production build (dist/) contains test-only or mock code: MSW, faker, or the
// fake data of `npm run dev:mock`. Run after `npm run build` (CI does).
// Prints only file names and markers, never the bundle itself.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const dist = new URL('../dist', import.meta.url).pathname

// Strings that survive minifying: MSW's worker file name and log prefix, faker's package
// name, seed data from src/mocks/devApi.ts, the fake sign-in's token (mockAuthClient.ts) and the
// fake push token (mockPushClient.ts: in prod, every phone would register it and get no pushes).
const markers = [
  'mockServiceWorker',
  '[MSW]',
  '@faker-js',
  'Renew passport',
  'mock-token',
  'rud.mock.signedOut', // the fake sign-in's sessionStorage key (mockAuthClient.ts)
  'mock-push-token',
]

function filesIn(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? filesIn(path) : [path]
  })
}

const found = filesIn(dist)
  .filter((f) => /\.(js|html|css)$/.test(f))
  .flatMap((f) => {
    const text = readFileSync(f, 'utf8')
    return markers.filter((m) => text.includes(m)).map((m) => `${relative(dist, f)}: ${m}`)
  })

if (found.length > 0) {
  console.error('Test-only or mock code in the production build:\n  ' + found.join('\n  '))
  process.exit(1)
}
console.log('Bundle: no test-only or mock code')
