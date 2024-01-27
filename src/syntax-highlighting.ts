import { type pino } from 'pino'
import {
  getHighlighter,
  type Highlighter,
  type LanguageRegistration,
  type SpecialLanguage,
  type SpecialTheme
} from 'shiki'
import { elapsed } from './build.js'

export const preloadedLanguages = [
  'none',
  'console',
  'javascript',
  'typescript',
  'json',
  'jsonc',
  'rust',
  'html',
  'css',
  'markdown',
  'shell',
  'graphql'
]

export const preloadedThemes = ['one-dark-pro']

const highlightersCache = new Map<string, Highlighter>()

// Add support for the command grammar
const consoleLanguage: LanguageRegistration = {
  name: 'console',
  scopeName: 'source.console',
  patterns: [
    {
      patterns: [
        {
          begin: '^[a-z-]+@[a-z-]+',
          end: '\n',
          name: 'string',
          patterns: [
            {
              match: ':',
              name: 'keyword.operator'
            },
            {
              match: '~',
              name: 'variable.function'
            },
            {
              match: '\\$',
              name: 'keyword.operator'
            },
            {
              match: '.+',
              name: 'punctuation.definition.bold'
            }
          ]
        }
      ]
    },
    {
      patterns: [{ match: '.+', name: 'comment' }]
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
  patterns: [
    {
      match: '.+',
      name: 'none'
    }
  ],
  repository: {
    $self: {},
    $base: {}
  }
}

async function createHighlighter(language: string, theme: string): Promise<Highlighter> {
  const cacheKey = `${theme}:${language}`
  let highlighter = highlightersCache.get(cacheKey)

  if (!highlighter) {
    highlighter = await getHighlighter({
      langs: language !== 'none' ? [language] : [],
      themes: [theme]
    })
    await highlighter.loadLanguage(consoleLanguage)
    await highlighter.loadLanguage(noneLanguage)
    highlightersCache.set(cacheKey, highlighter)
  }

  return highlighter
}

export async function initializeSyntaxHighlighting(logger?: pino.Logger): Promise<void> {
  logger?.info('Preparing syntax highlighting ...')
  const operationStart = process.hrtime.bigint()

  const combinations = []
  for (const language of preloadedLanguages) {
    for (const theme of preloadedThemes) {
      combinations.push([language, theme])
    }
  }

  await Promise.all(combinations.map(([language, theme]) => createHighlighter(language, theme)))

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

  const highlighter = await createHighlighter(language, theme)
  const lines = highlighter.codeToThemedTokens(code.trim(), {
    lang: language as SpecialLanguage,
    theme: theme as SpecialTheme
  })

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
        // TODO@PI: Font style
        .map(({ content, color }) => {
          return `<span dante-code-element="true" class="text-${color}">${content}</span>`
        })
        .join('')

      const lineNumberSpan = numbers
        ? `<span dante-code-element="true" class="${classes.lineNumber ?? ''}">${lineNumber}</span>`
        : ''

      return `<span dante-code-element="true" class="${lineClasses.join(' ')}">${lineNumberSpan}${children}</span>`
    })
    .join('\n')

  return `<pre dante-code-element="true" class="bg-${bg} text-${fg}">${html}</pre>`
}
