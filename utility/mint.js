let BigNumber = require('bignumber.js/bignumber')
const ERC20 = artifacts.require("@openzeppelin/contracts/presets/ERC20PresetMinterPauser.sol");
let Addresses = require('./addresses').ropsten

module.exports = async function(callback) {
    let ADMIN = '0x60deB44D46DB84d53C6259ac4e74400F4a1479FB'

    let wbtc = await ERC20.at(Addresses.Wbtc);
    await wbtc.mint(ADMIN, new BigNumber(1000000).multipliedBy(1e18));

    callback();
}
