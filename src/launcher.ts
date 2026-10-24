import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface LaunchOptions {
  args?: string[]
  nodeArgs?: string[]
  watchPaths?: (string | URL)[]
  cli?: string | URL
  build?: string | URL
  server?: string | URL
  cwd?: string
  env?: NodeJS.ProcessEnv
}

function resolvePath(value: string | URL, cwd: string): string {
  return value instanceof URL ? fileURLToPath(value) : resolve(cwd, value)
}

// Compatibility syntax: whitespace, single/double quotes, and backslash escapes.
// This deliberately performs no shell expansion or command substitution.
function parseLegacyNodeOptions(value: string): string[] {
  const args: string[] = []
  let token = ''
  let quote = ''
  let escaped = false
  let started = false

  for (const char of value) {
    if (escaped) {
      token += char
      escaped = false
    } else if (char === '\\' && quote !== "'") {
      escaped = true
      started = true
    } else if (quote) {
      if (char === quote) {
        quote = ''
      } else {
        token += char
      }
    } else if (char === '"' || char === "'") {
      quote = char
      started = true
    } else if (/\s/.test(char)) {
      if (started) {
        args.push(token)
        token = ''
        started = false
      }
    } else {
      token += char
      started = true
    }
  }

  if (quote || escaped) {
    throw new Error('Invalid DANTE_NODE_ADDITIONAL_OPTIONS: unterminated quote or escape')
  }

  if (started) {
    args.push(token)
  }

  return args
}

// Start Dante with Node flags configured before loading application hooks.
export function launch(options: LaunchOptions = {}): Promise<void> {
  return Promise.resolve().then(() => {
    if (!process.execve) {
      throw new Error('The Dante launcher requires process.execve support')
    }

    const args = options.args ?? process.argv.slice(2)
    const cwd = resolve(options.cwd ?? process.cwd())
    const env = { ...process.env, ...options.env }

    for (const [key, value] of [
      ['DANTE_CLI_PATH', options.cli],
      ['DANTE_BUILD_FILE_PATH', options.build],
      ['DANTE_SERVER_FILE_PATH', options.server]
    ] as const) {
      if (value !== undefined) {
        env[key] = resolvePath(value, cwd)
      }
    }

    const nodeArgs = [
      ...parseLegacyNodeOptions(env.DANTE_NODE_ADDITIONAL_OPTIONS ?? ''),
      ...(options.nodeArgs ?? []),
      '--import',
      new URL('./tsx-transformer.js', import.meta.url).href
    ]

    const watchPaths: (string | URL)[] = ['src', ...(options.watchPaths ?? [])]

    if (env.DANTE_WATCH_MODULES) {
      watchPaths.push('node_modules/@perseveranza-pets/dante')
    }

    watchPaths.push(
      ...(env.DANTE_WATCH_ADDITIONAL_PATHS ?? '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
    )

    // Commander decides whether to enable watch after application options are registered.
    env.DANTE_INTERNAL_WATCH_PATHS = JSON.stringify(watchPaths.map(path => resolvePath(path, cwd)))
    delete env.DANTE_INTERNAL_DEVELOPMENT

    const executionEnv: Record<string, string> = {}
    for (const [key, value] of Object.entries(env)) {
      if (value !== undefined) {
        executionEnv[key] = value
      }
    }

    process.chdir(cwd)
    process.execve(
      process.execPath,
      [process.execPath, ...nodeArgs, fileURLToPath(new URL('./cli.js', import.meta.url)), ...args],
      executionEnv
    )
  })
}

/** Restart from the development action after application preAction hooks have run. */
export function activateDevelopmentServer(): void {
  if (!process.execve) {
    throw new Error('The Dante launcher requires process.execve support')
  }

  const watchPaths: string[] = process.env.DANTE_INTERNAL_WATCH_PATHS
    ? JSON.parse(process.env.DANTE_INTERNAL_WATCH_PATHS)
    : [resolve('src')]
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value
    }
  }
  env.DANTE_INTERNAL_DEVELOPMENT = '1'

  process.execve(
    process.execPath,
    [
      process.execPath,
      ...process.execArgv,
      ...watchPaths.flatMap(path => ['--watch-path', path]),
      '--watch-preserve-output',
      ...process.argv.slice(1)
    ],
    env
  )
}
