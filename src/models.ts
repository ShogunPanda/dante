import { type FastifyInstance } from 'fastify'
import { glob } from 'glob'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type pino from 'pino'
import { type Plugin } from 'postcss'

export type Mode = 'development' | 'production'

export type ValueOrCallback<T> = T | ((context: BuildContext) => T | Promise<T>)

export interface BuildContext {
  version: string
  logger: pino.Logger
  isProduction: boolean
  root: string
  currentPage?: string
  extensions: any
}

export interface BuildResult {
  css?: ValueOrCallback<string>
  postcssPlugins?: ValueOrCallback<Plugin[]>
}

export type BuildFunction = (context: BuildContext) => BuildResult | Promise<BuildResult>

export interface ServerResult {
  directory?: string
}

export type ServerFunction = (
  server: FastifyInstance,
  isProduction?: boolean
) => ServerResult | undefined | Promise<ServerResult | undefined>

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

export function serverFilePath(): string {
  if (process.env.DANTE_SERVER_FILE_PATH) {
    return resolve(rootDir, process.env.DANTE_SERVER_FILE_PATH)
  }

  return resolve(rootDir, baseTemporaryDirectory, 'build/server.js')
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
    extensions: {}
  }
}
