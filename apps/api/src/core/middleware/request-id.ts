import type { RequestHandler } from 'express';
import { randomUUID } from 'crypto';

export const requestId: RequestHandler = (req, _res, next) => {
  req.id ||= randomUUID();
  next();
};
