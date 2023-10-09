import fastifyStatic from '@fastify/static'
import fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import { BAD_REQUEST, NO_CONTENT, badRequestSchema } from 'http-errors-enhanced'
import EventEmitter from 'node:events'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Readable } from 'node:stream'
import type pino from 'pino'
import { rootDir } from './models.js'

interface BuildStatus {
  status: 'pending' | 'success' | 'failed'
  payload?: object
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

function syncHandler(this: FastifyInstance, _: FastifyRequest, reply: FastifyReply): void {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  reply
    .header('content-type', 'text/event-stream')
    .header('cache-control', 'no-cache')
    .send(new SynchronizationStream(buildEmitter))

  setTimeout(() => buildEmitter.emit('update'), 100)
}

export async function localServer(
  ip: string,
  port: number,
  logger?: pino.Logger,
  development?: boolean
): Promise<FastifyInstance> {
  const https = existsSync(resolve(rootDir, 'ssl'))
    ? {
        key: await readFile(resolve(rootDir, 'ssl/privkey.pem')),
        cert: await readFile(resolve(rootDir, 'ssl/cert.pem')),
        ca: await readFile(resolve(rootDir, 'ssl/chain.pem'))
      }
    : null

  const server = fastify({
    https,
    logger: logger ?? { transport: { target: 'pino-pretty' } },
    forceCloseConnections: true
  })

  await server.register(fastifyStatic, {
    root: resolve(rootDir, 'dist'),
    decorateReply: true
  })

  if (development) {
    server.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (buildStatus.status !== 'success' && request.url !== '/__status') {
        return reply.sendFile('__status.html', resolve(rootDir, 'tmp'))
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
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    reply.type('text/html').sendFile('404.html')
  })

  process.on('SIGINT', () => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    server.close()
  })

  return new Promise<FastifyInstance>((resolve, reject) => {
    server.listen({ host: ip, port }, (err: Error | null) => {
      if (err) {
        reject(err)
        return
      }

      resolve(server)
    })
  })
}
