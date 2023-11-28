import { createGenerator, type UserConfig } from '@unocss/core'
import { transformDirectives } from '@unocss/transformer-directives'
import MagicString from 'magic-string'
import postcss, { type Rule } from 'postcss'
import postcssDiscardComments from 'postcss-discard-comments'
import postcssImport from 'postcss-import'
import postcssMinifySelector from 'postcss-minify-selectors'
import postcssNested from 'postcss-nested'
import postcssNormalizeWhitespace from 'postcss-normalize-whitespace'
import { PurgeCSS } from 'purgecss'
// @ts-expect-error This will be present at runtime
import { compressCSSClassesInHTML, extractCSSClasses } from './lib/html-utils/html_utils.js'
import { type BuildContext } from './models.js'

type CSSImporter = (id: string) => Promise<string | null>

type InternalClassesExpansions = Record<string, Set<string>>
export type ClassesExpansions = Record<string, string[]>

function replaceCSSClassesPlugin(compressedClasses: Map<string, string>, safelist: string[], decl: Rule): void {
  if (!decl.selector.startsWith('.')) {
    return
  }

  const newSelector: string[] = []
  for (const selector of decl.selector.split(/\s+,\s+/).map((s: string) => s.trim())) {
    // Split class and only keep the last modifier
    let [klass, ...modifiers] = selector.slice(1).split(':')
    klass = klass.replaceAll('\\', '').replaceAll(' ', '_')
    klass = [klass, ...modifiers.slice(0, -1)].join(':')
    const modifier = modifiers.at(-1)

    if (safelist.includes(klass)) {
      newSelector.push(selector)
      continue
    }

    const replacement = compressedClasses.get(klass)?.replaceAll('@', '\\@')

    if (replacement) {
      if (modifier) {
        newSelector.push(`.${replacement}:${modifier}`)
      } else {
        newSelector.push(`.${replacement}`)
      }
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

export async function transformCSS(config: UserConfig, css: string): Promise<string> {
  // Create a generator
  const generator = createGenerator(config)

  // Trasform the file
  const code = new MagicString(css)
  await transformDirectives(code, generator, {})

  return code.toString()
}

async function finalizeCSS(css: string, minify: boolean, cssImporter: CSSImporter): Promise<string> {
  const processed = await postcss([
    postcssImport({
      resolve(id: string): string {
        return `/handled/${id}`
      },
      async load(id: string): Promise<string> {
        id = id.replace(/^\/handled\//, '')

        const imported = await cssImporter(id)

        return imported ?? `/*!!! not-found: ${id} */`
      }
    }),
    postcssNested(),
    ...(minify
      ? [postcssDiscardComments({ removeAll: true }), postcssNormalizeWhitespace(), postcssMinifySelector()]
      : [])
  ]).process(css, {
    from: 'input.css',
    to: 'output.css'
  })

  return processed.css
}

export async function purgeCss(html: string, css: string): Promise<string> {
  const result = await new PurgeCSS().purge({
    content: [
      {
        raw: html,
        extension: 'html'
      }
    ],
    css: [
      {
        raw: css
      }
    ],
    safelist: [/[!#@$:[\\]./],
    variables: false
  })

  return result[0].css
}

export async function loadClassesExpansion(css: string, applyLayer: boolean = false): Promise<ClassesExpansions> {
  // Load classes from the classes file
  const unserializedClass: InternalClassesExpansions = {}

  // Load PostCSS with only the nested plugin enabled
  await postcss([
    postcssNested(),
    {
      postcssPlugin: 'dante.classes-expansion',
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
          const layer = applyLayer && selector.includes('@') ? selector.slice(1).split('@')[0] + '@' : ''

          // Split modifiers
          const [selectorClean, afterOrBeforePart] = selector.slice(1).split('::')
          const [klass, ...modifiers] = selectorClean.split(':')
          const afterOrBefore = afterOrBeforePart ? `::${afterOrBeforePart}` : ''

          if (!localClasses[klass]) {
            localClasses[klass + afterOrBefore] = new Set()
          }

          // No modifier, just set the rule untouch
          if (!modifiers.length) {
            for (const rule of rules) {
              localClasses[klass + afterOrBefore].add(layer + rule)
            }
          } else {
            // For each modifier, apply the rule with the modifier as prefix
            for (const modifier of modifiers) {
              for (const rule of rules) {
                localClasses[klass + afterOrBefore].add(layer + [modifier, rule].filter(Boolean).join('-'))
              }
            }
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

  for (const [compressed, expanded] of Object.entries(unserializedClass)) {
    const allExpansions = [...expanded]

    if (allExpansions.length) {
      classes[compressed] = allExpansions
    }
  }

  return classes
}

export function expandClasses(classes: ClassesExpansions, klasses?: string): string {
  let current = ''
  let replaced = klasses ?? ''

  while (replaced !== current) {
    current = replaced

    // For each input class
    replaced = current
      .split(' ')
      .flatMap(klass => classes[klass] ?? klass)
      .join(' ')
  }

  return replaced
}

export async function prepareStyles(context: BuildContext, contents: string): Promise<string> {
  const cssClasses =
    typeof context.css.classes === 'function' ? await context.css.classes(context) : context.css.classes

  extractCSSClasses(cssClasses, contents)

  return '@import "/style.css";'
}

export async function createStylesheet(
  cssConfig: UserConfig,
  classes: Set<string>,
  minify: boolean,
  cssImporter: CSSImporter,
  leadingCss: string = ''
): Promise<string> {
  // Generate the CSS out of the classes
  const generator = createGenerator({ ...cssConfig, mergeSelectors: false })

  const commonCss = await transformCSS(cssConfig, leadingCss)
  const { css: generatedCss } = await generator.generate(classes)

  return finalizeCSS(commonCss + generatedCss, minify, cssImporter)
}

// Compress each CSS class in the contents, then purged the CSS and finally replace the placeholder
export async function finalizePageCSS(
  context: BuildContext,
  contents: string,
  stylesheet: string,
  safelist: string[] = []
): Promise<string> {
  const css = context.css.removeUnused ? await purgeCss(contents, stylesheet) : stylesheet

  // First of all, replace all classes with their compressed version
  let compressedContents = contents

  const compressedClasses =
    typeof context.css.compressedClasses === 'function'
      ? await context.css.compressedClasses(context)
      : context.css.compressedClasses

  if (!context.css.keepExpanded) {
    const compressedLayers =
      typeof context.css.compressedLayers === 'function'
        ? await context.css.compressedLayers(context)
        : context.css.compressedLayers

    const generator =
      typeof context.css.generator === 'function' ? await context.css.generator(context) : context.css.generator

    const [counter, transformed] = compressCSSClassesInHTML(
      contents,
      compressedClasses,
      compressedLayers,
      new Set(safelist),
      generator.counter,
      generator.prefix ?? ''
    )

    compressedContents = transformed
    generator.counter = counter
  }

  // Now grab the CSS and replace the same classes again
  const postCssRules = []

  if (!context.css.keepExpanded) {
    postCssRules.push({
      postcssPlugin: 'dante.compressor',
      Rule: replaceCSSClassesPlugin.bind(null, compressedClasses, safelist)
    })
  }

  const compressedCss = await postcss(postCssRules).process(css, {
    from: 'input.css',
    to: 'output.css'
  })

  return compressedContents
    .toString()
    .replace(
      '<style data-dante-placeholder="style">@import "/style.css";</style>',
      `<style>${compressedCss.css}</style>`
    )
}
