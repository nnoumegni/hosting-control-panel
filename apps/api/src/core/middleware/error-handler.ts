import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from '../logger/index.js';
import { HttpError } from '../../shared/errors.js';

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      message: 'Validation failed',
      issues: err.issues,
    });
  }

  // Handle errors with status property (HttpError and similar)
  // Check for status property first - this is the most reliable way
  const hasStatus = 'status' in err && typeof (err as { status: unknown }).status === 'number';
  const statusValue = hasStatus ? (err as { status: number }).status : undefined;
  const isHttpError = err instanceof HttpError || 
    (err instanceof Error && 
     (err.name === 'HttpError' || 
      err.name === 'UnauthorizedError' || 
      err.name === 'ForbiddenError' || 
      err.name === 'NotFoundError' || 
      err.name === 'NotImplementedError') &&
     hasStatus);
  
  // If error has a status property and it's < 500, treat it as a user-actionable error
  // and include the message in the response
  if (hasStatus && statusValue !== undefined && statusValue < 500) {
    const httpErr = err as HttpError;
    const payload = {
      message: httpErr.message || err.message,
      requestId: req.id,
      details: 'details' in httpErr ? httpErr.details : undefined,
    };

    logger.warn({ err, status: statusValue, path: req.path, method: req.method }, 'HttpError (user-actionable)');
    return res.status(statusValue).json(payload);
  }
  
  // Handle HttpError instances with 500+ status codes
  if (isHttpError && statusValue !== undefined && statusValue >= 500) {
    const httpErr = err as HttpError;
    const payload = {
      message: httpErr.message,
      requestId: req.id,
      details: httpErr.details,
    };

    logger.error({ err, status: statusValue, path: req.path, method: req.method }, 'HttpError (server error)');
    return res.status(statusValue).json(payload);
  }

  // Handle MongoDB connection errors
  const errorName = err.name || '';
  const errorMessage = err.message || '';
  
  if (
    errorName === 'MongoServerSelectionError' ||
    errorName === 'MongoNetworkError' ||
    errorMessage.includes('ECONNREFUSED') ||
    errorMessage.includes('Topology is closed')
  ) {
    logger.error({ err, path: req.path, method: req.method }, 'MongoDB connection error');
    return res.status(503).json({
      message: 'Database service unavailable. Please ensure MongoDB is running.',
      requestId: req.id,
      error: 'SERVICE_UNAVAILABLE',
    });
  }

  // Handle other errors
  const status = (err as { status?: number }).status ?? 500;
  
  // Log full error details
  logger.error({ 
    err, 
    status, 
    path: req.path, 
    method: req.method,
    errorName: err.name,
    errorMessage: err.message,
  }, 'Unhandled error');
  
  const payload = {
    message: status >= 500 ? 'Internal server error' : err.message,
    requestId: req.id,
    details: (err as { details?: unknown }).details,
  };

  res.status(status).json(payload);
};
