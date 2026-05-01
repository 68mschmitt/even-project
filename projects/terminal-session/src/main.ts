import {
  CreateStartUpPageContainer,
  type EvenHubEvent,
  OsEventTypeList,
  TextContainerProperty,
  TextContainerUpgrade,
  waitForEvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import './style.css'

const GLASSES_WIDTH = 576
const GLASSES_HEIGHT = 288
const TERMINAL_CONTAINER_ID = 1
const TERMINAL_CONTAINER_NAME = 'terminal'
const GLASSES_COLUMNS = 42
const GLASSES_TERMINAL_ROWS = 9
const MAX_BUFFER_LINES = 120
const PROMPT = 'g2@even:~$'
const DEFAULT_HOST_BRIDGE_URL = 'http://localhost:8765'

type Bridge = Awaited<ReturnType<typeof waitForEvenAppBridge>>
type Tone = 'idle' | 'success' | 'error'
type HostBridgeScreen = {
  cols: number
  rows: number
  cursorX: number
  cursorY: number
  bufferType: string
  screen: string[]
}
type HostBridgePayload =
  | { type: 'output' | 'status'; data: string }
  | { type: 'screen'; data: HostBridgeScreen }

const foundApp = document.querySelector<HTMLElement>('#app')

if (!foundApp) {
  throw new Error('Missing #app element')
}

const app = foundApp
app.tabIndex = -1

let bridge: Bridge | null = null
let hostBridgeEvents: EventSource | null = null
let pendingSyncTimer: number | null = null
let queuedHostInput = ''
let hostInputFlushTimer: number | null = null
let hostInputFlushInFlight = false

const state = {
  status: 'Waiting for the Even bridge. The terminal buffer is editable now.',
  tone: 'idle' as Tone,
  scrollback: 0,
  lastEvent: 'None yet',
  hostBridgeUrl: localStorage.getItem('terminalSession.hostBridgeUrl') ?? DEFAULT_HOST_BRIDGE_URL,
  hostBridgeConnected: false,
  hostBridgeStatus: 'not connected',
  keyboardCapture: false,
  liveScreen: null as HostBridgeScreen | null,
  lines: [
    'terminal-session v0.1',
    'Render command output on Even Realities G2.',
    'Connect the host bridge for a real shell, or use local render mode.',
    'Paste real terminal output below to mirror it.',
  ],
}

function stripAnsi(value: string) {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
}

function normalizeTerminalText(value: string) {
  return stripAnsi(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\t/g, '    ')
}

function normalizeLine(value: string) {
  return normalizeTerminalText(value).replace(/\n/g, '')
}

function escapeHtml(value: string) {
  const escapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }

  return value.replace(/[&<>"']/g, (character) => escapes[character])
}

function wrapLine(value: string) {
  const line = normalizeLine(value)

  if (line.length === 0) {
    return ['']
  }

  const rows: string[] = []

  for (let index = 0; index < line.length; index += GLASSES_COLUMNS) {
    rows.push(line.slice(index, index + GLASSES_COLUMNS))
  }

  return rows
}

function wrappedRows() {
  return state.lines.flatMap(wrapLine)
}

function maxScrollback() {
  return Math.max(0, wrappedRows().length - GLASSES_TERMINAL_ROWS)
}

function visibleTerminalRows() {
  if (state.hostBridgeConnected && state.scrollback === 0 && state.liveScreen) {
    return state.liveScreen.screen.slice(-GLASSES_TERMINAL_ROWS)
  }

  const rows = wrappedRows()
  state.scrollback = Math.min(state.scrollback, maxScrollback())

  const end = Math.max(0, rows.length - state.scrollback)
  const start = Math.max(0, end - GLASSES_TERMINAL_ROWS)

  return rows.slice(start, end)
}

function glassesContent() {
  if (state.hostBridgeConnected && state.scrollback === 0 && state.liveScreen) {
    return visibleTerminalRows().join('\n')
  }

  const mode = state.scrollback === 0 ? 'live' : `-${state.scrollback} rows`

  return [`TERM ${mode}`, ...visibleTerminalRows(), 'tap tail | swipe scroll'].join('\n')
}

function previewContent() {
  if (state.hostBridgeConnected && state.liveScreen) {
    return state.liveScreen.screen.join('\n')
  }

  return state.lines.slice(-30).join('\n')
}

function addTerminalLines(lines: string[]) {
  state.lines.push(...lines.map(normalizeLine))

  trimTerminalBuffer()
  state.scrollback = 0
}

function trimTerminalBuffer() {
  if (state.lines.length <= MAX_BUFFER_LINES) {
    return
  }

  state.lines.splice(0, state.lines.length - MAX_BUFFER_LINES)
}

function appendToLastLine(value: string) {
  if (state.lines.length === 0) {
    state.lines.push(value)
    return
  }

  state.lines[state.lines.length - 1] += value
}

function appendTerminalText(value: string) {
  const parts = normalizeTerminalText(value).split('\n')

  appendToLastLine(parts[0] ?? '')

  for (const part of parts.slice(1)) {
    state.lines.push(part)
  }

  trimTerminalBuffer()
  state.scrollback = 0
}

function demoLines() {
  return [
    '$ git status --short',
    ' M projects/terminal-session/src/main.ts',
    '?? projects/terminal-session/',
    '',
    '$ npm run build',
    '> terminal-session@0.1.0 build',
    '> tsc --noEmit && vite build',
    'vite building for production...',
    'transformed 5 modules',
    'built in 180ms',
  ]
}

function commandOutput(command: string) {
  const [name = '', ...args] = command.trim().split(/\s+/)

  switch (name) {
    case 'help':
      return [
        'Commands rendered locally: help, demo, date, pwd, whoami, echo, clear.',
        'Paste real terminal output in the output box to mirror it on glasses.',
        'Run npm run bridge:terminal to stream a host shell into this renderer.',
      ]
    case 'demo':
      return demoLines()
    case 'date':
      return [new Date().toLocaleString()]
    case 'pwd':
      return ['/projects/terminal-session']
    case 'whoami':
      return ['even-operator']
    case 'echo':
      return [args.join(' ')]
    default:
      return [
        `${name}: not executed in browser sandbox`,
        'Paste command output below, or connect the host bridge to stream a real terminal.',
      ]
  }
}

function hostBridgeBaseUrl() {
  return state.hostBridgeUrl.replace(/\/+$/, '')
}

function isTextEditingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  )
}

