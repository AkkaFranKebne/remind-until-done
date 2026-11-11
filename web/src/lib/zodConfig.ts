import * as z from 'zod/mini'

/**
 * zod would otherwise build its object checks with new Function (a kind of eval) to run faster.
 * Our Content-Security-Policy doesn't allow eval (web/firebase.json, design doc 7.1), and our forms
 * are small. zod reads this when a schema is created, so main.tsx imports this file first, before
 * any module that defines a schema.
 */
z.config({ jitless: true })
