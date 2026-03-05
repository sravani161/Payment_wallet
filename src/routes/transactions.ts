import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { transactionValidation, validate } from '../middleware/validation';
import * as paymentService from '../payments/paymentService';
import { getWalletById } from '../wallet/walletService';

const router = Router();

// POST /api/transactions — create a transaction
router.post(
  '/',
  authenticate,
  transactionValidation,
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { from_wallet_id, ...data } = req.body;

      // Verify user owns the from_wallet
      const fromWalletId = from_wallet_id || (await getWalletById(req.user!.userId + '_default')).id;
      if (!from_wallet_id) {
        // Get user's first active wallet
        const wallets = await (await import('../wallet/walletService')).getWalletsByUser(req.user!.userId);
        if (!wallets.length) {
          res.status(400).json({ error: 'No wallet found' });
          return;
        }
        const transaction = await paymentService.createTransaction(req.user!.userId, wallets[0].id, data);
        res.status(202).json(transaction);
        return;
      }

      await getWalletById(from_wallet_id, req.user!.userId); // ownership check
      const transaction = await paymentService.createTransaction(req.user!.userId, from_wallet_id, data);
      res.status(202).json(transaction);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/transactions/:id
router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const transaction = await paymentService.getTransaction(req.params.id, req.user!.userId);
    res.json(transaction);
  } catch (err) {
    next(err);
  }
});

// GET /api/transactions/wallet/:walletId
router.get('/wallet/:walletId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 0;
    const size = Math.min(parseInt(req.query.size as string) || 20, 100);
    const result = await paymentService.getTransactionsByWallet(
      req.params.walletId,
      req.user!.userId,
      page,
      size
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// PUT /api/transactions/:id/status — admin only
router.put(
  '/:id/status',
  authenticate,
  authorize('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status } = req.body;
      const transaction = await paymentService.updateTransactionStatus(
        req.params.id,
        status,
        req.user!.userId
      );
      res.json(transaction);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
