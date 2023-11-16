import { glob } from 'glob'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type pino from 'pino'

export type Mode = 'development' | 'production'

export interface BuildContext {
  logger: pino.Logger
  isProduction: boolean
  root: string
  cssClasses: Set<string>
  safelist: string[]
  keepExpandedCss: boolean
  removeUnusedCss: boolean
  extensions?: any
}

export const danteDir = resolve(fileURLToPath(import.meta.url), '../..')
export const rootDir = process.cwd()
export let programName = 'dante'
export let baseTemporaryDirectory = '.dante'

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

export function setProgramName(name: string): void {
  programName = name
}

export function setBaseTemporaryDirectory(dir: string): void {
  baseTemporaryDirectory = dir
}

export function createBuildContext(
  logger: pino.Logger,
  isProduction: boolean,
  root: string,
  safelist: string[] = []
): BuildContext {
  return { logger, isProduction, root, cssClasses: new Set(), safelist, keepExpandedCss: false, removeUnusedCss: true }
}
