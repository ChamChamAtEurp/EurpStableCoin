let BigNumber = require('bignumber.js/bignumber')
let ERC20 = artifacts.require('@openzeppelin/contracts/token/ERC20/ERC20Burnable');
let CHICK = artifacts.require('token/Chick')

module.exports = async function(callback) {

    WBTC = '0xAe963bA28FAf02B3f5851cFeFcD52054042B04bE';
    BTC_WINDOW = '0x61E4C23fefFa97D7D43524994a2C96B20b143461'
    CHICK_ADDR = '0x8149edb3Ef7026DC31BcC45aaAD6429cc6CB812a'
    ADMIN = '0x60deB44D46DB84d53C6259ac4e74400F4a1479FB'

    let wbtc = await ERC20.at(WBTC);
    let chick = await CHICK.at(CHICK_ADDR)

    // burn btc of btcWindow
    let btcWindowBalance = new BigNumber(await wbtc.balanceOf(BTC_WINDOW));
    console.log('wbtc balance:', 'btcWindow', btcWindowBalance.dividedBy(1e18).toString()); 
    // if(!btcWindowBalance.eq(0)) {
    //     await wbtc.burn(BTC_WINDOW, btcWindowBalance);
    //     btcWindowBalance = new BigNumber(await wbtc.balanceOf(BTC_WINDOW));
    //     console.log('wbtc balance:', 'btcWindow', btcWindowBalance.dividedBy(1e18).toString()); 
    // }
  
    // burn chick of user
    let chickBalance = new BigNumber(await chick.balanceOf(ADMIN));
    console.log('chick balance:', 'admin', chickBalance.dividedBy(1e18).toString()); 
    if(!chickBalance.eq(0)) {
        await chick.burnFromRole(ADMIN, chickBalance);
        chickBalance = new BigNumber(await chick.balanceOf(ADMIN));
        console.log('chick balance:', 'admin', chickBalance.dividedBy(1e18).toString()); 
    }

    callback();
}
