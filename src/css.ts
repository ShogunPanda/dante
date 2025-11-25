import postcss, { type Plugin } from 'postcss'
import postcssDiscardComments from 'postcss-discard-comments'
import postcssMinifySelector from 'postcss-minify-selectors'
import postCssNested from 'postcss-nested'
import postcssNormalizeWhitespace from 'postcss-normalize-whitespace'
import { type BuildContext } from './models.ts'

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

export async function finalizePageCSS(
  context: BuildContext,
  html: string,
  css: string,
  postCssPlugins?: Plugin[]
): Promise<string> {
  if (!css?.trim().length || !html.includes('</head>')) {
    return html
  }

  const rules = [postCssNested(), ...(postCssPlugins ?? [])]

  if (context.isProduction) {
    rules.push(postcssDiscardComments({ removeAll: true }), postcssNormalizeWhitespace(), postcssMinifySelector())
  }

  const { css: finalCss } = await postcss(rules).process(css, {
    from: 'input.css',
    to: 'output.css'
  })

  return html.replace('</head>', `<style>${finalCss}</style></head>`)
}
