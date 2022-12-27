#!/usr/bin/env node

import { Command, program } from 'commander'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pino from 'pino'
import { rootDir, swc } from './models.js'

function compileSourceCode(): Promise<void> {
  let success: () => void
  let fail: (reason?: Error) => void

  const promise = new Promise<void>((resolve, reject) => {
    success = resolve
    fail = reject
  })

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

const logger = pino({ transport: { target: 'pino-pretty' } })
const packageInfo = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))

let siteSetupCLI: ((program: Command, logger: pino.BaseLogger) => void) | null = null

if (existsSync(resolve(rootDir, './src/build/cli.ts'))) {
  await compileSourceCode()
  const imported = await import(resolve(rootDir, './tmp/build/cli.js'))
  siteSetupCLI = imported.setupCLI ?? null
}

program
  .name('dante')
  .version(packageInfo.version, '-V, --version', 'Show version number')
  .helpOption('-h, --help', 'Show this help')
  .addHelpCommand(false)
  .showSuggestionAfterError(true)
  .allowUnknownOption(false)
  .action(() => {
    program.help()
  })

program
  .command('development')
  .description('Starts the development builder')
  .option('-i, --ip <ip>', 'The IP to listen on', '0.0.0.0')
  .option('-p, --port <port>', 'The port to listen on', v => Number.parseInt(v, 10), 4200)
  .alias('dev')
  .alias('d')
  .action(async function devAction(this: Command): Promise<void> {
    try {
      const { localServer } = await import('./server.js')
      const { developmentBuilder } = await import('./builders.js')

      // Prepare the target directory
      await rm(resolve(rootDir, 'dist'), { force: true, recursive: true })
      await mkdir(resolve(rootDir, 'dist'), { recursive: true })

      const { ip, port } = this.optsWithGlobals()

      await Promise.all([developmentBuilder(logger), localServer(ip, port, logger)])
    } catch (error) {
      logger.error(error)
      process.exit(1)
    }
  })

program
  .command('build')
  .description('Builds the site')
  .alias('b')
  .action(async function buildAction(this: Command): Promise<void> {
    try {
      const { productionBuilder } = await import('./builders.js')

      await productionBuilder()
    } catch (error) {
      logger.error(error)
      process.exit(1)
    }
  })

program
  .command('server')
  .description('Serves the site locally')
  .option('-i, --ip <ip>', 'The IP to listen on', '0.0.0.0')
  .option('-p, --port <port>', 'The port to listen on', v => Number.parseInt(v, 10), 4200)
  .alias('serve')
  .alias('s')
  .action(async function serveAction(this: Command): Promise<void> {
    try {
      const { localServer } = await import('./server.js')

      const { ip, port } = this.optsWithGlobals()
      await localServer(ip, port)
    } catch (error) {
      logger.error(error)
      process.exit(1)
    }
  })

if (siteSetupCLI) {
  siteSetupCLI(program, logger)
}

program.parse()
