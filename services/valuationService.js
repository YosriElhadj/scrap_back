// services/valuationService.js

/**
 * Calculate the estimated value of a land based on comparables and features
 * @param {number} area - Area of the land in square feet
 * @param {Array} comparables - Array of comparable properties
 * @param {Object} features - Features of the land (nearWater, roadAccess, utilities)
 * @returns {Object} Valuation result with estimated value and factors
 */
function calculateLandValue(area, comparables, features) {
    // Calculate average price per square foot from comparables
    const pricePerSqFtValues = comparables.map(property => property.pricePerSqFt);
    const avgPricePerSqFt = pricePerSqFtValues.reduce((sum, value) => sum + value, 0) / pricePerSqFtValues.length;
    
    // Base valuation
    let estimatedValue = avgPricePerSqFt * area;
    const valuationFactors = [];
  
    // Apply adjustment factors
    if (features.nearWater) {
      estimatedValue *= 1.15; // 15% premium
      valuationFactors.push({ factor: 'Water Proximity', adjustment: '+15%' });
    }
    
    if (!features.roadAccess) {
      estimatedValue *= 0.7; // 30% reduction
      valuationFactors.push({ factor: 'No Road Access', adjustment: '-30%' });
    }
    
    if (!features.utilities) {
      estimatedValue *= 0.8; // 20% reduction
      valuationFactors.push({ factor: 'No Utilities', adjustment: '-20%' });
    }
  
    return {
      estimatedValue,
      avgPricePerSqFt,
      valuationFactors
    };
  }
  
  /**
   * Calculate the price per square foot for a property
   * @param {number} price - Price of the property
   * @param {number} area - Area of the property in square feet
   * @returns {number} Price per square foot
   */
  function calculatePricePerSqFt(price, area) {
    if (!price || !area || area === 0) {
      return 0;
    }
    return price / area;
  }
  
  /**
   * Analyze historical price trends for an area
   * @param {Array} properties - Array of properties in the area
   * @param {string} timeFrame - Time frame for analysis (month, quarter, year)
   * @returns {Object} Price trend analysis
   */
  function analyzePriceTrends(properties, timeFrame = 'year') {
    // This would be implemented in a real production system
    // For now, we'll return a placeholder
    return {
      averagePriceChange: '+5.2%',
      medianPricePerSqFt: 15.75,
      trendDirection: 'increasing'
    };
  }
  
  module.exports = {
    calculateLandValue,
    calculatePricePerSqFt,
    analyzePriceTrends
  };