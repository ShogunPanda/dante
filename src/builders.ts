import { minify } from '@swc/core'
import { watch } from 'chokidar'
import { glob } from 'glob'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker, isMainThread } from 'node:worker_threads'
import type pino from 'pino'
import { finalizePage, type BuildContext } from './css.js'
import { resolveSwc, rootDir } from './models.js'
import { notifyBuildStatus } from './server.js'

export async function compileSourceCode(): Promise<void> {
  let success: () => void
  let fail: (reason?: Error) => void

  const promise = new Promise<void>((resolve, reject) => {
    success = resolve
    fail = reject
  })

  const swc = await resolveSwc()
  const compilation = spawn(swc, ['-d', 'tmp', 'src'])
  let error = Buffer.alloc(0)

  compilation.stderr.on('data', chunk => {
    error = Buffer.concat([error, chunk])
  })

  compilation.on('close', code => {
    if (code !== 0) {
      const errorString = error
        .toString()
        .trim()
        .replaceAll(/(^.)/gm, '$1'.padStart(17, ' '))
        .replaceAll(rootDir, '$ROOT')

      fail(new Error('Code compilation failed:\n\n  ' + errorString + '\n'))
    }

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

export async function developmentBuilder(logger: pino.Logger): Promise<void> {
  let compiling = false
  let success: () => void
  let fail: (reason?: Error) => void
  let timeout: NodeJS.Timeout | null

  const swc = await resolveSwc()
  const promise = new Promise<void>((resolve, reject) => {
    success = resolve
    fail = reject
  })

  function scheduleRun(): void {
    if (timeout) {
      clearTimeout(timeout)
    }

    timeout = setTimeout(run, 10)
  }

  function run(): void {
    notifyBuildStatus('pending')

    timeout = null

    if (compiling) {
      return
    }

    compiling = true
    let failed = false

    const compilation = spawn(swc, ['-d', 'tmp', 'src'])
    let error = Buffer.alloc(0)

    compilation.stderr.on('data', chunk => {
      error = Buffer.concat([error, chunk])
    })

    compilation.on('close', code => {
      if (code !== 0) {
        compiling = false
        const errorString = error
          .toString()
          .trim()
          .replaceAll(/(^.)/gm, '$1'.padStart(17, ' '))
          .replaceAll(rootDir, '$ROOT')
          .trim()

        failed = true
        logger.error('Code compilation failed:\n\n  ' + errorString + '\n')
        notifyBuildStatus('failed', { error: errorString })
        return
      }

      const worker = new Worker(fileURLToPath(import.meta.url))

      worker.on('message', message => {
        if (message === 'started') {
          notifyBuildStatus('pending')
        }
      })

      worker.on('error', error => {
        compiling = false

        const errorStack = (
          error.stack?.toString().trim().replaceAll(/(^.)/gm, '$1'.padStart(17, ' ')).replaceAll(rootDir, '$ROOT') ?? ''
        ).trim()

        const errorString = error.message + errorStack + '\n\n'

        failed = true
        notifyBuildStatus('failed', { error: errorString })
        logger.error('Code compilation failed:\n\n  ' + errorString + '\n')

        worker.terminate().catch(() => {})
      })

      worker.on('exit', () => {
        if (!failed) {
          notifyBuildStatus('success')
        }

        compiling = false
      })
    })
  }

  const watcher = watch([resolve(rootDir, 'src'), resolve(rootDir, 'config')], {
    persistent: true
  })

  process.on('SIGINT', () => {
    watcher.close().then(success).catch(fail)
  })

  watcher.on('add', scheduleRun).on('change', scheduleRun).on('unlink', scheduleRun).on('error', fail!)
  return promise
}

export async function productionBuilder(output: string = 'dist'): Promise<void> {
  if (!existsSync(resolve(rootDir, './tmp')) || isMainThread) {
    await compileSourceCode()
  }

  const client = await minify(
    await readFile(fileURLToPath(new URL('assets/hot-reload-trigger.js', import.meta.url)), 'utf8')
  )

  // First of all create the site
  const fullOutput = resolve(rootDir, output)
  await rm(fullOutput, { force: true, recursive: true })
  await mkdir(fullOutput, { recursive: true })

  if (!isMainThread) {
    await writeFile(resolve(rootDir, 'tmp', '__status.html'), await generateHotReloadPage(), 'utf8')
  }

  const { build, createStylesheet, safelist } = await import(resolve(rootDir, 'tmp/build/index.js'))

  await build(isMainThread ? 'production' : 'development', async (context: BuildContext) => {
    const stylesheet: string = await createStylesheet(context.cssClasses, true)

    // Now, for each generated page, replace the @import class with the production CSS
    const pages = await glob(resolve(fullOutput, '**/*.html'))
    for (const page of pages) {
      let finalized = await finalizePage(await readFile(page, 'utf8'), stylesheet, safelist)

      if (!isMainThread) {
        finalized = finalized.replace('</body>', `<script type="text/javascript">${client.code}</script></body>`)
      }

      await writeFile(page, finalized, 'utf8')
    }
  })
}

if (!isMainThread) {
  await productionBuilder()
}
