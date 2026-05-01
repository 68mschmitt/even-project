import { spawnSync } from 'node:child_process'
import http from 'node:http'
import os from 'node:os'

const port = numberFromEnv('PORT', 8766)
const host = process.env.HOST ?? '127.0.0.1'
const cols = numberFromEnv('TMUX_COLS', 57)
const rows = numberFromEnv('TMUX_ROWS', 10)
const pollMs = numberFromEnv('TMUX_POLL_MS', 250)
const sessionName = process.env.TMUX_SESSION ?? 'even-glasses'
const explicitTarget = process.env.TMUX_TARGET
const target = explicitTarget ?? sessionName
const ownsSession = explicitTarget === undefined
const resizeOwnedSession = ownsSession && process.env.TMUX_RESIZE !== '0'
const shellPath = process.env.SHELL ?? '/bin/sh'
const prompt = process.env.TMUX_PROMPT ?? '$ '
const clients = new Set()

let lastSnapshot = ''

ensureTmuxSession()

const pollTimer = setInterval(() => {
  if (clients.size > 0) {
    broadcastIfChanged()
  }
}, pollMs)

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function runTmux(args) {
  const result = spawnSync('tmux', args, { encoding: 'utf8' })

  if (result.error) {
    return { ok: false, stdout: '', stderr: result.error.message }
  }

  if (result.status !== 0) {
    return {
      ok: false,
      stdout: result.stdout ?? '',
      stderr: result.stderr || `tmux exited with status ${result.status}`,
    }
  }

  return { ok: true, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

function ensureTmuxSession() {
  if (!ownsSession) {
    return
  }

  const existing = runTmux(['has-session', '-t', sessionName])

  if (!existing.ok) {
    const created = runTmux([
      'new-session',
      '-d',
      '-s',
      sessionName,
      '-x',
      String(cols),
      '-y',
      String(rows),
      promptedShellCommand(),
    ])

    if (!created.ok) {
      console.error(`Could not create tmux session ${sessionName}: ${created.stderr.trim()}`)
      return
    }
  }

  if (resizeOwnedSession) {
    runTmux(['resize-window', '-t', sessionName, '-x', String(cols), '-y', String(rows)])
  }
}

function promptedShellCommand() {
  const shellName = shellPath.split('/').at(-1) ?? shellPath
  const promptEnv = [
    `PS1=${quoteShell(prompt)}`,
    `PROMPT=${quoteShell(prompt)}`,
    'RPROMPT=',
    'RPS1=',
  ].join(' ')

  if (shellName === 'bash') {
    return `exec env ${promptEnv} ${quoteShell(shellPath)} --noprofile --norc -i`
  }

  if (shellName === 'zsh') {
    return `exec env ${promptEnv} ${quoteShell(shellPath)} -f`
  }

  return `exec env ${promptEnv} ${quoteShell(shellPath)} -i`
}

function quoteShell(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function capturePane() {
  if (resizeOwnedSession) {
    runTmux(['resize-window', '-t', sessionName, '-x', String(cols), '-y', String(rows)])
  }

  const captured = runTmux(['capture-pane', '-p', '-t', target])

  if (!captured.ok) {
    return {
      type: 'error',
      data: `tmux capture-pane failed for ${target}: ${captured.stderr.trim() || 'unknown error'}`,
    }
  }

  return {
    type: 'screen',
    data: {
      target,
      cols,
      rows,
      screen: fitScreen(splitLines(captured.stdout)),
      updatedAt: new Date().toISOString(),
    },
  }
}

function splitLines(value) {
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const withoutFinalNewline = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized
  return withoutFinalNewline.length === 0 ? [''] : withoutFinalNewline.split('\n')
}

function fitScreen(value) {
  const visible = value.slice(-rows).map(fitRow)

  while (visible.length < rows) {
    visible.push('')
  }

  return visible
}

function fitRow(value) {
  return value
    .replace(/\t/g, '    ')
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '')
    .slice(0, cols)
    .replace(/\s+$/g, '')
}

function sendEvent(response, payload) {
  response.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function broadcast(payload) {
  for (const client of clients) {
    sendEvent(client, payload)
  }
}

function broadcastIfChanged() {
  const payload = capturePane()
  const snapshot = payload.type === 'screen' ? payload.data.screen.join('\n') : payload.data

  if (snapshot === lastSnapshot) {
    return
  }

  lastSnapshot = snapshot
  broadcast(payload)
}

function writeCorsHeaders(response, contentType = 'text/plain') {
  response.writeHead(200, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-cache',
    'Content-Type': contentType,
  })
}

const server = http.createServer((request, response) => {
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
      data: `Streaming tmux target ${target} as ${cols}x${rows}`,
    })
    sendEvent(response, capturePane())

    request.on('close', () => {
      clients.delete(response)
    })
    return
  }

  if (request.method === 'GET' && request.url === '/health') {
    writeCorsHeaders(response, 'application/json')
    response.end(JSON.stringify({ ok: true, target, cols, rows }))
    return
  }

  response.writeHead(404, { 'Content-Type': 'text/plain' })
  response.end('not found')
})

server.listen(port, host, () => {
  const visibleHosts = host === '0.0.0.0' ? localAddresses() : [host]
  console.log(`tmux bridge streaming target ${target}`)
  console.log(`Viewport: ${cols}x${rows}`)
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
  clearInterval(pollTimer)
  server.close(() => {
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
