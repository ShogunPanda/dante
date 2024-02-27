import postcss from 'postcss'
import postcssDiscardComments from 'postcss-discard-comments'
import postcssMinifySelector from 'postcss-minify-selectors'
import postcssNormalizeWhitespace from 'postcss-normalize-whitespace'
import { type BuildContext } from './models.js'

export type CSSClassToken = string | false | undefined | null

export function tokenizeCssClasses(klass: (CSSClassToken | CSSClassToken[])[]): string[] {
  return klass
    .flat(Number.MAX_SAFE_INTEGER)
    .filter(k => k)
    .map(k => (k as string).split(' '))
    .flat(Number.MAX_SAFE_INTEGER)
    .map(k => (k as string).trim())
    .filter(k => k)
}

export function cleanCssClasses(...klass: (CSSClassToken | CSSClassToken[])[]): string {
  return tokenizeCssClasses(klass).join(' ')
}

export async function finalizePageCSS(context: BuildContext, contents: string, originalCss: string): Promise<string> {
  // First of all, extract the classes
  const matcher = /<style data-dante-css-classes="([^"]+)"(?:\/>|>.*<\/style>)/
  const mo = contents.match(matcher)

  if (!mo) {
    return contents
  } else if (originalCss) {
    return contents.replace(matcher, '')
  }

  // @ts-expect-error Wrong typing
  const rules = [postCssNested()]

  if (context.isProduction) {
    rules.push(postcssDiscardComments({ removeAll: true }), postcssNormalizeWhitespace(), postcssMinifySelector())
  }

  const { css } = await postcss(rules).process(originalCss, {
    from: 'input.css',
    to: 'output.css'
  })

  return contents.replace(matcher, `<style>${css}</style>`)
}
