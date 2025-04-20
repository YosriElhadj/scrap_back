// routes/valuation.js - UPDATED
const express = require('express');
const router = express.Router();
const Property = require('../models/Property');
const { Client } = require('@googlemaps/google-maps-services-js');
const valuationService = require('../services/valuationService');
const { ValidationError, NotFoundError, DatabaseError } = require('../middleware/errorHandler');

const googleMapsClient = new Client({});

// Estimate land value based on input parameters
router.post('/estimate', async (req, res, next) => {
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

    // Validate required fields
    if (!lat || !lng) {
      throw new ValidationError('Latitude and longitude are required');
    }
    
    if (!area) {
      throw new ValidationError('Land area is required');
    }
    
    // Parse and validate numeric values
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    const parsedArea = parseFloat(area);
    
    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      throw new ValidationError('Invalid latitude or longitude values');
    }
    
    if (isNaN(parsedArea) || parsedArea <= 0) {
      throw new ValidationError('Area must be a positive number');
    }
    
    // Validate zoning
    const validZonings = ['residential', 'commercial', 'agricultural', 'industrial'];
    if (!validZonings.includes(zoning.toLowerCase())) {
      throw new ValidationError('Invalid zoning type. Must be one of: ' + validZonings.join(', '));
    }

    // Validate features
    if (typeof features !== 'object') {
      throw new ValidationError('Features must be an object');
    }
    
    // Find comparable properties
    const comparables = await Property.find({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parsedLng, parsedLat]
          },
          $maxDistance: 10000 // 10km radius
        }
      },
      // Find properties with similar zoning when available
      $or: [
        { zoning: zoning.toLowerCase() },
        { zoning: { $exists: false } },
        { zoning: 'unknown' }
      ]
    }).limit(10);

    // If no comparables found, try a broader search without zoning constraint
    if (comparables.length === 0) {
      const altComparables = await Property.find({
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [parsedLng, parsedLat]
            },
            $maxDistance: 20000 // 20km radius 
          }
        }
      }).limit(10);
      
      if (altComparables.length === 0) {
        throw new NotFoundError('No comparable properties found in this area');
      }
      
      comparables.push(...altComparables);
    }

    // Calculate estimated value using the valuation service
    const valuationResult = valuationService.calculateLandValue(
      parsedArea, 
      comparables, 
      features
    );
    
    // Get address information for the location
    let geocodeResponse;
    try {
      geocodeResponse = await googleMapsClient.reverseGeocode({
        params: {
          latlng: `${parsedLat},${parsedLng}`,
          key: process.env.GOOGLE_MAPS_API_KEY
        }
      });
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      // Continue without geocoding rather than failing the request
      geocodeResponse = { data: { results: [] } };
    }

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
      success: true,
      location: {
        lat: parsedLat,
        lng: parsedLng,
        address,
        city,
        state,
        zipCode
      },
      valuation: {
        estimatedValue: Math.round(valuationResult.estimatedValue),
        areaInSqFt: parsedArea,
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
    next(error);
  }
});

// Get historical price trends for an area
router.get('/trends', async (req, res, next) => {
  try {
    const { lat, lng, radius = 10000, timeFrame = 'year' } = req.query;
    
    if (!lat || !lng) {
      throw new ValidationError('Latitude and longitude are required');
    }
    
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    const parsedRadius = parseInt(radius);
    
    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      throw new ValidationError('Invalid latitude or longitude values');
    }
    
    if (isNaN(parsedRadius) || parsedRadius <= 0) {
      throw new ValidationError('Radius must be a positive number');
    }
    
    const validTimeFrames = ['month', 'quarter', 'year'];
    if (!validTimeFrames.includes(timeFrame)) {
      throw new ValidationError('Invalid timeFrame. Must be one of: ' + validTimeFrames.join(', '));
    }
    
    // Get properties in the area with date information
    const properties = await Property.find({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parsedLng, parsedLat]
          },
          $maxDistance: parsedRadius
        }
      },
      listedDate: { $exists: true }
    }).sort({ listedDate: 1 });
    
    // Analyze price trends
    const trendAnalysis = valuationService.analyzePriceTrends(properties, timeFrame);
    
    res.json({
      success: true,
      location: {
        lat: parsedLat,
        lng: parsedLng,
        radius: parsedRadius
      },
      timeFrame,
      trendAnalysis,
      sampleSize: properties.length
    });
    
  } catch (error) {
    next(error);
  }
});

module.exports = router;