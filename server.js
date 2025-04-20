// land-scraper-backend/server.js

const dotenv = require('dotenv');
// ✅ Load environment variables BEFORE anything else
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '.env') });

console.log("MongoDB URI:", process.env.MONGODB_URI);
console.log("Google Maps Key:", process.env.GOOGLE_MAPS_API_KEY); // should now log correctly
console.log("Current directory:", __dirname);

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

// Load routes
const propertiesRoutes = require('./routes/properties');
const valuationRoutes = require('./routes/valuation');
const scrapingRoutes = require('./routes/scraping');

// Load environment variables

const app = express();
const PORT = process.env.PORT || 5000;

// Log for debugging
console.log("MongoDB URI:", process.env.MONGODB_URI);

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect("mongodb://127.0.0.1:27017/land-valuation")
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// API Routes
app.use('/api/properties', propertiesRoutes);
app.use('/api/valuation', valuationRoutes);
app.use('/api/scrape', scrapingRoutes);

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Land Valuation API is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
});