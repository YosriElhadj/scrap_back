// land-scraper-backend/server.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { Client } = require('@googlemaps/google-maps-services-js');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Google Maps client setup
const googleMapsClient = new Client({});

// MongoDB schemas
const PropertySchema = new mongoose.Schema({
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    }
  },
  address: String,
  city: String,
  state: String,
  zipCode: String,
  price: Number,
  area: Number, // in square feet
  pricePerSqFt: Number,
  zoning: String,
  features: {
    nearWater: Boolean,
    roadAccess: Boolean,
    utilities: Boolean
  },
  sourceUrl: String,
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

// Add geospatial index for location-based queries
PropertySchema.index({ location: '2dsphere' });

const Property = mongoose.model('Property', mongoose.Schema({
  ...PropertySchema.obj,
  parcelId: String,
  description: String,
  images: [String],
  listedDate: Date
}));

// API Routes

// Get properties by location (coordinates)
app.get('/api/properties/nearby', async (req, res) => {
  try {
    const { lat, lng, radius = 5000, limit = 20 } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({ message: 'Latitude and longitude are required' });
    }

    const properties = await Property.find({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: parseInt(radius)
        }
      }
    }).limit(parseInt(limit));

    res.json(properties);
  } catch (error) {
    console.error('Error fetching nearby properties:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get properties by address search
app.get('/api/properties/search', async (req, res) => {
  try {
    const { address } = req.query;
    
    if (!address) {
      return res.status(400).json({ message: 'Address is required' });
    }

    // Geocode the address using Google Maps API
    const response = await googleMapsClient.geocode({
      params: {
        address,
        key: process.env.GOOGLE_MAPS_API_KEY
      }
    });

    if (response.data.results.length === 0) {
      return res.status(404).json({ message: 'Location not found' });
    }

    const location = response.data.results[0].geometry.location;
    
    // Find properties near the geocoded location
    const properties = await Property.find({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [location.lng, location.lat]
          },
          $maxDistance: 5000 // 5km radius
        }
      }
    }).limit(20);

    res.json({
      geocodedLocation: {
        lat: location.lat,
        lng: location.lng,
        formattedAddress: response.data.results[0].formatted_address
      },
      properties
    });
  } catch (error) {
    console.error('Error searching properties:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Estimate land value based on input parameters
app.post('/api/valuation/estimate', async (req, res) => {
  try {
    const { 
      lat, 
      lng, 
      area, 
      zoning = 'residential',
      features = {
        nearWater: false,
        roadAccess: true,
        utilities: true
      }
    } = req.body;

    if (!lat || !lng || !area) {
      return res.status(400).json({ 
        message: 'Latitude, longitude, and area are required' 
      });
    }

    // Find comparable properties
    const comparables = await Property.find({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: 10000 // 10km radius
        }
      },
      zoning: zoning
    }).limit(10);

    if (comparables.length === 0) {
      return res.status(404).json({ 
        message: 'No comparable properties found in this area' 
      });
    }

    // Calculate average price per square foot
    const pricePerSqFtValues = comparables.map(property => property.pricePerSqFt);
    const avgPricePerSqFt = pricePerSqFtValues.reduce((sum, value) => sum + value, 0) / pricePerSqFtValues.length;
    
    // Base valuation
    let estimatedValue = avgPricePerSqFt * parseFloat(area);
    const valuationFactors = [];

    // Apply adjustment factors
    if (features.nearWater) {
      estimatedValue *= 1.15; // 15% premium
      valuationFactors.push({ factor: 'Water Proximity', adjustment: '+15%' });
    }
    
    if (!features.roadAccess) {
      estimatedValue *= 0.7; // 30% reduction
      valuationFactors.push({ factor: 'No Road Access', adjustment: '-30%' });
    }
    
    if (!features.utilities) {
      estimatedValue *= 0.8; // 20% reduction
      valuationFactors.push({ factor: 'No Utilities', adjustment: '-20%' });
    }

    // Get address information for the location
    const geocodeResponse = await googleMapsClient.reverseGeocode({
      params: {
        latlng: `${lat},${lng}`,
        key: process.env.GOOGLE_MAPS_API_KEY
      }
    });

    let address = 'Unknown location';
    let city = '';
    let state = '';
    let zipCode = '';

    if (geocodeResponse.data.results.length > 0) {
      const result = geocodeResponse.data.results[0];
      address = result.formatted_address;
      
      // Extract address components
      for (const component of result.address_components) {
        if (component.types.includes('locality')) {
          city = component.long_name;
        } else if (component.types.includes('administrative_area_level_1')) {
          state = component.short_name;
        } else if (component.types.includes('postal_code')) {
          zipCode = component.long_name;
        }
      }
    }

    res.json({
      location: {
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        address,
        city,
        state,
        zipCode
      },
      valuation: {
        estimatedValue: Math.round(estimatedValue),
        areaInSqFt: parseFloat(area),
        avgPricePerSqFt: avgPricePerSqFt,
        zoning,
        valuationFactors
      },
      comparables: comparables.map(property => ({
        id: property._id,
        address: property.address,
        price: property.price,
        area: property.area,
        pricePerSqFt: property.pricePerSqFt,
        features: property.features
      }))
    });
  } catch (error) {
    console.error('Error estimating value:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Scrape data from real estate listings
app.post('/api/scrape/listings', async (req, res) => {
  try {
    const { location } = req.body;
    
    if (!location) {
      return res.status(400).json({ message: 'Location is required' });
    }

    // In a real implementation, you would integrate with real estate APIs or web scraping
    // This is a placeholder for the real scraping functionality
    res.json({
      message: 'Scraping initiated',
      jobId: 'job_' + Date.now(),
      estimatedCompletionTime: '5 minutes'
    });
    
    // Trigger background scraping job here
    // This would typically be done using a job queue like Bull
    startScrapingJob(location);
    
  } catch (error) {
    console.error('Error initiating scraping:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// This would be a separate function handling the actual scraping
async function startScrapingJob(location) {
  try {
    console.log(`Starting scraping job for location: ${location}`);
    
    // 1. Geocode the location
    const geocodeResponse = await googleMapsClient.geocode({
      params: {
        address: location,
        key: process.env.GOOGLE_MAPS_API_KEY
      }
    });
    
    if (geocodeResponse.data.results.length === 0) {
      console.error('Location not found');
      return;
    }
    
    const { lat, lng } = geocodeResponse.data.results[0].geometry.location;
    
    // 2. Set up API calls to real estate data sources
    // Examples: Zillow API, Realtor.com API, etc.
    // This is where you would add your real scraping logic
    
    // Mock implementation for demonstration:
    const mockScrapeSources = [
      { name: 'RealEstateSource1', url: 'https://api.realestate1.com' },
      { name: 'RealEstateSource2', url: 'https://api.realestate2.com' },
      { name: 'CountyRecords', url: 'https://api.countyrecords.com' }
    ];
    
    for (const source of mockScrapeSources) {
      console.log(`Scraping data from ${source.name}`);
      // Simulate API calls or web scraping
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Process and save the data
      // In a real implementation, you would parse the response and save to MongoDB
      console.log(`Completed scraping from ${source.name}`);
    }
    
    console.log('Scraping job completed successfully');
  } catch (error) {
    console.error('Error in scraping job:', error);
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});