// models/Property.js - UPDATED FOR TUNISIAN PROPERTIES
const mongoose = require('mongoose');

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
  area: Number, // in square feet (converted from m² if needed)
  pricePerSqFt: Number,
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
  originalArea: String,  // Original area text (e.g., "500 m²")
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

// Pre-save hook to calculate pricePerSqFt if not already set
PropertySchema.pre('save', function(next) {
  if (this.price && this.area && !this.pricePerSqFt) {
    this.pricePerSqFt = this.price / this.area;
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

// Make virtuals available when converting to JSON
PropertySchema.set('toJSON', { virtuals: true });
PropertySchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Property', PropertySchema);