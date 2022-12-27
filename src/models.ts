import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export type Mode = 'development' | 'production'

export const rootDir = process.cwd()

export let swc = resolve(rootDir, 'node_modules/.bin/swc')

if (!existsSync(swc)) {
  swc = fileURLToPath(new URL('../node_modules/.bin/swc', import.meta.url))
}
