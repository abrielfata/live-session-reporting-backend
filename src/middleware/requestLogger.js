const { randomUUID } = require('crypto');

const requestLogger = (req, res, next) => {
    const correlationId = req.headers['x-correlation-id'] || randomUUID();
    req.correlationId = correlationId;
    res.setHeader('x-correlation-id', correlationId);

    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(
            `[${correlationId}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`
        );
    });

    next();
};

module.exports = requestLogger;

