// routes/properties.js - FIXED VERSION
const express = require('express');
const router = express.Router();
const Property = require('../models/Property');
const { Client } = require('@googlemaps/google-maps-services-js');
const PropertyDataScraper = require('../scrapers/propertyDataScraper');
const fs = require('fs');
const path = require('path');

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
    
    // If no properties found, trigger an immediate scrape for this location
    if (properties.length === 0) {
      console.log(`No properties found near [${parsedLat}, ${parsedLng}], triggering on-demand scraper`);
      
      try {
        // Determine location name by reverse geocoding
        const geocodeResponse = await googleMapsClient.reverseGeocode({
          params: {
            latlng: `${parsedLat},${parsedLng}`,
            key: process.env.GOOGLE_MAPS_API_KEY
          }
        });
        
        let locationName = `${parsedLat},${parsedLng}`;
        if (geocodeResponse.data.results.length > 0) {
          locationName = geocodeResponse.data.results[0].formatted_address;
        }
        
        // Initialize and run scraper for this location
        const scraper = new PropertyDataScraper();
        await scraper.initialize();
        
        // Create sample properties immediately for this location
        await scraper.createSampleProperties(parsedLat, parsedLng, locationName);
        
        // Run the scrape in the background
        scraper.scrape(locationName, Math.ceil(parsedRadius / 1000)).catch(err => {
          console.error('Background scrape error:', err);
        });
        
        // Log the on-demand scrape
        fs.appendFileSync(
          path.join(__dirname, '../logs/scraping.log'),
          `[${new Date().toISOString()}] On-demand scrape triggered for ${locationName}\n`
        );
        
        // Check for initial data in case this is a first-time user
        const initialDataPath = path.join(__dirname, '../.initial-data-added');
        const hasInitialData = fs.existsSync(initialDataPath);
        
        if (!hasInitialData) {
          // Run the initial data script
          const { spawn } = require('child_process');
          const addInitialDataProcess = spawn('node', [path.join(__dirname, '../scripts/addInitialData.js')]);
          
          addInitialDataProcess.stdout.on('data', (data) => {
            console.log(`Initial data script: ${data}`);
          });
          
          addInitialDataProcess.stderr.on('data', (data) => {
            console.error(`Initial data script error: ${data}`);
          });
          
          // Wait for the script to complete
          await new Promise((resolve) => {
            addInitialDataProcess.on('close', (code) => {
              console.log(`Initial data script exited with code ${code}`);
              resolve();
            });
          });
        }
        
        // Try to fetch properties again
        properties = await Property.find({
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
        
        console.log(`After scraping, found ${properties.length} properties`);
      } catch (error) {
        console.error('Error in on-demand scraping:', error);
      }
    }

    // If still no properties found, find any properties in the database
    if (properties.length === 0) {
      console.log('Still no properties found, returning any available properties');
      properties = await Property.find().limit(parsedLimit);
      console.log(`Found ${properties.length} total properties in database`);
    }

    // IMPORTANT: The mobile app expects arrays, so ensure we return an array
    // This is the main fix - always returning a JSON array
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

    // If no properties found, trigger a background scrape and create sample properties immediately
    if (properties.length === 0) {
      console.log(`No properties found near ${address}, creating sample properties`);
      
      try {
        // Initialize scraper
        const scraper = new PropertyDataScraper();
        await scraper.initialize();
        
        // Create sample properties immediately
        await scraper.createSampleProperties(location.lat, location.lng, response.data.results[0].formatted_address);
        
        // Run the scrape in the background
        scraper.scrape(address, 5).catch(err => {
          console.error('Background scrape error:', err);
        });
        
        // Try to fetch properties again
        properties = await Property.find({
          location: {
            $near: {
              $geometry: {
                type: 'Point',
                coordinates: [location.lng, location.lat]
              },
              $maxDistance: 5000
            }
          }
        }).limit(20);
      } catch (error) {
        console.error('Error in background scraping:', error);
      }
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

module.exports = router;