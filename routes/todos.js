import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// All routes require authentication
router.use(authenticateToken);

// Create new todo
router.post('/', async (req, res) => {
  try {
    const { title, description } = req.body;
    const userId = req.user.id;

    // Validation
    if (!title || title.trim() === '') {
      return res.status(400).json({ error: 'Title is required' });
    }

    // Create todo
    const todo = await prisma.todo.create({
      data: {
        userId,
        title: title.trim(),
        description: description?.trim() || ''
      }
    });

    res.status(201).json({
      message: 'Todo created successfully',
      todo
    });
  } catch (error) {
    console.error('Create todo error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all todos for user
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { completed, limit = 100, offset = 0 } = req.query;

    const where = { userId };
    if (completed !== undefined) {
      where.completed = completed === 'true';
    }

    const todos = await prisma.todo.findMany({
      where,
      orderBy: [
        { completed: 'asc' },
        { createdAt: 'desc' }
      ],
      take: parseInt(limit),
      skip: parseInt(offset)
    });

    const total = await prisma.todo.count({ where });

    // Get counts
    const completedCount = await prisma.todo.count({
      where: { userId, completed: true }
    });
    const pendingCount = await prisma.todo.count({
      where: { userId, completed: false }
    });

    res.json({
      todos,
      counts: {
        total,
        completed: completedCount,
        pending: pendingCount
      },
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + parseInt(limit) < total
      }
    });
  } catch (error) {
    console.error('Get todos error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete all completed todos
router.delete('/completed/all', async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await prisma.todo.deleteMany({
      where: {
        userId,
        completed: true
      }
    });

    res.json({
      message: `${result.count} completed todos deleted successfully`,
      deletedCount: result.count
    });
  } catch (error) {
    console.error('Delete completed todos error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single todo
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const todo = await prisma.todo.findFirst({
      where: {
        id: parseInt(id),
        userId
      }
    });

    if (!todo) {
      return res.status(404).json({ error: 'Todo not found' });
    }

    res.json(todo);
  } catch (error) {
    console.error('Get todo error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update todo
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, completed } = req.body;
    const userId = req.user.id;

    // Check if todo belongs to user
    const existingTodo = await prisma.todo.findFirst({
      where: {
        id: parseInt(id),
        userId
      }
    });

    if (!existingTodo) {
      return res.status(404).json({ error: 'Todo not found' });
    }

    // Prepare update data
    const updateData = {};
    if (title !== undefined) {
      if (title.trim() === '') {
        return res.status(400).json({ error: 'Title cannot be empty' });
      }
      updateData.title = title.trim();
    }
    if (description !== undefined) {
      updateData.description = description?.trim() || '';
    }
    if (completed !== undefined) {
      updateData.completed = Boolean(completed);
    }

    // Update todo
    const todo = await prisma.todo.update({
      where: { id: parseInt(id) },
      data: updateData
    });

    res.json({
      message: 'Todo updated successfully',
      todo
    });
  } catch (error) {
    console.error('Update todo error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Toggle todo completion
router.patch('/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if todo belongs to user
    const existingTodo = await prisma.todo.findFirst({
      where: {
        id: parseInt(id),
        userId
      }
    });

    if (!existingTodo) {
      return res.status(404).json({ error: 'Todo not found' });
    }

    // Toggle completion
    const todo = await prisma.todo.update({
      where: { id: parseInt(id) },
      data: {
        completed: !existingTodo.completed
      }
    });

    res.json({
      message: 'Todo status updated successfully',
      todo
    });
  } catch (error) {
    console.error('Toggle todo error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete todo
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if todo belongs to user
    const existingTodo = await prisma.todo.findFirst({
      where: {
        id: parseInt(id),
        userId
      }
    });

    if (!existingTodo) {
      return res.status(404).json({ error: 'Todo not found' });
    }

    // Delete todo
    await prisma.todo.delete({
      where: { id: parseInt(id) }
    });

    res.json({
      message: 'Todo deleted successfully'
    });
  } catch (error) {
    console.error('Delete todo error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
