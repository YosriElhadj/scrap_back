// routes/scraping.js
const express = require('express');
const router = express.Router();
const { Client } = require('@googlemaps/google-maps-services-js');
const PropertyDataScraper = require('../scrapers/propertyDataScraper');

const googleMapsClient = new Client({});

// Scrape data from real estate listings
router.post('/listings', async (req, res) => {
  try {
    const { location } = req.body;
    
    if (!location) {
      return res.status(400).json({ message: 'Location is required' });
    }

    // Return immediate response while initiating background job
    res.json({
      message: 'Scraping initiated',
      jobId: 'job_' + Date.now(),
      estimatedCompletionTime: '5 minutes'
    });
    
    // Start background scraping job
    startScrapingJob(location);
    
  } catch (error) {
    console.error('Error initiating scraping:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// This runs the scraping in the background
async function startScrapingJob(location) {
  try {
    console.log(`Starting scraping job for location: ${location}`);
    
    // Initialize the scraper
    const scraper = new PropertyDataScraper();
    await scraper.initialize();
    
    // Run the scraping process
    const result = await scraper.scrape(location, 30); // 30 mile radius
    
    console.log(`Scraping job completed with result: ${JSON.stringify(result)}`);
  } catch (error) {
    console.error('Error in scraping job:', error);
  }
}

module.exports = router;