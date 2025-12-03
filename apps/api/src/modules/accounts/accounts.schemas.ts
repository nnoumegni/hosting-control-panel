import { z } from 'zod';

import {
  createHostingAccountSchema,
  createHostingPlanSchema,
  listAccountsQuerySchema,
  objectIdSchema,
  updateHostingAccountSchema,
  updateHostingPlanSchema,
} from '@hosting/common';

const nonEmpty = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema.refine((value) => Object.keys(value).length > 0, {
    message: 'Body must include at least one field',
  });

export const createPlanValidation = {
  body: createHostingPlanSchema,
};

export const updatePlanValidation = {
  params: z.object({ id: objectIdSchema }),
  body: nonEmpty(updateHostingPlanSchema.partial()),
};

export const planParamsValidation = {
  params: z.object({ id: objectIdSchema }),
};

export const createAccountValidation = {
  body: createHostingAccountSchema,
};

export const updateAccountValidation = {
  params: z.object({ id: objectIdSchema }),
  body: nonEmpty(updateHostingAccountSchema.partial()),
};

export const accountParamsValidation = {
  params: z.object({ id: objectIdSchema }),
};

export const listAccountsValidation = {
  query: listAccountsQuerySchema,
};

export type CreatePlanBody = z.infer<typeof createHostingPlanSchema>;
export type UpdatePlanBody = z.infer<typeof updateHostingPlanSchema>;
export type CreateAccountBody = z.infer<typeof createHostingAccountSchema>;
export type UpdateAccountBody = z.infer<typeof updateHostingAccountSchema>;
export type ListAccountsQuery = z.infer<typeof listAccountsQuerySchema>;
