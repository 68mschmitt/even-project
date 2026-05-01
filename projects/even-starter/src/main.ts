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
const MAIN_CONTAINER_ID = 1
const MAIN_CONTAINER_NAME = 'main'

type Bridge = Awaited<ReturnType<typeof waitForEvenAppBridge>>

const state = {
  status: 'Waiting for touch input',
  presses: 0,
  swipes: 0,
  lastEvent: 'None yet',
}

const foundApp = document.querySelector<HTMLElement>('#app')

if (!foundApp) {
  throw new Error('Missing #app element')
}

const app = foundApp

function glassesContent() {
  return [
    'Even Starter',
    '',
    state.status,
    `Presses: ${state.presses}`,
    `Swipes: ${state.swipes}`,
    `Last: ${state.lastEvent}`,
    '',
    'Input:',
    'Press = increment',
    'Swipe up/down = count',
    'Double press = reset',
  ].join('\n')
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

function renderPhoneStatus(message: string, tone: 'idle' | 'success' | 'error' = 'idle') {
  app.innerHTML = `
    <section class="shell ${tone}">
      <p class="eyebrow">Even Realities G2</p>
      <h1>Even Starter</h1>
      <p class="status">${escapeHtml(message)}</p>
      <pre class="glass-preview">${escapeHtml(glassesContent())}</pre>
      <div class="actions">
        <code>npm run dev</code>
        <code>npm run sim</code>
        <code>npm run qr</code>
      </div>
    </section>
  `
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
      return 'Press'
    case OsEventTypeList.DOUBLE_CLICK_EVENT:
      return 'Double press'
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

async function createStartupPage(bridge: Bridge) {
  const mainText = new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: GLASSES_WIDTH,
    height: GLASSES_HEIGHT,
    borderWidth: 0,
    borderColor: 5,
    paddingLength: 8,
    containerID: MAIN_CONTAINER_ID,
    containerName: MAIN_CONTAINER_NAME,
    content: glassesContent(),
    isEventCapture: 1,
  })

  const result = await bridge.createStartUpPageContainer(
    new CreateStartUpPageContainer({
      containerTotalNum: 1,
      textObject: [mainText],
    }),
  )

  if (result !== 0) {
    throw new Error(`createStartUpPageContainer failed with code ${result}`)
  }
}

async function updateGlasses(bridge: Bridge) {
  const content = glassesContent()
  renderPhoneStatus('Connected. Mirror of the current glasses page:', 'success')
  await bridge.textContainerUpgrade(
    new TextContainerUpgrade({
      containerID: MAIN_CONTAINER_ID,
      containerName: MAIN_CONTAINER_NAME,
      content,
      contentOffset: 0,
      contentLength: content.length,
    }),
  )
}

function applyEvent(eventType: OsEventTypeList) {
  state.lastEvent = eventLabel(eventType)

  switch (eventType) {
    case OsEventTypeList.CLICK_EVENT:
      state.presses += 1
      state.status = 'Press received'
      break
    case OsEventTypeList.DOUBLE_CLICK_EVENT:
      state.presses = 0
      state.swipes = 0
      state.status = 'Counters reset'
      break
    case OsEventTypeList.SCROLL_TOP_EVENT:
    case OsEventTypeList.SCROLL_BOTTOM_EVENT:
      state.swipes += 1
      state.status = 'Swipe received'
      break
    case OsEventTypeList.FOREGROUND_ENTER_EVENT:
      state.status = 'App is in foreground'
      break
    case OsEventTypeList.FOREGROUND_EXIT_EVENT:
      state.status = 'App moved to background'
      break
    case OsEventTypeList.ABNORMAL_EXIT_EVENT:
      state.status = 'Glasses disconnected unexpectedly'
      break
    default:
      state.status = 'Unhandled event received'
      break
  }
}

async function main() {
  renderPhoneStatus('Waiting for the Even bridge. Start the simulator or open from the Even Realities app.')

  const bridge = await waitForEvenAppBridge()
  state.status = 'Bridge connected'
  renderPhoneStatus('Bridge connected. Creating the startup page...', 'success')

  await createStartupPage(bridge)
  renderPhoneStatus('Connected. Mirror of the current glasses page:', 'success')

  bridge.onEvenHubEvent((event: EvenHubEvent) => {
    const eventType = eventTypeFrom(event)

    if (eventType === null) {
      return
    }

    applyEvent(eventType)
    void updateGlasses(bridge).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      renderPhoneStatus(`Failed to update glasses: ${message}`, 'error')
    })
  })
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  renderPhoneStatus(`Startup failed: ${message}`, 'error')
})
