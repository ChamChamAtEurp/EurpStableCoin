let BigNumber = require('bignumber.js/bignumber')
let ERC20 = artifacts.require('@openzeppelin/contracts/token/ERC20/IERC20');
const AddressBook = artifacts.require("AddressBook");
const LiquidationMgr = artifacts.require("UniswapLiquidationManager");


module.exports = async function( callback ) {

    // let wbtc = await ERC20.at('0xAe963bA28FAf02B3f5851cFeFcD52054042B04bE');

    // let btcWindowBalance = new BigNumber(await wbtc.balanceOf('0x61E4C23fefFa97D7D43524994a2C96B20b143461'));
    //console.log('wbtc balance:', 'btcWindow', btcWindowBalance.dividedBy(1e18).toString()); 
    console.log("hello world");
    console.log("Router Name : " + AddressBook.Name.ROUTER.toString() );

    const addressBook = await AddressBook.at("0xdbabe7794dAF99C8382985Dc292523847B0a0f5A");

    console.log("deploy");

    const liquidator = await LiquidationMgr.new( addressBook.address );
    //const liquidator = await LiquidationMgr.at("0xc48b9406eE982fcdee9ECe30b0466e26c9C9Ed3B");
    console.log("grant");
    
    await liquidator.grantRole(await liquidator.VAULT_ROLE(), "0x60deB44D46DB84d53C6259ac4e74400F4a1479FB");

    // function liquidate(  
    //     uint256 vauldId,
    //     address addr,
    //     uint256 ethAmount,
    //     uint256 chickAmount,
    //     uint256 interest,
    //     uint256 reward ) payable external override  onlyVault {

    //IUniswapV2Router02 UniswapV2Router02 = IUniswapV2Router02( 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D  );

    //await liquidator.liquidate( 0, 0, toUnit(0.001), toUnit( 0.3), 0, 0, { value: 0.001 } );
    console.log("end");
    callback();

}
