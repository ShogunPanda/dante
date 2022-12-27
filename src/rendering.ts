import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export function hash(contents: Buffer | string): string {
  return createHash('md5').update(contents).digest('hex').slice(0, 10)
}

export async function createFile(
  baseDir: string,
  relativePath: string,
  contents: string | Buffer | (() => string | Buffer | Promise<string | Buffer>),
  encoding?: BufferEncoding
): Promise<string> {
  if (typeof contents === 'function') {
    contents = await contents()
  }

  let computedHash = null
  if (relativePath.includes('$hash')) {
    computedHash = hash(contents)
    relativePath = relativePath.replace('$hash', computedHash)
  }

  await writeFile(resolve(baseDir, relativePath), contents, encoding)
  return '/' + relativePath
}
