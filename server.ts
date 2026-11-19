import http from 'node:http';
import path from 'node:path';
import express from 'express';
import jwt from 'jsonwebtoken';
import { Server as SocketIOServer } from 'socket.io';
import { env } from './backend/config/env.js';
import { initDatabase, queryOne } from './backend/config/db.js';
import { ensureSuperAdmin, removeLegacySeedAccounts, seedCoreRbacAndPlans } from './backend/config/rbac.js';
import { createBackendApp } from './backend/app.js';
import { setSocketIo } from './backend/services/auditService.js';
import { startPayrollScheduler } from './backend/services/payrollScheduler.js';

async function startServer() {
  await initDatabase();
  await seedCoreRbacAndPlans();
  await removeLegacySeedAccounts();
  await ensureSuperAdmin();

  const app = createBackendApp();
  const httpServer = http.createServer(app);
  // Allow long/slow file and video uploads without an arbitrary 5-minute Node HTTP wall
  httpServer.requestTimeout = 0;
  httpServer.keepAliveTimeout = 65_000;
  httpServer.headersTimeout = 66_000;

  const io = new SocketIOServer(httpServer, {
    cors: { origin: true, credentials: true },
  });

  // Authenticate Socket.IO connections & enforce strict tenant room isolation
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Unauthorized socket connection'));
      const decoded = jwt.verify(token, env.jwtSecret);
      socket.data.userId = decoded.sub;
      next();
    } catch {
      next(new Error('Invalid socket token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    socket.join(`user:${userId}`);

    socket.on('business:join', async (businessId) => {
      const id = Number(businessId);
      if (!id) return;
      const platformAdmin = await queryOne(
        `SELECT id FROM users WHERE id = ? AND is_platform_admin = 1 AND is_active = 1`,
        [userId]
      );
      const member = platformAdmin || await queryOne(
        `SELECT id FROM business_members WHERE business_id = ? AND user_id = ? AND status = 'active'`,
        [id, userId]
      );
      if (member) {
        for (const room of socket.rooms) {
          if (room.startsWith('business:')) socket.leave(room);
        }
        socket.join(`business:${id}`);
      }
    });
  });

  setSocketIo(io);
  startPayrollScheduler(60_000);

  if (env.nodeEnv !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(env.port, '0.0.0.0', () => {
    console.log(`[BizTrade Africa] Server running at http://localhost:${env.port}`);
  });
}

startServer().catch((err) => {
  console.error('[Startup Fatal Error]', err);
  process.exit(1);
});
