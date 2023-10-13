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
import { type VFile } from 'vfile'

interface CompressCSSClassesPluginOptions {
  safelist?: string[]
}

interface CSSClassGeneratorContext {
  name: string
  counter: number
}

type Rehype = Processor<Root, undefined, undefined, Root, string>
type CSSImporter = (id: string) => Promise<string | null>

export interface BuildContext {
  isProduction: boolean
  cssClasses: Set<string>
  safelist: string[]
  keepExpandedCss: boolean
  removeUnusedCss: boolean
  extensions?: any
}

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

    context.name = str

    // Avoid some combinations
  } while (cssForbiddenClasses.has(context.name))
}

function extractCSSClassesPlugin(_a: object): Transformer {
  return (tree: Node, file: VFile) => {
    const classes = new Set<string>()
    const compressedClasses = new Map<string, string>()

    file.data.classes = classes
    file.data.compression = compressedClasses

    visit(tree, 'element', (node: Element) => {
      for (const klass of (node.properties?.className as string[]) ?? []) {
        classes.add(klass)
      }
    })
  }
}

function compressCSSClassesPlugin(options: CompressCSSClassesPluginOptions = {}): Transformer {
  const safelist = new Set(options.safelist ?? [])

  return (tree: Node, file: VFile) => {
    const classGenerationContext: CSSClassGeneratorContext = { name: '', counter: 0 }
    const classes = new Set<string>()
    const compressedClasses = new Map<string, string>()

    file.data.classes = classes
    file.data.compression = compressedClasses

    visit(tree, 'element', (node: Element) => {
      const klasses = []

      for (const klass of (node.properties?.className as string[]) ?? []) {
        if (safelist.has(klass)) {
          // Do not compress safelist classes
          klasses.push(klass)
        } else {
          // Generate a new compressed class
          if (!compressedClasses.has(klass)) {
            cssClass(classGenerationContext)
            compressedClasses.set(klass, classGenerationContext.name)
          }

          // Replace the class
          klasses.push(compressedClasses.get(klass)!)
        }
      }

      if (klasses.length) {
        node.properties.className = klasses
      }
    })
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
    safelist: [/[#$:[\\]./],
    variables: false
  })

  return result[0].css
}

export async function loadClassesExpansion(css: string): Promise<ClassesExpansions> {
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
          // Split modifiers
          const [klass, ...modifiers] = selector.slice(1).split(':')

          if (!localClasses[klass]) {
            localClasses[klass] = new Set()
          }

          // No modifier, just set the rule untouch
          if (!modifiers.length) {
            for (const rule of rules) {
              localClasses[klass].add(rule)
            }
          } else {
            // For each modifier, apply the rule with the modifier as prefix
            for (const modifier of modifiers) {
              for (const rule of rules) {
                localClasses[klass].add([modifier, rule].filter(Boolean).join('-'))
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
    classes[compressed] = [...expanded]
  }

  return classes
}

export function expandClasses(classes: ClassesExpansions, klasses: string): string {
  // For each input class
  return klasses
    .split(' ')
    .flatMap(klass => {
      if (!classes[klass]) {
        return klass
      }

      return classes[klass]
    })
    .join(' ')
}

export function createBuildContext(isProduction: boolean, safelist: string[]): BuildContext {
  return { isProduction, cssClasses: new Set(), safelist, keepExpandedCss: false, removeUnusedCss: true }
}

export async function prepareStyles(context: BuildContext, contents: string): Promise<string> {
  // First of all, extract classes and put them into the big list, which will only be processed once
  const parsedContents = await rehype().use(extractCSSClassesPlugin, {}).process(contents)
  const allClasses = parsedContents.data.classes as Set<string>

  for (const klass of allClasses) {
    context.cssClasses.add(klass)
  }

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
export async function finalizePage(
  context: BuildContext,
  contents: string,
  stylesheet: string,
  safelist: string[] = []
): Promise<string> {
  const css = context.removeUnusedCss ? await purgeCss(contents, stylesheet) : stylesheet

  // First of all, replace all classes with their compressed version
  let pipeline = rehype()

  if (!context.keepExpandedCss) {
    pipeline = pipeline.use(compressCSSClassesPlugin, { safelist }) as unknown as Rehype
  }

  const compressedContents = await pipeline.use(stringify).process(contents)

  const compressedMap = compressedContents.data.compression as Map<string, string>

  // Now grab the CSS and replace the same classes again
  const postCssRules = []

  if (!context.keepExpandedCss) {
    postCssRules.push({
      postcssPlugin: 'dante.compressor',
      Rule(decl: Rule) {
        if (!decl.selector.startsWith('.')) {
          return
        }

        const newSelector: string[] = []
        for (const selector of decl.selector.split(/\s*,\s*/).map(s => s.trim())) {
          const [klass, modifier] = selector.slice(1).split(':')

          if (safelist.includes(klass)) {
            newSelector.push(selector)
            continue
          }

          const replacement = compressedMap.get(klass.replaceAll('\\', ''))

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
