const express = require('express');
const { NODE_ENV } = require('./config/env');
const corsMiddleware = require('./middleware/corsMiddleware');
const requestLogger = require('./middleware/requestLogger');
const errorMiddleware = require('./middleware/errorMiddleware');

// Routes
const authRoutes = require('./routes/authRoutes');
const telegramRoutes = require('./routes/telegramRoutes');
const reportRoutes = require('./routes/reportRoutes');
const userRoutes = require('./routes/userRoutes');
const hostRoutes = require('./routes/hostRoutes');
const { handleWebhook } = require('./controllers/telegramController');

const app = express();

// Core middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(corsMiddleware);
app.use(requestLogger);

// Health check
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Live Session Reporting API',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        environment: NODE_ENV,
        endpoints: {
            auth: '/api/auth',
            webhook: '/api/webhook',
            reports: '/api/reports',
            users: '/api/users',
            hosts: '/api/hosts',
        },
    });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/webhook', telegramRoutes);
app.post('/api/telegram/webhook', handleWebhook);
app.use('/api/reports', reportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/hosts', hostRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found',
        path: req.originalUrl,
    });
});

// Error handler
app.use(errorMiddleware);

module.exports = app;

