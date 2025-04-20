// services/valuationService.js

/**
 * Calculate the estimated value of a land based on comparables and features
 * @param {number} area - Area of the land in square feet
 * @param {Array} comparables - Array of comparable properties
 * @param {Object} features - Features of the land (nearWater, roadAccess, utilities)
 * @returns {Object} Valuation result with estimated value and factors
 */
function calculateLandValue(area, comparables, features) {
    // Filter out any comparables with missing price or area
    const validComparables = comparables.filter(p => p.price && p.pricePerSqFt);
    
    if (validComparables.length === 0) {
      throw new Error('No valid comparable properties found for valuation');
    }
    
    // Calculate average price per square foot from comparables
    const pricePerSqFtValues = validComparables.map(property => property.pricePerSqFt);
    
    // Sort the prices to find median and remove outliers
    const sortedPrices = [...pricePerSqFtValues].sort((a, b) => a - b);
    const lowerQuartile = sortedPrices[Math.floor(sortedPrices.length * 0.25)];
    const upperQuartile = sortedPrices[Math.floor(sortedPrices.length * 0.75)];
    const iqr = upperQuartile - lowerQuartile;
    const lowerBound = lowerQuartile - 1.5 * iqr;
    const upperBound = upperQuartile + 1.5 * iqr;
    
    // Filter out outliers
    const filteredPrices = sortedPrices.filter(price => price >= lowerBound && price <= upperBound);
    
    // Calculate mean without outliers
    const avgPricePerSqFt = filteredPrices.reduce((sum, value) => sum + value, 0) / filteredPrices.length;
    
    // Get median price per sqft (more robust to outliers)
    const medianPricePerSqFt = sortedPrices[Math.floor(sortedPrices.length / 2)];
    
    // Base valuation - use weighted average of mean and median
    const basePrice = (avgPricePerSqFt * 0.7) + (medianPricePerSqFt * 0.3);
    let estimatedValue = basePrice * area;
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
    
    // Adjust based on land size (economies of scale - larger plots often cheaper per sqft)
    const avgLandSize = validComparables.reduce((sum, property) => sum + (property.area || 0), 0) / validComparables.length;
    
    if (area > avgLandSize * 1.5) {
      estimatedValue *= 0.95; // 5% discount for larger properties
      valuationFactors.push({ factor: 'Large Land Size', adjustment: '-5%' });
    } else if (area < avgLandSize * 0.5) {
      estimatedValue *= 1.05; // 5% premium for smaller, potentially more desirable plots
      valuationFactors.push({ factor: 'Small Land Size', adjustment: '+5%' });
    }
    
    // Market trend adjustment - fake for now, would come from real market analysis
    const marketTrend = 1.03; // 3% annual appreciation
    estimatedValue *= marketTrend;
    valuationFactors.push({ factor: 'Market Trend', adjustment: '+3%' });
    
    // Ensure minimum output value
    if (estimatedValue < 1000) {
      estimatedValue = 1000;
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
    if (!properties || properties.length === 0) {
      return {
        averagePriceChange: 'N/A',
        medianPricePerSqFt: 0,
        trendDirection: 'stable'
      };
    }
    
    // Group properties by date
    const propertyByDate = {};
    const now = new Date();
    
    for (const property of properties) {
      if (!property.listedDate) continue;
      
      const listedDate = new Date(property.listedDate);
      let key;
      
      if (timeFrame === 'month') {
        key = `${listedDate.getFullYear()}-${listedDate.getMonth()}`;
      } else if (timeFrame === 'quarter') {
        const quarter = Math.floor(listedDate.getMonth() / 3) + 1;
        key = `${listedDate.getFullYear()}-Q${quarter}`;
      } else { // year
        key = listedDate.getFullYear().toString();
      }
      
      if (!propertyByDate[key]) {
        propertyByDate[key] = [];
      }
      
      propertyByDate[key].push(property);
    }
    
    // Calculate average price per sqft for each time period
    const timeSeriesData = Object.keys(propertyByDate).map(key => {
      const propertiesInPeriod = propertyByDate[key];
      const validProperties = propertiesInPeriod.filter(p => p.pricePerSqFt);
      
      if (validProperties.length === 0) return { period: key, avgPrice: 0 };
      
      const totalPricePerSqFt = validProperties.reduce((sum, p) => sum + p.pricePerSqFt, 0);
      return {
        period: key, 
        avgPrice: totalPricePerSqFt / validProperties.length
      };
    }).filter(d => d.avgPrice > 0).sort((a, b) => a.period.localeCompare(b.period));
    
    if (timeSeriesData.length < 2) {
      return {
        averagePriceChange: 'N/A (insufficient data)',
        medianPricePerSqFt: calculateMedianPricePerSqFt(properties),
        trendDirection: 'stable'
      };
    }
    
    // Calculate price change percentage
    const firstPeriod = timeSeriesData[0];
    const lastPeriod = timeSeriesData[timeSeriesData.length - 1];
    
    const priceChange = (lastPeriod.avgPrice - firstPeriod.avgPrice) / firstPeriod.avgPrice * 100;
    let trendDirection = 'stable';
    
    if (priceChange > 5) trendDirection = 'increasing';
    else if (priceChange < -5) trendDirection = 'decreasing';
    
    return {
      averagePriceChange: `${priceChange.toFixed(1)}%`,
      medianPricePerSqFt: calculateMedianPricePerSqFt(properties),
      trendDirection
    };
  }
  
  /**
   * Calculate median price per square foot from properties
   * @param {Array} properties - Array of property objects
   * @returns {number} Median price per square foot
   */
  function calculateMedianPricePerSqFt(properties) {
    if (!properties || properties.length === 0) return 0;
    
    const validProperties = properties.filter(p => p.pricePerSqFt);
    if (validProperties.length === 0) return 0;
    
    const prices = validProperties.map(p => p.pricePerSqFt).sort((a, b) => a - b);
    const middle = Math.floor(prices.length / 2);
    
    if (prices.length % 2 === 0) {
      return (prices[middle - 1] + prices[middle]) / 2;
    } else {
      return prices[middle];
    }
  }
  
  module.exports = {
    calculateLandValue,
    calculatePricePerSqFt,
    analyzePriceTrends
  };