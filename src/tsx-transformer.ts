import { readFileSync } from 'node:fs'
import {
  registerHooks,
  type LoadFnOutput,
  type LoadHookContext,
  type ResolveFnOutput,
  type ResolveHookContext
} from 'node:module'
import { fileURLToPath } from 'url'
import { transformSync } from 'oxc-transform'

const tsxCache: Record<string, string> = {}

export function resolve(
  url: string,
  context: ResolveHookContext,
  nextResolve: (url: string, context: ResolveHookContext) => ResolveFnOutput
): ResolveFnOutput {
  if (!url.endsWith('.tsx')) {
    return nextResolve(url, context)
  }

  return {
    format: 'module',
    url: new URL(url, context.parentURL).toString(),
    shortCircuit: true
  }
}

export function load(
  url: string,
  context: LoadHookContext,
  nextLoad: (url: string, context: Partial<LoadHookContext>) => LoadFnOutput
): LoadFnOutput {
  if (!url.endsWith('.tsx')) {
    return nextLoad(url, context)
  }

  if (!tsxCache[url]) {
    const result = transformSync(url, readFileSync(fileURLToPath(url), 'utf-8'), {
      jsx: {
        importSource: 'preact'
      }
    })

    tsxCache[url] = result.code
  }

  return {
    format: 'module',
    source: tsxCache[url],
    shortCircuit: true
  }
}

registerHooks({ resolve, load })
