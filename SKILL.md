---
name: dante
description: Create, maintain, and troubleshoot static sites using @perseveranza-pets/dante. Use for Dante project scaffolding, TypeScript/React static rendering, build functions, CSS and assets, development servers, CLI extensions, and changes to Dante itself.
---

# Dante

Dante is an ESM static site generator driven by a user-supplied build function. This skill is self-contained and is also printed by `npx @perseveranza-pets/dante skills`. It does not install dependencies or generate files by itself.

## Workflow

1. Inspect the existing package manifest, source layout, scripts, and custom build/server/CLI hooks. Adapt existing projects to their conventions.
2. For a new site, use the scaffolding below: ESM, TypeScript, React static rendering, Cowtech tooling, `src/build`, `src/templates`, and `src/styling`.
3. Install direct dependencies for everything the site imports or executes. Resolve compatible versions from the registry and the installed Dante release instead of copying old version pins.
4. Generate pages and assets in `context.root`; return CSS and optional visitors from `build`. Keep renderer code separate from build orchestration.
5. Run formatting, linting, type checking, and a production build. Inspect generated files and serve them to verify behavior. Check the build log, not just its exit code: Dante currently catches and logs build errors without rethrowing.

## New-site scaffolding

Require Node >= 24.22.0 and `"type": "module"`. Set the site's name and metadata appropriately; default to a private package at version `0.1.0`. The package is `@perseveranza-pets/dante`, not the unscoped `dante` package. Its executable is named `dante`.

Install runtime dependencies:

```bash
npm install react react-dom
npm install --save-dev @perseveranza-pets/dante typescript @types/node @types/react @types/react-dom @cowtech/typescript-config @cowtech/eslint-config @cowtech/stylelint-config eslint stylelint prettier concurrently
```

Add `commander` and `pino` as direct dev dependencies if adding the CLI hook below. Install any required peer dependencies of the chosen tooling versions. Use the project's existing package manager and lockfile when present.

Create this layout:

```text
src/
  build/
    index.ts
    cli.ts              # Optional custom commands
    server.ts           # Optional Fastify customization
  templates/
    index.html.tsx
  styling/
    main.css
eslint.config.js
.stylelintrc.json
prettier.config.js
tsconfig.json
package.json
```

Recommended package scripts:

```json
{
  "dev": "dante development",
  "build": "dante build",
  "postbuild": "concurrently npm:lint npm:lint:css npm:typecheck",
  "serve": "dante server",
  "format": "prettier -w src",
  "lint": "eslint --cache",
  "lint:css": "stylelint --cache 'src/**/*.css'",
  "typecheck": "tsc -p . --noEmit"
}
```

Ignore `node_modules`, `dist`, `.eslintcache`, and `.stylelintcache` in Git.

### Build entry point: `src/build/index.ts`

```ts
import { readFile } from 'node:fs/promises'
import { createFile, type BuildContext, type BuildResult } from '@perseveranza-pets/dante'
import { page } from '../templates/index.html.tsx'

export async function build(context: BuildContext): Promise<BuildResult> {
  context.logger.info(`Building site (version ${context.version}) ...`)

  await createFile(context.root, 'index.html', () => page(context), 'utf8')
  await createFile(
    context.root,
    '404.html',
    '<!doctype html><html lang="en"><head><title>Not found</title></head><body><h1>Not found</h1></body></html>',
    'utf8'
  )

  return { css: await readFile(new URL('../styling/main.css', import.meta.url), 'utf8') }
}
```

Dante already removes and recreates the output directory. Do not repeat cleanup in the site's build function or hardcode `dist`: use `context.root` to respect `--directory`. Explicitly create parent directories for nested pages/assets before writing them.

### React page: `src/templates/index.html.tsx`

```tsx
/** @jsxImportSource react */
import type { BuildContext } from '@perseveranza-pets/dante'
import { renderToStaticMarkup } from 'react-dom/server'

export function page(context: BuildContext): string {
  return (
    '<!doctype html>' +
    renderToStaticMarkup(
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Hello from Dante</title>
        </head>
        <body>
          <h1>Hello from Dante</h1>
          <footer>Build {context.version}</footer>
        </body>
      </html>
    )
  )
}
```

