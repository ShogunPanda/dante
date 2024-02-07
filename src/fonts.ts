import { readFile } from 'fs/promises'
import { dump, load } from 'js-yaml'
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
            decl.nodes.map(d => {
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

          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
          fonts.families[family] ??= {} as FontFamily
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
          fonts.families[family][style as Style] ??= {} as Font
          fonts.families[family][style as Style][parseInt(weight, 10)] ??= {}
          fonts.families[family][style as Style][parseInt(weight, 10)][range] = urlIndex
        }
      }
    ]).process(message, { from: 'input.css', to: 'output.css' })
  }

  logger.info('YAML representation of the fonts:\n')
  setTimeout(() => {
    console.log('---\n' + dump(fonts, { lineWidth: 1000 }))
  }, 200)
}

export async function loadFontsFile(path: string): Promise<Fonts> {
  return load(await readFile(path, 'utf-8')) as Fonts
}

/*
@font-face {
  font-family: 'M PLUS Rounded 1c';
  font-style: normal;
  font-weight: 300;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/mplusrounded1c/v15/VdGBAYIAV6gnpUpoWwNkYvrugw9RuM0q5psPxeymz15fQEPFwkYlR0a4qBwdyXRVeV9klkI.23.woff2) format('woff2');
  unicode-range: U+7d57, U+7d59-7d5d, U+7d63, U+7d65, U+7d67, U+7d6a, U+7d6e, U+7d70, U+7d72-7d73, U+7d78, U+7d7a-7d7b, U+7d7d, U+7d7f, U+7d81-7d83, U+7d85-7d86, U+7d88-7d89, U+7d8b-7d8d, U+7d8f, U+7d91, U+7d93, U+7d96-7d97, U+7d9b-7da0, U+7da2-7da3, U+7da6-7da7, U+7daa-7dac, U+7dae-7db0, U+7db3, U+7db5-7db9, U+7dbd, U+7dc0, U+7dc2-7dc7, U+7dcc-7dce, U+7dd0, U+7dd5-7dd9, U+7ddc-7dde, U+7de1-7de6, U+7dea-7ded, U+7df1-7df2, U+7df5-7df6, U+7df9-7dfa, U+7e00, U+7e05, U+7e08-7e0b, U+7e10-7e12, U+7e15, U+7e17, U+7e1c-7e1d, U+7e1f-7e23, U+7e27-7e28, U+7e2c-7e2d, U+7e2f, U+7e31-7e33, U+7e35-7e37, U+7e39-7e3b, U+7e3d, U+7e3f, U+7e43-7e48, U+7e4e, U+7e50, U+7e52, U+7e56, U+7e58-7e5a, U+7e5d-7e5f, U+7e61-7e62, U+7e65-7e67, U+7e69-7e6b, U+7e6d-7e6f, U+7e73, U+7e75, U+7e78-7e79, U+7e7b-7e7f, U+7e81-7e83, U+7e86-7e8a, U+7e8c-7e8e, U+7e90-7e96, U+7e98, U+7e9a-7e9f, U+7f38, U+7f3a-7f3f, U+7f43-7f45, U+7f47, U+7f4c-7f50, U+7f52-7f55, U+7f58, U+7f5b-7f5d, U+7f5f, U+7f61, U+7f63-7f69, U+7f6b, U+7f6d, U+7f71;
}
*/
export function fontsToCss(fonts: Fonts): string {
  let css = ''

  for (const [name, family] of Object.entries(fonts.families)) {
    for (const [style, definitions] of Object.entries(family)) {
      for (const [weight, ranges] of Object.entries(definitions)) {
        for (const [range, urlIndex] of Object.entries(ranges)) {
          const url = fonts.urls[urlIndex]
          const unicodeRange = fonts.ranges[range]

          const props = [
            ['font-family', `'${name}'`],
            ['font-style', style],
            ['font-weight', weight],
            ['font-display', 'swap'],
            ['src', `url(${url}) format('woff2')`],
            ['unicode-range', unicodeRange]
          ]

          css += '@font-face {\n' + props.map(([key, value]) => `  ${key}: ${value};`).join('\n') + '\n}\n'
        }
      }
    }
  }

  return css
}
