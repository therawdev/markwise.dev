import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';

// Credential endpoints (login/signup): brute-force protection, keyed by client IP.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many attempts — try again in a few minutes' },
});

// AI completions are expensive; key on the signed-in user (requireAuth runs first).
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req: Request) => (req.user ? `user:${req.user.id}` : ipKeyGenerator(req.ip!)),
  message: { error: 'AI rate limit reached — wait a minute and try again' },
});
