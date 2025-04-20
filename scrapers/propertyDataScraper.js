// scrapers/propertyDataScraper.js - UPDATED FOR NO PROXIES
const axios = require('axios');
const cheerio = require('cheerio');
const { Client } = require('@googlemaps/google-maps-services-js');
const mongoose = require('mongoose');
const Property = require('../models/Property');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

dotenv.config();

// Google Maps client setup
const googleMapsClient = new Client({});

// Class for handling property data scraping
class PropertyDataScraper {
  constructor() {
    this.sources = [
      {
        name: 'Zillow',
        baseUrl: 'https://www.zillow.com',
        enabled: true,
        needsProxy: false // Changed to false
      },
      {
        name: 'Realtor',
        baseUrl: 'https://www.realtor.com',
        enabled: true,
        needsProxy: false // Changed to false
      },
      {
        name: 'LandWatch',
        baseUrl: 'https://www.landwatch.com',
        enabled: true,
        needsProxy: false // Changed to false
      },
      {
        name: 'CountyRecords',
        type: 'api',
        enabled: false, // Requires subscription
        apiKey: process.env.COUNTY_RECORDS_API_KEY
      }
    ];
    
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36 Edg/92.0.902.84',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1'
    ];
    
    this.browser = null;
    // Increased delay to avoid rate limiting without proxies
    this.scrapingDelay = 10000; // 10 seconds between requests
    this.maxRetries = 3; // Add retries
  }
  
  async initialize() {
    // Create logs directory if it doesn't exist
    const logsDir = path.join(__dirname, '../logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Launch headless browser without proxy
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process', // Helps with some anti-scraping measures
        '--disable-dev-shm-usage', // For stability
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });
    
    // Log startup
    fs.appendFileSync(
      path.join(logsDir, 'scraping.log'),
      `[${new Date().toISOString()}] Scraper initialized without proxies\n`
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
      
      // Scrape from each enabled source with longer delays between them
      for (const source of this.sources.filter(s => s.enabled)) {
        console.log(`Scraping from ${source.name}...`);
        
        try {
          if (source.type === 'api') {
            await this.scrapeFromAPI(source, lat, lng, radius);
          } else {
            await this.scrapeFromWebsite(source, lat, lng, radius, formattedAddress);
          }
          
          // Wait longer between sources to avoid detection
          await this.sleep(this.scrapingDelay * 3);
        } catch (error) {
          console.error(`Error scraping from ${source.name}:`, error);
          fs.appendFileSync(
            path.join(__dirname, '../logs/errors.log'),
            `[${new Date().toISOString()}] Error scraping from ${source.name}: ${error.message}\n`
          );
        }
      }
      
      console.log('Scraping completed successfully');
      return { success: true, message: 'Scraping completed' };
      
    } catch (error) {
      console.error('Scraping error:', error);
      return { success: false, error: error.message };
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
    }
  }
  
  async scrapeFromWebsite(source, lat, lng, radius, address) {
    // Implementation varies by website
    if (source.name === 'Zillow') {
      await this.scrapeFromZillow(lat, lng, radius);
    } else if (source.name === 'Realtor') {
      await this.scrapeFromRealtor(lat, lng, radius);
    } else if (source.name === 'LandWatch') {
      await this.scrapeFromLandWatch(address, radius);
    }
  }
  
  async scrapeFromZillow(lat, lng, radius) {
    let retries = 0;
    
    while (retries < this.maxRetries) {
      try {
        // Create a new context for each attempt (helps avoid tracking)
        
        const page = await this.browser.newPage();
        
        // Set a random user agent
        await page.setUserAgent(this.getRandomUserAgent());
        
        // Add random delay
        await this.sleep(2000 + Math.floor(Math.random() * 3000));
        
        // Set extra headers to appear more like a real browser
        await page.setExtraHTTPHeaders({
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Referer': 'https://www.google.com/'
        });
        
        // Intercept requests to avoid unnecessary resources
        await page.setRequestInterception(true);
        page.on('request', (request) => {
          if (['image', 'stylesheet', 'font', 'media'].includes(request.resourceType())) {
            request.abort();
          } else {
            request.continue();
          }
        });
        
        // Use mapBounds with radius in degrees (roughly approximate)
        // 1 degree ~= 111km at the equator
        const radiusDegrees = radius * 0.01; // Convert miles to approximate degrees
        
        // Navigate to Zillow search page
        const searchUrl = `https://www.zillow.com/homes/for_sale/?searchQueryState={"mapBounds":{"west":${lng-radiusDegrees},"east":${lng+radiusDegrees},"south":${lat-radiusDegrees},"north":${lat+radiusDegrees}},"isMapVisible":true,"filterState":{"isLot":{"value":true},"isManuLand":{"value":false}},"isListVisible":true,"mapZoom":10}`;
        
        console.log(`Navigating to: ${searchUrl}`);
        await page.goto(searchUrl, { 
          waitUntil: 'networkidle2', 
          timeout: 60000 
        });
        
        // Pause to let the page fully render
        await this.sleep(5000);
        
        // Wait for search results to load
        try {
          await page.waitForSelector('[data-testid="search-list-container"]', { timeout: 30000 });
        } catch (e) {
          console.log('Could not find search-list-container, trying alternative selector');
          await page.waitForSelector('.search-page-list-container', { timeout: 30000 });
        }
        
        // Take a screenshot for debugging
        await page.screenshot({ path: 'zillow-results.png' });
        
        // Extract property data
        const propertyData = await page.evaluate(() => {
          const properties = [];
          // Try multiple selectors to handle Zillow's frequent UI changes
          const propertyCards = document.querySelectorAll('[data-test="property-card"], .list-card, .property-card');
          
          propertyCards.forEach(card => {
            try {
              const priceElement = card.querySelector('[data-test="property-card-price"], .list-card-price, .property-card-price');
              const addressElement = card.querySelector('[data-test="property-card-addr"], .list-card-addr, .property-card-address');
              const detailsElement = card.querySelector('[data-test="property-card-details"], .list-card-details, .property-card-details');
              const linkElement = card.querySelector('a[data-test="property-card-link"], a.list-card-link, a.property-card-link');
              
              if (priceElement && addressElement) {
                const price = priceElement.textContent.trim();
                const address = addressElement.textContent.trim();
                const details = detailsElement ? detailsElement.textContent.trim() : '';
                const link = linkElement ? linkElement.getAttribute('href') : '';
                
                // Parse area from details
                let area = null;
                const areaMatch = details.match(/([0-9,]+)\s+sqft|([0-9,.]+)\s+acres?/i);
                if (areaMatch) {
                  if (areaMatch[1]) {
                    // Square feet
                    area = parseInt(areaMatch[1].replace(/,/g, ''));
                  } else if (areaMatch[2]) {
                    // Acres (convert to sqft)
                    area = parseFloat(areaMatch[2].replace(/,/g, '')) * 43560;
                  }
                }
                
                properties.push({
                  price: parseFloat(price.replace(/[^0-9.]/g, '')),
                  address,
                  details,
                  area,
                  sourceUrl: link.startsWith('http') ? link : `https://www.zillow.com${link}`,
                  source: 'Zillow'
                });
              }
            } catch (error) {
              console.error('Error parsing property card:', error);
            }
          });
          
          return properties;
        });
        
        console.log(`Found ${propertyData.length} properties on Zillow`);
        
        // Process and save each property
        for (const property of propertyData) {
          await this.processAndSaveProperty(property, lat, lng);
          // Add small delay between saving properties
          await this.sleep(500);
        }
        
        await page.close();
        
        
        // Successfully completed
        break;
        
      } catch (error) {
        retries++;
        console.error(`Attempt ${retries}/${this.maxRetries} failed for Zillow:`, error);
        
        if (retries >= this.maxRetries) {
          console.error('Zillow scraping failed after max retries');
          throw error;
        }
        
        // Exponential backoff between retries
        await this.sleep(this.scrapingDelay * retries);
      }
    }
  }
  
  async scrapeFromRealtor(lat, lng, radius) {
    let retries = 0;
    
    while (retries < this.maxRetries) {
      try {
        // Create a new context for each attempt
        
        const page = await this.browser.newPage();
        
        // Set a random user agent
        await page.setUserAgent(this.getRandomUserAgent());
        
        // Add random delay
        await this.sleep(2000 + Math.floor(Math.random() * 3000));
        
        // Set extra headers to appear more like a real browser
        await page.setExtraHTTPHeaders({
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Referer': 'https://www.google.com/'
        });
        
        // Intercept requests to avoid unnecessary resources
        await page.setRequestInterception(true);
        page.on('request', (request) => {
          if (['image', 'stylesheet', 'font', 'media'].includes(request.resourceType())) {
            request.abort();
          } else {
            request.continue();
          }
        });
        
        // Use a simpler search URL format to minimize issues
        const searchUrl = `https://www.realtor.com/realestateandhomes-search/${Math.round(radius)}mi-radius/${lat},${lng}/type-land/sby-1`;
        
        console.log(`Navigating to: ${searchUrl}`);
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Pause to let the page fully render
        await this.sleep(5000);
        
        // Take a screenshot for debugging
        await page.screenshot({ path: 'realtor-results.png' });
        
        // Try different selectors as Realtor.com may change their HTML structure
        const selectors = ['[data-testid="property-list"]', '.result-list', '.property-list'];
        let listSelector = null;
        
        for (const selector of selectors) {
          if (await page.$(selector) !== null) {
            listSelector = selector;
            break;
          }
        }
        
        if (!listSelector) {
          throw new Error('Could not find property list on Realtor.com');
        }
        
        // Extract property data
        const propertyData = await page.evaluate((listSelector) => {
          const properties = [];
          const propertyCards = document.querySelectorAll(`${listSelector} [data-testid="property-card"], ${listSelector} .component_property-card, ${listSelector} .property-card`);
          
          propertyCards.forEach(card => {
            try {
              // Try multiple selectors to handle UI changes
              const priceElement = card.querySelector('[data-testid="card-price"], .card-price, .price');
              const addressElement = card.querySelector('[data-testid="card-address"], .card-address, .address');
              const detailsElement = card.querySelector('[data-testid="card-lot-size"], .card-lot-size, .property-details');
              const linkElement = card.querySelector('a[data-testid="card-link"], a.card-link, a.property-link');
              
              if (priceElement && addressElement) {
                const price = priceElement.textContent.trim();
                const address = addressElement.textContent.trim();
                const details = detailsElement ? detailsElement.textContent.trim() : '';
                const link = linkElement ? linkElement.getAttribute('href') : '';
                
                // Parse area from details
                let area = null;
                const areaMatch = details.match(/([0-9.,]+)\s+acres?|([0-9.,]+)\s+sqft/i);
                if (areaMatch) {
                  // Handle acres vs square feet
                  if (areaMatch[1]) {
                    // Convert acres to square feet
                    area = parseFloat(areaMatch[1].replace(/,/g, '')) * 43560;
                  } else if (areaMatch[2]) {
                    area = parseInt(areaMatch[2].replace(/,/g, ''));
                  }
                }
                
                // Get zoning information if available
                const zoningElement = card.querySelector('[data-testid="card-zoning"], .zoning');
                const zoning = zoningElement ? zoningElement.textContent.trim().toLowerCase() : 'unknown';
                
                properties.push({
                  price: parseFloat(price.replace(/[^0-9.]/g, '')),
                  address,
                  details,
                  area,
                  zoning,
                  sourceUrl: link.startsWith('http') ? link : `https://www.realtor.com${link}`,
                  source: 'Realtor'
                });
              }
            } catch (error) {
              console.error('Error parsing Realtor property card:', error);
            }
          });
          
          return properties;
        }, listSelector);
        
        console.log(`Found ${propertyData.length} properties on Realtor.com`);
        
        // Process and save each property
        for (const property of propertyData) {
          await this.processAndSaveProperty(property, lat, lng);
          // Add small delay between saving properties
          await this.sleep(500);
        }
        
        await page.close();
        
        
        // Successfully completed
        break;
        
      } catch (error) {
        retries++;
        console.error(`Attempt ${retries}/${this.maxRetries} failed for Realtor:`, error);
        
        if (retries >= this.maxRetries) {
          console.error('Realtor scraping failed after max retries');
          throw error;
        }
        
        // Exponential backoff between retries
        await this.sleep(this.scrapingDelay * retries);
      }
    }
  }
  
  async scrapeFromLandWatch(address, radius) {
    let retries = 0;
    
    while (retries < this.maxRetries) {
      try {
        // Create a new context for each attempt
        const page = await this.browser.newPage();
        
        // Set a random user agent
        await page.setUserAgent(this.getRandomUserAgent());
        
        // Add random delay
        await this.sleep(2000 + Math.floor(Math.random() * 3000));
        
        // Set extra headers to appear more like a real browser
        await page.setExtraHTTPHeaders({
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Referer': 'https://www.google.com/'
        });
        
        // Intercept requests to avoid unnecessary resources
        await page.setRequestInterception(true);
        page.on('request', (request) => {
          if (['image', 'stylesheet', 'font', 'media'].includes(request.resourceType())) {
            request.abort();
          } else {
            request.continue();
          }
        });
        
        // Use a simpler search approach - extract state from address if possible
        let searchState = '';
        const stateMatch = address.match(/([A-Z]{2})/);
        if (stateMatch) {
          searchState = stateMatch[1].toLowerCase();
        } else {
          // Extract country or city as fallback
          const parts = address.split(',');
          if (parts.length > 1) {
            searchState = parts[parts.length - 2].trim().toLowerCase().replace(/\s+/g, '-');
          } else {
            searchState = 'us'; // Default to US
          }
        }
        
        // LandWatch search URL - use simpler format
        const searchUrl = `https://www.landwatch.com/land-for-sale/${searchState}`;
        
        console.log(`Navigating to: ${searchUrl}`);
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Pause to let the page fully render
        await this.sleep(5000);
        
        // Take a screenshot for debugging
        await page.screenshot({ path: 'landwatch-results.png' });
        
        // Extract property data - try different selectors
        const propertyData = await page.evaluate(() => {
          const properties = [];
          // Try different selectors for property cards
          const propertyCards = document.querySelectorAll('.property-card, .land-card, .property-tile, .result-item');
          
          propertyCards.forEach(card => {
            try {
              // Try multiple selectors for each element
              const priceElement = card.querySelector('.price, .property-price, .card-price');
              const addressElement = card.querySelector('.address, .property-address, .card-address, .location');
              const detailsElement = card.querySelector('.details, .property-details, .card-details, .description');
              const linkElement = card.querySelector('a.property-card-link, a.card-link, a.property-link, a.detail-link');
              
              if (priceElement && addressElement) {
                const price = priceElement.textContent.trim();
                const address = addressElement.textContent.trim();
                const details = detailsElement ? detailsElement.textContent.trim() : '';
                const link = linkElement ? linkElement.getAttribute('href') : '';
                
                // Parse area from details
                let area = null;
                const areaMatch = details.match(/([0-9.,]+)\s+acres?|([0-9.,]+)\s+sqft/i);
                if (areaMatch) {
                  // Handle acres vs square feet
                  if (areaMatch[1]) {
                    // Convert acres to square feet
                    area = parseFloat(areaMatch[1].replace(/,/g, '')) * 43560;
                  } else if (areaMatch[2]) {
                    area = parseInt(areaMatch[2].replace(/,/g, ''));
                  }
                }
                
                // Check for features
                const featureText = details.toLowerCase();
                const nearWater = featureText.includes('water') || featureText.includes('lake') || 
                                  featureText.includes('river') || featureText.includes('creek');
                const roadAccess = !featureText.includes('no road access');
                const utilities = featureText.includes('utilities') || featureText.includes('electric') || 
                                  featureText.includes('water service');
                                  
                // Try to identify zoning
                let zoning = 'unknown';
                if (featureText.includes('residential')) zoning = 'residential';
                else if (featureText.includes('commercial')) zoning = 'commercial';
                else if (featureText.includes('agricultural')) zoning = 'agricultural';
                else if (featureText.includes('industrial')) zoning = 'industrial';
                
                properties.push({
                  price: parseFloat(price.replace(/[^0-9.]/g, '')),
                  address,
                  details,
                  area,
                  zoning,
                  features: {
                    nearWater,
                    roadAccess,
                    utilities
                  },
                  sourceUrl: link.startsWith('http') ? link : `https://www.landwatch.com${link}`,
                  source: 'LandWatch'
                });
              }
            } catch (error) {
              console.error('Error parsing LandWatch property card:', error);
            }
          });
          
          return properties;
        });
        
        console.log(`Found ${propertyData.length} properties on LandWatch`);
        
        // Process and save each property
        for (const property of propertyData) {
          await this.processAndSaveProperty(property, 0, 0); // Let geocoding handle coordinates
          // Add small delay between saving properties
          await this.sleep(500);
        }
        
        await page.close();
        
        
        // Successfully completed
        break;
        
      } catch (error) {
        retries++;
        console.error(`Attempt ${retries}/${this.maxRetries} failed for LandWatch:`, error);
        
        if (retries >= this.maxRetries) {
          console.error('LandWatch scraping failed after max retries');
          throw error;
        }
        
        // Exponential backoff between retries
        await this.sleep(this.scrapingDelay * retries);
      }
    }
  }
  
  async scrapeFromAPI(source, lat, lng, radius) {
    // Implementation simplified for educational purposes
    console.log(`API scraping from ${source.name} would go here in a production system`);
    return [];
  }
  
  async processAndSaveProperty(propertyData, refLat, refLng) {
    try {
      // Check if property already exists
      const existingProperty = await Property.findOne({
        address: propertyData.address,
        price: propertyData.price
      });
      
      if (existingProperty) {
        console.log(`Property already exists: ${propertyData.address}`);
        return;
      }
      
      // Geocode the address if coordinates not provided
      let lat = refLat;
      let lng = refLng;
      
      if (propertyData.address && refLat === 0 && refLng === 0) {
        try {
          const geocodeResponse = await googleMapsClient.geocode({
            params: {
              address: propertyData.address,
              key: process.env.GOOGLE_MAPS_API_KEY
            }
          });
          
          if (geocodeResponse.data.results.length > 0) {
            lat = geocodeResponse.data.results[0].geometry.location.lat;
            lng = geocodeResponse.data.results[0].geometry.location.lng;
            
            // Also extract address components
            const result = geocodeResponse.data.results[0];
            let city = '';
            let state = '';
            let zipCode = '';
            
            for (const component of result.address_components) {
              if (component.types.includes('locality')) {
                city = component.long_name;
              } else if (component.types.includes('administrative_area_level_1')) {
                state = component.short_name;
              } else if (component.types.includes('postal_code')) {
                zipCode = component.long_name;
              }
            }
            
            propertyData.city = city;
            propertyData.state = state;
            propertyData.zipCode = zipCode;
          }
        } catch (error) {
          console.error(`Error geocoding address: ${propertyData.address}`, error);
          // Continue with reference coordinates
        }
      }
      
      // Calculate price per square foot if possible
      let pricePerSqFt = null;
      if (propertyData.price && propertyData.area && propertyData.area > 0) {
        pricePerSqFt = propertyData.price / propertyData.area;
      }
      
      // Create new property record
      const newProperty = new Property({
        location: {
          type: 'Point',
          coordinates: [lng, lat]
        },
        address: propertyData.address,
        city: propertyData.city,
        state: propertyData.state,
        zipCode: propertyData.zipCode,
        price: propertyData.price,
        area: propertyData.area,
        pricePerSqFt,
        zoning: propertyData.zoning || 'unknown',
        features: propertyData.features || {
          nearWater: false,
          roadAccess: true,
          utilities: true
        },
        sourceUrl: propertyData.sourceUrl,
        parcelId: propertyData.parcelId,
        description: propertyData.details,
        listedDate: new Date()
      });
      
      await newProperty.save();
      console.log(`Saved new property: ${propertyData.address}`);
      
    } catch (error) {
      console.error('Error processing property:', error);
      fs.appendFileSync(
        path.join(__dirname, '../logs/errors.log'),
        `[${new Date().toISOString()}] Error processing property: ${propertyData.address}: ${error.message}\n`
      );
    }
  }
  
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = PropertyDataScraper;