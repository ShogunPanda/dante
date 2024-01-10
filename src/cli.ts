import { program, type Command } from 'commander'
import { existsSync, readFileSync } from 'node:fs'
import { type AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pino from 'pino'
import { builder, compileSourceCode } from './build.js'
import { downloadFonts } from './fonts.js'
import { baseTemporaryDirectory, createBuildContext, programDescription, programName, rootDir } from './models.js'
import { localServer } from './server.js'
import { initializeSyntaxHighlighting } from './syntax-highlighting.js'

const logger = pino({ transport: { target: 'pino-pretty' } })
const packageInfo = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))

let siteSetupCLI: ((program: Command, logger: pino.BaseLogger) => void) | null = null

if (process.env.DANTE_CLI_PATH) {
  const imported = await import(resolve(rootDir, process.env.DANTE_CLI_PATH))
  siteSetupCLI = imported.setupCLI ?? null
} else if (existsSync(resolve(rootDir, './src/build/cli.ts'))) {
  await compileSourceCode()
  const imported = await import(resolve(rootDir, baseTemporaryDirectory, 'build/cli.js'))
  siteSetupCLI = imported.setupCLI ?? null
} else if (existsSync(resolve(rootDir, './src/build/cli.js'))) {
  const imported = await import(resolve(rootDir, './src/build/cli.js'))
  siteSetupCLI = imported.setupCLI ?? null
}

program
  .name(programName)
  .description(programDescription)
  .version(packageInfo.version as string, '-V, --version', 'Show version number')
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
  .option('-d, --directory <dir>', 'The directory where to build and serve files from', 'dist')
  .option('-i, --ip <ip>', 'The IP to listen on', '0.0.0.0')
  .option('-p, --port <port>', 'The port to listen on', (v: string) => Number.parseInt(v, 10), 4200)
  .alias('dev')
  .alias('d')
  .action(async function devAction(this: Command): Promise<void> {
    try {
      const { ip, port, directory: staticDir } = this.optsWithGlobals()
      const absoluteStaticDir = resolve(rootDir, staticDir as string)
      const buildContext = createBuildContext(logger, false, absoluteStaticDir)

      await compileSourceCode(logger)
      await initializeSyntaxHighlighting(logger)
      const server = await localServer({ ip, port, logger: false, isProduction: false, staticDir: absoluteStaticDir })
      const protocol = existsSync(resolve(rootDir, 'ssl')) ? 'https' : 'http'
      const address = server.server.address()! as AddressInfo

      logger.info(`Server listening at ${protocol}://${address.address}:${address.port}.`)
      await builder(buildContext)
    } catch (error) {
      logger.error(error)
      process.exit(1)
    }
  })

program
  .command('build')
  .description('Builds the site')
  .option('-d, --directory <dir>', 'The directory where to build files to', 'dist')
  .alias('b')
  .action(async function buildAction(this: Command): Promise<void> {
    try {
      const { directory: staticDir } = this.optsWithGlobals()
      const absoluteStaticDir = resolve(rootDir, staticDir as string)
      const buildContext = createBuildContext(logger, true, absoluteStaticDir)

      await compileSourceCode(logger)
      await initializeSyntaxHighlighting(logger)
      await builder(buildContext)
    } catch (error) {
      logger.error(error)
      process.exit(1)
    }
  })

program
  .command('server')
  .description('Serves the site locally')
  .option('-d, --directory <dir>', 'The directory to server files from', 'dist')
  .option('-i, --ip <ip>', 'The IP to listen on', '0.0.0.0')
  .option('-p, --port <port>', 'The port to listen on', (v: string) => Number.parseInt(v, 10), 4200)
  .alias('serve')
  .alias('s')
  .action(async function serveAction(this: Command): Promise<void> {
    try {
      const { ip, port, directory: staticDir } = this.optsWithGlobals()

      await localServer({
        ip,
        port,
        logger,
        isProduction: true,
        staticDir: resolve(rootDir, staticDir as string)
      })
    } catch (error) {
      logger.error(error)
      process.exit(1)
    }
  })

program
  .command('font <url...>')
  .alias('f')
  .option('-r, --ranges <ranges>', 'Comma separated list of ranges to include', '')
  .action(async function fontAction(this: Command, urls: string[]): Promise<void> {
    try {
      const { ranges } = this.optsWithGlobals()
      await downloadFonts(
        logger,
        urls,
        ((ranges as string) ?? '')
          .split(/\s*,\s*/)
          .map(r => r.trim())
          .filter(Boolean)
      )
    } catch (error) {
      logger.error(error)
      process.exit(1)
    }
  })

if (siteSetupCLI) {
  siteSetupCLI(program, logger)
}

program.parse()
