import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// All routes require authentication
router.use(authenticateToken);

// Create new transaction
router.post('/', async (req, res) => {
  try {
    const { amount, description, date, savingId } = req.body;
    const userId = req.user.id;

    // Validation
    if (!amount || !savingId) {
      return res.status(400).json({ error: 'Amount and saving ID are required' });
    }

    if (amount <= 0) {
      return res.status(400).json({ error: 'Amount must be positive' });
    }

    // Check if saving belongs to user
    const saving = await prisma.saving.findFirst({
      where: {
        id: parseInt(savingId),
        userId
      }
    });

    if (!saving) {
      return res.status(404).json({ error: 'Saving not found' });
    }

    // Create transaction
    const transaction = await prisma.transaction.create({
      data: {
        userId,
        savingId: parseInt(savingId),
        amount: parseFloat(amount),
        description: description || '',
        date: date ? new Date(date) : new Date()
      },
      include: {
        saving: true
      }
    });

    res.status(201).json({
      message: 'Transaction created successfully',
      transaction
    });
  } catch (error) {
    console.error('Create transaction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get transactions for a specific saving
router.get('/saving/:savingId', async (req, res) => {
  try {
    const { savingId } = req.params;
    const userId = req.user.id;

    // Check if saving belongs to user
    const saving = await prisma.saving.findFirst({
      where: {
        id: parseInt(savingId),
        userId
      }
    });

    if (!saving) {
      return res.status(404).json({ error: 'Saving not found' });
    }

    const transactions = await prisma.transaction.findMany({
      where: {
        savingId: parseInt(savingId),
        userId
      },
      orderBy: {
        date: 'desc'
      },
      include: {
        saving: {
          select: {
            monthlyAmount: true,
            dailyBudget: true,
            month: true,
            year: true
          }
        }
      }
    });

    // Calculate running totals and daily differences
    let runningTotal = 0;
    const transactionsWithCalculations = transactions.map((transaction, index) => {
      runningTotal += transaction.amount;
      
      // Calculate expected spending up to this transaction's date
      const transactionDate = new Date(transaction.date);
      const dayOfMonth = transactionDate.getDate();
      const expectedSpent = saving.dailyBudget * dayOfMonth;
      const difference = expectedSpent - runningTotal;

      return {
        ...transaction,
        runningTotal,
        expectedSpent,
        difference: difference >= 0 ? `+${difference.toFixed(2)}` : difference.toFixed(2)
      };
    });

    res.json(transactionsWithCalculations.reverse()); // Show oldest first for running total
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all transactions for user
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 50, offset = 0 } = req.query;

    const transactions = await prisma.transaction.findMany({
      where: { userId },
      orderBy: {
        date: 'desc'
      },
      take: parseInt(limit),
      skip: parseInt(offset),
      include: {
        saving: {
          select: {
            month: true,
            year: true,
            dailyBudget: true
          }
        }
      }
    });

    const total = await prisma.transaction.count({
      where: { userId }
    });

    res.json({
      transactions,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + parseInt(limit) < total
      }
    });
  } catch (error) {
    console.error('Get all transactions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update transaction
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, description, date } = req.body;
    const userId = req.user.id;

    // Check if transaction belongs to user
    const existingTransaction = await prisma.transaction.findFirst({
      where: {
        id: parseInt(id),
        userId
      }
    });

    if (!existingTransaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Update transaction
    const transaction = await prisma.transaction.update({
      where: { id: parseInt(id) },
      data: {
        ...(amount && { amount: parseFloat(amount) }),
        ...(description !== undefined && { description }),
        ...(date && { date: new Date(date) })
      },
      include: {
        saving: true
      }
    });

    res.json({
      message: 'Transaction updated successfully',
      transaction
    });
  } catch (error) {
    console.error('Update transaction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete transaction
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if transaction belongs to user
    const existingTransaction = await prisma.transaction.findFirst({
      where: {
        id: parseInt(id),
        userId
      }
    });

    if (!existingTransaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Delete transaction
    await prisma.transaction.delete({
      where: { id: parseInt(id) }
    });

    res.json({
      message: 'Transaction deleted successfully'
    });
  } catch (error) {
    console.error('Delete transaction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
