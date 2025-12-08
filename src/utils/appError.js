class AppError extends Error {
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', metadata = {}) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.metadata = metadata;
        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = AppError;

