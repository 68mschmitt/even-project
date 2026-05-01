import { spawn } from 'node:child_process'
import http from 'node:http'
import os from 'node:os'
import xtermHeadless from '@xterm/headless'

const { Terminal } = xtermHeadless

const port = Number(process.env.PORT ?? 8765)
const host = process.env.HOST ?? '127.0.0.1'
const shellPath = process.env.SHELL ?? (process.platform === 'win32' ? 'powershell.exe' : '/bin/bash')
const shellArgs = process.platform === 'win32' ? ['-NoLogo'] : ['-i']
const terminalColumns = Number(process.env.TERM_COLS ?? 42)
const terminalRows = Number(process.env.TERM_ROWS ?? 9)
const useScriptPty = process.platform !== 'win32' && process.env.TERMINAL_BRIDGE_PTY !== '0'
const clients = new Set()

const terminal = new Terminal({
  allowProposedApi: true,
  cols: terminalColumns,
  rows: terminalRows,
  scrollback: 0,
  logLevel: 'off',
})

let screenBroadcastTimer = null

const shell = spawn(shellCommand(), shellCommandArgs(), {
  cwd: process.cwd(),
  env: {
    ...process.env,
    TERM: 'xterm-256color',
    COLUMNS: String(terminalColumns),
    LINES: String(terminalRows),
  },
  stdio: ['pipe', 'pipe', 'pipe'],
})

function shellCommand() {
  return useScriptPty ? 'script' : shellPath
}

function shellCommandArgs() {
  if (!useScriptPty) {
    return shellArgs
  }

  return [
    '-qfec',
    [
      `stty cols ${terminalColumns} rows ${terminalRows} 2>/dev/null`,
      'export TERM=xterm-256color',
      `export COLUMNS=${terminalColumns}`,
      `export LINES=${terminalRows}`,
      `exec ${quoteShell(shellPath)} -i`,
    ].join('; '),
    '/dev/null',
  ]
}

function quoteShell(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function sendEvent(response, payload) {
  response.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function broadcast(payload) {
  for (const client of clients) {
    sendEvent(client, payload)
  }
}

function terminalScreen() {
  const buffer = terminal.buffer.active
  const rows = []

  for (let row = 0; row < terminal.rows; row += 1) {
    const line = buffer.getLine(buffer.baseY + row)
    rows.push((line?.translateToString(false, 0, terminal.cols) ?? '').replace(/\s+$/g, ''))
  }

  const cursorY = Math.max(0, Math.min(terminal.rows - 1, buffer.cursorY))
  const cursorX = Math.max(0, Math.min(terminal.cols - 1, buffer.cursorX))
  const cursorRow = rows[cursorY] ?? ''
  const paddedCursorRow = cursorRow.padEnd(cursorX + 1, ' ')
  rows[cursorY] = `${paddedCursorRow.slice(0, cursorX)}_${paddedCursorRow.slice(cursorX + 1)}`.replace(/\s+$/g, '')

  return {
    cols: terminal.cols,
    rows: terminal.rows,
    cursorX: buffer.cursorX,
    cursorY: buffer.cursorY,
    bufferType: buffer.type,
    screen: rows,
  }
}

function broadcastScreen() {
  screenBroadcastTimer = null
  broadcast({ type: 'screen', data: terminalScreen() })
}

function scheduleScreenBroadcast() {
  if (screenBroadcastTimer !== null) {
    return
  }

  screenBroadcastTimer = setTimeout(broadcastScreen, 50)
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
    sendEvent(response, {
      type: 'status',
      data: `connected to ${shellPath} (${terminalColumns}x${terminalRows}${useScriptPty ? ', pty via script' : ''})`,
    })
    sendEvent(response, { type: 'screen', data: terminalScreen() })

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
  terminal.write(chunk, scheduleScreenBroadcast)
})

shell.stderr.on('data', (chunk) => {
  terminal.write(chunk, scheduleScreenBroadcast)
})

shell.on('exit', (code, signal) => {
  broadcast({ type: 'status', data: `shell exited with code ${code ?? 'none'} and signal ${signal ?? 'none'}` })
})

shell.on('error', (error) => {
  broadcast({ type: 'status', data: `failed to start terminal bridge shell: ${error.message}` })
})

server.listen(port, host, () => {
  const visibleHosts = host === '0.0.0.0' ? localAddresses() : [host]
  console.log(`Terminal bridge running with ${shellPath}`)
  console.log(`Viewport: ${terminalColumns}x${terminalRows}${useScriptPty ? ' with script PTY' : ''}`)
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
