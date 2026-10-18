import jwt from 'jsonwebtoken';
import config from '../config.js';
import { findUserById, publicUser } from '../db/users.js';

const COOKIE_NAME = 'owc_token';

export function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
    issuer: 'opencode-web-chat',
  });
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret, { issuer: 'opencode-web-chat' });
}

/** Guarda el JWT en una cookie httpOnly para el frontend. */
export function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

/** Extrae el token del header Authorization, query string o cookie. */
export function extractToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  if (req.query?.token) return String(req.query.token);
  if (req.cookies?.[COOKIE_NAME]) return req.cookies[COOKIE_NAME];
  return null;
}

/** Middleware que exige un JWT válido. */
export function authJWT(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: { code: 'no_token', message: 'Autenticación requerida' } });
  }
  try {
    const payload = verifyToken(token);
    const user = findUserById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: { code: 'user_not_found', message: 'La cuenta no existe' } });
    }
    req.user = user;
    req.userPublic = publicUser(user);
    next();
  } catch (error) {
    const expired = error.name === 'TokenExpiredError';
    return res.status(401).json({
      error: {
        code: expired ? 'token_expired' : 'invalid_token',
        message: expired ? 'La sesión expiró, vuelve a iniciar sesión' : 'Token inválido',
      },
    });
  }
}

export default { signToken, verifyToken, authJWT, extractToken, setAuthCookie, clearAuthCookie };
