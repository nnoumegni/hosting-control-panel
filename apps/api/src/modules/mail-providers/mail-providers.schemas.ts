import { z } from 'zod';

const domainIdParamSchema = z.object({
  domainId: z.string().min(1),
});

export const detectProviderSchema = {
  params: domainIdParamSchema,
};

export const validateGoogleProviderSchema = {
  params: domainIdParamSchema,
  body: z.object({
    serviceAccountJson: z.string().min(1),
    delegatedAdmin: z.string().email(),
  }),
};

export const validateMicrosoft365ProviderSchema = {
  params: domainIdParamSchema,
  body: z.object({
    tenantId: z.string().min(1),
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
  }),
};

export const getDnsStatusSchema = {
  params: domainIdParamSchema,
};

export const createGoogleUserSchema = {
  params: domainIdParamSchema,
  body: z.object({
    email: z.string().email(),
    givenName: z.string().min(1),
    familyName: z.string().min(1),
    password: z.string().min(8).optional(),
    suspended: z.boolean().optional(),
  }),
};

export const createMicrosoft365UserSchema = {
  params: domainIdParamSchema,
  body: z.object({
    email: z.string().email(),
    displayName: z.string().min(1),
    givenName: z.string().min(1),
    surname: z.string().min(1),
    password: z.string().min(8),
    accountEnabled: z.boolean().optional(),
  }),
};

export const updateGoogleUserSchema = {
  params: z.object({
    domainId: z.string().min(1),
    userId: z.string().min(1),
  }),
  body: z.object({
    givenName: z.string().min(1).optional(),
    familyName: z.string().min(1).optional(),
    suspended: z.boolean().optional(),
  }),
};

export const updateMicrosoft365UserSchema = {
  params: z.object({
    domainId: z.string().min(1),
    userId: z.string().min(1),
  }),
  body: z.object({
    displayName: z.string().min(1).optional(),
    givenName: z.string().min(1).optional(),
    surname: z.string().min(1).optional(),
    accountEnabled: z.boolean().optional(),
  }),
};

export const deleteUserSchema = {
  params: z.object({
    domainId: z.string().min(1),
    userId: z.string().min(1),
  }),
};

export const resetPasswordSchema = {
  params: z.object({
    domainId: z.string().min(1),
    userId: z.string().min(1),
  }),
  body: z.object({
    newPassword: z.string().min(8),
  }),
};

export const listUsersSchema = {
  params: domainIdParamSchema,
};

