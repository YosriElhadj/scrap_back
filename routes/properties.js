// routes/properties.js - UPDATED
const express = require('express');
const router = express.Router();
const Property = require('../models/Property');
const { Client } = require('@googlemaps/google-maps-services-js');
const { ValidationError, NotFoundError, DatabaseError } = require('../middleware/errorHandler');

const googleMapsClient = new Client({});

// Get properties by location (coordinates)
router.get('/nearby', async (req, res, next) => {
  try {
    const { lat, lng, radius = 5000, limit = 20 } = req.query;
    
    if (!lat || !lng) {
      throw new ValidationError('Latitude and longitude are required');
    }
    
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    const parsedRadius = parseInt(radius);
    const parsedLimit = parseInt(limit);
    
    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      throw new ValidationError('Invalid latitude or longitude values');
    }
    
    if (isNaN(parsedRadius) || parsedRadius <= 0) {
      throw new ValidationError('Radius must be a positive number');
    }
    
    if (isNaN(parsedLimit) || parsedLimit <= 0) {
      throw new ValidationError('Limit must be a positive number');
    }

    const properties = await Property.find({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parsedLng, parsedLat]
          },
          $maxDistance: parsedRadius
        }
      }
    }).limit(parsedLimit);

    res.json({
      success: true,
      count: properties.length,
      data: properties
    });
  } catch (error) {
    // Check if it's a MongoDB error
    if (error.name === 'MongoServerError') {
      next(new DatabaseError(`Database error: ${error.message}`));
    } else {
      next(error);
    }
  }
});

// Get properties by address search
router.get('/search', async (req, res, next) => {
  try {
    const { address } = req.query;
    
    if (!address) {
      throw new ValidationError('Address is required');
    }

    // Geocode the address using Google Maps API
    let response;
    try {
      response = await googleMapsClient.geocode({
        params: {
          address,
          key: process.env.GOOGLE_MAPS_API_KEY
        }
      });
    } catch (error) {
      throw new ValidationError(`Geocoding error: ${error.message}`);
    }

    if (response.data.results.length === 0) {
      throw new NotFoundError('Location not found for the provided address');
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
      success: true,
      geocodedLocation: {
        lat: location.lat,
        lng: location.lng,
        formattedAddress: response.data.results[0].formatted_address
      },
      count: properties.length,
      properties
    });
  } catch (error) {
    next(error);
  }
});

// Get a single property by ID
router.get('/:id', async (req, res, next) => {
  try {
    const property = await Property.findById(req.params.id);
    
    if (!property) {
      throw new NotFoundError(`Property not found with ID ${req.params.id}`);
    }
    
    res.json({
      success: true,
      data: property
    });
    
  } catch (error) {
    if (error.name === 'CastError') {
      next(new ValidationError('Invalid property ID format'));
    } else {
      next(error);
    }
  }
});

module.exports = router;