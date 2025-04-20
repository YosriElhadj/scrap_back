// land-scraper-backend/server.js

const dotenv = require('dotenv');
// ✅ Load environment variables BEFORE anything else
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const fs = require('fs');
const Property = require('./models/Property');
const { spawn } = require('child_process');

// Load routes
const propertiesRoutes = require('./routes/properties');
const valuationRoutes = require('./routes/valuation');
const scrapingRoutes = require('./routes/scraping');

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

// Create scripts directory if it doesn't exist
const scriptsDir = path.join(__dirname, 'scripts');
if (!fs.existsSync(scriptsDir)) {
  fs.mkdirSync(scriptsDir, { recursive: true });
  
  // Copy the addInitialData.js script if it doesn't exist
  const scriptPath = path.join(scriptsDir, 'addInitialData.js');
  if (!fs.existsSync(scriptPath)) {
    try {
      // Create a minimal version
      const scriptContent = `
// scripts/addInitialData.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Property = require('../models/Property');
const fs = require('fs');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function connectToDatabase() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/land-valuation");
    console.log('Connected to MongoDB successfully');
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  }
}

async function addInitialData() {
  try {
    await connectToDatabase();
    
    // Check if database already has properties
    const propertyCount = await Property.countDocuments();
    console.log(\`Current property count: \${propertyCount}\`);
    
    if (propertyCount > 0) {
      console.log('Database already has properties. Skipping initial data import.');
      process.exit(0);
    }
    
    console.log('Adding initial properties...');
    
    // Add a few simple properties to get started
    const initialProperties = [
      {
        address: "123 Sample St",
        city: "Austin",
        state: "TX",
        zipCode: "78701",
        price: 250000,
        area: 43560, // 1 acre
        pricePerSqFt: 250000 / 43560,
        zoning: "residential",
        features: {
          nearWater: false,
          roadAccess: true,
          utilities: true
        },
        description: "Sample property for initial database setup.",
        location: {
          type: "Point",
          coordinates: [-97.7430608, 30.267153]
        },
        lastUpdated: new Date(),
        listedDate: new Date()
      }
    ];
    
    // Insert the property
    await Property.insertMany(initialProperties);
    
    console.log('Added initial properties to the database');
    
    // Create a marker file to indicate initial data has been added
    fs.writeFileSync(path.join(__dirname, '../.initial-data-added'), new Date().toISOString());
    
  } catch (error) {
    console.error('Error adding initial data:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
    process.exit(0);
  }
}

// Run the function
addInitialData();
      `;
      
      fs.writeFileSync(scriptPath, scriptContent);
      console.log('Created addInitialData.js script');
    } catch (error) {
      console.error('Error creating initial data script:', error);
    }
  }
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

// Check if database has initial data
async function checkAndAddInitialData() {
  try {
    // Check database connection first
    if (mongoose.connection.readyState !== 1) {
      console.log('Database not connected yet, skipping initial data check');
      return;
    }
    
    // Count properties
    const propertyCount = await Property.countDocuments();
    console.log(`Current property count: ${propertyCount}`);
    
    if (propertyCount === 0) {
      console.log('No properties found in database, running initial data script');
      
      // Run the initial data script
      const addInitialDataProcess = spawn('node', [path.join(__dirname, 'scripts/addInitialData.js')]);
      
      addInitialDataProcess.stdout.on('data', (data) => {
        console.log(`Initial data script: ${data}`);
      });
      
      addInitialDataProcess.stderr.on('data', (data) => {
        console.error(`Initial data script error: ${data}`);
      });
      
      addInitialDataProcess.on('close', (code) => {
        console.log(`Initial data script exited with code ${code}`);
      });
    }
  } catch (error) {
    console.error('Error checking for initial data:', error);
  }
}

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
mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/land-valuation", {
  // No need for useNewUrlParser and useUnifiedTopology in newer versions of Mongoose
})
.then(() => {
  console.log('MongoDB connected');
  // Check for initial data once DB is connected
  checkAndAddInitialData();
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