// scrapers/propertyDataScraper.js - TAYARA FOCUSED VERSION
const axios = require('axios');
const { Client } = require('@googlemaps/google-maps-services-js');
const mongoose = require('mongoose');
const Property = require('../models/Property');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

dotenv.config();

// Google Maps client setup
const googleMapsClient = new Client({});

// Class for handling property data scraping
class PropertyDataScraper {
  constructor() {
    this.sources = [
      {
        name: 'Tayara',
        baseUrl: 'https://www.tayara.tn',
        enabled: true
      }
    ];
    
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0'
    ];
  }
  
  async initialize() {
    // Create logs directory if it doesn't exist
    const logsDir = path.join(__dirname, '../logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Log startup
    fs.appendFileSync(
      path.join(logsDir, 'scraping.log'),
      `[${new Date().toISOString()}] Scraper initialized\n`
    );
  }
  
  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }
  
  async scrape(location, radius = 50) {
    console.log(`Starting scraping for location: ${location} with radius: ${radius} miles`);
    
    try {
      // Geocode the location
      const geocodeResponse = await googleMapsClient.geocode({
        params: {
          address: location,
          key: process.env.GOOGLE_MAPS_API_KEY
        }
      });
      
      if (geocodeResponse.data.results.length === 0) {
        throw new Error('Location not found');
      }
      
      const { lat, lng } = geocodeResponse.data.results[0].geometry.location;
      const formattedAddress = geocodeResponse.data.results[0].formatted_address;
      
      console.log(`Geocoded ${location} to: ${formattedAddress} (${lat}, ${lng})`);
      
      // Log scraping job
      fs.appendFileSync(
        path.join(__dirname, '../logs/scraping.log'),
        `[${new Date().toISOString()}] Started scraping for ${formattedAddress}\n`
      );
      
      // Run the Python scraper (our primary data source)
      const pythonScraperResult = await this.runPythonScraper(location);
      
      // If Python scraper successful, report success
      if (pythonScraperResult) {
        console.log('Python scraper completed successfully');
        return { success: true, message: 'Scraping completed with Python scraper' };
      } else {
        // If Python scraper failed, report the error
        console.log('Python scraper failed');
        return { success: false, error: 'Python scraper failed to retrieve data' };
      }
      
    } catch (error) {
      console.error('Scraping error:', error);
      return { success: false, error: error.message };
    }
  }

  async runPythonScraper(location) {
    return new Promise((resolve, reject) => {
      try {
        console.log('Running Python scraper...');
        
        // Check if the Python script exists
        const scriptPath = path.resolve(path.join(__dirname, '..', 'scrape_tayara.py'));
        if (!fs.existsSync(scriptPath)) {
          console.log('Python scraper script not found at:', scriptPath);
          return resolve(false);
        }
        
        // Prepare arguments
        const args = [scriptPath];
        if (location) {
          args.push('--location');
          args.push(location);
        }
        
        console.log(`Running: python ${args.join(' ')}`);
        
        // Run the Python script (using 'python' on Windows, not 'python3')
        const pythonProcess = spawn('python', args);
        
        pythonProcess.stdout.on('data', (data) => {
          console.log(`Python output: ${data}`);
        });
        
        pythonProcess.stderr.on('data', (data) => {
          console.error(`Python error: ${data}`);
        });
        
        pythonProcess.on('close', async (code) => {
          if (code === 0) {
            console.log('Python scraper completed successfully');
            
            // Try to import the results
            try {
              // Check if JSON file exists
              const jsonPath = path.resolve(path.join(__dirname, '..', 'properties.json'));
              if (fs.existsSync(jsonPath)) {
                console.log('Found properties.json, importing...');
                
                // Read the JSON file
                const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
                console.log(`Found ${jsonData.length} properties in JSON`);
                
                // Import properties
                let importCount = 0;
                for (const item of jsonData) {
                  try {
                    // Skip if missing required fields
                    if (!item.price || !item.address) continue;
                    
                    // Get coordinates
                    let coordinates = item.coordinates || [10.1815, 36.8065]; // Default to Tunis
                    
                    // Skip if property already exists
                    const existingProperty = await Property.findOne({
                      address: item.address,
                      price: item.price
                    });
                    
                    if (existingProperty) {
                      console.log(`Property already exists: ${item.address}`);
                      continue;
                    }
                    
                    // Create new property
                    const newProperty = new Property({
                      location: {
                        type: 'Point',
                        coordinates: coordinates
                      },
                      address: item.address,
                      city: item.governorate || '',
                      state: 'Tunisia', 
                      zipCode: '',
                      price: item.price,
                      area: item.area || 43560, // Default to 1 acre if no area
                      pricePerSqFt: item.pricePerSqFt || (item.price / 43560),
                      zoning: item.zoning || 'residential',
                      features: {
                        nearWater: item.nearWater || false,
                        roadAccess: item.roadAccess || true,
                        utilities: item.utilities || true
                      },
                      sourceUrl: item.sourceUrl || '',
                      description: item.description || '',
                      // Parse the string of URLs back to an array
                      images: item.images ? 
                        (typeof item.images === 'string' ? 
                          item.images.split(',').map(img => img.trim()) : 
                          item.images) : 
                        [],
                      listedDate: new Date(),
                      lastUpdated: new Date()
                    });
                    
                    await newProperty.save();
                    importCount++;
                  } catch (itemError) {
                    console.error('Error importing property:', itemError);
                  }
                }
                
                console.log(`Imported ${importCount} properties from Python scraper`);
                resolve(true);
              } else {
                console.log('No properties.json file found at:', jsonPath);
                
                // Try CSV instead if JSON not found
                const csvPath = path.resolve(path.join(__dirname, '..', 'properties_enhanced.csv'));
                if (fs.existsSync(csvPath)) {
                  console.log('Found properties_enhanced.csv, but no CSV parser installed. Skipping import.');
                }
                
                resolve(false);
              }
            } catch (importError) {
              console.error('Error importing Python scraper results:', importError);
              resolve(false);
            }
          } else {
            console.error(`Python scraper failed with code ${code}`);
            resolve(false);
          }
        });
      } catch (error) {
        console.error('Error running Python scraper:', error);
        resolve(false);
      }
    });
  }
}

module.exports = PropertyDataScraper;