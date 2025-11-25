import { glob } from 'glob'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { transform } from 'oxc-transform'
import { finalizePageCSS } from './css.ts'
import { buildFilePath, danteDir, rootDir, type BuildContext, type BuildFunction } from './models.ts'
import { notifyBuildStatus } from './server.ts'

export function elapsed(start: bigint): string {
  return (Number(process.hrtime.bigint() - start) / 1e6).toFixed(3)
}

function serializeError(error: Buffer | Error): string {
  const description = Buffer.isBuffer(error) ? error.toString() : error.stack!

  return description
    .toString()
    .trim()
    .replaceAll(/(^.)/gm, '$1'.padStart(4, ' '))
    .replaceAll(rootDir, '$ROOT')
    .replaceAll(danteDir, '$DANTE')
}

export async function transpileTSX(url: URL): Promise<string> {
  const result = await transform(url.toString(), await readFile(url, 'utf-8'), {
    jsx: {
      importSource: 'preact'
    }
  })

  return result.code
}

export async function builder(context: BuildContext): Promise<void> {
  const operationStart = process.hrtime.bigint()

  try {
    // First of all create the site
    const fullOutput = context.root
    await rm(fullOutput, { force: true, recursive: true })
    await mkdir(fullOutput, { recursive: true })

    // Perform the build
    const { build }: { build: BuildFunction } = await import(buildFilePath())
    const { css, postcssPlugins } = await build(context)

    // Now, for each generated page, replace the @import class with the production CSS
    const pages = await glob(resolve(fullOutput, '**/*.html'))

    for (const page of pages) {
      context.currentPage = page

      const finalCss = css ? (typeof css === 'function' ? await css(context) : css) : ''
      const finalPostcssPlugins = postcssPlugins
        ? typeof postcssPlugins === 'function'
          ? await postcssPlugins(context)
          : postcssPlugins
        : []

      let finalized = await finalizePageCSS(context, await readFile(page, 'utf8'), finalCss, finalPostcssPlugins)

      if (!context.isProduction) {
        const hotReloadClient = await readFile(new URL('assets/hot-reload.js', import.meta.url), 'utf8')
        finalized = finalized.replace('</body>', `<script type="text/javascript">${hotReloadClient}</script></body>`)
      }

      await writeFile(page, finalized, 'utf8')
    }

    context.logger.info(`Building completed in ${elapsed(operationStart)} ms.`)
    notifyBuildStatus('success')
  } catch (error) {
    const errorString = serializeError(error as Error)
    context.logger.error(`Building failed after ${elapsed(operationStart)} ms:\n\n  ${errorString}\n`)
    notifyBuildStatus('failed', { message: 'Building failed', error: errorString })
  }
}
