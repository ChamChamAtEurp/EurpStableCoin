


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
const EthVaultV2 = artifacts.require("EthVaultV2");
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


    await deployer.link(SafeMath, [EthVaultV2 ]);
    await deployer.link(SafeDecimalMath, [EthVaultV2 ]);
    await deployer.link(Address, [EthVaultV2]);
    await deployer.link(AddressBookLib, [EthVaultV2 ]);


    console.log("--------------- deploy  vault V2-------------");
    
    let liquidationRatio=1;
    let collateralRatio = 1.5;
    const vault = await DeployIfNotExist(deployer, EthVaultV2, addressBook.address, toUnit(liquidationRatio), toUnit(collateralRatio) ); 

    const DEFAULT_ADMIN_ROLE = await vault.DEFAULT_ADMIN_ROLE();
    const ADMIN_ROLE = await vault.ADMIN_ROLE();

    // transfer admin
    console.log("--------------- vault  -------------");
    if( await vault.hasRole( ADMIN_ROLE, new_admin ) == false ){
      console.log("grant vault admin role to new admin");

      await vault.grantRole( ADMIN_ROLE, new_admin );
    }

    if( await vault.hasRole( DEFAULT_ADMIN_ROLE, owner) == false ){
      console.log("grant default admin role");

      await vault.grantRole( DEFAULT_ADMIN_ROLE, owner );
    }
    if( await vault.hasRole( DEFAULT_ADMIN_ROLE, admin ) ){
      console.log("remove default admin role from deployer");

      await vault.revokeRole( DEFAULT_ADMIN_ROLE, admin );
    }

    //
    console.log("--------------- grant role  -------------");
    console.log("still need to grant role to chick, vtoken, interestMgr, rewardMgr, liquidator ");
    /*
    if( await interestMgr.hasRole(await interestMgr.VAULT_ROLE(), vault.address) == false ){
      console.log("grant vault role:"+ await interestMgr.VAULT_ROLE().toString() + ": " + vault.address.toString());
      await interestMgr.grantRole(await interestMgr.VAULT_ROLE(), vault.address);
    }

    if( await rewardMgr.hasRole(await rewardMgr.VAULT_ROLE(), vault.address) == false ){
      console.log("grant vault role:"+ await rewardMgr.VAULT_ROLE().toString() + ": " + vault.address.toString());
      await rewardMgr.grantRole(await rewardMgr.VAULT_ROLE(), vault.address);
    }

    if( await liquidator.hasRole( await liquidator.VAULT_ROLE(), vault.address) == false ){
      console.log("grant vault role:"+ await liquidator.VAULT_ROLE().toString() + ": " + vault.address.toString());
      await liquidator.grantRole(await liquidator.VAULT_ROLE(), vault.address);
    }


    // grant role
    console.log("--------------- grant chick  -------------");
    if( await chick.hasRole( await chick.MINTER_ROLE(), vault.address) == false ){
      console.log("grant mint role:"+ await chick.MINTER_ROLE().toString() + ": " + vault.address.toString());
      await chick.grantRole(await chick.MINTER_ROLE(), vault.address);
    }
    if( await chick.hasRole( await chick.BURNER_ROLE(), vault.address) == false ){
      console.log("grant burn role:"+ await chick.BURNER_ROLE().toString() + ": " + vault.address.toString());

      await chick.grantRole(await chick.BURNER_ROLE(), vault.address);
    }
  

    console.log("--------------- grant vault token  -------------");
    if( await vtoken.hasRole( await vtoken.MINTER_ROLE(), vault.address) == false ){
      console.log("grant mint role:"+ await vtoken.MINTER_ROLE().toString() + ": " + vault.address.toString());
    
      await vtoken.grantRole(await vtoken.MINTER_ROLE(), vault.address);
    }
    if( await vtoken.hasRole( await vtoken.BURNER_ROLE(), vault.address) == false ){
      console.log("grant burn role:"+ await vtoken.BURNER_ROLE().toString() + ": " + vault.address.toString());

      await vtoken.grantRole(await vtoken.BURNER_ROLE(), vault.address);
    }
    */
    
  });
};
