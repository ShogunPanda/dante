import { dump, load } from 'js-yaml'
import { readFile } from 'node:fs/promises'
import type pino from 'pino'
import postcss, { type AtRule, type Comment, type Declaration } from 'postcss'

export type Style = 'normal' | 'italic' | 'bold'
export type Weight = number
export type Range = string
export type Font = Record<Weight, Record<Range, number>>
export type FontFamily = Record<Style, Font>

export interface Fonts {
  ranges: Record<string, string>
  urls: string[]
  families: Record<string, FontFamily>
  sources: Record<string, string>
}

export async function downloadFonts(logger: pino.Logger, urls: string[], whitelistedRanges: string[]): Promise<void> {
  const fonts: Fonts = { sources: {}, families: {}, urls: [], ranges: {} }

  for (let remoteUrl of urls) {
    logger.info(`Downloading ${remoteUrl} ...`)

    // When no scheme is given, we assume Google Fonts
    if (!remoteUrl.startsWith('https://')) {
      remoteUrl = `https://fonts.googleapis.com/css2?family=${remoteUrl}&display=swap`
    }

    const res = await fetch(remoteUrl, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    })
    const message: string = await res.text()

    if (res.status !== 200) {
      throw new Error(`HTTP Error ${res.status}: ${message}`)
    }

    // Parse the CSS and extract all font-faces
    await postcss([
      {
        postcssPlugin: 'dante.fonts-parser',
        AtRule(decl: AtRule) {
          if (decl.name !== 'font-face') {
            return
          }

          // Find the range, it's going to be the comment before the rule
          const range = (decl.prev() as Comment).text.trim()

          if (whitelistedRanges.length && !whitelistedRanges.includes(range)) {
            return
          }

          const props = Object.fromEntries(
            decl.nodes!.map(d => {
              const pair = d as Declaration
              return [pair.prop, pair.value]
            })
          )

          if (!fonts.ranges[range]) {
            fonts.ranges[range] = props['unicode-range']
          } else if (fonts.ranges[range] !== props['unicode-range']) {
            throw new Error(
              `Mismatching range for ${range}.\n\tPrevious: ${fonts.ranges[range]}\n\tCurrent: ${props['unicode-range']}`
            )
          }

          const { 'font-family': rawFamily, 'font-style': style, 'font-weight': weight, src } = props
          const family: string = rawFamily.match(/'(.+)'/)![1]
          const url = src.match(/url\((.+)\) format\(.+\)/)![1]

          let urlIndex = fonts.urls.indexOf(url)
          if (urlIndex === -1) {
            urlIndex = fonts.urls.length
            fonts.urls.push(url)
          }

          fonts.sources[family] = remoteUrl

          fonts.families[family] ??= {} as FontFamily

          fonts.families[family][style as Style] ??= {} as Font
          fonts.families[family][style as Style][parseInt(weight, 10)] ??= {}
          fonts.families[family][style as Style][parseInt(weight, 10)][range] = urlIndex
        }
      }
    ]).process(message, { from: 'input.css', to: 'output.css' })
  }

  logger.info('YAML representation of the fonts:\n')
  setTimeout(() => {
    console.log('---\n' + dump(fonts, { lineWidth: 1000 }) + '\n')

    logger.info('CSS representation of the fonts:\n')

    setTimeout(() => {
      console.log(fontsToCss(fonts))
    }, 200)
  }, 200)
}

export async function loadFontsFile(path: string): Promise<Fonts> {
  return load(await readFile(path, 'utf-8')) as Fonts
}

export function fontsToCss(fonts: Fonts): string {
  let css = ''

  for (const [name, family] of Object.entries(fonts.families)) {
    css += `/* ${fonts.sources[name]} */\n\n`

    for (const [style, definitions] of Object.entries(family)) {
      for (const [weight, ranges] of Object.entries(definitions)) {
        for (const [range, urlIndex] of Object.entries(ranges)) {
          const url = fonts.urls[urlIndex]
          const unicodeRange = fonts.ranges[range]

          const props = [
            ['font-family', `'${name}'`],
            ['font-weight', weight],
            ['font-style', style],
            ['font-display', 'swap'],
            ['src', `url('${url}') format('woff2')`],
            ['unicode-range', unicodeRange]
          ]

          css += '@font-face {\n' + props.map(([key, value]) => `  ${key}: ${value};`).join('\n') + '\n}\n\n'
        }
      }
    }
  }

  return css.trim()
}
