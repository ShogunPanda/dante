import { parseArgs } from 'node:util'

const cli = parseArgs({
  args: process.argv.slice(2),
  options: { help: { short: 'h', type: 'boolean' }, version: { short: 'V', type: 'boolean' } },
  strict: false
})

if (['development', 'dev', 'd'].includes(cli.positionals[0])) {
  let additionalOptions = `--no-warnings ${process.env.DANTE_NODE_ADDITIONAL_OPTIONS ?? ''}`

  if (process.env.DANTE_WATCH_MODULES) {
    additionalOptions += ' --watch-path node_modules/dante'
  }

  if (process.env.DANTE_WATCH_ADDITIONAL_PATHS) {
    const paths = process.env.DANTE_WATCH_ADDITIONAL_PATHS.split(/\s*,\s*/).map(p => p.trim())

    for (const path of paths) {
      additionalOptions += ` --watch-path ${path}`
    }
  }

  additionalOptions += ' --watch-path src --watch-preserve-output'

  console.log(additionalOptions.replaceAll(/\s{2,}/g, ' ').trim())
}
