// services/ethPriceService.js
const axios = require('axios');

class EthPriceService {
  constructor() {
    this.cache = {
      price: null,
      timestamp: null
    };
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache
  }

  async getEthPriceInTND() {
    // Check cache first
    if (this.cache.price && this.cache.timestamp && 
        (Date.now() - this.cache.timestamp) < this.cacheTimeout) {
      return this.cache.price;
    }

    try {
      // Get ETH price in USD
      const ethResponse = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
      const ethUSD = ethResponse.data.ethereum.usd;

      // Get USD to TND rate
      const currencyResponse = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
      const usdToTND = currencyResponse.data.rates.TND || 3.15; // Fallback to approximate rate

      const ethTND = ethUSD * usdToTND;

      // Update cache
      this.cache.price = ethTND;
      this.cache.timestamp = Date.now();

      console.log(`Current ETH price: $${ethUSD} = ${ethTND} TND`);
      return ethTND;
    } catch (error) {
      console.error('Error fetching ETH price:', error);
      // Return fallback value or last cached value
      return this.cache.price || 7560; // Approximate ETH price in TND
    }
  }

  async convertTNDtoETH(tndAmount) {
    const ethPrice = await this.getEthPriceInTND();
    return tndAmount / ethPrice;
  }

  async convertETHtoTND(ethAmount) {
    const ethPrice = await this.getEthPriceInTND();
    return ethAmount * ethPrice;
  }
}

module.exports = new EthPriceService();