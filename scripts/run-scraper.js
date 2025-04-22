// scripts/run-scraper.js
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Property = require('../models/Property');
const dotenv = require('dotenv');
const readline = require('readline');

// Load environment variables
dotenv.config();

// Create an interface for reading user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function to ask questions
function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Connect to MongoDB
async function connectToDatabase() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/land-valuation");
    console.log('Connected to MongoDB successfully');
    return true;
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    return false;
  }
}

// Run the Python scraper
async function runPythonScraper(location) {
  return new Promise((resolve, reject) => {
    console.log(`Running Python scraper for location: ${location || 'default'}`);
    
    // Create the scraper command with optional location arg
    const scriptPath = path.join(__dirname, '../scrape_tayara.py');
    const args = [scriptPath];
    
    if (location) {
      args.push('--location');
      args.push(location);
    }
    
    const pythonProcess = spawn('python3', args);
    
    pythonProcess.stdout.on('data', (data) => {
      console.log(`${data}`);
    });
    
    pythonProcess.stderr.on('data', (data) => {
      console.error(`Python error: ${data}`);
    });
    
    pythonProcess.on('close', (code) => {
      if (code === 0) {
        console.log('Python scraper completed successfully');
        resolve(true);
      } else {
        console.error(`Python scraper exited with code ${code}`);
        resolve(false);
      }
    });
  });
}

// Import JSON data into MongoDB
async function importJsonData() {
  try {
    const jsonPath = path.join(__dirname, '../properties.json');
    if (!fs.existsSync(jsonPath)) {
      console.log('No properties.json file found');
      return 0;
    }
    
    console.log('Importing data from properties.json...');
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
        
        // Show progress
        if (importCount % 10 === 0) {
          process.stdout.write(`Imported ${importCount} properties...\r`);
        }
      } catch (itemError) {
        console.error('Error importing property:', itemError);
      }
    }
    
    console.log(`\nImported ${importCount} new properties to MongoDB`);
    return importCount;
  } catch (error) {
    console.error('Error importing data:', error);
    return 0;
  }
}

// Check MongoDB for existing properties
async function checkExistingProperties() {
  try {
    const count = await Property.countDocuments();
    console.log(`Current database has ${count} properties`);
    return count;
  } catch (error) {
    console.error('Error checking existing properties:', error);
    return 0;
  }
}

// Main function to run the scraper and import data
async function main() {
  try {
    console.log('=== Land Valuation Data Integration Tool ===');
    
    // Connect to database
    const connected = await connectToDatabase();
    if (!connected) {
      console.log('Cannot continue without database connection');
      rl.close();
      return;
    }
    
    // Check existing properties
    const existingCount = await checkExistingProperties();
    
    // Ask user what they want to do
    const action = await ask(
      '\nWhat would you like to do?\n' +
      '1. Run Python scraper and import data\n' +
      '2. Import existing data from properties.json\n' +
      '3. Exit\n' +
      'Enter choice (1-3): '
    );
    
    if (action === '1') {
      // Ask for location
      const location = await ask('Enter location to scrape (or leave empty for default): ');
      
      // Run the Python scraper
      const scraperSuccess = await runPythonScraper(location || '');
      
      if (scraperSuccess) {
        // Import the data
        const importCount = await importJsonData();
        console.log(`Successfully imported ${importCount} new properties.`);
      } else {
        console.log('Scraper did not complete successfully.');
      }
    } else if (action === '2') {
      // Import existing data
      const importCount = await importJsonData();
      console.log(`Successfully imported ${importCount} new properties.`);
    } else {
      console.log('Exiting...');
    }
    
    // Disconnect from database
    await mongoose.connection.close();
    console.log('Database connection closed');
    
    rl.close();
  } catch (error) {
    console.error('Error in main process:', error);
    // Try to disconnect database before exit
    try {
      await mongoose.connection.close();
    } catch (e) {}
    
    rl.close();
  }
}

// Run the main function
main();