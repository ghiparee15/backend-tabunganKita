import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
// import { PrismaClient } from '@prisma/client';

// Import routes
// import authRoutes from './routes/auth.js';
// import savingsRoutes from './routes/savings.js';
// import transactionsRoutes from './routes/transactions.js';
// import todosRoutes from './routes/todos.js';

// Load environment variables
dotenv.config();

// Initialize Prisma Client
// const prisma = new PrismaClient();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: [
    'http://localhost:3000', // Local development
    'https://frontend-tabungan-kita.vercel.app', // Production frontend
    'https://*.vercel.app' // All Vercel apps
  ],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes - Temporarily disabled for Prisma fix
// app.use('/api/auth', authRoutes);
// app.use('/api/savings', savingsRoutes);
// app.use('/api/transactions', transactionsRoutes);
// app.use('/api/todos', todosRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Tabungan Kita API Server',
    status: 'running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({
    message: 'API Test Successful',
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ message: 'Server is running!' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
