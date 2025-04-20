// backend-diagnostic.js - Create this file in your project root
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Property = require('./models/Property');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env') });

async function diagnoseBackend() {
  console.log('Starting backend diagnostic...');
  
  try {
    // Check environment variables
    console.log('Environment variables:');
    console.log('- PORT:', process.env.PORT || 'Not set');
    console.log('- MONGODB_URI:', process.env.MONGODB_URI || 'Not set');
    console.log('- GOOGLE_MAPS_API_KEY:', process.env.GOOGLE_MAPS_API_KEY ? 'Set' : 'Not set');
    
    // Connect to MongoDB
    console.log('\nConnecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/land-valuation");
    console.log('Successfully connected to MongoDB');
    
    // Check property count
    const propertyCount = await Property.countDocuments();
    console.log(`\nFound ${propertyCount} properties in the database`);
    
    // Check property format and structure
    const sampleProperty = await Property.findOne().lean();
    if (sampleProperty) {
      console.log('\nSample property structure:');
      console.log(JSON.stringify(sampleProperty, null, 2));
      
      // Check geospatial indexing
      console.log('\nChecking geospatial index...');
      const indexes = await Property.collection.indexes();
      console.log('Collection indexes:', JSON.stringify(indexes, null, 2));
      
      // Test the nearby properties route logic directly
      console.log('\nTesting nearby properties query...');
      const testLat = sampleProperty.location.coordinates[1]; // Latitude is second element
      const testLng = sampleProperty.location.coordinates[0]; // Longitude is first element
      
      const nearbyProperties = await Property.find({
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [testLng, testLat]
            },
            $maxDistance: 5000
          }
        }
      }).limit(5);
      
      console.log(`Found ${nearbyProperties.length} properties near [${testLat}, ${testLng}]`);
      
      // Test API response formatting
      console.log('\nCreating test API response...');
      const testResponse = nearbyProperties.map(p => p.toObject());
      console.log('First property in response format:');
      console.log(JSON.stringify(testResponse[0], null, 2));
    } else {
      console.log('No properties found in the database!');
    }
    
  } catch (error) {
    console.error('Diagnostic error:', error);
  } finally {
    // Disconnect from MongoDB
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      console.log('\nDatabase connection closed');
    }
  }
  
  console.log('\nDiagnostic completed');
}

// Run the diagnostic
diagnoseBackend();