// land-valuation-backend/server.js

const dotenv = require('dotenv');
// ✅ Load environment variables BEFORE anything else
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const fs = require('fs');
const Property = require('./models/Property');

// Load routes
const propertiesRoutes = require('./routes/properties');
const valuationRoutes = require('./routes/valuation');

// Load error handler (create a minimal version if it doesn't exist)
let errorHandler, notFoundHandler;

try {
  const errorHandlers = require('./middleware/errorHandler');
  errorHandler = errorHandlers.errorHandler;
  notFoundHandler = errorHandlers.notFoundHandler;
} catch (error) {
  console.log('Error handler middleware not found, using default handlers');
  
  // Simple error handler
  errorHandler = (err, req, res, next) => {
    console.error(err);
    res.status(err.statusCode || 500).json({
      success: false,
      error: {
        message: err.message || 'Server Error',
        type: err.name || 'Error'
      }
    });
  };
  
  // Simple 404 handler
  notFoundHandler = (req, res) => {
    res.status(404).json({
      success: false,
      error: {
        message: `Route not found: ${req.originalUrl}`,
        type: 'NotFoundError'
      }
    });
  };
}

const app = express();
const PORT = process.env.PORT || 5000;

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Simple request logger since morgan isn't installed
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  next();
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api/properties', propertiesRoutes);
app.use('/api/valuation', valuationRoutes);

// Health check route
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({ 
    status: 'ok', 
    message: 'Land Valuation API is running',
    dbStatus,
    apiVersion: '1.1.0',
    timestamp: new Date().toISOString()
  });
});

// 404 handler for undefined routes
app.use(notFoundHandler);

// Error handling middleware
app.use(errorHandler);

// Basic error handler for unhandled errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  fs.appendFileSync(
    path.join(logsDir, 'errors.log'),
    `[${new Date().toISOString()}] Uncaught Exception: ${err.message}\n${err.stack}\n`
  );
});

// MongoDB connection with better error handling
mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/land-valuation")
.then(() => {
  console.log('MongoDB connected');
})
.catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1); // Exit if DB connection fails
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
});

// Graceful shutdown
process.on('SIGTERM', () => shutDown());
process.on('SIGINT', () => shutDown());

function shutDown() {
  console.log('Received kill signal, shutting down gracefully');
  
  // Close the server
  server.close(() => {
    console.log('Server closed');
    
    // Close the database connection
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
  
  // If server hasn't closed in 10 seconds, force shutdown
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}