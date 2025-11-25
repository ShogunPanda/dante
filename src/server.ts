import fastifyStatic from '@fastify/static'
import fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import { BAD_REQUEST, NOT_FOUND, NO_CONTENT, badRequestSchema } from 'http-errors-enhanced'
import EventEmitter from 'node:events'
import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Readable } from 'node:stream'
import type pino from 'pino'
import { rootDir, serverFilePath, type ServerFunction } from './models.ts'

declare module 'fastify' {
  interface FastifyInstance {
    rootDir: string
  }
}

interface BuildStatus {
  status: 'pending' | 'success' | 'failed'
  payload?: object
}

interface ServerOptions {
  ip: string
  port: number
  logger: pino.Logger | false
  isProduction?: boolean
  staticDir: string
}

const defaultServerOptions: ServerOptions = {
  ip: '::',
  port: 0,
  logger: false,
  isProduction: true,
  staticDir: 'dist/html'
}

class SynchronizationEventEmitter extends EventEmitter {
  public closed: boolean

  constructor(options?: { captureRejections?: boolean }) {
    super(options)

    this.closed = false
    this.once('close', () => {
      this.closed = true
    })
  }

  close(): void {
    this.emit('close')
  }

  get isClosed(): boolean {
    return this.closed
  }
}

class SynchronizationStream extends Readable {
  private readonly emitter: SynchronizationEventEmitter

  constructor(emitter: SynchronizationEventEmitter) {
    super()

    emitter.on('update', () => {
      this.push(`event: sync\ndata: ${JSON.stringify(buildStatus)}\n\n`)
    })

    emitter.on('close', () => {
      this.push('event: close\ndata:\n\n')
    })

    this.emitter = emitter
    this.push('retry: 10000\n\n')
  }

  _read(): void {
    if (this.emitter.isClosed) {
      this.push(null)
    }
  }
}

const buildStatus: BuildStatus = { status: 'pending' }
const buildEmitter = new SynchronizationEventEmitter()

export function notifyBuildStatus(status: 'pending' | 'success' | 'failed', payload?: object): void {
  buildStatus.status = status
  buildStatus.payload = payload
  buildEmitter.emit('update')
}

function syncHandler(_: FastifyRequest, reply: FastifyReply): void {
  reply
    .header('content-type', 'text/event-stream')
    .header('cache-control', 'no-cache')
    .send(new SynchronizationStream(buildEmitter))

  setTimeout(() => buildEmitter.emit('update'), 100)
}

export async function localServer(options?: Partial<ServerOptions>): Promise<FastifyInstance> {
  const { ip, port, logger, staticDir, isProduction } = { ...defaultServerOptions, ...options }

  const https = existsSync(resolve(rootDir, 'ssl'))
    ? {
        key: await readFile(resolve(rootDir, 'ssl/privkey.pem')),
        cert: await readFile(resolve(rootDir, 'ssl/cert.pem')),
        ca: await readFile(resolve(rootDir, 'ssl/chain.pem'))
      }
    : null

  let serverDir: string = ''
  let setupServer: ServerFunction | undefined

  if (existsSync(serverFilePath())) {
    const serverExport = await import(serverFilePath())
    setupServer = serverExport.setupServer
  }

  const server = fastify({
    https,
    logger: logger ?? { transport: { target: 'pino-pretty' } },
    forceCloseConnections: true
  }) as unknown as FastifyInstance

  if (setupServer && typeof setupServer === 'function') {
    const result = await setupServer(server, isProduction)

    if (result?.directory) {
      serverDir = result.directory
    }
  }

  const root = resolve(...[staticDir, serverDir].filter(s => s))
  await mkdir(root, { recursive: true })

  await server.register(fastifyStatic, { root, decorateReply: true, index: ['index.html', 'index.htm'] })
  server.decorate('rootDir', root)

  if (!isProduction) {
    let page = await readFile(new URL('assets/status-page.html', import.meta.url), 'utf8')
    const client = await readFile(new URL('assets/status-page.js', import.meta.url), 'utf8')
    page = page.replace('</body>', `<script type="text/javascript">${client}</script></body>`)

    server.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (buildStatus.status !== 'success' && request.url !== '/__status') {
        return reply.type('text/html').send(page)
      }
    })

    server.route({
      method: 'GET',
      url: '/__status',
      handler: syncHandler,
      schema: {
        response: {
          [NO_CONTENT]: {},
          [BAD_REQUEST]: badRequestSchema
        }
      }
    })
  }

  server.setNotFoundHandler(function (_: FastifyRequest, reply: FastifyReply) {
    reply.code(NOT_FOUND).type('text/html').sendFile('404.html')
  })

  process.on('SIGINT', () => {
    server.close()
  })

  return new Promise<FastifyInstance>((resolve, reject) => {
    server.listen(
      {
        host: ip,
        port,
        listenTextResolver(address: string): string {
          return `Server listening at ${address}.`
        }
      },
      (err: Error | null) => {
        if (err) {
          reject(err)
          return
        }

        resolve(server as unknown as FastifyInstance)
      }
    )
  })
}
