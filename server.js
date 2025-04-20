// land-scraper-backend/server.js

const dotenv = require('dotenv');
// ✅ Load environment variables BEFORE anything else
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const helmet = require('helmet'); // Added for security
const morgan = require('morgan'); // Added for logging
const fs = require('fs');

// Load routes
const propertiesRoutes = require('./routes/properties');
const valuationRoutes = require('./routes/valuation');
const scrapingRoutes = require('./routes/scraping');

// Load error handlers
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Create request log stream
const accessLogStream = fs.createWriteStream(path.join(logsDir, 'access.log'), { flags: 'a' });

// Middleware
app.use(helmet()); // Secure HTTP headers
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: accessLogStream })); // Log all requests

// MongoDB connection with better error handling
mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/land-valuation", {
  // No need for useNewUrlParser and useUnifiedTopology in newer versions of Mongoose
})
.then(() => console.log('MongoDB connected'))
.catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1); // Exit if DB connection fails
});

// API Routes
app.use('/api/properties', propertiesRoutes);
app.use('/api/valuation', valuationRoutes);
app.use('/api/scrape', scrapingRoutes);

// Health check route
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({ 
    status: 'ok', 
    message: 'Land Valuation API is running',
    dbStatus,
    apiVersion: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// 404 handler for undefined routes
app.use(notFoundHandler);

// Error handling middleware
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', shutDown);
process.on('SIGINT', shutDown);

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

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
});