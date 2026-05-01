import { spawn } from 'node:child_process'
import http from 'node:http'
import os from 'node:os'

const port = Number(process.env.PORT ?? 8765)
const host = process.env.HOST ?? '127.0.0.1'
const shellPath = process.env.SHELL ?? (process.platform === 'win32' ? 'powershell.exe' : '/bin/bash')
const shellArgs = process.platform === 'win32' ? ['-NoLogo'] : ['-i']
const clients = new Set()

const shell = spawn(shellPath, shellArgs, {
  cwd: process.cwd(),
  env: process.env,
  stdio: ['pipe', 'pipe', 'pipe'],
})

function sendEvent(response, payload) {
  response.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function broadcast(payload) {
  for (const client of clients) {
    sendEvent(client, payload)
  }
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []

    request.on('data', (chunk) => {
      chunks.push(chunk)
    })

    request.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'))
    })

    request.on('error', reject)
  })
}

function writeCorsHeaders(response, contentType = 'text/plain') {
  response.writeHead(200, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-cache',
    'Content-Type': contentType,
  })
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    writeCorsHeaders(response)
    response.end()
    return
  }

  if (request.method === 'GET' && request.url === '/events') {
    writeCorsHeaders(response, 'text/event-stream')
    response.write('retry: 1000\n\n')
    clients.add(response)
    sendEvent(response, { type: 'status', data: `connected to ${shellPath}` })

    request.on('close', () => {
      clients.delete(response)
    })
    return
  }

  if (request.method === 'POST' && request.url === '/input') {
    const input = await readRequestBody(request)
    shell.stdin.write(input)
    writeCorsHeaders(response)
    response.end('ok')
    return
  }

  if (request.method === 'GET' && request.url === '/health') {
    writeCorsHeaders(response, 'application/json')
    response.end(JSON.stringify({ ok: true, shell: shellPath }))
    return
  }

  response.writeHead(404, { 'Content-Type': 'text/plain' })
  response.end('not found')
})

shell.stdout.on('data', (chunk) => {
  broadcast({ type: 'output', data: chunk.toString('utf8') })
})

shell.stderr.on('data', (chunk) => {
  broadcast({ type: 'output', data: chunk.toString('utf8') })
})

shell.on('exit', (code, signal) => {
  broadcast({ type: 'status', data: `shell exited with code ${code ?? 'none'} and signal ${signal ?? 'none'}` })
})

server.listen(port, host, () => {
  const visibleHosts = host === '0.0.0.0' ? localAddresses() : [host]
  console.log(`Terminal bridge running with ${shellPath}`)
  console.log(`Local URL: http://${host}:${port}`)
  console.log(`Reachable URLs: ${visibleHosts.map((address) => `http://${address}:${port}`).join(', ')}`)
})

function localAddresses() {
  return Object.values(os.networkInterfaces())
    .flatMap((interfaces) => interfaces ?? [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address)
}

function shutdown() {
  shell.kill()
  server.close(() => {
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
