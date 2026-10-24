# @perseveranza-pets/dante

[![Version](https://img.shields.io/npm/v/@perseveranza-pets/dante.svg)](https://npm.im/@perseveranza-pets/dante)
[![Dependencies](https://img.shields.io/librariesio/release/npm/@perseveranza-pets/dante)](https://libraries.io/npm/@perseveranza-pets/dante)

Opinionated static site generator. Write an asynchronous build function, generate HTML with your preferred renderer, and let Dante handle CSS finalization, development watching, and local serving.

https://sw.cowtech.it/dante

## Requirements

- Node.js >= 24.22.0.
- ESM (`"type": "module"` in your site's `package.json`).
- TypeScript is supported at runtime; the CLI preloads a TSX transformer. Type checking is a separate step.

## Getting started with an agent

Print the complete, self-contained Dante skill:

```bash
npx @perseveranza-pets/dante skills
```

The command writes [SKILL.md](./SKILL.md) to stdout; it does not install a skill or create a site. It also works outside a Dante project and bypasses the site's CLI customization hook.

Alternatively, install the skill with the [skills.sh](https://skills.sh) CLI:

```bash
npx skills add ShogunPanda/dante --skill dante
```

Ask your agent to use the skill to scaffold or maintain your site. `create-dante-site` and the bundled scaffolding templates have been removed; their conventions are documented in the skill, including complete React/TypeScript examples and tooling configuration.

## Minimal site

Install Dante in an ESM project:

```bash
npm install --save-dev @perseveranza-pets/dante
```

Create `src/build/index.ts`:

```ts
import { createFile, type BuildContext, type BuildResult } from '@perseveranza-pets/dante'

export async function build(context: BuildContext): Promise<BuildResult> {
  await createFile(
    context.root,
    'index.html',
    '<!doctype html><html lang="en"><head><title>Hello</title></head><body><h1>Hello from Dante</h1></body></html>',
    'utf8'
  )

  return { css: 'body { font-family: system-ui; }' }
}
```

Run `npx dante dev`, then open http://localhost:4200. Run `npx dante build` to export to `dist`, and `npx dante serve` to preview the export.

## Project layout

```text
src/
  build/
    index.ts          # Required: exports build(context)
    cli.ts            # Optional: exports setupCLI(program, logger)
    server.ts         # Optional: exports setupServer(server, isProduction)
  templates/          # Your page components/renderers
  styling/            # Your CSS
dist/                 # Generated output
```

These are site directories, not templates distributed by Dante. Build, server, and CLI entry points also support `.js`, with `.ts` preferred. Paths can be overridden through environment variables.

## CLI

| Command               | Aliases      | Purpose                                        |
| --------------------- | ------------ | ---------------------------------------------- |
| `dante skills`        |              | Print the complete agent skill                 |
| `dante development`   | `dev`, `d`   | Build, watch `src`, and serve with live reload |
| `dante build`         | `b`          | Generate production output                     |
| `dante server`        | `serve`, `s` | Serve existing output without building         |
| `dante font <url...>` | `f`          | Print font metadata as YAML and CSS            |

Build, development, and server accept `-d, --directory <dir>` (default `dist`). Development and server accept `-i, --ip <ip>` (default `0.0.0.0`) and `-p, --port <port>` (default `4200`). Use `-h, --help` or `-V, --version` for CLI information.

```bash
npx dante build --directory public
npx dante dev --port 8080
npx dante font 'Roboto:wght@400;700' --ranges latin
```

Development uses Node's process watcher, rebuilds on changes, and injects a live-reload client. A status page displays pending or failed builds. `DANTE_WATCH_ADDITIONAL_PATHS` adds watch locations.

## Build API

Export `build(context)` from `src/build/index.ts`. It must return a `BuildResult` object, even if empty. Dante removes and recreates the output directory before calling it. Always write to `context.root` so `--directory` works; create nested directories yourself.

### BuildContext

| Property       | Meaning                                            |
| -------------- | -------------------------------------------------- |
| `version`      | Timestamp-based version, or `DANTE_BUILD_VERSION`  |
| `logger`       | Pino logger                                        |
| `isProduction` | `true` for `build`, `false` for development        |
| `root`         | Absolute output directory                          |
| `currentPage`  | Current HTML file path during CSS finalization     |
| `extensions`   | Mutable object for application-specific build data |

`rootDir` is the working directory; `danteDir` is the installed package directory. `createBuildContext(logger, isProduction, root)` and `builder(context)` expose the build pipeline programmatically.

### Files and assets

`createFile(baseDir, relativePath, contents, encoding?)` accepts a string, Buffer, promise, or synchronous/asynchronous function returning contents. It writes the file and returns its root-relative URL. A `$hash` placeholder in the filename is replaced with a ten-character MD5 content hash:

```ts
const scriptUrl = await createFile(context.root, 'app.$hash.js', 'console.log("hello")', 'utf8')
```

The helper does not create parent directories or bundle browser code. `hash(contents)` exposes the same hash algorithm. Copy static assets explicitly in your build.

### CSS

`BuildResult` supports optional `css` (string) and `cssVisitor` (Lightning CSS visitor). Either may be a callback receiving `BuildContext`, optionally asynchronous. Dante evaluates them for each generated HTML file, setting `currentPage`, then injects a `<style>` before `</head>`. CSS is minified in production. No special style placeholder is needed.

Read CSS files yourself in the build function. `finalizePageCSS(context, html, css, visitor?)` exposes finalization directly; `cleanCssClasses(...classes)` joins and deduplicates class tokens, and `tokenizeCssClasses(classes)` returns tokens.

### Rendering

Dante accepts any renderer producing HTML. The skill contains a React SSR example. The TSX loader defaults to Preact: React TSX files must declare `/** @jsxImportSource react */` to use React's JSX runtime. Install the renderer and its runtime in the site. Dante does not automatically hydrate pages or bundle client-side JavaScript.

## Custom server

Create `src/build/server.ts` and export `setupServer(server, isProduction)`. The first argument is a Fastify instance; the second is a boolean, not a build context. The hook may be asynchronous and may return `{ directory: 'html' }` to serve a subdirectory of the chosen output directory.

```ts
import type { ServerFunction } from '@perseveranza-pets/dante'

export const setupServer: ServerFunction = async (server, isProduction) => {
  server.get('/health', async () => ({ ok: true, production: isProduction }))
}
```

Dante registers static serving after the hook and decorates `server.rootDir` with its resolved serving directory. Generate `404.html` for the not-found handler. If an `ssl` directory exists in the project root, the server uses HTTPS and reads `privkey.pem`, `cert.pem`, and `chain.pem` from it.

`localServer(options)` is also exported. Its programmatic defaults differ from the CLI: IP `::`, port `0`, static directory `dist/html`, and production mode. Options include `ip`, `port`, `staticDir`, `isProduction`, and `logger` (a Pino logger or `false`).

## Custom CLI

Create `src/build/cli.ts`:

```ts
import type { Command } from 'commander'
import type { Logger } from 'pino'

export async function setupCLI(program: Command, logger: Logger): Promise<void> {
  program.command('hello').action(() => logger.info('Hello!'))
}
```

The hook is awaited before parsing arguments. Install `commander` and `pino` as direct dependencies when importing them in your project. Plain `dante skills` bypasses this hook.

### Detecting the development process

```ts
import { developmentServerActive } from '@perseveranza-pets/dante'
```

This exported boolean is available during module imports and `setupCLI`. It is `false` during the initial CLI bootstrap and for commands other than development. After Commander identifies `development` (including `dev`/`d`), Dante replaces the process with Node's watcher; the watched CLI starts with `developmentServerActive === true`, including on subsequent watch restarts.

Consequently, development loads CLI modules and calls `setupCLI` once with `false`, then again with `true` in a fresh runtime. Always register commands/options in both phases. Application `preAction` hooks also run in both phases: the development action activates watch only after those hooks finish. Gate development-only initialization or effects that should skip bootstrap on `developmentServerActive`. The actual development server and build start only in the watched runtime. Other commands execute their hooks/actions once with `false`.

`true` identifies the development execution phase, not server readiness: the server may not be listening yet. `false` does not imply production, since it also describes the initial development bootstrap. The environment markers backing this state are internal; use the exported boolean rather than setting them yourself.

## Fonts and syntax highlighting

- `downloadFonts(logger, urls, ranges)` reads font stylesheet metadata and prints YAML/CSS. A value without an `https://` prefix is treated as a Google Fonts family query. It does not download font binaries.
- `loadFontsFile(path)` loads saved YAML; `fontsToCss(fonts)` produces `@font-face` rules referencing the recorded remote URLs.
- `renderCode(code, language, numbers, highlight, classes, theme?)` renders syntax-highlighted HTML with Shiki. The default preloaded theme is `one-dark-pro`; languages load on demand, including custom `output` and `none` grammars. Add other themes to `preloadedThemes` before the first call.
- The class map supports `root`, `line`, `lineHighlighted`, `lineNotHighlighted`, `lineNumber`, `italic`, `bold`, and `underline`. Supply CSS for those classes and the `--dante-fg`/`--dante-bg` properties.
- `parseRanges('1,3-5')` parses line ranges; `sanitizeTabularOutputSnippet(code)` normalizes terminal box-drawing characters.

## Environment variables

| Variable                        | Purpose                                                                     |
| ------------------------------- | --------------------------------------------------------------------------- |
| `DANTE_BUILD_VERSION`           | Override the generated version for reproducible builds                      |
| `DANTE_BUILD_FILE_PATH`         | Build entry point, relative to the working directory or absolute            |
| `DANTE_SERVER_FILE_PATH`        | Server customization entry point                                            |
| `DANTE_CLI_PATH`                | CLI customization entry point                                               |
| `DANTE_WATCH_MODULES`           | When nonempty, watch `node_modules/@perseveranza-pets/dante` in development |
| `DANTE_WATCH_ADDITIONAL_PATHS`  | Comma-separated additional development watch paths                          |
| `DANTE_NODE_ADDITIONAL_OPTIONS` | Legacy extra Node flags; prefer `NODE_OPTIONS` or the launcher API          |
| `DANTE_PROGRAM_NAME`            | Override the CLI name                                                       |
| `DANTE_PROGRAM_DESCRIPTION`     | Override the CLI description                                                |

## Embedding the launcher

Packages extending Dante can use a Node entry point instead of a shell wrapper:

```js
#!/usr/bin/env node
import { launch } from '@perseveranza-pets/dante/launcher'

await launch({
  args: process.argv.slice(2),
  cli: new URL('./cli.js', import.meta.url),
  build: new URL('./build.js', import.meta.url),
  server: new URL('./server.js', import.meta.url),
  nodeArgs: ['--max-old-space-size=4096'],
  watchPaths: [new URL('../src', import.meta.url)]
})
```

The example assumes an entry point beside the compiled hooks. All options are optional; `launch()` runs the standard Dante CLI. `cli`, `build`, and `server` select hook modules, not executable entry points. String paths resolve against `cwd` (default: the current directory); file URLs are also accepted. `args` defaults to `process.argv.slice(2)`. `env` merges overrides into the inherited environment; `undefined` removes a variable. Explicit hook options override the matching `DANTE_*` variables in the replacement process; otherwise existing environment-based wrappers keep working.

The launcher changes to `cwd` and uses `process.execve` to replace itself with `process.execPath`, passing argument arrays without a shell. PID and standard file descriptors are preserved, so signals and exit codes belong directly to the replacement process. It first preloads TSX without adding watch flags. After all CLI extensions have registered, Commander parses arguments and runs application `preAction` hooks; the development action then triggers a second `execve` with the configured watch paths. This handles extension options before the command (for example `--only talk dev`) without guessing which arguments are option values. Help, version, and parse errors do not activate watch. It is a process entry-point API: await it once from your executable. Successful replacement never returns and does not run JavaScript cleanup or exit handlers; preparation errors reject the promise.

Use `nodeArgs` for programmatic Node flags and standard `NODE_OPTIONS` from the shell. Caller `process.execArgv` is not automatically copied to the replacement process. `DANTE_NODE_ADDITIONAL_OPTIONS` remains supported but is deprecated: whitespace separates arguments; single/double quotes group them; backslash escapes the next character outside single quotes. Unclosed quotes or trailing escapes are errors. No globbing, variable expansion, or command substitution is performed. Legacy arguments precede explicit `nodeArgs`.

`watchPaths` supplements the default `src` watch and the legacy watch environment variables. Array entries retain spaces and commas; the legacy `DANTE_WATCH_ADDITIONAL_PATHS` remains comma-separated. An external shell wrapper must still forward its own arguments correctly (`"$@"`) before Dante receives them.

## Verification and contributing

For sites, run your formatter, lint checks, type check, and production build. Inspect generated HTML and assets and preview them with `dante serve`. The builder currently logs build failures without rethrowing them, so a zero exit status alone does not prove a successful export.

For Dante itself, install dependencies with `pnpm install` and run `pnpm run ci`. The build compiles `src`, copies runtime assets, and runs ESLint. `npm test` is currently a placeholder. The Node entry point delegates to `dist/launcher.js` for TSX preload and defers the watch restart to the development action. Ship `SKILL.md` with the npm package and keep it synchronized with this README and the APIs.

## Copyright

Copyright (C) 2022 and above Shogun (shogun@cowtech.it).

Licensed under the ISC license: https://choosealicense.com/licenses/isc.
