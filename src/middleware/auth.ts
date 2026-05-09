import { Request, Response, NextFunction } from 'express';
import { getConfig } from '../config';
import crypto from 'crypto';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const config = getConfig();
  
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: {
        type: 'authentication_error',
        message: 'Missing or invalid Authorization header.'
      }
    });
  }

  const token = authHeader.split(' ')[1];
  const tokenBuffer = Buffer.from(token, 'utf8');
  let isValid = false;

  for (const validToken of config.auth.valid_tokens) {
    const validBuffer = Buffer.from(validToken, 'utf8');
    // timingSafeEqual 必须要求两个 Buffer 长度一致，否则会报错
    if (tokenBuffer.length === validBuffer.length && crypto.timingSafeEqual(tokenBuffer, validBuffer)) {
      isValid = true;
      break;
    }
  }

  if (!isValid) {
    return res.status(403).json({
      error: {
        type: 'authentication_error',
        message: 'Invalid API key provided.'
      }
    });
  }

  // Token is valid, proceed
  next();
}
