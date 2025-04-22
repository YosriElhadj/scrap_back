// scripts/runPythonScraper.js
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Property = require('../models/Property');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Connect to MongoDB
async function connectToDatabase() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/land-valuation");
    console.log('Connected to MongoDB successfully');
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  }
}

// Run the Python scraper
async function runPythonScraper(location) {
  return new Promise((resolve, reject) => {
    console.log(`Running Python scraper for location: ${location || 'default'}`);
    
    // Create the scraper command with optional location arg
    const args = ['scrape_tayara.py'];
    if (location) {
      args.push('--location');
      args.push(location);
    }
    
    const pythonProcess = spawn('python3', args);
    
    pythonProcess.stdout.on('data', (data) => {
      console.log(`Python output: ${data}`);
    });
    
    pythonProcess.stderr.on('data', (data) => {
      console.error(`Python error: ${data}`);
    });
    
    pythonProcess.on('close', (code) => {
      if (code === 0) {
        console.log('Python scraper completed successfully');
        resolve();
      } else {
        console.error(`Python scraper exited with code ${code}`);
        reject(new Error(`Python script exited with code ${code}`));
      }
    });
  });
}

// Import the scraped data into MongoDB
async function importScrapedData() {
  try {
    // Read the CSV file
    const Papa = require('papaparse');
    const csvData = fs.readFileSync('properties_enhanced.csv', 'utf8');
    
    // Parse the CSV data
    const parsed = Papa.parse(csvData, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true
    });
    
    console.log(`Found ${parsed.data.length} properties in CSV`);
    
    // Convert to MongoDB format
    let counter = 0;
    for (const item of parsed.data) {
      // Skip items with missing crucial data
      if (!item.price || !item.address) {
        continue;
      }
      
      // Get coordinates (you would need to implement geocoding here)
      let coordinates = [10.181667, 36.806389]; // Default to Tunis coordinates
      
      // Use geocoding for actual locations using the address
      try {
        if (item.address && item.governorate) {
          // You could add actual geocoding here, for now using random coordinates in Tunisia
          const latOffset = (Math.random() - 0.5) * 0.1;
          const lngOffset = (Math.random() - 0.5) * 0.1;
          coordinates = [10.181667 + lngOffset, 36.806389 + latOffset];
        }
      } catch (error) {
        console.error('Error geocoding address:', error);
      }
      
      // Create features object
      const features = {
        nearWater: item.description?.toLowerCase().includes('mer') || item.description?.toLowerCase().includes('lac'),
        roadAccess: true, // Default assumption
        utilities: true // Default assumption
      };
      
      // Create MongoDB document
      const property = new Property({
        location: {
          type: 'Point',
          coordinates: coordinates // [longitude, latitude]
        },
        address: item.address,
        city: item.governorate || '',
        state: 'Tunisia',
        zipCode: '',
        price: item.price,
        area: item.area || 43560, // Default to 1 acre if no area
        pricePerSqFt: item.pricePerSqFt || (item.price / 43560),
        zoning: item.zoning || 'residential',
        features: features,
        sourceUrl: item.sourceUrl || '',
        description: item.description || '',
        images: item.images ? item.images.split(',').map(img => img.trim()) : [],
        listedDate: new Date(),
        lastUpdated: new Date()
      });
      
      // Save to MongoDB, but skip if property with same address and price already exists
      const existingProperty = await Property.findOne({
        address: property.address,
        price: property.price
      });
      
      if (!existingProperty) {
        await property.save();
        counter++;
      }
    }
    
    console.log(`Imported ${counter} new properties to MongoDB`);
    return counter;
  } catch (error) {
    console.error('Error importing data:', error);
    throw error;
  }
}

// Main function to run the scraper and import data
async function main() {
  try {
    // Check if location was passed as arg
    const args = process.argv.slice(2);
    const locationArgIndex = args.indexOf('--location');
    const location = locationArgIndex !== -1 ? args[locationArgIndex + 1] : null;
    
    // Connect to database
    await connectToDatabase();
    
    // Run the Python scraper
    await runPythonScraper(location);
    
    // Import the data
    const count = await importScrapedData();
    
    // Disconnect from database
    await mongoose.connection.close();
    
    console.log(`Script completed successfully. Imported ${count} properties.`);
    process.exit(0);
  } catch (error) {
    console.error('Error in main process:', error);
    // Try to disconnect database before exit
    try {
      await mongoose.connection.close();
    } catch (e) {}
    process.exit(1);
  }
}

// Run the main function
main();