function keyboardInputFromEvent(event: KeyboardEvent) {
  if (event.isComposing || event.metaKey) {
    return null
  }

  if (event.ctrlKey && !event.altKey) {
    const key = event.key.toLowerCase()

    if (key === 'v') {
      return null
    }

    if (key.length === 1 && key >= 'a' && key <= 'z') {
      return String.fromCharCode(key.charCodeAt(0) - 96)
    }

    const controlInputs: Record<string, string> = {
      '[': '\x1b',
      ']': '\x1d',
      '\\': '\x1c',
      '6': '\x1e',
      '-': '\x1f',
      ' ': '\x00',
    }

    return controlInputs[key] ?? null
  }

  const specialInputs: Record<string, string> = {
    Enter: '\r',
    Backspace: '\x7f',
    Tab: '\t',
    Escape: '\x1b',
    ArrowUp: '\x1b[A',
    ArrowDown: '\x1b[B',
    ArrowRight: '\x1b[C',
    ArrowLeft: '\x1b[D',
    Home: '\x1b[H',
    End: '\x1b[F',
    Insert: '\x1b[2~',
    Delete: '\x1b[3~',
    PageUp: '\x1b[5~',
    PageDown: '\x1b[6~',
  }

  if (specialInputs[event.key]) {
    return specialInputs[event.key]
  }

  if (event.key.length === 1) {
    return event.altKey ? `\x1b${event.key}` : event.key
  }

  return null
}

function parseHostBridgePayload(value: string): HostBridgePayload | null {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    const type = parsed.type
    const data = parsed.data

    if ((type === 'output' || type === 'status') && typeof data === 'string') {
      return { type, data }
    }

    if (type === 'screen' && isHostBridgeScreen(data)) {
      return { type, data }
    }
  } catch {
    return { type: 'output', data: value }
  }

  return null
}

