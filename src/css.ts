import { createGenerator, type UserConfig } from '@unocss/core'
import { transformDirectives } from '@unocss/transformer-directives'
import MagicString from 'magic-string'
import postcss, { type Rule } from 'postcss'
import postcssDiscardComments from 'postcss-discard-comments'
import postcssMinifySelector from 'postcss-minify-selectors'
import postcssNested from 'postcss-nested'
import postcssNormalizeWhitespace from 'postcss-normalize-whitespace'
import { type BuildContext } from './models.js'

type InternalClassesExpansions = Record<string, Set<string>>
export type ClassesExpansions = Record<string, string[]>
export type CSSClassToken = string | false | undefined | null
export type CSSClassesResolver = (...klasses: (CSSClassToken | CSSClassToken[])[]) => string

const cssClassAlphabet = 'abcdefghijklmnopqrstuvwxyz'
const cssClassAlphabetLength = cssClassAlphabet.length
const cssForbiddenClasses = new Set(['ad'])

function replaceCSSClassesPlugin(compressedClasses: Map<string, string>, decl: Rule): void {
  if (!decl.selector.startsWith('.')) {
    return
  }

  const newSelector: string[] = []
  for (const selector of decl.selector.split(/\s+,\s+/).map((s: string) => s.trim())) {
    const [, rawClass, modifier] = selector.slice(1).match(/^(.+?)(:{1,2}[^:]+)?$/)!
    const klass = rawClass.replaceAll('\\', '')
    const replacement = compressedClasses.get(klass)

    if (replacement) {
      newSelector.push(`.${replacement}${modifier ?? ''}`)
    } else {
      decl.remove()
    }
  }

  if (newSelector.length) {
    decl.selector = newSelector.join(',')
  } else {
    decl.remove()
  }
}

export function tokenizeCssClasses(klass: (CSSClassToken | CSSClassToken[])[]): string[] {
  return klass
    .flat(Number.MAX_SAFE_INTEGER)
    .filter(k => k)
    .map(k => (k as string).split(' '))
    .flat(Number.MAX_SAFE_INTEGER)
    .map(k => (k as string).trim())
    .filter(k => k)
}

export async function transformCSS(config: UserConfig, css: string): Promise<string> {
  // Create a generator
  const generator = createGenerator(config)

  // Trasform the file
  const code = new MagicString(css)
  await transformDirectives(code, generator, {})

  return code.toString()
}

export async function loadCSSClassesExpansion(css: string): Promise<ClassesExpansions> {
  // Load classes from the classes file
  const unserializedClass: InternalClassesExpansions = {}

  // Load PostCSS with only the nested plugin enabled
  await postcss([
    postcssNested(),
    {
      postcssPlugin: 'dante.classes-expansion-loader',
      Rule(decl: Rule) {
        // If not a class selector, ignore it
        if (!decl.selector.startsWith('.')) {
          return
        }

        // For each rule, only retain @apply ones
        const rules = []
        for (const node of decl.nodes) {
          if (node.type === 'atrule' && node.name === 'apply') {
            rules.push(node.params)
          }
        }

        // Now build the expansions for the global rule
        const localClasses: InternalClassesExpansions = {}

        // For each selector of this rule
        for (const selector of decl.selectors) {
          // Split modifiers of the rule
          const [klass, pseudoComponent] = selector.slice(1).split(':')
          const pseudo = pseudoComponent ? `${pseudoComponent}:` : ''

          if (!localClasses[klass]) {
            localClasses[klass] = new Set()
          }

          // Now apply the rule using also the pseudo selectors
          for (const rule of rules) {
            let [layer, cleanRule] = rule.split('@')

            if (!cleanRule) {
              cleanRule = layer
              layer = ''
            } else {
              layer += '@'
            }

            localClasses[klass].add(layer + pseudo + cleanRule)
          }
        }

        // Merge local classes with global one
        for (const [from, tos] of Object.entries(localClasses)) {
          if (!unserializedClass[from]) {
            unserializedClass[from] = new Set()
          }

          for (const to of tos) {
            unserializedClass[from].add(to)
          }
        }
      }
    }
  ]).process(css, {
    from: 'input.css',
    to: 'output.css'
  })

  const classes: ClassesExpansions = {}

  for (const [id, expansions] of Object.entries(unserializedClass)) {
    const allExpansions = [...expansions]

    if (allExpansions.length) {
      classes[id] = allExpansions
    }
  }

  return classes
}

