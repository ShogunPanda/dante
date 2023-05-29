import { glob } from 'glob'
import { resolve } from 'node:path'

export type Mode = 'development' | 'production'

export const rootDir = process.cwd()
let swc: string

export async function resolveSwc(): Promise<string> {
  const location = await glob(resolve(rootDir, 'node_modules/**/@swc/cli/bin/swc.js'), {
    follow: true,
    dot: true
  })

  if (!location.length) {
    throw new Error('Cannot find swc.')
  }

  swc = location[0]
  return swc
}
