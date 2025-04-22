// routes/properties.js - OPTIMIZED VERSION
const express = require('express');
const router = express.Router();
const Property = require('../models/Property');
const { Client } = require('@googlemaps/google-maps-services-js');

// Set up Google Maps client
const googleMapsClient = new Client({});

// Get properties by location (coordinates)
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng, radius = 5000, limit = 20 } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({ 
        success: false, 
        message: 'Latitude and longitude are required' 
      });
    }

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    const parsedRadius = parseInt(radius);
    const parsedLimit = parseInt(limit);

    console.log(`Searching for properties near [${parsedLat}, ${parsedLng}] with radius ${parsedRadius}m`);

    // Find properties near the location
    let properties = await Property.find({
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

    console.log(`Found ${properties.length} properties near [${parsedLat}, ${parsedLng}]`);
    
    // If no properties found, try a wider search
    if (properties.length === 0) {
      console.log(`No properties found near [${parsedLat}, ${parsedLng}], trying wider radius`);
      
      properties = await Property.find({
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [parsedLng, parsedLat]
            },
            $maxDistance: parsedRadius * 2 // Double the radius
          }
        }
      }).limit(parsedLimit);
      
      console.log(`Found ${properties.length} properties with wider radius`);
    }

    // If still no properties found with geospatial query, try finding by governorate
    if (properties.length === 0) {
      console.log('Still no properties found with geospatial query, trying governorate-based search');
      
      // Reverse geocode to get governorate/city
      try {
        const geocodeResponse = await googleMapsClient.reverseGeocode({
          params: {
            latlng: `${parsedLat},${parsedLng}`,
            key: process.env.GOOGLE_MAPS_API_KEY
          }
        });
        
        let governorate = null;
        if (geocodeResponse.data.results.length > 0) {
          // Extract administrative area (could be city or governorate)
          for (const component of geocodeResponse.data.results[0].address_components) {
            if (component.types.includes('administrative_area_level_1') || 
                component.types.includes('locality')) {
              governorate = component.long_name;
              break;
            }
          }
        }
        
        if (governorate) {
          console.log(`Found governorate: ${governorate}, searching by text match`);
          // Try text search by governorate
          properties = await Property.find({
            $or: [
              { governorate: { $regex: governorate, $options: 'i' } },
              { city: { $regex: governorate, $options: 'i' } },
              { address: { $regex: governorate, $options: 'i' } }
            ]
          }).limit(parsedLimit);
          
          console.log(`Found ${properties.length} properties by governorate text search`);
        }
      } catch (geocodeError) {
        console.error('Error during reverse geocoding:', geocodeError);
      }
    }

    // If still no properties found, return any properties in the database
    if (properties.length === 0) {
      console.log('No properties found by any criteria, returning any available properties');
      properties = await Property.find().limit(parsedLimit);
      console.log(`Found ${properties.length} total properties in database`);
    }

    // IMPORTANT: The mobile app expects arrays, so ensure we return a JSON array
    res.json(properties);
  } catch (error) {
    console.error('Error fetching nearby properties:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
});

// Get properties by address search
router.get('/search', async (req, res) => {
  try {
    const { address } = req.query;
    
    if (!address) {
      return res.status(400).json({ 
        success: false, 
        message: 'Address is required' 
      });
    }

    // Geocode the address using Google Maps API
    const response = await googleMapsClient.geocode({
      params: {
        address,
        key: process.env.GOOGLE_MAPS_API_KEY
      }
    });

    if (response.data.results.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Location not found' 
      });
    }

    const location = response.data.results[0].geometry.location;
    
    // Find properties near the geocoded location
    let properties = await Property.find({
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

    // If no properties found with geospatial query, try text search
    if (properties.length === 0) {
      // Extract administrative area (city/governorate) from geocoded address
      let administrativeArea = null;
      for (const component of response.data.results[0].address_components) {
        if (component.types.includes('administrative_area_level_1') || 
            component.types.includes('locality')) {
          administrativeArea = component.long_name;
          break;
        }
      }
      
      if (administrativeArea) {
        properties = await Property.find({
          $or: [
            { governorate: { $regex: administrativeArea, $options: 'i' } },
            { city: { $regex: administrativeArea, $options: 'i' } },
            { address: { $regex: administrativeArea, $options: 'i' } }
          ]
        }).limit(20);
      }
    }

    // If still no properties, try a wider search
    if (properties.length === 0) {
      properties = await Property.find({
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [location.lng, location.lat]
            },
            $maxDistance: 10000 // 10km radius
          }
        }
      }).limit(20);
    }

    // If still no properties, return any properties in the database
    if (properties.length === 0) {
      properties = await Property.find().limit(20);
    }

    res.json({
      geocodedLocation: {
        lat: location.lat,
        lng: location.lng,
        formattedAddress: response.data.results[0].formatted_address
      },
      properties: properties
    });
  } catch (error) {
    console.error('Error searching properties:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
});

// Get a single property by ID
router.get('/:id', async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    
    if (!property) {
      return res.status(404).json({
        success: false,
        message: `Property not found with ID ${req.params.id}`
      });
    }
    
    res.json(property);
    
  } catch (error) {
    console.error('Error getting property by ID:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
});

// Add a new endpoint to get property stats by city/region
router.get('/stats/by-region', async (req, res) => {
  try {
    // Aggregate properties by city and calculate averages
    const stats = await Property.aggregate([
      {
        $group: {
          _id: { 
            city: '$city', 
            state: '$state'
          },
          count: { $sum: 1 },
          avgPrice: { $avg: '$price' },
          minPrice: { $min: '$price' },
          maxPrice: { $max: '$price' },
          avgPricePerSqFt: { $avg: '$pricePerSqFt' }
        }
      },
      {
        $project: {
          _id: 0,
          city: '$_id.city',
          state: '$_id.state',
          count: 1,
          avgPrice: { $round: ['$avgPrice', 2] },
          minPrice: { $round: ['$minPrice', 2] },
          maxPrice: { $round: ['$maxPrice', 2] },
          avgPricePerSqFt: { $round: ['$avgPricePerSqFt', 2] }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting property stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
});

module.exports = router;