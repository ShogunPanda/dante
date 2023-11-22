import { createGenerator, type UserConfig } from '@unocss/core'
import { transformDirectives } from '@unocss/transformer-directives'
import { type Element, type Root } from 'hast'
import MagicString from 'magic-string'
import postcss, { type Rule } from 'postcss'
import postcssDiscardComments from 'postcss-discard-comments'
import postcssImport from 'postcss-import'
import postcssMinifySelector from 'postcss-minify-selectors'
import postcssNested from 'postcss-nested'
import postcssNormalizeWhitespace from 'postcss-normalize-whitespace'
import { PurgeCSS } from 'purgecss'
import { rehype } from 'rehype'
import stringify from 'rehype-stringify'
import { type Processor, type Transformer } from 'unified'
import { type Node } from 'unist'
import { visit } from 'unist-util-visit'
import { type BuildContext, type CSSClassGeneratorContext } from './models.js'

interface CompressCSSClassesPluginOptions {
  safelist?: string[]
  compressedClasses?: Map<string, string>
  generator?: CSSClassGeneratorContext
}

type Rehype = Processor<Root, undefined, undefined, Root, string>
type CSSImporter = (id: string) => Promise<string | null>

type InternalClassesExpansions = Record<string, Set<string>>
export type ClassesExpansions = Record<string, string[]>

const cssClassAlphabet = 'abcdefghijklmnopqrstuvwxyz'
const cssClassAlphabetLength = cssClassAlphabet.length
const cssForbiddenClasses = new Set(['ad'])

function cssClass(context: CSSClassGeneratorContext): void {
  do {
    let i = ++context.counter
    let str = ''

    do {
      let index = i % cssClassAlphabetLength
      i = i / cssClassAlphabetLength

      if (index - 1 === -1) {
        index = cssClassAlphabetLength
        i--
      }

      str = cssClassAlphabet.charAt(index - 1) + str
    } while (i >= 1)

    context.name = `${context.prefix ?? ''}${str}`

    // Avoid some combinations
  } while (cssForbiddenClasses.has(context.name))
}

function extractCSSClassesPlugin(classes: Set<string>, _: object): Transformer {
  return (tree: Node) => {
    visit(tree, 'element', (node: Element) => {
      for (const klass of (node.properties?.className as string[]) ?? []) {
        classes.add(klass)
      }
    })
  }
}

export function compressCSSClasses(
  expanded: string[],
  compressedClasses: Map<string, string>,
  safelist: Set<string>,
  generator: CSSClassGeneratorContext
): string[] {
  const klasses = []

  for (const klass of expanded) {
    if (safelist.has(klass)) {
      // Do not compress safelist classes
      klasses.push(klass)
      compressedClasses.set(klass, klass)
    } else {
      // Generate a new compressed class
      if (!compressedClasses.has(klass)) {
        cssClass(generator)
        const layerIndex = klass.indexOf('@')
        const layer = layerIndex !== -1 ? klass.substring(0, layerIndex) + '@' : ''
        compressedClasses.set(klass, layer + generator.name)
      }

      // Replace the class
      klasses.push(compressedClasses.get(klass)!)
    }
  }

  return klasses
}

function compressCSSClassesPlugin(options: CompressCSSClassesPluginOptions = {}): Transformer {
  const compressedClasses = options.compressedClasses ?? new Map<string, string>()
  const safelist = new Set(options.safelist ?? [])
  const generator: CSSClassGeneratorContext = options.generator ?? { name: '', counter: 0 }

  return function (tree: Node) {
    visit(tree, 'element', (node: Element) => {
      const klasses = compressCSSClasses(
        (node.properties?.className as string[]) ?? [],
        compressedClasses,
        safelist,
        generator
      )

      if (klasses.length) {
        node.properties.className = klasses
      }
    })
  }
}

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

// TODO@PI: Replace with scraper
export async function prepareStyles(context: BuildContext, contents: string): Promise<string> {
  const cssClasses =
    typeof context.css.classes === 'function' ? await context.css.classes(context) : context.css.classes

  // First of all, extract classes and put them into the big list, which will only be processed once
  await rehype().use(extractCSSClassesPlugin.bind(null, cssClasses), {}).process(contents)

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

  // TODO@PI: Replace with scraper
  // First of all, replace all classes with their compressed version
  let pipeline = rehype()

  const compressedClasses =
    typeof context.css.compressedClasses === 'function'
      ? await context.css.compressedClasses(context)
      : context.css.compressedClasses

  if (!context.css.keepExpanded) {
    const generator =
      typeof context.css.generator === 'function' ? await context.css.generator(context) : context.css.generator

    pipeline = pipeline.use(compressCSSClassesPlugin, { safelist, compressedClasses, generator }) as unknown as Rehype
  }

  const compressedContents = await pipeline.use(stringify).process(contents)

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
