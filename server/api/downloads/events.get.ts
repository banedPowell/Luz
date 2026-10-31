import { downloadEvents, downloadService } from '../../modules/download/download.service'

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  })

  const send = (type: string, data: unknown) => {
    event.node.res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  send('queue', downloadService.getQueue())
  send('history', downloadService.getHistory())

  const handlers: [string, (data: unknown) => void][] = [
    ['job', (data) => send('job', data)],
    ['queue', (data) => send('queue', data)],
    ['history', (data) => send('history', data)],
    ['log', (data) => send('log', data)],
    ['library:updated', (data) => send('library:updated', data)]
  ]

  for (const [eventName, handler] of handlers) {
    downloadEvents.on(eventName, handler)
  }

  event.node.req.on('close', () => {
    for (const [eventName, handler] of handlers) {
      downloadEvents.off(eventName, handler)
    }
  })

  return new Promise(() => {})
})
