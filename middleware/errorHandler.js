// middleware/errorHandler.js

const fs = require('fs');
const path = require('path');

// Custom error types
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

class DatabaseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DatabaseError';
    this.statusCode = 500;
  }
}

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Error logger
const logError = (err, req) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${err.name}: ${err.message}\n`;
  const requestInfo = `  Request: ${req.method} ${req.originalUrl}\n`;
  const userAgent = `  User-Agent: ${req.get('user-agent')}\n`;
  const stackTrace = `  Stack: ${err.stack}\n\n`;
  
  fs.appendFileSync(
    path.join(logsDir, 'errors.log'),
    logMessage + requestInfo + userAgent + stackTrace
  );
};

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  // Log the error
  logError(err, req);
  
  // Set default status code and message
  const statusCode = err.statusCode || 500;
  let errorMessage = err.message || 'Internal Server Error';
  
  // In production, don't expose error details for 500 errors
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    errorMessage = 'An unexpected error occurred';
  }
  
  // Return error response
  res.status(statusCode).json({
    success: false,
    error: {
      message: errorMessage,
      type: err.name || 'Error',
      code: statusCode
    }
  });
};

// 404 handler middleware
const notFoundHandler = (req, res, next) => {
  const err = new NotFoundError(`Route not found: ${req.originalUrl}`);
  next(err);
};

module.exports = {
  ValidationError,
  NotFoundError,
  DatabaseError,
  errorHandler,
  notFoundHandler
};