export function compressCssClass(context: BuildContext, expanded: string): string {
  const previous = context.css.compressedClasses.get(expanded)

  if (previous) {
    return previous
  }

  let name = ''
  let state = context.css.compressionState

  // Generate the unique class
  do {
    let i = ++state
    name = ''

    do {
      let index = i % cssClassAlphabetLength
      i = i / cssClassAlphabetLength

      if (index - 1 === -1) {
        index = cssClassAlphabetLength
        i--
      }

      name = cssClassAlphabet.charAt(index - 1) + name
    } while (i >= 1)

    // Avoid some combinations
  } while (cssForbiddenClasses.has(name))

  // Update the state
  context.css.compressionState = state

  // Save the compressed class
  context.css.compressedClasses.set(expanded, name)

  // This mapping is to avoid recompressing a compressed class
  context.css.compressedClasses.set(name, name)

  return name
}

export function expandCSSClasses(
  context: BuildContext,
  classes: ClassesExpansions,
  ...klasses: (CSSClassToken | CSSClassToken[])[]
): string {
  let replaced = klasses
  let changed = true

  while (changed) {
    changed = false
    replaced = tokenizeCssClasses(replaced).map(klass => {
      const replacement = classes[klass]

      if (replacement) {
        changed = true
        return replacement
      } else {
        if (context.isProduction) {
          context.logger.error(`Missing replacement for CSS class "${klass}".`)
        }

        return klass
      }
    })
  }

  let expanded = Array.from(new Set(tokenizeCssClasses(replaced)))

  // Register all classes
  for (const klass of expanded) {
    context.css.currentClasses.add(klass)
  }

  // If classes compression is enabled, perform the replacement now
  if (!context.css.keepExpanded) {
    expanded = expanded.map(klass => {
      return compressCssClass(context, klass)
    })
  }

  return expanded.join(' ')
}

export function createCSSClassesResolver(context: BuildContext, classes: ClassesExpansions): CSSClassesResolver {
  context.css.currentClasses = new Set()
  context.css.compressedClasses = new Map()
  context.css.compressionState = 0
  return expandCSSClasses.bind(null, context, classes)
}

export function serializeCSSClasses(context: BuildContext): Record<string, string> {
  return {
    'data-dante-css-classes': Array.from(context.css.currentClasses).join(' ')
  }
}

export async function finalizePageCSS(
  context: BuildContext,
  cssConfig: UserConfig,
  contents: string,
  headingCss: string
): Promise<string> {
  // First of all, extract the classes
  const matcher = /<style data-dante-css-classes="([^"]+)"(?:\/>|>.*<\/style>)/
  const mo = contents.match(matcher)

  if (!mo) {
    return contents
  }

  const classes = mo[1].split(' ')

  // Generate the CSS out of the heading CSS and the CSS classes
  headingCss = await transformCSS(cssConfig, headingCss)
  const generator = createGenerator({ ...cssConfig, mergeSelectors: false })
  const { css: generatedCss } = await generator.generate(classes)

  const postCssRules = [
    postcssNested(),
    postcssDiscardComments({ removeAll: true }),
    postcssNormalizeWhitespace(),
    postcssMinifySelector()
  ]

  if (!context.css.keepExpanded) {
    postCssRules.push({
      postcssPlugin: 'dante.compressor',
      Rule: replaceCSSClassesPlugin.bind(null, context.css.compressedClasses)
    })
  }

  const { css } = await postcss(postCssRules).process(`${headingCss}\n${generatedCss}`, {
    from: 'input.css',
    to: 'output.css'
  })

  return contents.replace(matcher, `<style>${css}</style>`)
}
