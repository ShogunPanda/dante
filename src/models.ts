import { glob } from 'glob'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type pino from 'pino'

export type Mode = 'development' | 'production'

type ValueOrCallback<T> = T | ((context: BuildContext) => Promise<T>)

export interface CSSClassGeneratorContext {
  prefix?: string
  name: string
  counter: number
}

export interface BuildContext {
  version: string
  logger: pino.Logger
  isProduction: boolean
  root: string
  currentPage?: string
  css: {
    keepExpanded: boolean
    removeUnused: boolean
    classes: ValueOrCallback<Set<string>>
    compressedClasses: ValueOrCallback<Map<string, string>>
    generator: ValueOrCallback<CSSClassGeneratorContext>
  }
  extensions: any
}

export const danteDir = resolve(fileURLToPath(import.meta.url), '../..')
export const rootDir = process.cwd()
export const programName = process.env.DANTE_PROGRAM_NAME ?? 'dante'
export const programDescription = process.env.DANTE_PROGRAM_DESCRIPTION ?? 'Opinionated static site generator.'
export const baseTemporaryDirectory = process.env.DANTE_BASE_TEMPORARY_DIRECTORY ?? '.dante'

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

export function buildFilePath(): string {
  if (process.env.DANTE_BUILD_FILE_PATH) {
    return resolve(rootDir, process.env.DANTE_BUILD_FILE_PATH)
  }

  return resolve(rootDir, baseTemporaryDirectory, 'build/index.js')
}

export function createBuildContext(logger: pino.Logger, isProduction: boolean, root: string): BuildContext {
  return {
    version: new Date()
      .toISOString()
      .replaceAll(/([:-])|(\.\d+Z$)/g, '')
      .replace('T', '.'),
    logger,
    isProduction,
    root,
    css: {
      keepExpanded: !isProduction,
      removeUnused: isProduction,
      classes: new Set(),
      compressedClasses: new Map<string, string>(),
      generator: { name: '', counter: 0 }
    },
    extensions: {}
  }
}
