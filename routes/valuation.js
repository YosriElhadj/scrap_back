// routes/valuation.js - UPDATED
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

    // Validate required fields
    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }
    
    if (!area) {
      return res.status(400).json({
        success: false,
        message: 'Land area is required'
      });
    }
    
    // Parse and validate numeric values
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    const parsedArea = parseFloat(area);
    
    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid latitude or longitude values'
      });
    }
    
    if (isNaN(parsedArea) || parsedArea <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Area must be a positive number'
      });
    }
    
    // Validate zoning
    const validZonings = ['residential', 'commercial', 'agricultural', 'industrial'];
    if (!validZonings.includes(zoning.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid zoning type. Must be one of: ' + validZonings.join(', ')
      });
    }

    // Validate features
    if (typeof features !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Features must be an object'
      });
    }
    
    // Use a staged approach to find comparable properties
    let comparables = [];
    
    // Stage 1: Find properties with similar zoning nearby
    comparables = await Property.find({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parsedLng, parsedLat]
          },
          $maxDistance: 10000 // 10km radius
        }
      },
      zoning: zoning.toLowerCase()
    }).limit(10);

    // Stage 2: If not enough comparables, find any nearby properties
    if (comparables.length < 5) {
      const additionalComparables = await Property.find({
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [parsedLng, parsedLat]
            },
            $maxDistance: 20000 // 20km radius
          }
        }
      }).limit(10 - comparables.length);
      
      comparables = [...comparables, ...additionalComparables];
    }
    
    // Stage 3: If still not enough, try to find by governorate
    if (comparables.length < 3) {
      try {
        // Get address information for the location
        const geocodeResponse = await googleMapsClient.reverseGeocode({
          params: {
            latlng: `${parsedLat},${parsedLng}`,
            key: process.env.GOOGLE_MAPS_API_KEY
          }
        });
        
        if (geocodeResponse.data.results.length > 0) {
          // Try to extract governorate or city
          let governorate = '';
          for (const component of geocodeResponse.data.results[0].address_components) {
            if (component.types.includes('administrative_area_level_1') || 
                component.types.includes('locality')) {
              governorate = component.long_name;
              break;
            }
          }
          
          if (governorate) {
            // Find properties by governorate text matching
            const governorateProperties = await Property.find({
              $or: [
                { governorate: { $regex: governorate, $options: 'i' } },
                { city: { $regex: governorate, $options: 'i' } },
                { address: { $regex: governorate, $options: 'i' } }
              ]
            }).limit(10 - comparables.length);
            
            comparables = [...comparables, ...governorateProperties];
          }
        }
      } catch (geocodeError) {
        console.error('Error in reverse geocoding:', geocodeError);
      }
    }
    
    // Stage 4: If still not enough, use any properties in the database
    if (comparables.length < 3) {
      const anyProperties = await Property.find().limit(10 - comparables.length);
      comparables = [...comparables, ...anyProperties];
    }
    
    // If no comparables found at all, create fallback data
    if (comparables.length === 0) {
      console.log('No comparables found in database, creating fallback data');
      
      // Create one minimal fallback property
      const fallbackProperty = {
        _id: 'fallback_id',
        address: 'Nearby Area',
        price: 100000, // Default price in TND
        area: 1000, // Default area
        pricePerSqFt: 100, // Default price per square foot
        features: {
          nearWater: false,
          roadAccess: true,
          utilities: true
        },
        governorate: 'Tunis', // Default
        zoning: zoning // Use requested zoning
      };
      
      comparables = [fallbackProperty];
      
      // Log warning about using fallback data
      console.log('Using fallback property data for valuation calculation');
    }
    
    // Then calculate estimated value
    try {
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
          address: address || "Unknown location",
          city: city || "",
          state: state || "",
          zipCode: zipCode || ""
        },
        valuation: {
          estimatedValue: Math.round(valuationResult.estimatedValue) || 0,
          areaInSqFt: parsedArea || 0,
          avgPricePerSqFt: valuationResult.avgPricePerSqFt || 0,
          zoning: zoning || "residential",
          valuationFactors: valuationResult.valuationFactors || []
        },
        comparables: comparables.map(property => ({
          id: property._id || "",
          address: property.address || "Unknown",
          price: property.price || 0,
          area: property.area || 0,
          pricePerSqFt: property.pricePerSqFt || 0,
          features: {
            nearWater: property.features?.nearWater || false,
            roadAccess: property.features?.roadAccess || true,
            utilities: property.features?.utilities || true
          }
        }))
      });
    } catch (valuationError) {
      console.error('Error in valuation calculation:', valuationError);
      
      // Create a minimal response with default values
      return res.json({
        success: true,
        location: {
          lat: parsedLat,
          lng: parsedLng,
          address: 'Unknown location',
          city: '',
          state: '',
          zipCode: ''
        },
        valuation: {
          estimatedValue: Math.round(parsedArea * 20), // Simple estimate at 20 TND per sq ft
          areaInSqFt: parsedArea,
          avgPricePerSqFt: 20,
          zoning: zoning,
          valuationFactors: [
            { factor: 'Default Estimation', adjustment: 'Baseline' },
            { factor: 'Limited Data', adjustment: 'Approximation only' }
          ]
        },
        comparables: []
      });
    }
  } catch (error) {
    console.error('Error in valuation:', error);
    res.status(500).json({
      success: false,
      message: 'Error calculating valuation',
      error: error.message
    });
  }
});

// Get historical price trends for an area
router.get('/trends', async (req, res) => {
  try {
    const { lat, lng, radius = 10000, timeFrame = 'year' } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }
    
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    const parsedRadius = parseInt(radius);
    
    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid latitude or longitude values'
      });
    }
    
    if (isNaN(parsedRadius) || parsedRadius <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Radius must be a positive number'
      });
    }
    
    const validTimeFrames = ['month', 'quarter', 'year'];
    if (!validTimeFrames.includes(timeFrame)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid timeFrame. Must be one of: ' + validTimeFrames.join(', ')
      });
    }
    
    // Get properties in the area with date information
    let properties = await Property.find({
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
    
    // If not enough properties found with geospatial query, try finding by city/governorate
    if (properties.length < 5) {
      try {
        const geocodeResponse = await googleMapsClient.reverseGeocode({
          params: {
            latlng: `${parsedLat},${parsedLng}`,
            key: process.env.GOOGLE_MAPS_API_KEY
          }
        });
        
        if (geocodeResponse.data.results.length > 0) {
          // Try to extract governorate or city
          let governorate = '';
          for (const component of geocodeResponse.data.results[0].address_components) {
            if (component.types.includes('administrative_area_level_1') || 
                component.types.includes('locality')) {
              governorate = component.long_name;
              break;
            }
          }
          
          if (governorate) {
            // Find properties by governorate text matching
            const governorateProperties = await Property.find({
              $or: [
                { governorate: { $regex: governorate, $options: 'i' } },
                { city: { $regex: governorate, $options: 'i' } },
                { address: { $regex: governorate, $options: 'i' } }
              ],
              listedDate: { $exists: true }
            }).sort({ listedDate: 1 });
            
            properties = [...properties, ...governorateProperties];
          }
        }
      } catch (geocodeError) {
        console.error('Error in reverse geocoding for trends:', geocodeError);
      }
    }
    
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
    console.error('Error analyzing price trends:', error);
    res.status(500).json({
      success: false,
      message: 'Error analyzing price trends',
      error: error.message
    });
  }
});

module.exports = router;