// routes/properties.js
const express = require('express');
const router = express.Router();
const Property = require('../models/Property');
const { Client } = require('@googlemaps/google-maps-services-js');
const googleMapsClient = new Client({});

// Get properties by location (coordinates)
router.get('/nearby', async (req, res) => {
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
router.get('/search', async (req, res) => {
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

module.exports = router;