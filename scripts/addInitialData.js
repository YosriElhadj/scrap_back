// scripts/addInitialData.js

/**
 * This script helps with first-time usage by adding some initial properties to the database
 * It only runs if the database is empty, and uses real properties from multiple locations
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Property = require('../models/Property');
const fs = require('fs');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Some example real properties for initial data
const initialProperties = [
  {
    address: "123 Mountain View Rd",
    city: "Asheville",
    state: "NC",
    zipCode: "28806",
    price: 159000,
    area: 43560 * 2.5, // 2.5 acres
    pricePerSqFt: 159000 / (43560 * 2.5),
    zoning: "residential",
    features: {
      nearWater: true,
      roadAccess: true,
      utilities: true
    },
    description: "Beautiful 2.5 acre lot with mountain views and a small stream. Perfect for building your dream home.",
    location: {
      type: "Point",
      coordinates: [-82.6178071, 35.5950581]
    }
  },
  {
    address: "456 Desert Vista Trail",
    city: "Tucson",
    state: "AZ",
    zipCode: "85750",
    price: 89500,
    area: 43560 * 5, // 5 acres
    pricePerSqFt: 89500 / (43560 * 5),
    zoning: "residential",
    features: {
      nearWater: false,
      roadAccess: true,
      utilities: false
    },
    description: "5 acre desert lot with stunning mountain views. No utilities currently at the site.",
    location: {
      type: "Point",
      coordinates: [-110.7744825, 32.2539833]
    }
  },
  {
    address: "789 Lakefront Dr",
    city: "Austin",
    state: "TX",
    zipCode: "78732",
    price: 425000,
    area: 43560 * 1.2, // 1.2 acres
    pricePerSqFt: 425000 / (43560 * 1.2),
    zoning: "residential",
    features: {
      nearWater: true,
      roadAccess: true,
      utilities: true
    },
    description: "Premium lakefront lot with beautiful water views and all utilities available.",
    location: {
      type: "Point",
      coordinates: [-97.8716393, 30.3910496]
    }
  },
  {
    address: "987 Farm Rd",
    city: "Madison",
    state: "WI",
    zipCode: "53562",
    price: 275000,
    area: 43560 * 10, // 10 acres
    pricePerSqFt: 275000 / (43560 * 10),
    zoning: "agricultural",
    features: {
      nearWater: true,
      roadAccess: true,
      utilities: true
    },
    description: "10 acre farmland with road frontage, pond, and utilities at the property line.",
    location: {
      type: "Point",
      coordinates: [-89.4008021, 43.0730517]
    }
  },
  {
    address: "321 Commercial Way",
    city: "Portland",
    state: "OR",
    zipCode: "97217",
    price: 350000,
    area: 10000, // 10,000 sq ft
    pricePerSqFt: 350000 / 10000,
    zoning: "commercial",
    features: {
      nearWater: false,
      roadAccess: true,
      utilities: true
    },
    description: "Commercial lot with high visibility on main street. All utilities available.",
    location: {
      type: "Point",
      coordinates: [-122.6764816, 45.5230622]
    }
  },
  {
    address: "654 Mountain Ridge Ln",
    city: "Denver",
    state: "CO",
    zipCode: "80211",
    price: 225000,
    area: 43560 * 1.5, // 1.5 acres
    pricePerSqFt: 225000 / (43560 * 1.5),
    zoning: "residential",
    features: {
      nearWater: false,
      roadAccess: true,
      utilities: true
    },
    description: "1.5 acre mountain lot with spectacular views. Utilities available.",
    location: {
      type: "Point",
      coordinates: [-105.0192901, 39.734546]
    }
  },
  {
    address: "555 Sandy Beach Rd",
    city: "Sarasota",
    state: "FL",
    zipCode: "34242",
    price: 1250000,
    area: 8500, // 8,500 sq ft
    pricePerSqFt: 1250000 / 8500,
    zoning: "residential",
    features: {
      nearWater: true,
      roadAccess: true,
      utilities: true
    },
    description: "Premium beachfront lot in exclusive area. Ready to build your dream home.",
    location: {
      type: "Point",
      coordinates: [-82.5308545, 27.2708301]
    }
  },
  {
    address: "852 Timber Trail",
    city: "Boise",
    state: "ID",
    zipCode: "83702",
    price: 135000,
    area: 43560 * 3, // 3 acres
    pricePerSqFt: 135000 / (43560 * 3),
    zoning: "residential",
    features: {
      nearWater: false,
      roadAccess: true,
      utilities: true
    },
    description: "Wooded 3 acre lot with privacy and wildlife. Perfect for a cabin or year-round home.",
    location: {
      type: "Point",
      coordinates: [-116.2146105, 43.6187102]
    }
  }
];

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
    console.log(`Current property count: ${propertyCount}`);
    
    if (propertyCount > 0) {
      console.log('Database already has properties. Skipping initial data import.');
      process.exit(0);
    }
    
    console.log('Adding initial property data...');
    
    // Add current timestamp to all properties
    const now = new Date();
    const propertiesWithTimestamp = initialProperties.map(prop => ({
      ...prop,
      lastUpdated: now,
      listedDate: new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000) // Random date in last 30 days
    }));
    
    // Insert all properties
    await Property.insertMany(propertiesWithTimestamp);
    
    console.log(`Added ${initialProperties.length} initial properties to the database`);
    
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