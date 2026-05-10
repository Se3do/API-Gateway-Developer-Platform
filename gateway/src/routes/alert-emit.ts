import { Router, Request, Response } from 'express';
import { getIO } from '../services/socket.io.js';
import { config } from '../config/index.js';

export function createAlertEmitRouter(): Router {
  const router = Router();

  router.post('/api/v1/alerts/emit', (req: Request, res: Response) => {
    const secret = req.headers['x-alert-secret'];
    if (!secret || secret !== config.alertSecret) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid alert secret' });
      return;
    }

    const io = getIO();
    if (io) {
      io.of('/monitor').emit('alert:new', req.body);
    }

    res.status(200).json({ received: true });
  });

  return router;
}