The runtime TSX transformer defaults to Preact. Include `/** @jsxImportSource react */` in React TSX files; TypeScript's `jsx` configuration alone does not configure the runtime transformer. Use explicit `.tsx` imports. If a project chooses Preact or another renderer, use its matching runtime and server renderer consistently. Dante does not bundle browser JavaScript or automatically hydrate static HTML.

There is no `prepareStyles` API or required style placeholder: return CSS from `build` and Dante injects it before each page's `</head>`.

### Styles: `src/styling/main.css`

```css
body {
  margin: 2rem;
  font-family: system-ui, sans-serif;
}
```

### Tooling

`eslint.config.js`:

```js
import { cowtech } from '@cowtech/eslint-config'

export default [...cowtech, { languageOptions: { parserOptions: { projectService: true } } }]
```

`.stylelintrc.json`:

```json
{ "extends": ["@cowtech/stylelint-config"] }
```

`prettier.config.js`:

```js
export default {
  printWidth: 120,
  semi: false,
  singleQuote: true,
  bracketSpacing: true,
  trailingComma: 'none',
  arrowParens: 'avoid'
}
```

`tsconfig.json`:

```json
{
  "extends": "@cowtech/typescript-config",
  "compilerOptions": {
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    "outDir": "dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", "dist"]
}
```

Run `npm run format`, `npm run typecheck`, and `npm run build` (which also runs the lint checks through `postbuild`). Then `npm run dev` or `npm run serve`.

## CLI reference

- `dante skills`: print this entire file to stdout, without loading the site's CLI hook.
- `dante development` / `dev` / `d`: build, serve, and watch `src`; live-reload and build-status UI are injected during development.
- `dante build` / `b`: produce a production export.
- `dante server` / `serve` / `s`: serve an existing export without building.
- `dante font <url...>` / `f`: read font stylesheet metadata and print YAML and CSS. `-r, --ranges <ranges>` filters comma-separated ranges, e.g. `latin`.
- Build/development/server: `-d, --directory <dir>` defaults to `dist`.
- Development/server: `-i, --ip <ip>` defaults to `0.0.0.0`; `-p, --port <port>` defaults to `4200`.
- Global help/version: `-h, --help` and `-V, --version`.

There is no `create-dante-site` command or bundled scaffolding template directory. Use this skill to generate site files.

## Build and rendering APIs

Import public APIs from `@perseveranza-pets/dante`.

`build(context)` returns a `BuildResult` object or a promise of one. Its optional fields are `css` (string) and `cssVisitor` (Lightning CSS visitor). Either can instead be a synchronous/asynchronous callback accepting the build context. Dante scans generated `**/*.html`, sets `context.currentPage`, evaluates these callbacks, and finalizes CSS. CSS is minified only in production and requires a closing `</head>` for injection.

`BuildContext` fields:

- `version`: timestamp-based version or `DANTE_BUILD_VERSION`.
- `logger`: Pino logger.
- `isProduction`: production build flag.
- `root`: absolute output directory, not the source/project directory.
- `currentPage`: optional HTML file path, populated during finalization.
- `extensions`: mutable application-specific state, initially `{}`.

`rootDir` is `process.cwd()`; `danteDir` is the installed package directory. `createBuildContext(logger, isProduction, root)` creates a context; `builder(context)` runs cleanup, build, CSS finalization, and development injection.

`createFile(baseDir, relativePath, contents, encoding?)` writes a string/Buffer, promise, or function returning those values. It returns a root-relative URL. A `$hash` placeholder in `relativePath` is replaced with the first ten hexadecimal characters of the content's MD5 hash. `hash(contents)` exposes that algorithm. The helper does not create parent directories. Copy source assets yourself; there is no automatic asset pipeline.

```ts
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

await mkdir(resolve(context.root, 'assets'), { recursive: true })
const url = await createFile(context.root, 'assets/app.$hash.js', scriptContents, 'utf8')
```

