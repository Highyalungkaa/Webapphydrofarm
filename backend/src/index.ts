import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { restoreCropSnapshots } from './services/masterSnapshots.js';

// Routes
import profileRouter from './routes/profile.js';
import roundsRouter from './routes/rounds.js';
import ordersRouter from './routes/orders.js';
import settingsRouter from './routes/settings.js';

// Admin Routes
import adminCropsRouter from './routes/admin/crops.js';
import adminRoundsRouter from './routes/admin/rounds.js';
import plantLossesRouter from './routes/admin/plantLosses.js';
import unsoldRoundsRouter from './routes/admin/unsoldRounds.js';
import stockRouter from './routes/admin/stock.js';
import purchaseLimitsRouter from './routes/admin/purchaseLimits.js';
import adminOrdersRouter from './routes/admin/orders.js';
import chatOrdersRouter from './routes/admin/chatOrders.js';
import adminSettingsRouter from './routes/admin/settings.js';
import adminAdminsRouter from './routes/admin/admins.js';
import adminAuditRouter from './routes/admin/audit.js';
import adminCustomersRouter from './routes/admin/customers.js';
import adminFarmRouter from './routes/admin/farm.js';
import adminPlotsRouter from './routes/admin/plots.js';
import adminReportsRouter from './routes/admin/reports.js';
import equipmentRouter from './routes/equipment.js';
import {reconcileOrderExpiry} from './middlewares/orderExpiry.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// Security & Core Middlewares
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow localhost or specified client origin
      if (!origin || origin.startsWith('http://localhost') || origin === clientOrigin) {
        callback(null, true);
      } else {
        callback(null, true); // Dev-friendly fallback
      }
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '8mb' }));
app.use((_req, res, next) => {
  const sendJson = res.json.bind(res);
  res.json = ((body: any) => sendJson(restoreCropSnapshots(body))) as typeof res.json;
  next();
});
app.use(['/api/rounds','/api/orders','/api/admin/orders','/api/admin/rounds'],reconcileOrderExpiry);

// Health Check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'Hydroponic Pre-order API',
    timestamp: new Date().toISOString(),
  });
});

// Customer & Public API Routes
app.use('/api/profile', profileRouter);
app.use('/api/rounds', roundsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/equipment', equipmentRouter);

// Admin API Routes
app.use('/api/admin/crops', adminCropsRouter);
app.use('/api/admin/rounds', adminRoundsRouter);
app.use('/api/admin/rounds', plantLossesRouter);
app.use('/api/admin/rounds', unsoldRoundsRouter);
app.use('/api/admin/rounds', stockRouter);
app.use('/api/admin/rounds', purchaseLimitsRouter);
app.use('/api/admin/orders', chatOrdersRouter);
app.use('/api/admin/orders', adminOrdersRouter);
app.use('/api/admin/settings', adminSettingsRouter);
app.use('/api/admin/admins', adminAdminsRouter);
app.use('/api/admin/audit', adminAuditRouter);
app.use('/api/admin/customers', adminCustomersRouter);
app.use('/api/admin/farm', adminFarmRouter);
app.use('/api/admin/plots', adminPlotsRouter);
app.use('/api/admin/reports', adminReportsRouter);

// 404 Route Handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'ไม่พบ endpoint ที่เรียกใช้งาน (Not Found)' });
});

// Global Error Handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'เกิดข้อผิดพลาดภายในระบบเซิร์ฟเวอร์',
  });
});

app.listen(port, () => {
  console.log(`🚀 Hydroponic Pre-order API running on port ${port}`);
  console.log(`📡 Ready for requests from ${clientOrigin}`);
});

export default app;
