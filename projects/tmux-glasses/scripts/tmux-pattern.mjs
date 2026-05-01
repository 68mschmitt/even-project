import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const cols = numberFromEnv('TMUX_COLS', 57)
const rows = numberFromEnv('TMUX_ROWS', 10)
const target = process.env.TMUX_TARGET ?? process.env.TMUX_SESSION ?? 'even-glasses'
const args = new Set(process.argv.slice(2))

if (args.has('--send')) {
  sendToTmux()
} else {
  renderPattern(args.has('--hold'))
}

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function renderPattern(hold) {
  process.stdout.write('\x1b[2J\x1b[H')
  process.stdout.write(testCard().join('\n'))

  if (!hold) {
    process.stdout.write('\n')
    return
  }

  process.stdout.write('\x1b[?25l')
  const timer = setInterval(() => {}, 1 << 30)

  const restoreAndExit = () => {
    clearInterval(timer)
    process.stdout.write('\x1b[?25h\n')
    process.exit(0)
  }

  process.on('SIGINT', restoreAndExit)
  process.on('SIGTERM', restoreAndExit)
}

function sendToTmux() {
  const scriptPath = fileURLToPath(import.meta.url)
  const command = `node ${quoteShell(scriptPath)} --hold`
  const result = spawnSync('tmux', ['send-keys', '-t', target, command, 'C-m'], { encoding: 'utf8' })

  if (result.error) {
    console.error(`Could not send test card to tmux: ${result.error.message}`)
    process.exit(1)
  }

  if (result.status !== 0) {
    console.error(result.stderr || `tmux exited with status ${result.status}`)
    process.exit(result.status ?? 1)
  }

  console.log(`Sent ${cols}x${rows} text test card to tmux target ${target}.`)
  console.log('Press Ctrl-C in that tmux pane to return to the shell.')
}

function testCard() {
  if (rows <= 1) {
    return [ruler(cols)]
  }

  const inner = Math.max(0, cols - 2)
  const content = [
    `TMUX GLASSES ${cols}x${rows} TEXT TEST`,
    ruler(inner),
    'A....B....C....D....E....F....G....H....',
    '\\                                      /',
    ' \\          EDGE TO EDGE              / ',
    '  \\____ visible text bounds ________/  ',
    'bottom row touches viewport edge',
  ]

  while (content.length < rows - 2) {
    content.splice(content.length - 1, 0, '')
  }

  return [border(), ...content.slice(0, rows - 2).map(frame), border()]
}

function border() {
  if (cols === 1) {
    return '+'
  }

  return `+${'-'.repeat(Math.max(0, cols - 2))}+`
}

function frame(value) {
  if (cols === 1) {
    return '|'
  }

  const inner = cols - 2
  return `|${value.slice(0, inner).padEnd(inner, ' ')}|`
}

function ruler(width) {
  return Array.from({ length: width }, (_, index) => String(index % 10)).join('')
}

function quoteShell(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`
}
