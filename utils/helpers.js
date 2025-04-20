// utils/helpers.js

/**
 * Format a price value for display
 * @param {number} price - The price value
 * @param {boolean} includeCents - Whether to include cents in the price
 * @returns {string} Formatted price string with currency symbol
 */
function formatPrice(price, includeCents = false) {
    if (price === null || price === undefined || isNaN(price)) {
      return 'Unknown';
    }
    
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: includeCents ? 2 : 0,
      maximumFractionDigits: includeCents ? 2 : 0
    }).format(price);
  }
  
  /**
   * Format area value for display
   * @param {number} area - Area in square feet
   * @param {string} unit - Unit to display ('sqft' or 'acres')
   * @returns {string} Formatted area string
   */
  function formatArea(area, unit = 'sqft') {
    if (area === null || area === undefined || isNaN(area)) {
      return 'Unknown';
    }
    
    if (unit === 'acres') {
      // Convert square feet to acres (1 acre = 43,560 sq ft)
      const acres = area / 43560;
      return `${acres.toFixed(2)} acres`;
    }
    
    // Format with thousand separators
    return `${new Intl.NumberFormat('en-US').format(Math.round(area))} sq ft`;
  }
  
  /**
   * Convert between area units
   * @param {number} value - The area value to convert
   * @param {string} fromUnit - The unit to convert from ('sqft' or 'acres')
   * @param {string} toUnit - The unit to convert to ('sqft' or 'acres')
   * @returns {number} Converted area value
   */
  function convertArea(value, fromUnit, toUnit) {
    if (fromUnit === toUnit) {
      return value;
    }
    
    if (fromUnit === 'acres' && toUnit === 'sqft') {
      return value * 43560;
    }
    
    if (fromUnit === 'sqft' && toUnit === 'acres') {
      return value / 43560;
    }
    
    throw new Error('Invalid unit conversion');
  }
  
  /**
   * Validate a geographical coordinate
   * @param {number} lat - Latitude 
   * @param {number} lng - Longitude
   * @returns {boolean} Whether the coordinates are valid
   */
  function isValidCoordinate(lat, lng) {
    const validLat = !isNaN(lat) && lat >= -90 && lat <= 90;
    const validLng = !isNaN(lng) && lng >= -180 && lng <= 180;
    
    return validLat && validLng;
  }
  
  /**
   * Calculate the distance between two points using the Haversine formula
   * @param {number} lat1 - Latitude of first point
   * @param {number} lng1 - Longitude of first point
   * @param {number} lat2 - Latitude of second point
   * @param {number} lng2 - Longitude of second point
   * @returns {number} Distance in kilometers
   */
  function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in km
    
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * 
              Math.sin(dLng/2) * Math.sin(dLng/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    return distance;
  }
  
  /**
   * Convert degrees to radians
   * @param {number} degrees - Angle in degrees
   * @returns {number} Angle in radians
   */
  function toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }
  
  /**
   * Generate a slug from a string
   * @param {string} text - Input text
   * @returns {string} URL-friendly slug
   */
  function slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^\w ]+/g, '')
      .replace(/ +/g, '-');
  }
  
  /**
   * Capitalize the first letter of each word in a string
   * @param {string} text - Input text
   * @returns {string} Title-cased text
   */
  function toTitleCase(text) {
    if (!text) return '';
    
    return text
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  
  module.exports = {
    formatPrice,
    formatArea,
    convertArea,
    isValidCoordinate,
    calculateDistance,
    slugify,
    toTitleCase
  };