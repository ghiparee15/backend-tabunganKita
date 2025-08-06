import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// All routes require authentication
router.use(authenticateToken);

// Create or update monthly savings
router.post('/', async (req, res) => {
  try {
    // Support both old and new format for backward compatibility
    const {
      monthlyIncome,
      savingTarget,
      period = 'monthly',
      month,
      year,
      weekNumber
    } = req.body;
    const userId = req.user.id;

    let finalDailyBudget;

    // Validation
    if (!monthlyIncome || !savingTarget) {
      return res.status(400).json({ error: 'Monthly income and saving target are required' });
    }

    const finalMonthlyIncome = parseFloat(monthlyIncome);
    const finalSavingTarget = parseFloat(savingTarget);
    const finalAvailableAmount = finalMonthlyIncome - finalSavingTarget;

    // Calculate daily budget based on period
    let days;
    if (period === 'weekly') {
      days = 7; // 7 days for weekly period
    } else {
      days = new Date(year, month, 0).getDate(); // Days in month
    }
    finalDailyBudget = finalAvailableAmount / days;

    // Validation
    if (finalMonthlyIncome <= 0) {
      return res.status(400).json({ error: 'Monthly income must be positive' });
    }
    if (finalSavingTarget < 0) {
      return res.status(400).json({ error: 'Saving target cannot be negative' });
    }
    if (finalSavingTarget >= finalMonthlyIncome) {
      return res.status(400).json({ error: 'Saving target cannot be equal or greater than monthly income' });
    }

    // Common validation
    if (!month || !year) {
      return res.status(400).json({ error: 'Month and year are required' });
    }
    if (month < 1 || month > 12) {
      return res.status(400).json({ error: 'Month must be between 1 and 12' });
    }

    // Create or update saving
    let saving;

    if (period === 'weekly') {
      // For weekly savings
      if (!weekNumber) {
        return res.status(400).json({ error: 'Week number is required for weekly savings' });
      }

      saving = await prisma.saving.upsert({
        where: {
          userId_month_year_weekNumber: {
            userId,
            month: parseInt(month),
            year: parseInt(year),
            weekNumber: parseInt(weekNumber)
          }
        },
        update: {
          monthlyIncome: finalMonthlyIncome,
          savingTarget: finalSavingTarget,
          availableAmount: finalAvailableAmount,
          dailyBudget: finalDailyBudget,
          period: period
        },
        create: {
          userId,
          monthlyIncome: finalMonthlyIncome,
          savingTarget: finalSavingTarget,
          availableAmount: finalAvailableAmount,
          dailyBudget: finalDailyBudget,
          period: period,
          month: parseInt(month),
          year: parseInt(year),
          weekNumber: parseInt(weekNumber)
        }
      });
    } else {
      // For monthly savings, use findFirst + create/update pattern
      const existingSaving = await prisma.saving.findFirst({
        where: {
          userId,
          month: parseInt(month),
          year: parseInt(year),
          weekNumber: null
        }
      });

      if (existingSaving) {
        // Update existing monthly saving
        saving = await prisma.saving.update({
          where: { id: existingSaving.id },
          data: {
            monthlyIncome: finalMonthlyIncome,
            savingTarget: finalSavingTarget,
            availableAmount: finalAvailableAmount,
            dailyBudget: finalDailyBudget,
            period: period
          }
        });
      } else {
        // Create new monthly saving
        saving = await prisma.saving.create({
          data: {
            userId,
            monthlyIncome: finalMonthlyIncome,
            savingTarget: finalSavingTarget,
            availableAmount: finalAvailableAmount,
            dailyBudget: finalDailyBudget,
            period: period,
            month: parseInt(month),
            year: parseInt(year),
            weekNumber: null
          }
        });
      }
    }

    res.json({
      message: 'Savings updated successfully',
      saving
    });
  } catch (error) {
    console.error('Create/Update savings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all savings for user
router.get('/all', async (req, res) => {
  try {
    const userId = req.user.id;

    const savings = await prisma.saving.findMany({
      where: { userId },
      orderBy: [
        { year: 'desc' },
        { month: 'desc' }
      ],
      include: {
        transactions: true
      }
    });

    // Calculate summaries for each saving
    const savingsWithSummary = savings.map(saving => {
      const totalSpent = saving.transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
      const remainingBudget = saving.availableAmount - totalSpent;
      
      return {
        ...saving,
        summary: {
          totalSpent,
          remainingBudget,
          transactionCount: saving.transactions.length
        }
      };
    });

    res.json(savingsWithSummary);
  } catch (error) {
    console.error('Get all savings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get savings for a specific month/year
router.get('/:year/:month', async (req, res) => {
  try {
    const { year, month } = req.params;
    const userId = req.user.id;

    // For monthly savings, try to find with weekNumber = null first
    let saving = await prisma.saving.findFirst({
      where: {
        userId,
        month: parseInt(month),
        year: parseInt(year),
        weekNumber: null
      },
      include: {
        transactions: {
          orderBy: {
            date: 'desc'
          }
        }
      }
    });

    if (!saving) {
      return res.status(404).json({ error: 'Savings not found for this month' });
    }

    // Calculate totals
    const totalSpent = saving.transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
    const remainingBudget = saving.availableAmount - totalSpent;
    const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
    const currentDay = new Date().getDate();
    const expectedSpent = saving.dailyBudget * currentDay;
    const difference = expectedSpent - totalSpent;

    res.json({
      saving,
      summary: {
        totalSpent,
        remainingBudget,
        expectedSpent,
        difference,
        daysInMonth,
        currentDay
      }
    });
  } catch (error) {
    console.error('Get savings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete saving
router.delete('/:id', async (req, res) => {
  try {
    const savingId = parseInt(req.params.id);
    const userId = req.user.id;

    // Check if saving exists and belongs to user
    const saving = await prisma.saving.findFirst({
      where: {
        id: savingId,
        userId: userId
      },
      include: {
        transactions: true
      }
    });

    if (!saving) {
      return res.status(404).json({ error: 'Saving not found or does not belong to you' });
    }

    // Check if saving has transactions
    if (saving.transactions.length > 0) {
      return res.status(400).json({
        error: 'Cannot delete saving with existing transactions. Please delete all transactions first.',
        transactionCount: saving.transactions.length
      });
    }

    // Delete the saving
    await prisma.saving.delete({
      where: { id: savingId }
    });

    res.json({
      message: 'Saving deleted successfully',
      deletedSaving: {
        id: saving.id,
        month: saving.month,
        year: saving.year
      }
    });
  } catch (error) {
    console.error('Error deleting saving:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete saving with all transactions (force delete)
router.delete('/:id/force', async (req, res) => {
  try {
    const savingId = parseInt(req.params.id);
    const userId = req.user.id;

    // Check if saving exists and belongs to user
    const saving = await prisma.saving.findFirst({
      where: {
        id: savingId,
        userId: userId
      },
      include: {
        transactions: true
      }
    });

    if (!saving) {
      return res.status(404).json({ error: 'Saving not found or does not belong to you' });
    }

    const transactionCount = saving.transactions.length;

    // Delete all transactions first, then the saving
    await prisma.$transaction(async (prisma) => {
      // Delete all transactions
      await prisma.transaction.deleteMany({
        where: { savingId: savingId }
      });

      // Delete the saving
      await prisma.saving.delete({
        where: { id: savingId }
      });
    });

    res.json({
      message: 'Saving and all associated transactions deleted successfully',
      deletedSaving: {
        id: saving.id,
        month: saving.month,
        year: saving.year
      },
      deletedTransactions: transactionCount
    });
  } catch (error) {
    console.error('Error force deleting saving:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
