import { BuildContext, createBuildContext, createFile, createStylesheet as createCSS, Mode, rootDir } from 'dante'
import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import pino from 'pino'
import { cssConfig } from '../styling/unocss.config.js'
import { page } from '../templates/index.html.js'

export const safelist = []

export function createStylesheet(context: BuildContext, _page: string, minify: boolean): Promise<string> {
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

export async function build(context: BuildContext): Promise<void> {
  context.logger.info(`Building site (version ${context.version}) ...`)

  // Clean up the directory
  const baseDir = resolve(rootDir, 'dist')
  await rm(baseDir, { force: true, recursive: true })
  await mkdir(baseDir, { recursive: true })

  const context: BuildContext = createBuildContext(isProduction, safelist)
  await createFile(baseDir, 'index.html', () => page(context), 'utf8')

  if (!isProduction) {
    await createFile(baseDir, 'style.css', () => createStylesheet(context, false), 'utf8')
  }
}
