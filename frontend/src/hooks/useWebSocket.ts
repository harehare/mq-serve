import { useState, useEffect, useRef } from 'react'

export type WsStatus = 'connected' | 'disconnected'

export function useWebSocket(onMessage: (data: unknown) => void): WsStatus {
  const [status, setStatus] = useState<WsStatus>('disconnected')
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    let ws: WebSocket | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    function connect() {
      const url = `ws://${location.host}/ws`
      ws = new WebSocket(url)

      ws.onopen = () => setStatus('connected')
      ws.onclose = () => {
        setStatus('disconnected')
        retryTimer = setTimeout(connect, 3000)
      }
      ws.onerror = () => ws?.close()
      ws.onmessage = (e) => {
        try {
          onMessageRef.current(JSON.parse(e.data as string))
        } catch {
          // ignore malformed messages
        }
      }
    }

    connect()

    return () => {
      if (retryTimer) clearTimeout(retryTimer)
      ws?.close()
    }
  }, [])

  return status
}
