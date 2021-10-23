


// Util
const w3utils = require('web3-utils');
const { toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));
const fromUnit = amount => fromWei(amount, 'ether');
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);
const { DeployIfNotExist, CallWithEstimateGas, GetDeployed, LoadDeployedContractsData } = require("../utility/truffle-tool");

// Lib
const SafeMath = artifacts.require("SafeMath");
const SafeDecimalMath = artifacts.require("SafeDecimalMath");
const Address = artifacts.require("Address");
const AddressBookLib = artifacts.require("AddressBookLib");

// Token
const Chick = artifacts.require("Chick");
const GovernToken = artifacts.require("GovernToken");
const VToken = artifacts.require("VaultToken");

// Eth
const EthPriceFeed = artifacts.require("PriceFeed");
const ChickPriceFeed = artifacts.require("ChickPriceFeed");
const ChainlinkFeed = artifacts.require("ChainlinkEurEthPriceFeed");

// vault
const EthVault = artifacts.require("EthVault");
const RewardMgr = artifacts.require("GTokenRewardManager");
const InterestMgr = artifacts.require("InterestManager");
const EthModerator = artifacts.require("EthModerator");



// Manager
const AddressBook = artifacts.require("AddressBook");

const LpReward = artifacts.require("LpRewardManager");
const TestLpToken = artifacts.require("TestLpToken");

const LiquidationMgr = artifacts.require("UniswapLiquidationManager");
const NewLiquidator = artifacts.require("UniswapLiquidatorV3");

let BigNumber = require('bignumber.js/bignumber')

 


module.exports = function (deployer, network, accounts) {
  deployer.then(async ()=>{
    // chick
    const admin = accounts[0];
    process.env.NETWORK = network;
    if( network != 'development'){
      LoadDeployedContractsData( network );
    }

    let block = await web3.eth.getBlock("latest");
    console.log("deploy start, current block: " + block.number);

    let owner;
    let new_admin;
    if( network == "rinkeby"){
      owner = "0xdD6EE13Bdd6311E1c6223c3770d09101F4472EAa";
      new_admin = "0xdD6EE13Bdd6311E1c6223c3770d09101F4472EAa";
    }else if( network == "mainnet"){
      owner = '0xf83f3CAC7467B560Ac61c64aa7b0521EcDeDa2b8';
      new_admin = '0x5710b80b81f1713B677e9632b9f2BA67d762B2d8';
    }else if( network == "development"){
      owner = new_admin  = admin;
    }

    console.log("admin: " + admin );
    console.log("owner: " + owner );
    console.log("new_admin: " + new_admin );
    console.log("Api Key: " + process.env.INFURA_KEY );

    const addressBook = await GetDeployed(AddressBook);
    console.log("AddressBook: " + addressBook.address.toString() );

    const chick = await GetDeployed(Chick);
    console.log("Chick: " + chick.address.toString() );

    console.log("--------------- deploy liquidation2 -------------");


    await deployer.link(SafeMath, [NewLiquidator ]);
    await deployer.link(SafeDecimalMath, [NewLiquidator ]);
    await deployer.link(Address, [NewLiquidator]);
    await deployer.link(AddressBookLib, [NewLiquidator ]);

    let liquidator2;
    if( network == "rinkeby" || network == "development"){
      liquidator2 = await DeployIfNotExist(deployer, NewLiquidator, chick.address, '0xc7AD46e0b8a400Bb3C915120d284AafbA8fc4735', '0xE592427A0AEce92De3Edee1F18E0157C05861564' );
    }else if( network == "mainnet"){
      // usdc, router
      liquidator2 = await DeployIfNotExist(deployer, NewLiquidator, chick.address, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', '0xE592427A0AEce92De3Edee1F18E0157C05861564' );
    }
    
    /*
    if( await addressBook.getAddress( AddressBook.Name.LIQUIDATION_MGR ) != liquidator.address ){
      console.log("set liquidator address");

      await addressBook.setAddress(AddressBook.Name.LIQUIDATION_MGR, liquidator.address);
    }
    */
    const DEFAULT_ADMIN_ROLE = await liquidator2.DEFAULT_ADMIN_ROLE();
    const ADMIN_ROLE = await liquidator2.ADMIN_ROLE();

    const vault = await GetDeployed(EthVault);

    if( await liquidator2.hasRole( await liquidator2.VAULT_ROLE(), admin ) == false )
    {
      console.log("grant vault role:"+ await liquidator2.VAULT_ROLE() + ": " + admin );

      await liquidator2.grantRole(await liquidator2.VAULT_ROLE(), admin );
    }

    /*
    // for test
    console.log("test liquidate:")
    await liquidator2.liquidate( 0, admin, toUnit(0.0001), toUnit(0), 0, 0, { value: toUnit(0.0001), from: admin } );

    vault.err123( "stop here ");
    */

    if( await liquidator2.hasRole( await liquidator2.VAULT_ROLE(), vault.address) == false ){
      console.log("grant vault role:"+ await liquidator2.VAULT_ROLE() + ": " + vault.address.toString());
      await liquidator2.grantRole(await liquidator2.VAULT_ROLE(), vault.address);
    }

    // transfor admin role
    console.log("transfer admin role: ");
    if( await liquidator2.hasRole( await liquidator2.VAULT_ROLE(), admin )  )
    {
      console.log("revoke vault role:"+ await liquidator2.VAULT_ROLE() + ": " + admin );

      await liquidator2.revokeRole(await liquidator2.VAULT_ROLE(), admin );
    }

    if( await liquidator2.hasRole( ADMIN_ROLE, new_admin ) == false ){
      console.log("grant admin role to new admin");

      await liquidator2.grantRole( ADMIN_ROLE, new_admin );
    }

    if( await liquidator2.hasRole( DEFAULT_ADMIN_ROLE, owner) == false ){
      console.log("grant default admin role");

      await liquidator2.grantRole( DEFAULT_ADMIN_ROLE, owner );
    }

    if( await liquidator2.hasRole( DEFAULT_ADMIN_ROLE, admin ) ){
      console.log("remove default admin role from deployer");

      await liquidator2.revokeRole( DEFAULT_ADMIN_ROLE, admin );
    }

    // still need set address book:
    console.log("Still need set addressbook : " + AddressBook.Name.LIQUIDATION_MGR );


    // // for test
    // await liquidator2.grantRole(await liquidator2.VAULT_ROLE(), admin );
    // await liquidator2.grantRole(await liquidator2.ADMIN_ROLE(), admin );

    console.log("--------------- done  -------------");

  });
};
