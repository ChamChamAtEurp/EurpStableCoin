// Util
const w3utils = require('web3-utils');
const { toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));
const fromUnit = amount => fromWei(amount, 'ether');
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);
const { DeployIfNotExist, CallWithEstimateGas, GetDeployed, LoadDeployedContractsData } = require("./truffle-tool");

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

let BigNumber = require('bignumber.js/bignumber')

// async function GetDeployed( deployer, contract) {
//     return await contract.deployed();
//   }

const SubsidyHalvingInterval = (3600 * 24 * 365) / 15;
const InitialTokenPerBlock = 5 * 1e18; // 

var caps;
var subsides;

function init() {
  caps = new Array(64);
  subsides = new Array(64);
  let amount = toBN(0);
  let gen = toBN(InitialTokenPerBlock);
  caps[0] = toBN(0);
  subsides[0] = gen;
  for (let i = 1; i < 64; ++i) {
    amount = amount.add(gen.mul(toBN(SubsidyHalvingInterval)));
    gen = gen.div(toBN(2));

    caps[i] = amount;
    subsides[i] = gen;
  }
}

async function callContract( f, ...args ){
  try{
    f( ...args );
  }
  catch( e ){
    console.log( e );
  }
} 


module.exports = async function(callback) {
  const newtworkType = await web3.eth.net.getNetworkType();
  const networkId = await web3.eth.net.getId();
  console.log("network type:"+newtworkType);
  console.log("network id:"+networkId);
  let network = newtworkType;

    let owner = '0x6594137c4ade20C1810973f9DAE2AEEA2E203004';
    let admin = '0x6594137c4ade20C1810973f9DAE2AEEA2E203004';
    let creator = '0x60deb44d46db84d53c6259ac4e74400f4a1479fb';


    init();
    if( network != 'development'){
      LoadDeployedContractsData( network );
    }

    console.log("Addressbook");
    // AddressBook
    const addressBook = await GetDeployed(AddressBook);
    await callContract( addressBook.transferOwnership, owner );
 

    // chick
    console.log("Chick");

    const chick = await GetDeployed(Chick);

    const DEFAULT_ADMIN_ROLE = await chick.DEFAULT_ADMIN_ROLE();
    const MINTER_ROLE = await   chick.MINTER_ROLE();
    const PAUSER_ROLE = await   chick.PAUSER_ROLE();
    const BURNER_ROLE = await   chick.BURNER_ROLE();
    
    await callContract(chick.grantRole, DEFAULT_ADMIN_ROLE, owner );
    await callContract(chick.revokeRole, MINTER_ROLE, creator );
    await callContract(chick.revokeRole, PAUSER_ROLE, creator );
    await callContract(chick.revokeRole, BURNER_ROLE, creator );
    await callContract(chick.revokeRole, DEFAULT_ADMIN_ROLE, creator );   
    //await callContract(chick.transferOwnership, owner );

    console.log("gtoken");

    // gtoken
    const gtoken = await GetDeployed( GovernToken );

    await callContract(gtoken.grantRole, DEFAULT_ADMIN_ROLE, owner );
    await callContract(gtoken.revokeRole, MINTER_ROLE, creator );
    await callContract(gtoken.revokeRole, PAUSER_ROLE, creator );
    await callContract(gtoken.revokeRole, BURNER_ROLE, creator );
    await callContract(gtoken.revokeRole, DEFAULT_ADMIN_ROLE, creator );   
   // await callContract(gtoken.transferOwnership, owner );

    console.log("vtoken");


    // vault nft
    const vtoken = await GetDeployed( VToken ); 

    await callContract(vtoken.grantRole, DEFAULT_ADMIN_ROLE, owner );
    await callContract(vtoken.revokeRole, MINTER_ROLE, creator );
    await callContract(vtoken.revokeRole, PAUSER_ROLE, creator );
    await callContract(vtoken.revokeRole, BURNER_ROLE, creator );
    await callContract(vtoken.revokeRole, DEFAULT_ADMIN_ROLE, creator );   
   // await callContract(vtoken.transferOwnership, owner );

    console.log("ethprice");

    let ethPriceFeed;
    if (network === 'development') {
    } else {
      // eth/usd,  eur/usd
      ethPriceFeed = await GetDeployed( ChainlinkFeed );  
      await callContract(ethPriceFeed.transferOwnership, owner );
    }

    console.log("chickprice");

    const chickPriceFeed = await GetDeployed( ChickPriceFeed );    
    await callContract(chickPriceFeed.transferOwnership, owner );

    console.log("vault");

    const vault = await GetDeployed( EthVault ); 
    const ADMIN_ROLE = await vault.ADMIN_ROLE();
    await callContract(vault.transferOwnership, owner );
    await callContract(vault.grantRole, DEFAULT_ADMIN_ROLE, owner );
    await callContract(vault.revokeRole, ADMIN_ROLE, creator );


    console.log("interestMgr");

    const interestMgr = await GetDeployed( InterestMgr );
    //await callContract(interestMgr.transferOwnership, owner );
    await callContract(interestMgr.grantRole, DEFAULT_ADMIN_ROLE, owner );
    await callContract(interestMgr.grantRole, ADMIN_ROLE, admin );
    await callContract(interestMgr.revokeRole, ADMIN_ROLE, creator );

    console.log("rewardMgr");

    const rewardMgr = await GetDeployed(RewardMgr);
    //await callContract(rewardMgr.transferOwnership, owner );
    await callContract(rewardMgr.grantRole, DEFAULT_ADMIN_ROLE, owner );
    await callContract(rewardMgr.grantRole, ADMIN_ROLE, admin );
    await callContract(rewardMgr.revokeRole, ADMIN_ROLE, creator );

    console.log("end");

    callback();
}
