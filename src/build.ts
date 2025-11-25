import { minify, type Output } from '@swc/core'
import { glob } from 'glob'
import { spawn } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type pino from 'pino'
import { finalizePageCSS } from './css.ts'
import {
  baseTemporaryDirectory,
  buildFilePath,
  danteDir,
  resolveSwc,
  rootDir,
  type BuildContext,
  type BuildFunction
} from './models.ts'
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

export async function compileSourceCode(logger?: pino.Logger): Promise<void> {
  logger?.info('Compiling Typescript ...')

  const operationStart = process.hrtime.bigint()

  let success: () => void
  let fail: (reason?: Error) => void

  const promise = new Promise<void>((resolve, reject) => {
    success = resolve
    fail = reject
  })

  const swc = await resolveSwc()
  const compilation = spawn(swc, ['--strip-leading-paths', '-d', baseTemporaryDirectory, 'src'])
  let error = Buffer.alloc(0)

  compilation.stderr.on('data', chunk => {
    error = Buffer.concat([error, chunk])
  })

  compilation.on('close', code => {
    if (code !== 0) {
      const errorString = serializeError(error)
      const errorWithCause = new Error('Code compilation failed')
      errorWithCause.cause = errorString

      if (logger) {
        logger.error(`Code compilation failed after ${elapsed(operationStart)} ms:\n\n  ${errorString}\n`)
        notifyBuildStatus('failed', { message: 'Code compilation failed', error: errorString })
      }
      fail(errorWithCause)
    }

    logger?.info(`TypeScript compilation completed in ${elapsed(operationStart)} ms.`)
    success()
  })

  return promise
}

async function generateHotReloadPage(): Promise<string> {
  const page = await readFile(fileURLToPath(new URL('assets/status-page.html', import.meta.url)), 'utf8')
  const client = await readFile(fileURLToPath(new URL('assets/status-page.js', import.meta.url)), 'utf8')

  const minifiedClient = await minify(client, { compress: true, mangle: false })
  return page.replace('</body>', `<script type="text/javascript">${minifiedClient.code}</script></body>`)
}

export async function builder(context: BuildContext): Promise<void> {
  const operationStart = process.hrtime.bigint()

  try {
    // First of all create the site
    const fullOutput = context.root
    await rm(fullOutput, { force: true, recursive: true })
    await mkdir(fullOutput, { recursive: true })

    // Prepare for HMR
    let hotReloadClient: Output

    if (!context.isProduction) {
      hotReloadClient = await minify(
        await readFile(fileURLToPath(new URL('assets/hot-reload.js', import.meta.url)), 'utf8')
      )
      await writeFile(resolve(rootDir, baseTemporaryDirectory, '__status.html'), await generateHotReloadPage(), 'utf8')
    }

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
        finalized = finalized.replace(
          '</body>',
          `<script type="text/javascript">${hotReloadClient!.code}</script></body>`
        )
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
