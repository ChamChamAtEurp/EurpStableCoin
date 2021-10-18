let BigNumber = require('bignumber.js/bignumber')
let Addresses = require('./addresses').ropsten
const PriceFeed = artifacts.require("PriceFeed")

module.exports = async function(callback) {

    let ethPriceFeed = await PriceFeed.at(Addresses.EthPriceFeed);
    //let btcPriceFeed = await PriceFeed.at(Addresses.BtcPriceFeed);

    await ethPriceFeed.setRoundData(0, new BigNumber(2500).multipliedBy(1e18), 0, 0, 0);
    //await btcPriceFeed.setRoundData(0, new BigNumber(50000).multipliedBy(1e18), 0, 0, 0);

    callback();
}
