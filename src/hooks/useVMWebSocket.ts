import { useEffect, useRef, useState, useCallback } from 'react';
import { WebSocketMessage } from '@/lib/websocket-server';

export interface VMWebSocketHook {
  isConnected: boolean;
  sendMessage: (message: Omit<WebSocketMessage, 'timestamp'>) => void;
  sendProgressUpdate: (progress: {
    currentIndex: number;
    totalVideos: number;
    playlistName: string;
  }) => void;
  sendVideoChange: (video: {
    id: string;
    username: string;
    description: string;
    duration: number;
    position: number;
  }) => void;
}

export function useVMWebSocket(displayId: string): VMWebSocketHook {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttempts = useRef(0);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?type=vm&displayId=${displayId}`;

    console.log('🔌 VM WebSocket connecting to:', wsUrl);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('✅ VM WebSocket connected');
      setIsConnected(true);
      reconnectAttempts.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        handleMessage(message);
      } catch (error) {
        console.error('❌ Failed to parse WebSocket message:', error);
      }
    };

    ws.onclose = (event) => {
      console.log('🔌 VM WebSocket disconnected:', event.code, event.reason);
      setIsConnected(false);
      wsRef.current = null;

      // Attempt to reconnect with exponential backoff
      if (reconnectAttempts.current < 10) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        console.log(`🔄 Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current + 1})`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttempts.current++;
          connect();
        }, delay);
      }
    };

    ws.onerror = (error) => {
      console.error('❌ VM WebSocket error:', error);
    };
  }, [displayId]);

  const handleMessage = useCallback((message: WebSocketMessage) => {
    console.log('📨 VM received message:', message.type);

    switch (message.type) {
      case 'connected':
        console.log('✅ VM WebSocket connection confirmed');
        break;

      case 'status-request':
        // Admin is requesting current status - we could trigger a status update here
        console.log('📊 Admin requested status update');
        break;

      case 'pong':
        // Keep-alive response
        break;

      default:
        console.log('❓ Unknown message type:', message.type);
    }
  }, []);

  const sendMessage = useCallback((message: Omit<WebSocketMessage, 'timestamp'>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const fullMessage: WebSocketMessage = {
        ...message,
        timestamp: Date.now()
      };
      wsRef.current.send(JSON.stringify(fullMessage));
    } else {
      console.warn('⚠️ WebSocket not connected, message not sent:', message.type);
    }
  }, []);

  const sendProgressUpdate = useCallback((progress: {
    currentIndex: number;
    totalVideos: number;
    playlistName: string;
  }) => {
    sendMessage({
      type: 'vm-progress-update',
      data: { playlistProgress: progress }
    });
  }, [sendMessage]);

  const sendVideoChange = useCallback((video: {
    id: string;
    username: string;
    description: string;
    duration: number;
    position: number;
  }) => {
    sendMessage({
      type: 'vm-video-change',
      data: { currentVideo: video }
    });
  }, [sendMessage]);

  // Initialize connection
  useEffect(() => {
    connect();

    // Cleanup on unmount
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  // Keep-alive ping
  useEffect(() => {
    if (!isConnected) return;

    const pingInterval = setInterval(() => {
      sendMessage({ type: 'ping' });
    }, 30000); // Ping every 30 seconds

    return () => clearInterval(pingInterval);
  }, [isConnected, sendMessage]);

  return {
    isConnected,
    sendMessage,
    sendProgressUpdate,
    sendVideoChange
  };
}
