// routes/valuation.js
const express = require('express');
const router = express.Router();
const Property = require('../models/Property');
const { Client } = require('@googlemaps/google-maps-services-js');
const valuationService = require('../services/valuationService');

const googleMapsClient = new Client({});

// Estimate land value based on input parameters
router.post('/estimate', async (req, res) => {
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

    // Calculate estimated value using the valuation service
    const valuationResult = valuationService.calculateLandValue(
      parseFloat(area), 
      comparables, 
      features
    );
    
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
        estimatedValue: Math.round(valuationResult.estimatedValue),
        areaInSqFt: parseFloat(area),
        avgPricePerSqFt: valuationResult.avgPricePerSqFt,
        zoning,
        valuationFactors: valuationResult.valuationFactors
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

module.exports = router;