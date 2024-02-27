import { createFile, rootDir, type BuildContext, type BuildResult } from 'dante'
import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { page } from '../templates/index.html.js'

export async function build(context: BuildContext): Promise<BuildResult> {
  context.logger.info(`Building site (version ${context.version}) ...`)

  // Clean up the directory
  const baseDir = resolve(rootDir, 'dist')
  await rm(baseDir, { force: true, recursive: true })
  await mkdir(baseDir, { recursive: true })

  await createFile(baseDir, 'index.html', () => page(context), 'utf8')

  return { css: '' }
}
