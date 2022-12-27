import { watch } from 'chokidar'
import glob from 'glob'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import pino from 'pino'
import { BuildContext, finalizePage } from './css.js'
import { rootDir } from './models.js'

const swc = fileURLToPath(new URL('../node_modules/.bin/swc', import.meta.url))

export function developmentBuilder(logger: pino.Logger): Promise<void> {
  let compiling = false
  let success: () => void
  let fail: (reason?: Error) => void

  const promise = new Promise<void>((resolve, reject) => {
    success = resolve
    fail = reject
  })

  let timeout: NodeJS.Timeout | null

  function scheduleRun(): void {
    if (timeout) {
      clearTimeout(timeout)
    }

    timeout = setTimeout(run, 10)
  }

  function run(): void {
    timeout = null

    if (compiling) {
      return
    }

    compiling = true

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

        logger.error('Code compilation failed:\n\n  ' + errorString + '\n')
        return
      }

      const worker = new Worker(new URL('buildWorker.js', import.meta.url), { workerData: { mode: 'development' } })
      worker.on('error', error => {
        compiling = false
        fail(error)
      })

      worker.on('exit', () => {
        compiling = false
      })
    })
  }

  const watcher = watch([resolve(rootDir, 'src'), resolve(rootDir, 'config')], {
    persistent: true
  })

  process.on('SIGINT', () => watcher.close().then(success))

  watcher.on('add', scheduleRun).on('change', scheduleRun).on('unlink', scheduleRun).on('error', fail!)
  return promise
}

export async function productionBuilder(): Promise<void> {
  // First of all create the site
  await mkdir(resolve(rootDir, 'dist'), { recursive: true })

  const { build, createStylesheet, safelist } = await import(resolve(rootDir, 'tmp/build/index.js'))

  await build('production', async (context: BuildContext) => {
    const stylesheet: string = await createStylesheet(context.cssClasses, true)

    // Now, for each generated page, replace the @import class with the production CSS
    const pages = glob.sync(resolve(rootDir, 'dist', '**/*.html'))
    for (const page of pages) {
      await writeFile(page, await finalizePage(await readFile(page, 'utf8'), stylesheet, safelist), 'utf8')
    }
  })
}
