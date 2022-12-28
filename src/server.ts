import fastifyStatic from '@fastify/static'
import fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import pino from 'pino'
import { rootDir } from './models.js'

export async function localServer(ip: string, port: number, logger?: pino.Logger): Promise<FastifyInstance> {
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
