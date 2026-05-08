import { Request, Response, NextFunction } from 'express';
import { getConfig } from '../config';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: {
        type: 'authentication_error',
        message: 'Missing or invalid Authorization header. Expected "Bearer <token>"'
      }
    });
  }

  const token = authHeader.split(' ')[1];
  const config = getConfig();

  if (!config.auth.valid_tokens.includes(token)) {
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
