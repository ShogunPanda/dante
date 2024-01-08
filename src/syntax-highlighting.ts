import { type pino } from 'pino'
import { getHighlighter, renderToHtml, type Highlighter, type Lang } from 'shiki'
import { elapsed } from './build.js'

export const preloadedLanguages = [
  'javascript',
  'typescript',
  'json',
  'jsonc',
  'rust',
  'html',
  'css',
  'markdown',
  'console',
  'shell',
  'graphql'
]

export const preloadedThemes = ['one-dark-pro']

const highlightersCache = new Map<string, Highlighter>()

// Add support for the command grammar
const consoleGrammar = {
  id: 'console',
  scopeName: 'source.console',
  grammar: {
    scopeName: 'source.console',
    patterns: [{ include: '#command' }, { include: '#output' }],
    repository: {
      command: {
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
      output: {
        patterns: [{ match: '.+', name: 'comment' }]
      }
    }
  }
}

async function createHighlighter(language: string, theme: string): Promise<Highlighter> {
  const cacheKey = `${theme}:${language}`
  let highlighter = highlightersCache.get(cacheKey)

  if (!highlighter) {
    highlighter = await getHighlighter({ langs: [language as unknown as Lang], themes: [theme] })
    await highlighter.loadLanguage(consoleGrammar as unknown as Lang)
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
  const tokens = highlighter.codeToThemedTokens(code.trim(), language, theme, { includeExplanation: false })

  const { fg, bg } = highlighter.getTheme(theme)

  let i = 0
  const ranges = parseRanges(highlight)

  return renderToHtml(tokens, {
    elements: {
      line({ className, children }: Record<string, unknown>): string {
        i++
        const nextRange = ranges[0]
        let baseClass = classes.line ?? ''
        let highlighted = false

        // There is a range to higlight
        if (nextRange) {
          // We have to highlight
          if (nextRange[0] <= i && nextRange[1] >= i) {
            baseClass += ` ${classes.lineHighlighted}`
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

        if (!highlighted) {
          baseClass += ` ${classes.lineNotHighlighted}`
        }

        const lineNumberSpan = numbers ? `<span class="${classes.lineNumber ?? ''}">${i}</span>` : ''
        return `<span class="${className} ${baseClass.trim()}">${lineNumberSpan}${children}</span>`
      }
    },
    fg,
    bg,
    themeName: theme
  }).replace('<pre class="', `<pre class="${classes.root ?? ''} `)
}
