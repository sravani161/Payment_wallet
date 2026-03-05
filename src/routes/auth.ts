import { Router, Request, Response, NextFunction } from 'express';
import * as authService from '../auth/authService';
import { registerValidation, loginValidation, validate } from '../middleware/validation';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/register', registerValidation, validate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/login', loginValidation, validate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.login(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      res.status(400).json({ error: 'refresh_token required' });
      return;
    }
    const result = await authService.refreshAccessToken(refresh_token);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/logout', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refresh_token } = req.body;
    if (refresh_token) await authService.logout(refresh_token);
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
