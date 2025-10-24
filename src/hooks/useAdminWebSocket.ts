import { useEffect, useRef, useState, useCallback } from 'react';
import { WebSocketMessage } from '@/lib/websocket-server';

export interface DisplayStatus {
  displayId: string;
  isConnected: boolean;
  currentVideo?: {
    id: string;
    username: string;
    description: string;
    duration: number;
    position: number;
  };
  playlistProgress?: {
    currentIndex: number;
    totalVideos: number;
    playlistName: string;
  };
  lastUpdate: number;
}

export interface AdminWebSocketHook {
  isConnected: boolean;
  displayStatuses: Map<string, DisplayStatus>;
  sendMessage: (message: Omit<WebSocketMessage, 'timestamp'>) => void;
  registerDisplays: (displayIds: string[]) => void;
  requestDisplayStatus: (displayId: string) => void;
}

export function useAdminWebSocket(adminId: string): AdminWebSocketHook {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [displayStatuses, setDisplayStatuses] = useState<Map<string, DisplayStatus>>(new Map());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttempts = useRef(0);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (!adminId || adminId.trim() === '') {
      console.log('🔌 Admin WebSocket: No adminId provided, skipping connection');
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?type=admin&adminId=${adminId}`;

    console.log('🔌 Admin WebSocket connecting to:', wsUrl);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('✅ Admin WebSocket connected');
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
      console.log('🔌 Admin WebSocket disconnected:', event.code, event.reason);
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
      console.error('❌ Admin WebSocket error:', error);
    };
  }, [adminId]);

  const handleMessage = useCallback((message: WebSocketMessage) => {
    console.log('📨 Admin received message:', message.type);

    switch (message.type) {
      case 'connected':
        console.log('✅ Admin WebSocket connection confirmed');
        break;

      case 'display-status':
        if (message.displayId) {
          setDisplayStatuses(prev => {
            const newMap = new Map(prev);
            const existing = newMap.get(message.displayId!) || {
              displayId: message.displayId!,
              isConnected: false,
              lastUpdate: Date.now()
            };
            
            newMap.set(message.displayId!, {
              ...existing,
              isConnected: message.data.status === 'connected',
              lastUpdate: Date.now()
            });
            
            return newMap;
          });
        }
        break;

      case 'display-progress-update':
        if (message.displayId) {
          setDisplayStatuses(prev => {
            const newMap = new Map(prev);
            const existing = newMap.get(message.displayId!) || {
              displayId: message.displayId!,
              isConnected: true,
              lastUpdate: Date.now()
            };
            
            newMap.set(message.displayId!, {
              ...existing,
              playlistProgress: message.data.playlistProgress,
              lastUpdate: Date.now()
            });
            
            return newMap;
          });
        }
        break;

      case 'display-video-change':
        if (message.displayId) {
          setDisplayStatuses(prev => {
            const newMap = new Map(prev);
            const existing = newMap.get(message.displayId!) || {
              displayId: message.displayId!,
              isConnected: true,
              lastUpdate: Date.now()
            };
            
            newMap.set(message.displayId!, {
              ...existing,
              currentVideo: message.data.currentVideo,
              playlistProgress: {
                ...existing.playlistProgress,
                videoProgress: 0, // Reset video progress when video changes
                enhancedPosition: existing.playlistProgress?.enhancedPosition || 0
              },
              lastUpdate: Date.now()
            });
            
            return newMap;
          });
        }
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

  const registerDisplays = useCallback((displayIds: string[]) => {
    sendMessage({
      type: 'admin-register-displays',
      data: { displayIds }
    });
  }, [sendMessage]);

  const requestDisplayStatus = useCallback((displayId: string) => {
    sendMessage({
      type: 'admin-request-status',
      displayId
    });
  }, [sendMessage]);

  // Initialize connection when adminId is available
  useEffect(() => {
    if (adminId && adminId.trim() !== '') {
      connect();
    }

    // Cleanup on unmount or adminId change
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
    };
  }, [adminId, connect]);

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
    displayStatuses,
    sendMessage,
    registerDisplays,
    requestDisplayStatus
  };
}
