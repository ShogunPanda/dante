import type { Visitor } from 'lightningcss'
import type { BuildContext } from './models.ts'
import { transform } from 'lightningcss'

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

export function finalizePageCSS(context: BuildContext, html: string, css: string, visitor?: Visitor<any>): string {
  if (!css?.trim().length || !html.includes('</head>')) {
    return html
  }

  const { code: finalCss } = transform({
    filename: 'style.css',
    code: Buffer.from(css),
    minify: context.isProduction,
    sourceMap: false,
    customAtRules: {
      color: {
        prelude: '<custom-ident>+'
      }
    },
    visitor
  })

  return html.replace('</head>', `<style>${finalCss.toString()}</style></head>`)
}
