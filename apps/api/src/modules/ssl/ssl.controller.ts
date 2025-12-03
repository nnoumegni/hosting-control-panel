import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/http/async-handler.js';
import type { SSLService } from './ssl.service.js';
import type {
  IssueCertificateBody,
  RenewCertificateBody,
  RevokeCertificateBody,
  ConfigureACMEAccountBody,
} from './ssl.schemas.js';

export const createSSLController = (service: SSLService) => ({
  listCertificates: asyncHandler(async (req: Request, res: Response) => {
    const instanceId = req.query.instanceId as string | undefined;
    const domain = req.query.domain as string | undefined;
    const certificates = await service.listCertificates(instanceId, domain);
    res.json(certificates);
  }),

  getCertificateHealth: asyncHandler(async (req: Request, res: Response) => {
    const instanceId = req.query.instanceId as string | undefined;
    const domain = req.query.domain as string | undefined;
    const health = await service.getCertificateHealth(instanceId, domain);
    res.json(health);
  }),

  issueCertificate: asyncHandler(async (req: Request, res: Response) => {
    const instanceId = req.query.instanceId as string | undefined;
    const body = req.body as IssueCertificateBody;
    const certificate = await service.issueCertificate(instanceId, body.domain);
    res.status(201).json(certificate);
  }),

  renewCertificate: asyncHandler(async (req: Request, res: Response) => {
    const instanceId = req.query.instanceId as string | undefined;
    const body = req.body as RenewCertificateBody;
    const certificate = await service.renewCertificate(instanceId, body.domain);
    res.json(certificate);
  }),

  revokeCertificate: asyncHandler(async (req: Request, res: Response) => {
    const instanceId = req.query.instanceId as string | undefined;
    const body = req.body as RevokeCertificateBody;
    const result = await service.revokeCertificate(instanceId, body.domain);
    res.json(result);
  }),

  getACMEAccount: asyncHandler(async (req: Request, res: Response) => {
    const instanceId = req.query.instanceId as string | undefined;
    const account = await service.getACMEAccount(instanceId);
    res.json(account);
  }),

  configureACMEAccount: asyncHandler(async (req: Request, res: Response) => {
    const instanceId = req.query.instanceId as string | undefined;
    const body = req.body as ConfigureACMEAccountBody;
    const account = await service.configureACMEAccount(instanceId, body.email, body.useStaging ?? false);
    res.json(account);
  }),

  checkDomain: asyncHandler(async (req: Request, res: Response) => {
    const instanceId = req.query.instanceId as string | undefined;
    const domain = req.query.domain as string;
    if (!domain) {
      res.status(400).json({ error: 'domain query parameter is required' });
      return;
    }
    const result = await service.checkDomain(instanceId, domain);
    res.json(result);
  }),
});

