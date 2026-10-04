import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { config } from './config/env.js';
import { router } from './routes/index.js';
import { apiLimiter, csrfGuard, sanitizeInput } from './middleware/security.js';
import { errorHandler, notFoundHandler, requestLogger } from './middleware/errorHandler.js';

const MEDIA_ORIGINS = ['https://res.cloudinary.com'];
// Watch together embeds YouTube's player (script + iframe + thumbnails).
const YOUTUBE_SCRIPT = ['https://www.youtube.com', 'https://s.ytimg.com'];
const YOUTUBE_FRAME = ['https://www.youtube.com', 'https://www.youtube-nocookie.com'];

function securityHeaders() {
  return helmet({
    // CSP only matters for the HTML we serve; the API returns JSON.
    contentSecurityPolicy: config.serveClient
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", ...YOUTUBE_SCRIPT],
            frameSrc: YOUTUBE_FRAME,
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'blob:', ...MEDIA_ORIGINS, 'https://i.ytimg.com'],
            mediaSrc: ["'self'", 'blob:', ...MEDIA_ORIGINS],
            // Older Safari doesn't treat 'self' as covering WebSockets; name the host explicitly.
            connectSrc: ["'self'", (req) => `wss://${req.get('host')}`, (req) => `ws://${req.get('host')}`, ...MEDIA_ORIGINS],
            fontSrc: ["'self'", 'data:'],
            workerSrc: ["'self'"],
            manifestSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
          },
        }
      : false,
    // Split deployments load local-driver media cross-site.
    crossOriginResourcePolicy: { policy: config.clientOrigins.length ? 'cross-origin' : 'same-origin' },
    crossOriginEmbedderPolicy: false,
    // YouTube's embedded player refuses to play without a referrer (error 153).
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(securityHeaders());
  app.use(compression());
  if (config.clientOrigins.length) {
    app.use(cors({ origin: config.clientOrigins, credentials: true, allowedHeaders: ['Content-Type', 'X-Requested-With'] }));
  }
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());
  app.use(sanitizeInput);
  if (!config.isTest) app.use(requestLogger);

  app.use('/api', apiLimiter, csrfGuard, router);
  app.use('/api', notFoundHandler);

  if (config.serveClient) {
    app.use(
      express.static(config.clientDist, {
        index: false,
        setHeaders: (res, filePath) => {
          // Hashed assets are immutable; the shell and service worker must revalidate.
          const cacheable = filePath.includes(`${path.sep}assets${path.sep}`);
          res.setHeader('Cache-Control', cacheable ? 'public, max-age=31536000, immutable' : 'no-cache');
        },
      }),
    );
    app.get('/{*splat}', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(config.clientDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