`finalizePageCSS(context, html, css, visitor?)` performs CSS injection directly. `cleanCssClasses(...classes)` joins and deduplicates class names, ignoring false/null/undefined; `tokenizeCssClasses(classes)` returns individual tokens.

## Server customization

Optional `src/build/server.ts` (or `.js`) exports `setupServer(server, isProduction)`, synchronously or asynchronously. Its arguments are a Fastify instance and a production boolean, not a build context. It may return `{ directory: 'html' }` to serve an output subdirectory, or nothing.

```ts
import type { ServerFunction } from '@perseveranza-pets/dante'

export const setupServer: ServerFunction = async (server, isProduction) => {
  server.get('/health', async () => ({ ok: true, production: isProduction }))
}
```

Static serving is registered after this hook. `server.rootDir` is then set to the serving root. Generate `404.html` for missing pages. An `ssl` directory enables HTTPS and must contain `privkey.pem`, `cert.pem`, and `chain.pem`.

`localServer(options)` accepts `ip`, `port`, `staticDir`, `isProduction`, and `logger` (Pino instance or `false`). Programmatic defaults are `::`, port `0`, `dist/html`, and production mode, unlike the CLI defaults.

## CLI customization

Optional `src/build/cli.ts` (or `.js`) exports `setupCLI(program, logger)`. Dante awaits it before parsing arguments. Install direct `commander` and `pino` dependencies if using these imports:

```ts
import type { Command } from 'commander'
import type { Logger } from 'pino'

export async function setupCLI(program: Command, logger: Logger): Promise<void> {
  program.command('hello').action(() => logger.info('Hello!'))
}
```

Plain `dante skills` bypasses this hook so the instructions remain accessible outside a site or when a site's hook is broken.

### Development state during CLI bootstrap

Import `developmentServerActive` from `@perseveranza-pets/dante`. This boolean is available at module import time and inside `setupCLI`: initially `false`, then `true` in the watched development runtime and on each watch restart. It is not a readiness indicator: `true` does not mean the server is listening yet. `false` means either the preliminary bootstrap or a non-development command, not necessarily production.

Always register CLI commands/options regardless of the boolean. Development imports the CLI modules and invokes `setupCLI` first with `false`, then again in a fresh runtime with `true`. Application `preAction` hooks also run in both phases: the development action replaces the preliminary process after those hooks finish. Gate development-only initialization or effects that should skip bootstrap on `developmentServerActive`. The actual server/build starts only in the watched runtime. Other commands run their hooks/actions once with `false`. Internal environment markers transport the watch configuration/state; do not set or rely on them directly.

## Environment

- `DANTE_BUILD_FILE_PATH`: override the build entry point; otherwise `src/build/index.ts`, falling back to `.js`.
- `DANTE_SERVER_FILE_PATH`: override the server hook; otherwise `src/build/server.ts`, falling back to `.js`.
- `DANTE_CLI_PATH`: override the CLI hook; otherwise `src/build/cli.ts`, falling back to `.js`.
- Override paths resolve against the working directory; absolute paths also work.
- `DANTE_BUILD_VERSION`: set the build version for reproducible exports.
- `DANTE_WATCH_MODULES`: any nonempty value adds `node_modules/@perseveranza-pets/dante` to development watch paths.
- `DANTE_WATCH_ADDITIONAL_PATHS`: comma-separated additional development watch paths.
- `NODE_OPTIONS`: standard Node startup options, inherited by the launcher and its replacement process.
- `DANTE_NODE_ADDITIONAL_OPTIONS`: deprecated extra Node startup flags. Whitespace separates arguments, quotes group them, and backslash escapes the next character outside single quotes. Unclosed quotes/trailing escapes fail. No shell expansions are performed. Prefer `NODE_OPTIONS` or `launch({ nodeArgs })`.
- `DANTE_PROGRAM_NAME` / `DANTE_PROGRAM_DESCRIPTION`: customize CLI branding.

## Fonts and syntax highlighting

`dante font 'Roboto:wght@400;700' --ranges latin` prints font metadata and CSS. HTTPS inputs are stylesheet URLs; other inputs are Google Fonts family queries. It does not download font binaries. Programmatically use `downloadFonts(logger, urls, ranges)`, `loadFontsFile(path)` for saved YAML, and `fontsToCss(fonts)` for `@font-face` rules using remote font URLs.