function isHostBridgeScreen(value: unknown): value is HostBridgeScreen {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.cols === 'number' &&
    typeof candidate.rows === 'number' &&
    typeof candidate.cursorX === 'number' &&
    typeof candidate.cursorY === 'number' &&
    typeof candidate.bufferType === 'string' &&
    Array.isArray(candidate.screen) &&
    candidate.screen.every((row) => typeof row === 'string')
  )
}

function queueTerminalSync(message: string) {
  if (pendingSyncTimer !== null) {
    window.clearTimeout(pendingSyncTimer)
  }

  pendingSyncTimer = window.setTimeout(() => {
    pendingSyncTimer = null
    syncTerminal(message)
  }, 75)
}

function disconnectHostBridge(message?: string) {
  hostBridgeEvents?.close()
  hostBridgeEvents = null
  state.hostBridgeConnected = false
  state.hostBridgeStatus = 'not connected'
  state.keyboardCapture = false
  state.liveScreen = null

  if (message) {
    addTerminalLines([`[host bridge] ${message}`])
    syncTerminal(message)
  }
}

function connectHostBridge(url: string) {
  disconnectHostBridge()

  state.hostBridgeUrl = url.trim() || DEFAULT_HOST_BRIDGE_URL
  localStorage.setItem('terminalSession.hostBridgeUrl', state.hostBridgeUrl)
  state.hostBridgeStatus = 'connecting'
  state.liveScreen = null
  addTerminalLines(['', `[host bridge] connecting to ${state.hostBridgeUrl}`, ''])
  syncTerminal('Connecting to host bridge')

  const source = new EventSource(`${hostBridgeBaseUrl()}/events`)
  hostBridgeEvents = source

  source.onopen = () => {
    state.hostBridgeConnected = true
    state.hostBridgeStatus = 'connected'
    syncTerminal('Host bridge connected. Commands will stream to the shell.')
  }

  source.onmessage = (event) => {
    const payload = parseHostBridgePayload(event.data)

    if (!payload) {
      return
    }

    if (payload.type === 'status') {
      addTerminalLines([`[host bridge] ${payload.data}`, ''])
    } else if (payload.type === 'output') {
      appendTerminalText(payload.data)
    } else if (payload.type === 'screen') {
      state.liveScreen = payload.data
      state.hostBridgeConnected = true
      state.hostBridgeStatus = `${payload.data.cols}x${payload.data.rows} live screen`
    }

    queueTerminalSync(payload.type === 'screen' ? 'Live terminal window updated' : 'Streaming host terminal output')
  }

  source.onerror = () => {
    state.hostBridgeConnected = false
    state.hostBridgeStatus = 'connection lost'
    state.keyboardCapture = false
    renderPhoneStatus('Host bridge connection lost. Check the bridge process and URL.', 'error')
  }
}

function setKeyboardCapture(enabled: boolean) {
  if (enabled && !state.hostBridgeConnected) {
    renderPhoneStatus('Connect the host bridge before starting keyboard capture.', 'error')
    return
  }

  state.keyboardCapture = enabled

  if (enabled) {
    app.focus()
  }

  renderPhoneStatus(enabled ? 'Keyboard capture is on. Type on this page to control the terminal.' : 'Keyboard capture is off.')
}

function queueHostBridgeInput(input: string) {
  if (!state.hostBridgeConnected) {
    renderPhoneStatus('Connect the host bridge before typing into the terminal.', 'error')
    return
  }

  queuedHostInput += input

  if (hostInputFlushTimer !== null) {
    return
  }

  hostInputFlushTimer = window.setTimeout(() => {
    hostInputFlushTimer = null
    void flushQueuedHostInput()
  }, 12)
}

async function flushQueuedHostInput() {
  if (hostInputFlushInFlight || queuedHostInput.length === 0) {
    return
  }

  hostInputFlushInFlight = true
  const input = queuedHostInput
  queuedHostInput = ''

  try {
    await sendHostBridgeInput(input)
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    renderPhoneStatus(`Failed to send keyboard input to host bridge: ${errorMessage}`, 'error')
  } finally {
    hostInputFlushInFlight = false

    if (queuedHostInput.length > 0) {
      void flushQueuedHostInput()
    }
  }
}

