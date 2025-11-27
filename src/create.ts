#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { program, type Command } from 'commander'
import { pino, type Logger } from 'pino'
import { rootDir } from './models.ts'

const logger = pino({ transport: { target: 'pino-pretty' } })

let createSetupCLI: ((program: Command, logger: Logger) => void) | null = null

if (process.env.DANTE_CREATE_PATH) {
  const imported = await import(resolve(rootDir, process.env.DANTE_CREATE_PATH))
  createSetupCLI = imported.createSetupCLI ?? null
} else if (existsSync(resolve(rootDir, './src/build/create.ts'))) {
  const imported = await import(resolve(rootDir, './src/build/create.ts'))
  createSetupCLI = imported.createSetupCLI ?? null
} else if (existsSync(resolve(rootDir, './src/build/create.js'))) {
  const imported = await import(resolve(rootDir, './src/build/create.js'))
  createSetupCLI = imported.createSetupCLI ?? null
}

const packageInfo = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))

const templates = {
  'src/build/cli.ts': 'cli.ts',
  'src/build/index.ts': 'index.ts',
  'src/templates/index.html.tsx': 'index.tsx',
  'eslint.config.js': 'eslint.config.js',
  '.stylelintrc.json': 'stylelintrc.json',
  'package.json': 'package.json',
  'prettier.config.js': 'prettier.config.js',
  'tsconfig.json': 'tsconfig.json'
}

function compile(template: string, variables: Record<string, string>): string {
  return template.replaceAll(/(@([A-Z]+)@)/g, (_, all: string, name: string) => {
    return variables[name] ?? all
  })
}

export async function initializeSite(logger: Logger, name: string, directory: string): Promise<void> {
  const packageJson = JSON.parse(await readFile(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
  const fullOutput = resolve(rootDir, directory)

  // Check if the output directory is not empty
  try {
    const files = await readdir(fullOutput)

    if (files.filter(f => !f.startsWith('.'))) {
      logger.error(`Directory ${relative(rootDir, directory)} is not empty. Aborting.`)
      process.exit(1)
    }
  } catch (error) {
    if (error.code === 'ENOTDIR') {
      logger.error(`Path ${relative(rootDir, directory)} already exists and it is not a directory. Aborting.`)
      process.exit(1)
    } else if (error.code !== 'ENOENT') {
      throw error
    }
  }

  logger.info(`Preparing site into directory ${fullOutput} ...`)

  // Create the main directory
  await mkdir(fullOutput, { recursive: true })
  await mkdir(resolve(fullOutput, 'src/build'), { recursive: true })
  await mkdir(resolve(fullOutput, 'src/styling'), { recursive: true })
  await mkdir(resolve(fullOutput, 'src/templates'), { recursive: true })

  const variables = {
    NAME: name,
    VERSION: packageJson.version
  }

  // Create all files
  for (const [file, templateFile] of Object.entries(templates)) {
    const destination = compile(resolve(fullOutput, file), variables)

    logger.info(`Creating file ${relative(fullOutput, destination)} ...`)
    const template = await readFile(
      fileURLToPath(new URL(`../dist/templates/${templateFile}.tpl`, import.meta.url)),
      'utf8'
    )
    await writeFile(destination, compile(template, variables), 'utf8')
  }
}

program
  .name('create-dante-site')
  .arguments('<name>   [directory]')
  .description('Initializes a dante site.')
  .version(packageInfo.version as string, '-V, --version', 'Show version number')
  .helpOption('-h, --help', 'Show this help')
  .addHelpCommand(false)
  .showSuggestionAfterError(true)
  .allowUnknownOption(false)
  .action(async (name: string, directory: string) => {
    try {
      await initializeSite(logger, name, directory ?? name)
    } catch (error) {
      console.error(error)
    }
  })

if (createSetupCLI) {
  createSetupCLI(program, logger)
}

program.parse()
