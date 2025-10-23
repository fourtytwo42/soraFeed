import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { parse } from 'url';

export interface WebSocketMessage {
  type: string;
  displayId?: string;
  data?: any;
  timestamp: number;
}

export interface ConnectedClient {
  ws: WebSocket;
  type: 'admin' | 'vm';
  displayId?: string;
  adminId?: string;
  lastSeen: number;
}

class SoraFeedWebSocketServer {
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, ConnectedClient>();
  private displayAdminMap = new Map<string, string>(); // displayId -> adminId

  initialize(server: any) {
    if (this.wss) return;

    this.wss = new WebSocketServer({ 
      server,
      path: '/ws'
    });

    this.wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
      this.handleConnection(ws, request);
    });

    console.log('🔌 WebSocket server initialized');
  }

  private handleConnection(ws: WebSocket, request: IncomingMessage) {
    const url = parse(request.url || '', true);
    const clientType = url.query.type as 'admin' | 'vm';
    const displayId = url.query.displayId as string;
    const adminId = url.query.adminId as string;

    if (!clientType || (clientType === 'vm' && !displayId) || (clientType === 'admin' && !adminId)) {
      console.log('❌ WebSocket connection rejected - missing parameters');
      ws.close(1008, 'Missing required parameters');
      return;
    }

    const clientId = clientType === 'admin' ? `admin-${adminId}` : `vm-${displayId}`;
    
    const client: ConnectedClient = {
      ws,
      type: clientType,
      displayId: clientType === 'vm' ? displayId : undefined,
      adminId: clientType === 'admin' ? adminId : undefined,
      lastSeen: Date.now()
    };

    this.clients.set(clientId, client);

    // Track display ownership for admin clients
    if (clientType === 'admin') {
      // Admin connecting - they'll send their owned displays
    } else if (clientType === 'vm') {
      // VM connecting - find which admin owns this display
      console.log(`🔌 VM client connected: ${displayId}`);
    }

    console.log(`🔌 ${clientType.toUpperCase()} client connected: ${clientId}`);
    console.log(`📊 Total clients: ${this.clients.size}`);

    ws.on('message', (data) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());
        this.handleMessage(clientId, message);
      } catch (error) {
        console.error('❌ Invalid WebSocket message:', error);
      }
    });

    ws.on('close', () => {
      this.clients.delete(clientId);
      console.log(`🔌 Client disconnected: ${clientId}`);
      console.log(`📊 Total clients: ${this.clients.size}`);
    });

    ws.on('error', (error) => {
      console.error(`❌ WebSocket error for ${clientId}:`, error);
    });

    // Send welcome message
    this.sendToClient(clientId, {
      type: 'connected',
      data: { clientId, clientType },
      timestamp: Date.now()
    });
  }

  private handleMessage(clientId: string, message: WebSocketMessage) {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.lastSeen = Date.now();

    console.log(`📨 Message from ${clientId}:`, message.type);

    switch (message.type) {
      case 'admin-register-displays':
        this.handleAdminRegisterDisplays(clientId, message.data.displayIds);
        break;

      case 'vm-progress-update':
        this.handleVMProgressUpdate(clientId, message);
        break;

      case 'vm-video-change':
        this.handleVMVideoChange(clientId, message);
        break;

      case 'admin-request-status':
        this.handleAdminRequestStatus(clientId, message.displayId!);
        break;

      case 'ping':
        this.sendToClient(clientId, {
          type: 'pong',
          timestamp: Date.now()
        });
        break;

      default:
        console.log(`❓ Unknown message type: ${message.type}`);
    }
  }

  private handleAdminRegisterDisplays(adminClientId: string, displayIds: string[]) {
    const client = this.clients.get(adminClientId);
    if (!client || client.type !== 'admin') return;

    // Register this admin as owner of these displays
    displayIds.forEach(displayId => {
      this.displayAdminMap.set(displayId, client.adminId!);
    });

    console.log(`📋 Admin ${client.adminId} registered displays:`, displayIds);

    // Send current status for each display
    displayIds.forEach(displayId => {
      const vmClient = this.clients.get(`vm-${displayId}`);
      if (vmClient) {
        this.sendToClient(adminClientId, {
          type: 'display-status',
          displayId,
          data: { status: 'connected' },
          timestamp: Date.now()
        });
      }
    });
  }

  private handleVMProgressUpdate(vmClientId: string, message: WebSocketMessage) {
    const client = this.clients.get(vmClientId);
    if (!client || client.type !== 'vm') return;

    const displayId = client.displayId!;
    const adminId = this.displayAdminMap.get(displayId);
    
    if (adminId) {
      const adminClientId = `admin-${adminId}`;
      this.sendToClient(adminClientId, {
        type: 'display-progress-update',
        displayId,
        data: message.data,
        timestamp: Date.now()
      });
    }
  }

  private handleVMVideoChange(vmClientId: string, message: WebSocketMessage) {
    const client = this.clients.get(vmClientId);
    if (!client || client.type !== 'vm') return;

    const displayId = client.displayId!;
    const adminId = this.displayAdminMap.get(displayId);
    
    if (adminId) {
      const adminClientId = `admin-${adminId}`;
      this.sendToClient(adminClientId, {
        type: 'display-video-change',
        displayId,
        data: message.data,
        timestamp: Date.now()
      });
    }
  }

  private handleAdminRequestStatus(adminClientId: string, displayId: string) {
    const vmClientId = `vm-${displayId}`;
    this.sendToClient(vmClientId, {
      type: 'status-request',
      timestamp: Date.now()
    });
  }

  private sendToClient(clientId: string, message: WebSocketMessage) {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) return;

    try {
      client.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error(`❌ Failed to send message to ${clientId}:`, error);
    }
  }

  // Public methods for external use
  public broadcastToAdmins(message: WebSocketMessage) {
    this.clients.forEach((client, clientId) => {
      if (client.type === 'admin') {
        this.sendToClient(clientId, message);
      }
    });
  }

  public sendToDisplay(displayId: string, message: WebSocketMessage) {
    const vmClientId = `vm-${displayId}`;
    this.sendToClient(vmClientId, message);
  }

  public sendToAdminOfDisplay(displayId: string, message: WebSocketMessage) {
    const adminId = this.displayAdminMap.get(displayId);
    if (adminId) {
      const adminClientId = `admin-${adminId}`;
      this.sendToClient(adminClientId, message);
    }
  }

  public getConnectedDisplays(): string[] {
    const displays: string[] = [];
    this.clients.forEach((client, clientId) => {
      if (client.type === 'vm' && client.displayId) {
        displays.push(client.displayId);
      }
    });
    return displays;
  }

  public isDisplayConnected(displayId: string): boolean {
    return this.clients.has(`vm-${displayId}`);
  }
}

// Singleton instance
export const wsServer = new SoraFeedWebSocketServer();