async function sendHostBridgeInput(input: string) {
  const response = await fetch(`${hostBridgeBaseUrl()}/input`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
    },
    body: input,
  })

  if (!response.ok) {
    throw new Error(`Host bridge returned ${response.status}`)
  }
}

function handleKeyboardCapture(event: KeyboardEvent) {
  if (!state.keyboardCapture || !state.hostBridgeConnected || isTextEditingTarget(event.target)) {
    return
  }

  const input = keyboardInputFromEvent(event)

  if (input === null) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  queueHostBridgeInput(input)
}

function handleKeyboardPaste(event: ClipboardEvent) {
  if (!state.keyboardCapture || !state.hostBridgeConnected || isTextEditingTarget(event.target)) {
    return
  }

  const pastedText = event.clipboardData?.getData('text/plain') ?? ''

  if (pastedText.length === 0) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  queueHostBridgeInput(pastedText)
}

function renderPhoneStatus(message: string = state.status, tone: Tone = state.tone) {
  state.status = message
  state.tone = tone

  app.innerHTML = `
    <section class="terminal-shell ${tone}">
      <div class="hero">
        <p class="eyebrow">Even Realities G2</p>
        <h1>Terminal Session</h1>
        <p class="status">${escapeHtml(message)}</p>
      </div>

      <section class="panel glass-panel" aria-label="Glasses terminal preview">
        <div class="panel-bar">
          <span>glasses render</span>
          <span>${escapeHtml(state.liveScreen && state.scrollback === 0 ? `${state.liveScreen.cols}x${state.liveScreen.rows} live screen` : state.scrollback === 0 ? 'live tail' : `scrollback -${state.scrollback}`)}</span>
        </div>
        <pre class="glass-preview">${escapeHtml(glassesContent())}</pre>
      </section>

      <section class="panel controls" aria-label="Terminal controls">
        <form class="bridge-form" data-bridge-form>
          <label for="bridge-url">Host Bridge URL</label>
          <input id="bridge-url" name="bridge-url" autocomplete="off" spellcheck="false" value="${escapeHtml(state.hostBridgeUrl)}" />
          <button type="submit">${state.hostBridgeConnected ? 'Reconnect' : 'Connect'}</button>
        </form>

        <div class="bridge-status">
          <span>Host bridge: ${escapeHtml(state.hostBridgeStatus)}</span>
          <button type="button" data-disconnect-bridge ${state.hostBridgeConnected || hostBridgeEvents ? '' : 'disabled'}>Disconnect</button>
        </div>

        <div class="capture-panel ${state.keyboardCapture ? 'active' : ''}">
          <button type="button" data-keyboard-capture ${state.hostBridgeConnected ? '' : 'disabled'}>${state.keyboardCapture ? 'Stop Keyboard Capture' : 'Start Keyboard Capture'}</button>
          <span>${escapeHtml(state.keyboardCapture ? 'Typing on this page goes straight to the bridged terminal.' : 'Start capture to use your PC keyboard as terminal input.')}</span>
        </div>

        <form class="command-row" data-command-form>
          <label for="command">Command</label>
          <input id="command" name="command" autocomplete="off" spellcheck="false" placeholder="${state.hostBridgeConnected ? 'ls -la' : 'demo'}" />
          <button type="submit">${state.hostBridgeConnected ? 'Send' : 'Render'}</button>
        </form>

        <form class="output-form" data-output-form>
          <label for="output">Paste Terminal Output</label>
          <textarea id="output" name="output" rows="5" spellcheck="false" placeholder="$ npm test&#10;✓ all tests passed"></textarea>
          <button type="submit">Append Output</button>
        </form>

        <div class="button-row">
          <button type="button" data-demo>Demo Output</button>
          <button type="button" data-clear>Clear</button>
        </div>
      </section>

      <section class="panel session-panel" aria-label="Terminal session buffer">
        <div class="panel-bar">
          <span>${state.liveScreen ? 'live terminal window' : 'session buffer'}</span>
          <span>${escapeHtml(state.liveScreen ? `${state.liveScreen.bufferType} buffer` : `${state.lines.length} lines`)}</span>
        </div>
        <pre class="session-preview">${escapeHtml(previewContent())}</pre>
      </section>

      <p class="hint">Glasses input: tap jumps to the live terminal window, swipe up/down scrolls through text history.</p>
    </section>
  `

  bindControls()
}

