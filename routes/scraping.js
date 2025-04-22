// routes/scraping.js - UPDATED FOR TAYARA
const express = require('express');
const router = express.Router();
const { Client } = require('@googlemaps/google-maps-services-js');
const PropertyDataScraper = require('../scrapers/propertyDataScraper');
const { ValidationError } = require('../middleware/errorHandler');
const fs = require('fs');
const path = require('path');

const googleMapsClient = new Client({});

// Active scraping jobs tracker - could be replaced with a more robust job queue in production
const activeJobs = new Map();

// Get scraping job status
router.get('/status/:jobId', (req, res, next) => {
  try {
    const { jobId } = req.params;
    
    if (!jobId) {
      throw new ValidationError('Job ID is required');
    }
    
    const job = activeJobs.get(jobId);
    
    if (!job) {
      return res.json({
        success: true,
        jobId,
        status: 'unknown',
        message: 'Job not found or completed'
      });
    }
    
    res.json({
      success: true,
      jobId,
      status: job.status,
      progress: job.progress,
      message: job.message,
      startTime: job.startTime,
      estimatedCompletionTime: job.estimatedCompletionTime
    });
    
  } catch (error) {
    next(error);
  }
});

// Scrape data from real estate listings
router.post('/listings', async (req, res, next) => {
  try {
    const { location, radius = 30 } = req.body;
    
    if (!location) {
      throw new ValidationError('Location is required');
    }
    
    // Validate radius
    const parsedRadius = parseInt(radius);
    if (isNaN(parsedRadius) || parsedRadius <= 0 || parsedRadius > 100) {
      throw new ValidationError('Radius must be a positive number between 1 and 100 miles');
    }
    
    // Generate a job ID
    const jobId = 'job_' + Date.now();
    
    // Create a new job entry
    activeJobs.set(jobId, {
      status: 'queued',
      progress: 0,
      message: 'Job queued, waiting to start',
      startTime: new Date().toISOString(),
      estimatedCompletionTime: new Date(Date.now() + 5 * 60 * 1000).toISOString() // estimate 5 minutes
    });
    
    // Return immediate response
    res.json({
      success: true,
      message: 'Scraping initiated',
      jobId,
      estimatedCompletionTime: '5 minutes',
      statusEndpoint: `/api/scrape/status/${jobId}`
    });
    
    // Start background scraping job
    startScrapingJob(jobId, location, parsedRadius);
    
  } catch (error) {
    next(error);
  }
});

// This runs the scraping in the background
async function startScrapingJob(jobId, location, radius) {
  try {
    console.log(`Starting scraping job ${jobId} for location: ${location} with radius: ${radius} miles`);
    
    // Update job status
    activeJobs.set(jobId, {
      ...activeJobs.get(jobId),
      status: 'running',
      message: 'Scraping in progress',
    });
    
    // Debug the PropertyDataScraper type
    console.log('PropertyDataScraper type:', typeof PropertyDataScraper);
    
    // Initialize the scraper
    const scraper = new PropertyDataScraper();
    await scraper.initialize();
    
    // Update progress
    updateJobProgress(jobId, 10, 'Scraper initialized');
    
    // Run the scraping process
    const result = await scraper.scrape(location, radius);
    
    // Update job status based on result
    if (result.success) {
      activeJobs.set(jobId, {
        ...activeJobs.get(jobId),
        status: 'completed',
        progress: 100,
        message: `Scraping completed: ${result.message}`,
        completionTime: new Date().toISOString()
      });
    } else {
      activeJobs.set(jobId, {
        ...activeJobs.get(jobId),
        status: 'failed',
        progress: 100,
        message: `Scraping failed: ${result.error}`,
        completionTime: new Date().toISOString()
      });
    }
    
    console.log(`Scraping job ${jobId} completed with result:`, result);
    
    // Clean up job data after 1 hour
    setTimeout(() => {
      activeJobs.delete(jobId);
    }, 60 * 60 * 1000);
    
  } catch (error) {
    console.error(`Error in scraping job ${jobId}:`, error);
    
    // Log the error
    fs.appendFileSync(
      path.join(__dirname, '../logs/errors.log'),
      `[${new Date().toISOString()}] Error in scraping job ${jobId}: ${error.message}\n`
    );
    
    // Update job status
    activeJobs.set(jobId, {
      ...activeJobs.get(jobId),
      status: 'failed',
      progress: 100,
      message: `Error: ${error.message}`,
      completionTime: new Date().toISOString()
    });
    
    // Clean up job data after 1 hour
    setTimeout(() => {
      activeJobs.delete(jobId);
    }, 60 * 60 * 1000);
  }
}

// Helper to update job progress
function updateJobProgress(jobId, progress, message) {
  const job = activeJobs.get(jobId);
  if (job) {
    activeJobs.set(jobId, {
      ...job,
      progress,
      message
    });
  }
}

// Add a route to get recent scraping logs
router.get('/logs', (req, res, next) => {
  try {
    const { lines = 100 } = req.query;
    const parsedLines = parseInt(lines);
    
    if (isNaN(parsedLines) || parsedLines <= 0) {
      throw new ValidationError('Lines must be a positive number');
    }
    
    // Read the scraping log file
    const scrapingLogPath = path.join(__dirname, '../logs/scraping.log');
    const errorLogPath = path.join(__dirname, '../logs/errors.log');
    
    let scrapingLogs = '';
    let errorLogs = '';
    
    if (fs.existsSync(scrapingLogPath)) {
      scrapingLogs = fs.readFileSync(scrapingLogPath, 'utf8')
        .split('\n')
        .filter(Boolean)
        .slice(-parsedLines)
        .join('\n');
    }
    
    if (fs.existsSync(errorLogPath)) {
      errorLogs = fs.readFileSync(errorLogPath, 'utf8')
        .split('\n')
        .filter(Boolean)
        .slice(-parsedLines)
        .join('\n');
    }
    
    res.json({
      success: true,
      scrapingLogs,
      errorLogs,
      activeJobs: Array.from(activeJobs.entries()).map(([id, job]) => ({ id, ...job }))
    });
    
  } catch (error) {
    next(error);
  }
});

// Add a direct run route for immediate Python scraping
router.post('/run-python', async (req, res, next) => {
  try {
    const { location } = req.body;
    
    if (!location) {
      throw new ValidationError('Location is required');
    }
    
    console.log('Running immediate Python scraper for:', location);
    
    // Initialize the scraper
    const scraper = new PropertyDataScraper();
    await scraper.initialize();
    
    // Run the Python scraper directly
    const result = await scraper.runPythonScraper(location);
    
    if (result) {
      res.json({
        success: true,
        message: 'Python scraper completed successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Python scraper failed'
      });
    }
    
  } catch (error) {
    next(error);
  }
});

module.exports = router;