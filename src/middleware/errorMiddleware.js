const { NODE_ENV } = require('../config/env');

// eslint-disable-next-line no-unused-vars
const errorMiddleware = (err, req, res, next) => {
    const status = err.statusCode || err.status || 500;
    res.status(status).json({
        success: false,
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Internal server error',
        ...(NODE_ENV === 'development' && { stack: err.stack }),
        ...(err.metadata && { metadata: err.metadata })
    });
};

module.exports = errorMiddleware;