function syncTerminal(message: string, tone: Tone = bridge ? 'success' : 'idle') {
  void updateGlasses(message, tone).catch((error: unknown) => {
    const errorMessage = error instanceof Error ? error.message : String(error)
    renderPhoneStatus(`Failed to update glasses: ${errorMessage}`, 'error')
  })
}

function bindControls() {
  const bridgeForm = app.querySelector<HTMLFormElement>('[data-bridge-form]')
  const bridgeUrlInput = app.querySelector<HTMLInputElement>('#bridge-url')
  const disconnectBridgeButton = app.querySelector<HTMLButtonElement>('[data-disconnect-bridge]')
  const keyboardCaptureButton = app.querySelector<HTMLButtonElement>('[data-keyboard-capture]')
  const commandForm = app.querySelector<HTMLFormElement>('[data-command-form]')
  const commandInput = app.querySelector<HTMLInputElement>('#command')
  const outputForm = app.querySelector<HTMLFormElement>('[data-output-form]')
  const outputInput = app.querySelector<HTMLTextAreaElement>('#output')
  const demoButton = app.querySelector<HTMLButtonElement>('[data-demo]')
  const clearButton = app.querySelector<HTMLButtonElement>('[data-clear]')

  bridgeForm?.addEventListener('submit', (event) => {
    event.preventDefault()
    connectHostBridge(bridgeUrlInput?.value ?? DEFAULT_HOST_BRIDGE_URL)
  })

  disconnectBridgeButton?.addEventListener('click', () => {
    disconnectHostBridge('Host bridge disconnected')
  })

  keyboardCaptureButton?.addEventListener('click', () => {
    setKeyboardCapture(!state.keyboardCapture)
  })

  commandForm?.addEventListener('submit', (event) => {
    event.preventDefault()

    const command = commandInput?.value.trim() ?? ''

    if (command.length === 0) {
      return
    }

    if (command === 'clear') {
      state.lines = []
      state.scrollback = 0
      syncTerminal('Terminal cleared')

      if (state.hostBridgeConnected) {
        queueHostBridgeInput(`${command}\n`)
      }

      return
    }

    if (state.hostBridgeConnected) {
      syncTerminal(`Sent to host bridge: ${command}`)
      queueHostBridgeInput(`${command}\n`)
      return
    }

    addTerminalLines([`${PROMPT} ${command}`, ...commandOutput(command)])
    syncTerminal(`Rendered command: ${command}`)
  })

  outputForm?.addEventListener('submit', (event) => {
    event.preventDefault()

    const output = outputInput?.value ?? ''

    if (output.trim().length === 0) {
      return
    }

    addTerminalLines(output.split('\n'))
    syncTerminal('Appended pasted terminal output')
  })

  demoButton?.addEventListener('click', () => {
    addTerminalLines(demoLines())
    syncTerminal('Rendered demo terminal output')
  })

  clearButton?.addEventListener('click', () => {
    state.lines = []
    state.scrollback = 0
    syncTerminal('Terminal cleared')
  })
}

function eventTypeFrom(event: EvenHubEvent) {
  if (event.textEvent) {
    return event.textEvent.eventType ?? OsEventTypeList.CLICK_EVENT
  }

  if (event.sysEvent) {
    return event.sysEvent.eventType ?? null
  }

  return null
}

