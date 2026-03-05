import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import * as walletService from '../wallet/walletService';

const router = Router();

// GET /api/wallets — list my wallets
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wallets = await walletService.getWalletsByUser(req.user!.userId);
    res.json(wallets);
  } catch (err) {
    next(err);
  }
});

// GET /api/wallets/:id — get a single wallet
router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wallet = await walletService.getWalletById(req.params.id, req.user!.userId);
    res.json(wallet);
  } catch (err) {
    next(err);
  }
});

// POST /api/wallets — create additional wallet (non-USD)
router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currency } = req.body;
    if (!['USD', 'EUR', 'GBP'].includes(currency)) {
      res.status(400).json({ error: 'Invalid currency' });
      return;
    }
    const wallet = await walletService.createWallet(req.user!.userId, currency);
    res.status(201).json(wallet);
  } catch (err) {
    next(err);
  }
});

export default router;
