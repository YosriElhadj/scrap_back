// models/Property.js - ENHANCED FOR TUNISIAN PROPERTIES WITH ETH
const mongoose = require('mongoose');

// Define approximate coordinates for major Tunisian governorates
const GOVERNORATE_COORDINATES = {
  'Tunis': [10.1815, 36.8065],
  'Ariana': [10.1939, 36.8625],
  'Ben Arous': [10.2233, 36.7535],
  'Manouba': [10.0986, 36.8089],
  'Nabeul': [10.6912, 36.4513],
  'Bizerte': [9.8642, 37.2744],
  'Zaghouan': [10.1428, 36.4028],
  'Beja': [9.1844, 36.7256],
  'Jendouba': [8.7550, 36.5012],
  'Kef': [8.7047, 36.1675],
  'Siliana': [9.3909, 36.0875],
  'Sousse': [10.6412, 35.8245],
  'Monastir': [10.7809, 35.7640],
  'Mahdia': [11.0622, 35.5044],
  'Kairouan': [10.0963, 35.6781],
  'Kasserine': [8.8365, 35.1722],
  'Sidi Bouzid': [9.4968, 35.0382],
  'Sfax': [10.7600, 34.7400],
  'Gabes': [10.0982, 33.8828],
  'Medenine': [10.5050, 33.3450],
  'Tataouine': [10.4507, 32.9227],
  'Tozeur': [8.1335, 33.9185],
  'Kebili': [8.9715, 33.7072],
  'Gafsa': [8.7094, 34.4311]
};

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
  state: String, // This will store the Tunisian governorate
  zipCode: String,
  price: Number, // Price in Tunisian Dinar (TND)
  priceInETH: Number, // ETH value at time of scraping
  ethPriceAtScraping: Number, // ETH/TND exchange rate at scraping
  area: Number, // in square feet (converted from m² if needed)
  pricePerSqFt: Number,
  pricePerSqFtETH: Number, // Price per square foot in ETH
  zoning: {
    type: String,
    enum: ['residential', 'commercial', 'agricultural', 'industrial', 'unknown'],
    default: 'unknown'
  },
  features: {
    nearWater: Boolean,
    roadAccess: Boolean,
    utilities: Boolean
  },
  sourceUrl: String,
  parcelId: String,
  description: String,
  images: [String],
  listedDate: Date,
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  // Additional fields for Tunisian properties
  originalPrice: String, // Original price text (e.g., "150,000 DT")
  originalArea: Number,  // Original area in square meters
  governorate: String,   // Tunisian governorate (e.g., Tunis, Sfax, etc.)
  neighborhood: String,  // Neighborhood or specific area
  propertyType: {        // More specific property type
    type: String,
    enum: ['terrain_agricole', 'terrain_construction', 'terrain_industriel', 'terrain_commercial', 'autre'],
    default: 'terrain_construction'
  },
  source: {              // Source website
    type: String,
    default: 'tayara.tn'
  }
});

// Add geospatial index for location-based queries
PropertySchema.index({ location: '2dsphere' });
// Add text index for text search capabilities
PropertySchema.index({ 
  address: 'text', 
  description: 'text', 
  governorate: 'text',
  city: 'text',
  neighborhood: 'text' 
});

// Pre-save hook to calculate pricePerSqFt if not already set
PropertySchema.pre('save', function(next) {
  // Calculate price per square foot if not set
  if (this.price && this.area && !this.pricePerSqFt) {
    this.pricePerSqFt = this.price / this.area;
  }
  
  // Use approximate governorate coordinates if actual coordinates are missing or invalid
  if (!this.location || !this.location.coordinates || 
      !Array.isArray(this.location.coordinates) ||
      this.location.coordinates.length !== 2 ||
      isNaN(this.location.coordinates[0]) || isNaN(this.location.coordinates[1]) ||
      this.location.coordinates[0] === 0 || this.location.coordinates[1] === 0) {
    
    // Try to assign coordinates based on governorate
    if (this.governorate && GOVERNORATE_COORDINATES[this.governorate]) {
      // Add small random offset to avoid all properties being at exact same point
      const lng = GOVERNORATE_COORDINATES[this.governorate][0];
      const lat = GOVERNORATE_COORDINATES[this.governorate][1];
      
      const lngOffset = (Math.random() - 0.5) * 0.05; // ±0.025 degrees longitude
      const latOffset = (Math.random() - 0.5) * 0.05; // ±0.025 degrees latitude
      
      this.location = {
        type: 'Point',
        coordinates: [lng + lngOffset, lat + latOffset]
      };
    } 
    // If no governorate match, check city
    else if (this.city && GOVERNORATE_COORDINATES[this.city]) {
      const lng = GOVERNORATE_COORDINATES[this.city][0];
      const lat = GOVERNORATE_COORDINATES[this.city][1];
      
      const lngOffset = (Math.random() - 0.5) * 0.05;
      const latOffset = (Math.random() - 0.5) * 0.05;
      
      this.location = {
        type: 'Point',
        coordinates: [lng + lngOffset, lat + latOffset]
      };
    }
    // Last resort - use Tunis coordinates with wider randomization
    else {
      const lng = 10.1815; // Default to Tunis
      const lat = 36.8065; // Default to Tunis
      
      const lngOffset = (Math.random() - 0.5) * 0.2; // Wider offset for more dispersion
      const latOffset = (Math.random() - 0.5) * 0.2;
      
      this.location = {
        type: 'Point',
        coordinates: [lng + lngOffset, lat + latOffset]
      };
    }
  }
  
  next();
});

// Virtual property for price in US Dollars (estimated conversion)
PropertySchema.virtual('priceUSD').get(function() {
  // Approximate conversion rate: 1 TND ≈ 0.32 USD (as of 2025)
  // This is an estimation - would need a real currency API for accurate conversion
  const conversionRate = 0.32;
  return this.price * conversionRate;
});

// Virtual property for real-time ETH value
PropertySchema.virtual('currentPriceInETH').get(function() {
  // This will be calculated using current ETH price in the service layer
  return null; // Will be populated by the service
});

// Virtual property for area in square meters
PropertySchema.virtual('areaInSqMeters').get(function() {
  // Convert square feet to square meters (1 sq ft ≈ 0.092903 sq m)
  return this.area * 0.092903;
});

// Virtual property for area in hectares
PropertySchema.virtual('areaInHectares').get(function() {
  // Convert square feet to hectares (1 hectare = 107,639 sq ft)
  return this.area / 107639;
});

// Helper for formatting price in TND
PropertySchema.methods.formatPrice = function() {
  return `${this.price.toLocaleString()} TND`;
};

// Helper for formatting price in ETH
PropertySchema.methods.formatPriceETH = function() {
  if (this.priceInETH) {
    return `${this.priceInETH.toFixed(4)} ETH`;
  }
  return 'N/A';
};

// Helper for calculating price per m²
PropertySchema.methods.getPricePerSqMeter = function() {
  if (!this.price || !this.area) return null;
  return this.price / (this.area * 0.092903); // Convert area to m² then calculate
};

// Helper for resolving governorate from address if not explicitly set
PropertySchema.methods.resolveGovernorate = function() {
  if (this.governorate) return this.governorate;
  
  if (this.address) {
    for (const gov in GOVERNORATE_COORDINATES) {
      if (this.address.includes(gov)) {
        return gov;
      }
    }
  }
  
  return 'Unknown';
};

// Make virtuals available when converting to JSON
PropertySchema.set('toJSON', { virtuals: true });
PropertySchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Property', PropertySchema);