`renderCode(code, language, numbers, highlight, classes, theme?)` returns Shiki-highlighted HTML. `highlight` is a line selection such as `'1,3-5'`. The class map supports `root`, `line`, `lineHighlighted`, `lineNotHighlighted`, `lineNumber`, `italic`, `bold`, and `underline`; provide corresponding styles and styles using `--dante-fg` and `--dante-bg`. The default theme is `one-dark-pro`; add other themes to the exported `preloadedThemes` array before the first render. Languages load on demand; custom `output` and `none` grammars are included. `parseRanges` parses line selections; `sanitizeTabularOutputSnippet` normalizes box-drawing characters.

## Extending Dante's launcher

Use a Node executable importing `launch` from `@perseveranza-pets/dante/launcher` instead of finding Dante through a shell `PATH`:

```js
#!/usr/bin/env node
import { launch } from '@perseveranza-pets/dante/launcher'

await launch({
  cli: new URL('./cli.js', import.meta.url),
  build: new URL('./build.js', import.meta.url),
  server: new URL('./server.js', import.meta.url),
  nodeArgs: ['--max-old-space-size=4096'],
  watchPaths: [new URL('../src', import.meta.url)]
})
```

The example entry point sits beside the compiled hooks. All options are optional. `cli`, `build`, and `server` are hook modules; explicit values override the matching `DANTE_*` environment variables in the replacement process. Existing environment-based integrations remain supported. `cwd` defaults to the working directory; string paths resolve against it, and file URLs are accepted. `env` merges overrides into the inherited environment; `undefined` removes a variable. `args` defaults to `process.argv.slice(2)`.

The launcher changes to `cwd` and replaces itself using `process.execve(process.execPath, ...)` with arrays and no shell. PID and standard file descriptors are preserved: signals and exit codes belong directly to the replacement process. It first preloads TSX without watch flags, then lets Commander parse the complete CLI after extensions register. For `development`/`dev`/`d`, the action replaces the process again with watch enabled after application `preAction` hooks execute. This correctly handles global extension options before the command and option values named `dev`. Help, version, and parse errors never activate watch. `watchPaths` supplements `src` and the legacy watch variables; array paths preserve spaces and commas. `nodeArgs` follows legacy Node flags; caller `process.execArgv` is not automatically forwarded into the initial CLI, while its configured Node flags are preserved on the development restart. Await the API once from a process entry point; successful replacement never returns or runs JavaScript cleanup/exit handlers, while preparation errors reject. External shell wrappers must still quote `"$@"` correctly themselves.

## Working on Dante itself

- `src/cli.ts` defines commands and site-hook loading; `src/launcher.ts` provides the public launcher API and the internal development restart. `bin/dante` is a thin Node entry point. Preload is configured at startup; the development action enables watch through a second exec after parsing and application `preAction` hooks. Keep activation inside the action's `try` so preparation errors use the same logger/error handling as server startup and build.
- `src/build.ts` orchestrates exports; `src/models.ts` defines contexts and hooks; `src/rendering.ts` writes files; `src/css.ts` finalizes styles; `src/server.ts` serves output; `src/tsx-transformer.ts` registers the runtime TSX loader.
- Public APIs are re-exported from `src/index.ts`. Use explicit `.ts` imports in package sources and follow the existing formatting conventions.
- `pnpm run ci` compiles TypeScript, copies `src/assets` into `dist`, and runs lint. `npm test` is a placeholder; do not add automated tests. Verify changed behavior with targeted manual checks.
- Keep this skill and README synchronized with the implementation. Include this file in the npm package; `dante skills` must reproduce it exactly on stdout. `AGENTS.md` points here. Validate package contents with `npm pack --dry-run --ignore-scripts`.
- For startup changes, check dev aliases and watch environment variables, production commands without watch mode, and TSX loading. For skill changes, check output both outside a project and with an invalid CLI hook override. For scaffolding changes, build the documented example and inspect its generated HTML/CSS.
