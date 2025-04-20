// models/Property.js
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
  parcelId: String,
  description: String,
  images: [String],
  listedDate: Date,
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

// Add geospatial index for location-based queries
PropertySchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Property', PropertySchema);