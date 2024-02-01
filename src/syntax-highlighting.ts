import { type pino } from 'pino'
import {
  getHighlighter,
  type BundledLanguage,
  type Highlighter,
  type LanguageRegistration,
  type SpecialLanguage,
  type SpecialTheme
} from 'shiki'
import { elapsed } from './build.js'

let highlighter: Highlighter

export const preloadedThemes = ['one-dark-pro']

// Add some special grammars
const outputLanguage: LanguageRegistration = {
  name: 'output',
  scopeName: 'source.output',
  patterns: [
    {
      begin: '^([a-zA-Z0-9-]+@[a-zA-Z0-9-]+)(:)(~/[a-zA-Z0-9-]+)(\\$)(.+)',
      end: '\n',
      beginCaptures: {
        1: {
          name: 'string'
        },
        2: {
          name: 'beginning.punctuation.definition.list.markdown.xi'
        },
        3: {
          name: 'variable.function'
        },
        4: {
          name: 'beginning.punctuation.definition.list.markdown.xi'
        },
        5: {
          name: 'punctuation.definition.bold'
        }
      }
    }
  ],
  repository: {
    $self: {},
    $base: {}
  }
}

const noneLanguage: LanguageRegistration = {
  name: 'none',
  scopeName: 'source.none',
  patterns: [],
  repository: {
    $self: {},
    $base: {}
  }
}

export async function initializeSyntaxHighlighting(logger?: pino.Logger): Promise<void> {
  logger?.info('Preparing syntax highlighting ...')
  const operationStart = process.hrtime.bigint()

  highlighter = await getHighlighter({ themes: preloadedThemes })
  await highlighter.loadLanguage(outputLanguage)
  await highlighter.loadLanguage(noneLanguage)

  logger?.info(`Syntax highlighting prepared in ${elapsed(operationStart)} ms.`)
}

export function parseRanges(highlight: any): number[][] {
  return (highlight ?? '')
    .split(',')
    .map((raw: string) => {
      const parsed = raw
        .trim()
        .split('-')
        .map(r => Number.parseInt(r))
        .filter(r => !Number.isNaN(r))

      switch (parsed.length) {
        case 0:
          return null
        case 1:
          return [parsed[0], parsed[0]]
        default:
          return parsed.slice(0, 2)
      }
    })
    .filter(Boolean)
}

export async function renderCode(
  code: string,
  language: string,
  numbers: boolean,
  highlight: string,
  classes: Record<string, string>,
  theme: string = 'one-dark-pro'
): Promise<string> {
  if (!language) {
    language = 'javascript'
  }

  const lines = highlighter.codeToThemedTokens(code.trim(), {
    lang: language as SpecialLanguage,
    theme: theme as SpecialTheme
  })

  if (!highlighter.getLoadedLanguages().includes(language)) {
    await highlighter.loadLanguage(language as BundledLanguage)
  }

  const { fg, bg } = highlighter.getTheme(theme)

  const ranges = parseRanges(highlight)
  const hasRanges = ranges.length > 0

  const html = lines
    .map((tokens, i) => {
      const lineNumber = i + 1
      const lineClasses = [classes.line]

      // There is a range to higlight
      const nextRange = ranges[0]

      let highlighted = false
      if (nextRange) {
        // We have to highlight
        if (nextRange[0] <= lineNumber && nextRange[1] >= i) {
          lineClasses.push(classes.lineHighlighted)
          highlighted = true

          // If it was a single line, make sure we move to the next range
          if (nextRange[0] === nextRange[1]) {
            ranges.shift()
          }

          // We're past the previous range, look for the next one
        } else if (nextRange[0] <= i) {
          ranges.shift()
        }
      }

      if (hasRanges && !highlighted) {
        lineClasses.push(classes.lineNotHighlighted)
      }

      const children = tokens
        .map(({ content, color, fontStyle }) => {
          const spanClasses = [`text-${color}`]

          if (fontStyle) {
            if (fontStyle & 1) {
              // Italic
              spanClasses.push('font-italic')
            }

            if (fontStyle & 2) {
              // Bold
              spanClasses.push('font-bold')
            }

            if (fontStyle & 4) {
              // Underline
              spanClasses.push('underline')
            }
          }

          return `<span dante-code-element="true" class="${spanClasses.join(' ')}">${content}</span>`
        })
        .join('')

      const lineNumberSpan = numbers
        ? `<span dante-code-element="true" class="${classes.lineNumber ?? ''}">${lineNumber}</span>`
        : ''

      return `<span dante-code-element="true" class="${lineClasses.join(' ')}">${lineNumberSpan}${children}</span>`
    })
    .join('\n')

  return `<pre dante-code-root="true" class="bg-${bg} text-${fg}">${html}</pre>`
}
