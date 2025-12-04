import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/http/async-handler.js';
import type { MailProvidersService } from './mail-providers.service.js';

export const createMailProvidersController = (service: MailProvidersService) => {
  /**
   * Detect email provider from DNS records
   */
  const detectProvider = asyncHandler(async (req: Request, res: Response) => {
    const { domainId } = req.params;
    const result = await service.detectProvider(domainId);
    res.json(result);
  });

  /**
   * Validate and configure Google Workspace
   */
  const validateGoogleProvider = asyncHandler(async (req: Request, res: Response) => {
    const { domainId } = req.params;
    const { serviceAccountJson, delegatedAdmin } = req.body;

    const provider = await service.validateProvider({
      domainId,
      providerType: 'GOOGLE_WORKSPACE',
      credentials: {
        google: {
          serviceAccountJson,
          delegatedAdmin,
        },
      },
    });

    res.json(provider);
  });

  /**
   * Validate and configure Microsoft 365
   */
  const validateMicrosoft365Provider = asyncHandler(async (req: Request, res: Response) => {
    const { domainId } = req.params;
    const { tenantId, clientId, clientSecret } = req.body;

    const provider = await service.validateProvider({
      domainId,
      providerType: 'MICROSOFT_365',
      credentials: {
        microsoft365: {
          tenantId,
          clientId,
          clientSecret,
        },
      },
    });

    res.json(provider);
  });

  /**
   * Get DNS status for a domain
   */
  const getDnsStatus = asyncHandler(async (req: Request, res: Response) => {
    const { domainId } = req.params;
    const status = await service.getDnsStatus(domainId);
    res.json(status);
  });

  /**
   * Get provider configuration for a domain
   */
  const getProvider = asyncHandler(async (req: Request, res: Response) => {
    const { domainId } = req.params;
    const provider = await service.getProvider(domainId);
    if (!provider) {
      res.status(404).json({ error: 'No provider configured for this domain' });
      return;
    }
    res.json(provider);
  });

  /**
   * List users for a domain
   */
  const listUsers = asyncHandler(async (req: Request, res: Response) => {
    const { domainId } = req.params;
    const users = await service.listUsers(domainId);
    res.json(users);
  });

  /**
   * Create a user
   */
  const createUser = asyncHandler(async (req: Request, res: Response) => {
    const { domainId } = req.params;
    const user = await service.createUser(domainId, req.body);
    res.status(201).json(user);
  });

  /**
   * Update a user
   */
  const updateUser = asyncHandler(async (req: Request, res: Response) => {
    const { domainId, userId } = req.params;
    const user = await service.updateUser(domainId, userId, req.body);
    res.json(user);
  });

  /**
   * Delete a user
   */
  const deleteUser = asyncHandler(async (req: Request, res: Response) => {
    const { domainId, userId } = req.params;
    await service.deleteUser(domainId, userId);
    res.status(204).send();
  });

  /**
   * Reset user password
   */
  const resetPassword = asyncHandler(async (req: Request, res: Response) => {
    const { domainId, userId } = req.params;
    const { newPassword } = req.body;
    await service.resetPassword(domainId, userId, newPassword);
    res.status(204).send();
  });

  return {
    detectProvider,
    validateGoogleProvider,
    validateMicrosoft365Provider,
    getDnsStatus,
    getProvider,
    listUsers,
    createUser,
    updateUser,
    deleteUser,
    resetPassword,
  };
};

