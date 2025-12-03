import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(8),
  mfaToken: z.string().optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(10),
});


