import { BuildContext, createBuildContext, createFile, createStylesheet as createCSS, Mode, rootDir } from 'dante'
import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import pino from 'pino'
import { cssConfig } from '../styling/unocss.config.js'
import { page } from '../templates/index.html.js'

export const safelist = []

export function createStylesheet(context: BuildContext, minify: boolean): Promise<string> {
  return createCSS(
    cssConfig,
    context.cssClasses,
    minify,
    (id: string) => {
      return null
    },
    ''
  )
}

export async function build(
  mode: Mode,
  after?: (context: BuildContext) => void | Promise<void>
): Promise<BuildContext> {
  const isProduction = mode === 'production'
  const logger = pino({ transport: { target: 'pino-pretty' } })
  const start = process.hrtime.bigint()

  const version = new Date()
    .toISOString()
    .replaceAll(/([:-])|(\.\d+Z$)/g, '')
    .replace('T', '.')

  // Clean up the directory
  const baseDir = resolve(rootDir, 'dist')
  await rm(baseDir, { force: true, recursive: true })
  await mkdir(baseDir, { recursive: true })

  logger.info(`Building site (version ${version}) ...`)

  const context: BuildContext = createBuildContext(isProduction, safelist)
  await createFile(baseDir, 'index.html', () => page(context), 'utf8')

  if (!isProduction) {
    await createFile(baseDir, 'style.css', () => createStylesheet(context, false), 'utf8')
  }

  if (typeof after === 'function') {
    await after(context)
  }

  logger.info(`Built successfully in ${(Number(process.hrtime.bigint() - start) / 1e6).toFixed(3)} ms!`)
}
