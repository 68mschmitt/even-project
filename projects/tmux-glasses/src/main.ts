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
const VIEWPORT_COLUMNS = 42
const VIEWPORT_ROWS = 9
const TMUX_CONTAINER_ID = 1
const TMUX_CONTAINER_NAME = 'tmux'
const DEFAULT_BRIDGE_URL = 'http://localhost:8766'

type Bridge = Awaited<ReturnType<typeof waitForEvenAppBridge>>
type Tone = 'idle' | 'success' | 'error'
type BridgeScreen = {
  target: string
  cols: number
  rows: number
  screen: string[]
  updatedAt: string
}
type BridgePayload =
  | { type: 'screen'; data: BridgeScreen }
  | { type: 'status'; data: string }
  | { type: 'error'; data: string }

const foundApp = document.querySelector<HTMLElement>('#app')

if (!foundApp) {
  throw new Error('Missing #app element')
}

const app = foundApp
let bridge: Bridge | null = null
let tmuxEvents: EventSource | null = null
let pendingGlassesSync: number | null = null

const state = {
  status: 'Waiting for the Even bridge. Start the tmux bridge when ready.',
  tone: 'idle' as Tone,
  connected: false,
  target: 'not connected',
  lastUpdate: 'none',
  bridgeUrl: localStorage.getItem('tmuxGlasses.bridgeUrl') ?? DEFAULT_BRIDGE_URL,
  screen: initialScreen(),
}

function initialScreen() {
  return fitScreen([
    'tmux -> Even G2',
    '',
    '1. npm run bridge:tmux',
    '2. Connect bridge URL',
    '',
    'Default target:',
    'tmux session even-glasses',
    '',
    'Viewport: 42 cols x 9 rows',
  ])
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

function fitRow(value: string) {
  return value
    .replace(/\t/g, '    ')
    .replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '')
    .slice(0, VIEWPORT_COLUMNS)
    .replace(/\s+$/g, '')
}

function fitScreen(rows: string[]) {
  const fitted = rows.slice(-VIEWPORT_ROWS).map(fitRow)

  while (fitted.length < VIEWPORT_ROWS) {
    fitted.push('')
  }

  return fitted
}

function glassesContent() {
  return fitScreen(state.screen).join('\n')
}

function bridgeBaseUrl() {
  return state.bridgeUrl.replace(/\/+$/, '')
}

function parseBridgePayload(value: string): BridgePayload | null {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    const type = parsed.type
    const data = parsed.data

    if ((type === 'status' || type === 'error') && typeof data === 'string') {
      return { type, data }
    }

    if (type === 'screen' && isBridgeScreen(data)) {
      return { type, data }
    }
  } catch {
    return { type: 'error', data: value }
  }

  return null
}

function isBridgeScreen(value: unknown): value is BridgeScreen {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Record<string, unknown>

  return (
    typeof candidate.target === 'string' &&
    typeof candidate.cols === 'number' &&
    typeof candidate.rows === 'number' &&
    typeof candidate.updatedAt === 'string' &&
    Array.isArray(candidate.screen) &&
    candidate.screen.every((row) => typeof row === 'string')
  )
}

function renderPhone(message: string = state.status, tone: Tone = state.tone) {
  state.status = message
  state.tone = tone

  app.innerHTML = `
    <section class="tmux-shell ${tone}">
      <section class="hero">
        <p class="eyebrow">Even Realities G2</p>
        <h1>tmux Glasses</h1>
        <p class="status">${escapeHtml(message)}</p>
      </section>

      <section class="panel preview-panel" aria-label="Glasses viewport preview">
        <div class="panel-bar">
          <span>glasses viewport</span>
          <span>${VIEWPORT_COLUMNS}x${VIEWPORT_ROWS}</span>
        </div>
        <pre class="glass-preview">${escapeHtml(glassesContent())}</pre>
      </section>

      <section class="panel controls" aria-label="tmux bridge controls">
        <form class="bridge-form" data-bridge-form>
          <label for="bridge-url">tmux Bridge URL</label>
          <input id="bridge-url" name="bridge-url" autocomplete="off" spellcheck="false" value="${escapeHtml(state.bridgeUrl)}" />
          <button type="submit">${state.connected ? 'Reconnect' : 'Connect'}</button>
        </form>

        <dl class="facts">
          <div><dt>Target</dt><dd>${escapeHtml(state.target)}</dd></div>
          <div><dt>Last update</dt><dd>${escapeHtml(state.lastUpdate)}</dd></div>
          <div><dt>Bridge</dt><dd>${escapeHtml(state.connected ? 'connected' : 'not connected')}</dd></div>
        </dl>

        <div class="button-row">
          <button type="button" data-disconnect ${tmuxEvents ? '' : 'disabled'}>Disconnect</button>
          <button type="button" data-demo>Show Demo</button>
        </div>
      </section>

      <p class="hint">The bridge captures the current tmux pane, crops it to ${VIEWPORT_COLUMNS} columns, and sends exactly ${VIEWPORT_ROWS} rows so the glasses stay readable.</p>
    </section>
  `

  bindControls()
}

