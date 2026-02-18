import { mkdirSync } from 'node:fs';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pino } from 'pino';

import errorHandler from '@/middleware/errorHandler';
import rateLimiter from '@/middleware/rateLimiter';
import requestLogger from '@/middleware/requestLogger';

import { deployAccountRouter } from './api/deployAccountRouter';
import { faucetRouter } from './api/faucetRouter';
import { healthCheckRouter } from './api/healthCheckRouter';
import { ensureFactoryDeployed } from './utils/accounts/factory';
import { env } from './utils/envConfig';

const logger = pino({ name: 'server start' });
const app: Express = express();

// Set the application to trust the reverse proxy
app.set('trust proxy', true);

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(helmet());
app.use(rateLimiter);

// Request logging
app.use(requestLogger);

// Routes
app.use('/health-check', healthCheckRouter);
app.use('/deploy-account', deployAccountRouter);
app.use('/faucet', faucetRouter);

// Error handlers
app.use(errorHandler());

// Check factory once on startup (do not block server start)
setTimeout(() => {
  ensureFactoryDeployed().catch((err) => {
    logger.error({ err }, 'ensureFactoryDeployed failed');
  });
}, 0);

export { app, logger };
