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
import { startMonitoringScheduler } from './backend/services/monitoringService.js';

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
  startMonitoringScheduler(5 * 60 * 1000);

  if (env.nodeEnv !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const hmrDisabled = process.env.DISABLE_HMR === 'true' || Boolean(process.env.CONTROL_PLANE_PORT);
    const vite = await createViteServer({
      plugins: hmrDisabled
        ? [
            {
              name: 'disable-hmr-client-ws',
              enforce: 'post',
              transform(code, id) {
                if (
                  (id.includes('vite/dist/client/client.mjs') || id === '/@vite/client') &&
                  code.includes('transport.connect(createHMRHandler(handleMessage));')
                ) {
                  return code.replace(
                    'transport.connect(createHMRHandler(handleMessage));',
                    '/* HMR disabled: WebSocket transport suppressed */'
                  );
                }
              },
            },
          ]
        : [],
      server: {
        middlewareMode: true,
        hmr: hmrDisabled ? false : { server: httpServer },
        ...(hmrDisabled ? { ws: false, watch: null } : {}),
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(
      '/assets',
      express.static(path.join(distPath, 'assets'), {
        maxAge: '1y',
        immutable: true,
      })
    );
    app.use(
      express.static(distPath, {
        maxAge: '1h',
        setHeaders(res, filePath) {
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
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
