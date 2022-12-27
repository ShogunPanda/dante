import { resolve } from 'node:path'
import { isMainThread, workerData } from 'node:worker_threads'
import { Mode, rootDir } from './models.js'

const { build } = await import(resolve(rootDir, 'tmp/build/index.js'))

if (!isMainThread) {
  await build(workerData.mode as Mode)
}
