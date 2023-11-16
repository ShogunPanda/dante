import { minify, type Output } from '@swc/core'
import { glob } from 'glob'
import { spawn } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type pino from 'pino'
import { finalizePage } from './css.js'
import { baseTemporaryDirectory, danteDir, resolveSwc, rootDir, type BuildContext } from './models.js'
import { notifyBuildStatus } from './server.js'

export function elapsed(start: bigint): string {
  return (Number(process.hrtime.bigint() - start) / 1e6).toFixed(3)
}

export async function compileSourceCode(logger?: pino.Logger): Promise<void> {
  const operationStart = process.hrtime.bigint()

  let success: () => void
  let fail: (reason?: Error) => void

  const promise = new Promise<void>((resolve, reject) => {
    success = resolve
    fail = reject
  })

  const swc = await resolveSwc()
  const compilation = spawn(swc, ['-d', baseTemporaryDirectory, 'src'])
  let error = Buffer.alloc(0)

  compilation.stderr.on('data', chunk => {
    error = Buffer.concat([error, chunk])
  })

  compilation.on('close', code => {
    if (code !== 0) {
      const errorString = error
        .toString()
        .trim()
        .replaceAll(/(^.)/gm, '$1'.padStart(4, ' '))
        .replaceAll(rootDir, '$ROOT')
        .replaceAll(danteDir, '$DANTE')

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
  const page = await readFile(fileURLToPath(new URL('assets/status.html', import.meta.url)), 'utf8')
  const client = await readFile(fileURLToPath(new URL('assets/hot-reload-status.js', import.meta.url)), 'utf8')

  const minifiedClient = await minify(client, { compress: true, mangle: false })
  return page.replace('</body>', `<script type="text/javascript">${minifiedClient.code}</script></body>`)
}

export async function builder(context: BuildContext): Promise<void> {
  const operationStart = process.hrtime.bigint()

  // First of all create the site
  const fullOutput = context.root
  await rm(fullOutput, { force: true, recursive: true })
  await mkdir(fullOutput, { recursive: true })

  // Prepare for HMR
  let hotReloadClient: Output

  if (!context.isProduction) {
    hotReloadClient = await minify(
      await readFile(fileURLToPath(new URL('assets/hot-reload-trigger.js', import.meta.url)), 'utf8')
    )
    await writeFile(resolve(rootDir, baseTemporaryDirectory, '__status.html'), await generateHotReloadPage(), 'utf8')
  }

  const { build, createStylesheet, safelist } = await import(resolve(rootDir, baseTemporaryDirectory, 'build/index.js'))

  await build(context, async (context: BuildContext) => {
    const stylesheet: string = await createStylesheet(context, true)

    // Now, for each generated page, replace the @import class with the production CSS
    const pages = await glob(resolve(fullOutput, '**/*.html'))
    for (const page of pages) {
      let finalized = await finalizePage(context, await readFile(page, 'utf8'), stylesheet, safelist)

      if (!context.isProduction) {
        finalized = finalized.replace(
          '</body>',
          `<script type="text/javascript">${hotReloadClient.code}</script></body>`
        )
      }

      await writeFile(page, finalized, 'utf8')
    }
  })

  context.logger.info(`Building completed in ${elapsed(operationStart)} ms.`)
  notifyBuildStatus('success')
}