function bindControls() {
  const bridgeForm = app.querySelector<HTMLFormElement>('[data-bridge-form]')
  const bridgeUrlInput = app.querySelector<HTMLInputElement>('#bridge-url')
  const disconnectButton = app.querySelector<HTMLButtonElement>('[data-disconnect]')
  const demoButton = app.querySelector<HTMLButtonElement>('[data-demo]')

  bridgeForm?.addEventListener('submit', (event) => {
    event.preventDefault()
    connectTmuxBridge(bridgeUrlInput?.value ?? DEFAULT_BRIDGE_URL)
  })

  disconnectButton?.addEventListener('click', () => {
    disconnectTmuxBridge('tmux bridge disconnected')
  })

  demoButton?.addEventListener('click', () => {
    state.connected = false
    state.target = 'demo'
    state.lastUpdate = new Date().toLocaleTimeString()
    state.screen = fitScreen([
      '$ tmux ls',
      'even-glasses: 1 windows',
      '',
      '$ git status --short',
      ' M projects/tmux-glasses/src/main.ts',
      '?? projects/tmux-glasses/',
      '',
      '$ npm run build',
      'vite built in 180ms_',
    ])
    queueGlassesSync('Rendered demo tmux viewport')
  })
}

function connectTmuxBridge(url: string) {
  disconnectTmuxBridge()

  state.bridgeUrl = url.trim() || DEFAULT_BRIDGE_URL
  localStorage.setItem('tmuxGlasses.bridgeUrl', state.bridgeUrl)
  state.connected = false
  state.target = 'connecting'
  state.lastUpdate = 'none'
  renderPhone(`Connecting to ${state.bridgeUrl}`)

  const source = new EventSource(`${bridgeBaseUrl()}/events`)
  tmuxEvents = source

  source.onopen = () => {
    state.connected = true
    renderPhone('tmux bridge connected', 'success')
  }

  source.onmessage = (event) => {
    const payload = parseBridgePayload(event.data)

    if (!payload) {
      return
    }

    if (payload.type === 'status') {
      state.connected = true
      renderPhone(payload.data, 'success')
      return
    }

    if (payload.type === 'error') {
      state.connected = false
      renderPhone(payload.data, 'error')
      return
    }

    state.connected = true
    state.target = payload.data.target
    state.lastUpdate = new Date(payload.data.updatedAt).toLocaleTimeString()
    state.screen = fitScreen(payload.data.screen)
    queueGlassesSync(`Mirroring tmux target ${payload.data.target}`)
  }

  source.onerror = () => {
    state.connected = false
    renderPhone('tmux bridge connection lost. Check the bridge process and URL.', 'error')
  }
}

function disconnectTmuxBridge(message?: string) {
  tmuxEvents?.close()
  tmuxEvents = null
  state.connected = false

  if (message) {
    renderPhone(message)
  }
}

function queueGlassesSync(message: string) {
  if (pendingGlassesSync !== null) {
    window.clearTimeout(pendingGlassesSync)
  }

  pendingGlassesSync = window.setTimeout(() => {
    pendingGlassesSync = null
    void updateGlasses(message, bridge ? 'success' : 'idle')
  }, 75)
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

async function createStartupPage(connectedBridge: Bridge) {
  const tmuxText = new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: GLASSES_WIDTH,
    height: GLASSES_HEIGHT,
    borderWidth: 0,
    borderColor: 5,
    paddingLength: 8,
    containerID: TMUX_CONTAINER_ID,
    containerName: TMUX_CONTAINER_NAME,
    content: glassesContent(),
    isEventCapture: 1,
  })

  const result = await connectedBridge.createStartUpPageContainer(
    new CreateStartUpPageContainer({
      containerTotalNum: 1,
      textObject: [tmuxText],
    }),
  )

  if (result !== 0) {
    throw new Error(`createStartUpPageContainer failed with code ${result}`)
  }
}

async function updateGlasses(message: string, tone: Tone = bridge ? 'success' : 'idle') {
  renderPhone(message, tone)

  if (!bridge) {
    return
  }

  const content = glassesContent()
  await bridge.textContainerUpgrade(
    new TextContainerUpgrade({
      containerID: TMUX_CONTAINER_ID,
      containerName: TMUX_CONTAINER_NAME,
      content,
      contentOffset: 0,
      contentLength: content.length,
    }),
  )
}

async function main() {
  renderPhone()

  const connectedBridge = await waitForEvenAppBridge()
  bridge = connectedBridge
  renderPhone('Even bridge connected. Creating tmux viewport...', 'success')

  await createStartupPage(connectedBridge)
  await updateGlasses('Connected. Start or connect the tmux bridge.', 'success')

  connectedBridge.onEvenHubEvent((event: EvenHubEvent) => {
    const eventType = eventTypeFrom(event)

    if (eventType === null) {
      return
    }

    queueGlassesSync(`${eventLabel(eventType)} received. tmux viewport re-synced.`)
  })
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  renderPhone(`Startup failed: ${message}`, 'error')
})