function eventLabel(eventType: OsEventTypeList) {
  switch (eventType) {
    case OsEventTypeList.CLICK_EVENT:
      return 'Tap'
    case OsEventTypeList.DOUBLE_CLICK_EVENT:
      return 'Double tap'
    case OsEventTypeList.SCROLL_TOP_EVENT:
      return 'Swipe up'
    case OsEventTypeList.SCROLL_BOTTOM_EVENT:
      return 'Swipe down'
    case OsEventTypeList.FOREGROUND_ENTER_EVENT:
      return 'Foreground enter'
    case OsEventTypeList.FOREGROUND_EXIT_EVENT:
      return 'Foreground exit'
    case OsEventTypeList.ABNORMAL_EXIT_EVENT:
      return 'Abnormal exit'
    default:
      return `Unknown event ${eventType}`
  }
}

function applyEvent(eventType: OsEventTypeList) {
  state.lastEvent = eventLabel(eventType)

  switch (eventType) {
    case OsEventTypeList.CLICK_EVENT:
    case OsEventTypeList.DOUBLE_CLICK_EVENT:
      state.scrollback = 0
      state.status = state.liveScreen ? 'Jumped to live terminal window' : 'Jumped to live terminal tail'
      break
    case OsEventTypeList.SCROLL_TOP_EVENT:
      state.scrollback = Math.min(state.scrollback + GLASSES_TERMINAL_ROWS, maxScrollback())
      state.status = `Scrolled back ${state.scrollback} rows`
      break
    case OsEventTypeList.SCROLL_BOTTOM_EVENT:
      state.scrollback = Math.max(0, state.scrollback - GLASSES_TERMINAL_ROWS)
      state.status = state.scrollback === 0 ? 'Back at live terminal window' : `Scrolled back ${state.scrollback} rows`
      break
    case OsEventTypeList.FOREGROUND_ENTER_EVENT:
      state.status = 'Terminal Session is in foreground'
      break
    case OsEventTypeList.FOREGROUND_EXIT_EVENT:
      state.status = 'Terminal Session moved to background'
      break
    case OsEventTypeList.ABNORMAL_EXIT_EVENT:
      state.status = 'Glasses disconnected unexpectedly'
      break
    default:
      state.status = 'Unhandled glasses event received'
      break
  }
}

async function createStartupPage(connectedBridge: Bridge) {
  const terminalText = new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: GLASSES_WIDTH,
    height: GLASSES_HEIGHT,
    borderWidth: 0,
    borderColor: 5,
    paddingLength: 8,
    containerID: TERMINAL_CONTAINER_ID,
    containerName: TERMINAL_CONTAINER_NAME,
    content: glassesContent(),
    isEventCapture: 1,
  })

  const result = await connectedBridge.createStartUpPageContainer(
    new CreateStartUpPageContainer({
      containerTotalNum: 1,
      textObject: [terminalText],
    }),
  )

  if (result !== 0) {
    throw new Error(`createStartUpPageContainer failed with code ${result}`)
  }
}

async function updateGlasses(message: string, tone: Tone = bridge ? 'success' : 'idle') {
  renderPhoneStatus(message, tone)

  if (!bridge) {
    return
  }

  const content = glassesContent()
  await bridge.textContainerUpgrade(
    new TextContainerUpgrade({
      containerID: TERMINAL_CONTAINER_ID,
      containerName: TERMINAL_CONTAINER_NAME,
      content,
      contentOffset: 0,
      contentLength: content.length,
    }),
  )
}

async function main() {
  renderPhoneStatus()

  const connectedBridge = await waitForEvenAppBridge()
  bridge = connectedBridge
  renderPhoneStatus('Bridge connected. Creating terminal page...', 'success')

  await createStartupPage(connectedBridge)
  await updateGlasses('Connected. Terminal buffer is mirrored on the glasses.', 'success')

  connectedBridge.onEvenHubEvent((event: EvenHubEvent) => {
    const eventType = eventTypeFrom(event)

    if (eventType === null) {
      return
    }

    applyEvent(eventType)
    syncTerminal(`${state.status} (${state.lastEvent})`, 'success')
  })
}

document.addEventListener('keydown', handleKeyboardCapture, true)
document.addEventListener('paste', handleKeyboardPaste, true)

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  renderPhoneStatus(`Startup failed: ${message}`, 'error')
})
