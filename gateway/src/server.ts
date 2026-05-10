import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createApp } from './app.js';
import { createEventEmitter } from './middleware/event-emitter.js';
import { setIO } from './services/socket.io.js';

export function createServer() {
  const io = new SocketIOServer({
    cors: {
      origin: true,
      methods: ['GET', 'POST'],
    },
  });

  setIO(io);

  const monitorNamespace = io.of('/monitor');
  let activeConnections = 0;

  monitorNamespace.on('connection', (socket) => {
    activeConnections++;
    monitorNamespace.emit('connections:active', { count: activeConnections });

    socket.on('disconnect', () => {
      activeConnections--;
      monitorNamespace.emit('connections:active', { count: activeConnections });
    });
  });

  const eventEmitter = createEventEmitter(monitorNamespace);

  const app = createApp(eventEmitter);
  const httpServer = http.createServer(app);

  io.attach(httpServer);

  return { httpServer, app, io };
}
