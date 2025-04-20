// land-scraper-backend/scrapers/propertyDataScraper.js
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
        needsProxy: true
      },
      {
        name: 'Realtor',
        baseUrl: 'https://www.realtor.com',
        enabled: true,
        needsProxy: true
      },
      {
        name: 'LandWatch',
        baseUrl: 'https://www.landwatch.com',
        enabled: true,
        needsProxy: false
      },
      {
        name: 'CountyRecords',
        type: 'api',
        enabled: false, // Requires subscription
        apiKey: process.env.COUNTY_RECORDS_API_KEY
      }
    ];
    
    this.proxies = [
      // Add your rotating proxies here
      `http://${process.env.PROXY_USERNAME}:${process.env.PROXY_PASSWORD}@proxy1.example.com:8080`,
      `http://${process.env.PROXY_USERNAME}:${process.env.PROXY_PASSWORD}@proxy2.example.com:8080`
    ];
    
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0'
    ];
    
    this.browser = null;
    this.currentProxyIndex = 0;
    this.scrapingDelay = 5000; // 5 seconds between requests
  }
  
  async initialize() {
    // Launch headless browser
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        `--proxy-server=${this.getNextProxy()}`
      ]
    });
    
    // Create logs directory if it doesn't exist
    const logsDir = path.join(__dirname, '../logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
  }
  
  getNextProxy() {
    const proxy = this.proxies[this.currentProxyIndex];
    this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxies.length;
    return proxy;
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
      
      // Scrape from each enabled source
      for (const source of this.sources.filter(s => s.enabled)) {
        console.log(`Scraping from ${source.name}...`);
        
        try {
          if (source.type === 'api') {
            await this.scrapeFromAPI(source, lat, lng, radius);
          } else {
            await this.scrapeFromWebsite(source, lat, lng, radius, formattedAddress);
          }
        } catch (error) {
          console.error(`Error scraping from ${source.name}:`, error);
          fs.appendFileSync(
            path.join(__dirname, '../logs/errors.log'),
            `[${new Date().toISOString()}] Error scraping from ${source.name}: ${error.message}\n`
          );
        }
        
        // Wait between sources to avoid rate limiting
        await this.sleep(this.scrapingDelay);
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
    try {
      const page = await this.browser.newPage();
      
      // Set user agent
      await page.setUserAgent(this.getRandomUserAgent());
      
      // Intercept requests to avoid unnecessary resources
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        if (['image', 'stylesheet', 'font', 'media'].includes(request.resourceType())) {
          request.abort();
        } else {
          request.continue();
        }
      });
      
      // Navigate to Zillow search page
      // Note: The exact URL format may need adjustment based on Zillow's current structure
      const searchUrl = `https://www.zillow.com/homes/for_sale/?searchQueryState={"mapBounds":{"west":${lng-0.1},"east":${lng+0.1},"south":${lat-0.1},"north":${lat+0.1}},"isMapVisible":true,"filterState":{"isLot":{"value":true},"isManuLand":{"value":false}},"isListVisible":true,"mapZoom":12}`;
      
      console.log(`Navigating to: ${searchUrl}`);
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      
      // Wait for search results to load
      await page.waitForSelector('[data-testid="search-list-container"]', { timeout: 60000 });
      
      // Extract property data
      const propertyData = await page.evaluate(() => {
        const properties = [];
        const propertyCards = document.querySelectorAll('[data-test="property-card"]');
        
        propertyCards.forEach(card => {
          try {
            const priceElement = card.querySelector('[data-test="property-card-price"]');
            const addressElement = card.querySelector('[data-test="property-card-addr"]');
            const detailsElement = card.querySelector('[data-test="property-card-details"]');
            const linkElement = card.querySelector('a[data-test="property-card-link"]');
            
            if (priceElement && addressElement) {
              const price = priceElement.textContent.trim();
              const address = addressElement.textContent.trim();
              const details = detailsElement ? detailsElement.textContent.trim() : '';
              const link = linkElement ? linkElement.getAttribute('href') : '';
              
              // Parse area from details
              let area = null;
              const areaMatch = details.match(/([0-9,]+)\s+sqft/);
              if (areaMatch) {
                area = parseInt(areaMatch[1].replace(/,/g, ''));
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
      }
      
      await page.close();
      
    } catch (error) {
      console.error('Error scraping from Zillow:', error);
      throw error;
    }
  }
  
  async scrapeFromRealtor(lat, lng, radius) {
    try {
      const page = await this.browser.newPage();
      
      // Set user agent
      await page.setUserAgent(this.getRandomUserAgent());
      
      // Intercept requests to avoid unnecessary resources
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        if (['image', 'stylesheet', 'font', 'media'].includes(request.resourceType())) {
          request.abort();
        } else {
          request.continue();
        }
      });
      
      // Realtor.com search URL format
      const searchUrl = `https://www.realtor.com/realestateandhomes-search/10mi-radius/${lat},${lng}/type-land/sby-1`;
      
      console.log(`Navigating to: ${searchUrl}`);
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      
      // Wait for search results to load
      await page.waitForSelector('[data-testid="property-list"]', { timeout: 60000 });
      
      // Extract property data
      const propertyData = await page.evaluate(() => {
        const properties = [];
        const propertyCards = document.querySelectorAll('[data-testid="property-card"]');
        
        propertyCards.forEach(card => {
          try {
            const priceElement = card.querySelector('[data-testid="card-price"]');
            const addressElement = card.querySelector('[data-testid="card-address"]');
            const detailsElement = card.querySelector('[data-testid="card-lot-size"]');
            const linkElement = card.querySelector('a[data-testid="card-link"]');
            
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
              const zoningElement = card.querySelector('[data-testid="card-zoning"]');
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
      });
      
      console.log(`Found ${propertyData.length} properties on Realtor.com`);
      
      // Process and save each property
      for (const property of propertyData) {
        await this.processAndSaveProperty(property, lat, lng);
      }
      
      await page.close();
      
    } catch (error) {
      console.error('Error scraping from Realtor.com:', error);
      fs.appendFileSync(
        path.join(__dirname, '../logs/errors.log'),
        `[${new Date().toISOString()}] Error scraping from Realtor: ${error.message}\n`
      );
      throw error;
    }
  }
  
  async scrapeFromLandWatch(address, radius) {
    try {
      const page = await this.browser.newPage();
      
      // Set user agent
      await page.setUserAgent(this.getRandomUserAgent());
      
      // Intercept requests to avoid unnecessary resources
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        if (['image', 'stylesheet', 'font', 'media'].includes(request.resourceType())) {
          request.abort();
        } else {
          request.continue();
        }
      });
      
      // LandWatch search URL format - use address location
      const encodedAddress = encodeURIComponent(address);
      const searchUrl = `https://www.landwatch.com/land-for-sale/in-${encodedAddress}`;
      
      console.log(`Navigating to: ${searchUrl}`);
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      
      // Wait for search results to load
      await page.waitForSelector('.property-card', { timeout: 60000 });
      
      // Extract property data
      const propertyData = await page.evaluate(() => {
        const properties = [];
        const propertyCards = document.querySelectorAll('.property-card');
        
        propertyCards.forEach(card => {
          try {
            const priceElement = card.querySelector('.price');
            const addressElement = card.querySelector('.address');
            const detailsElement = card.querySelector('.details');
            const linkElement = card.querySelector('a.property-card-link');
            
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
      }
      
      await page.close();
      
    } catch (error) {
      console.error('Error scraping from LandWatch:', error);
      fs.appendFileSync(
        path.join(__dirname, '../logs/errors.log'),
        `[${new Date().toISOString()}] Error scraping from LandWatch: ${error.message}\n`
      );
      throw error;
    }
    }
  
  async scrapeFromAPI(source, lat, lng, radius) {
    if (source.name === 'CountyRecords') {
      try {
        // Example API call to county records
        const response = await axios.get('https://api.countyrecords.com/properties', {
          params: {
            lat,
            lng,
            radius,
            apiKey: source.apiKey,
            propertyType: 'land'
          }
        });
        
        if (response.data && response.data.properties) {
          console.log(`Found ${response.data.properties.length} properties from County Records API`);
          
          for (const property of response.data.properties) {
            await this.processAndSaveProperty({
              price: property.price,
              address: property.address,
              area: property.lotSize,
              sourceUrl: property.detailUrl,
              source: 'CountyRecords',
              zoning: property.zoning,
              features: {
                nearWater: property.nearWater,
                roadAccess: property.roadAccess,
                utilities: property.utilities
              },
              parcelId: property.parcelId
            }, lat, lng);
          }
        }
      } catch (error) {
        console.error('Error fetching from County Records API:', error);
        throw error;
      }
    }
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
      
      if (propertyData.address) {
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

// Example usage
// async function main() {
//   const scraper = new PropertyDataScraper();
//   await scraper.initialize();
//   await scraper.scrape('Austin, TX', 30);
// }
// 
// main().catch(console.error);