import { Router } from 'express';
import { createUser, findUserByEmail, publicUser, verifyPassword } from '../db/users.js';
import { getSettings, publicSettings } from '../db/settings.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authJWT, clearAuthCookie, setAuthCookie, signToken } from '../middleware/authJWT.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { credentialsSchema, validate } from '../middleware/validate.js';

const router = Router();

function sessionPayload(user) {
  return {
    token: signToken(user),
    user: publicUser(user),
    settings: publicSettings(getSettings(user.id)),
  };
}

/** POST /api/auth/register */
router.post(
  '/register',
  authLimiter,
  validate({ body: credentialsSchema }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = createUser({ email, password });
    const payload = sessionPayload(user);
    setAuthCookie(res, payload.token);
    res.status(201).json(payload);
  }),
);

/** POST /api/auth/login */
router.post(
  '/login',
  authLimiter,
  validate({ body: credentialsSchema }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = findUserByEmail(email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({
        error: { code: 'invalid_credentials', message: 'Email o contraseña incorrectos' },
      });
    }
    const payload = sessionPayload(user);
    setAuthCookie(res, payload.token);
    res.json(payload);
  }),
);

/** GET /api/auth/me */
router.get(
  '/me',
  authJWT,
  asyncHandler(async (req, res) => {
    res.json({
      user: req.userPublic,
      settings: publicSettings(getSettings(req.user.id)),
    });
  }),
);

/** POST /api/auth/logout */
router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

export default router;
