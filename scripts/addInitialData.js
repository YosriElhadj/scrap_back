// scripts/addInitialData.js - UPDATED FOR TAYARA.TN

/**
 * This script helps with first-time usage by scraping real property data from Tayara.tn
 * for major Tunisian cities instead of using sample data
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Property = require('../models/Property');
const PropertyDataScraper = require('../scrapers/propertyDataScraper');
const fs = require('fs');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Major Tunisian cities to scrape data from
const tunisianCities = [
  'Tunis',      // Capital and largest city
  'Sfax',       // Major industrial and commercial center
  'Sousse',     // Tourist destination with active real estate
  'Djerba',     // Island with tourism development
  'Hammamet'    // Coastal resort town with many land opportunities
];

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

async function addInitialData() {
  try {
    await connectToDatabase();
    
    // Check if database already has properties
    const propertyCount = await Property.countDocuments();
    console.log(`Current property count: ${propertyCount}`);
    
    if (propertyCount > 0) {
      console.log('Database already has properties. Skipping initial data import.');
      process.exit(0);
    }
    
    console.log('Starting initial data scraping from Tayara.tn...');
    
    // Initialize scraper
    const scraper = new PropertyDataScraper();
    await scraper.initialize();
    
    let totalPropertiesAdded = 0;
    
    // Scrape each major city
    for (const city of tunisianCities) {
      console.log(`Scraping properties for ${city}...`);
      
      try {
        // Scrape properties for this city
        const result = await scraper.scrape(city, 30); // 30km radius
        
        if (result.success) {
          // Count how many properties were added for this city
          const cityPropertyCount = await Property.countDocuments();
          const newProperties = cityPropertyCount - propertyCount - totalPropertiesAdded;
          
          console.log(`Added ${newProperties} properties for ${city}`);
          totalPropertiesAdded += newProperties;
        } else {
          console.error(`Failed to scrape properties for ${city}: ${result.error}`);
        }
      } catch (cityError) {
        console.error(`Error processing ${city}: ${cityError.message}`);
        // Continue with next city
      }
      
      // Pause between cities to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log(`Added a total of ${totalPropertiesAdded} real properties from Tayara.tn`);
    
    // If we didn't find any properties, log a warning
    if (totalPropertiesAdded === 0) {
      console.warn('WARNING: No properties were found during initial scraping.');
      console.warn('You may need to manually trigger scraping for specific locations.');
    }
    
    // Create a marker file to indicate initial data has been added
    fs.writeFileSync(path.join(__dirname, '../.initial-data-added'), new Date().toISOString());
    
  } catch (error) {
    console.error('Error adding initial data:', error);
  } finally {
    // Clean up
    if (scraper && scraper.browser) {
      await scraper.browser.close();
    }
    
    await mongoose.connection.close();
    console.log('Database connection closed');
    process.exit(0);
  }
}

// Run the function
addInitialData();