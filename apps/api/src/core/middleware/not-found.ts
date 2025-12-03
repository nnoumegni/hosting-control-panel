import type { RequestHandler } from 'express';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    message: 'Route not found',
    path: req.originalUrl,
  });
};


