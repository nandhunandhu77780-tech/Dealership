import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import healthRoutes from './routes/healthRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import { getHealth } from './controllers/healthController.js';
import { detectAndSendAllOverdueNotifications } from './services/fcmService.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Parse allowed CORS origins from CLIENT_ORIGIN (supports comma-separated list)
const clientOrigin = process.env.CLIENT_ORIGIN;
const allowedOrigins = clientOrigin
  ? clientOrigin
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  : [];

// Enable CORS allowing configured production origins while keeping local development working
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, uptime monitors, server-to-server)
      if (!origin) return callback(null, true);

      // If no CLIENT_ORIGIN specified or wildcard, allow all
      if (allowedOrigins.length === 0 || allowedOrigins.includes('*')) {
        return callback(null, true);
      }

      // Allow configured production origins
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Always allow local development origins (localhost / 127.0.0.1 on any port)
      const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
      if (isLocalhost) {
        return callback(null, true);
      }

      callback(new Error(`CORS error: Origin '${origin}' is not allowed.`));
    },
    credentials: true,
  })
);

// Body parser middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoints (available at both /api/health and /health for Render/cloud probes)
app.get('/health', getHealth);
app.use('/api', healthRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/notifications', notificationRoutes);

// Error Handling Middlewares
app.use(notFound);
app.use(errorHandler);

// Connect to Database before starting Express server
const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server is running on port ${PORT} (0.0.0.0)`);

      // Run initial overdue push notification scan on startup in background
      setTimeout(() => {
        detectAndSendAllOverdueNotifications().catch((err) => {
          console.warn('[server] Background overdue notification scan error:', err.message);
        });
      }, 5000);

      // Periodically scan for overdue installments every 6 hours
      setInterval(() => {
        detectAndSendAllOverdueNotifications().catch((err) => {
          console.warn('[server] Scheduled overdue notification scan error:', err.message);
        });
      }, 6 * 60 * 60 * 1000);
    });
  } catch (error) {
    console.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

startServer();
