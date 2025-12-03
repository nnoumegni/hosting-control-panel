import type { NextFunction, Request, Response } from 'express';

export type AsyncRequestHandler<
  P = Request['params'],
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Request['query'],
> = (req: Request<P, ResBody, ReqBody, ReqQuery>, res: Response<ResBody>, next: NextFunction) => Promise<void | Response>;

export const asyncHandler =
  <P = Request['params'], ResBody = unknown, ReqBody = unknown, ReqQuery = Request['query']>(
    handler: AsyncRequestHandler<P, ResBody, ReqBody, ReqQuery>,
  ) =>
  (req: Request<P, ResBody, ReqBody, ReqQuery>, res: Response<ResBody>, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };


