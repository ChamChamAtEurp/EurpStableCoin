


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

let BigNumber = require('bignumber.js/bignumber')

// async function GetDeployed( deployer, contract) {
//     return await contract.deployed();
//   }

const SubsidyHalvingInterval = (3600 * 24 * 365) / 15;
const InitialTokenPerBlock = 5 * 1e18; // 
const InitReward = 3;

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
 


module.exports = function (deployer, network, accounts) {
  deployer.then(async ()=>{
    // chick
    const admin = accounts[0];
    init();
    process.env.NETWORK = network;
    if( network != 'development'){
      LoadDeployedContractsData( network );
    }

    let block = await web3.eth.getBlock("latest");
    console.log("deploy start, current block: " + block.number);

    let owner;
    let new_admin;
    if( network == "rinkeby"){
      owner = '0x99530F82E3356255b1346dfbE8148BCFa0389985';
      new_admin = '0x99530F82E3356255b1346dfbE8148BCFa0389985';
    }else if( network == "mainnet"){
      owner = '0xf83f3CAC7467B560Ac61c64aa7b0521EcDeDa2b8';
      new_admin = '0x5710b80b81f1713B677e9632b9f2BA67d762B2d8';
    }
    console.log("owner: " + owner );
    console.log("new_admin: " + new_admin );

  

    await DeployIfNotExist(deployer, SafeMath);
    await DeployIfNotExist(deployer, SafeDecimalMath);
    await DeployIfNotExist(deployer, Address);
    await DeployIfNotExist(deployer, AddressBookLib);



    // Link Lib
    console.log("--------------- link lib -------------");
    await deployer.link(SafeMath, [EthVault, EthModerator, LiquidationMgr ]);
    await deployer.link(SafeDecimalMath, [EthVault, EthModerator, LiquidationMgr ]);
    await deployer.link(Address, [EthVault, EthModerator, LiquidationMgr]);
    await deployer.link(AddressBookLib, [LpReward, EthVault, RewardMgr, EthModerator, LiquidationMgr ]);

    console.log("--------------- deploy AddressBook -------------");

    // AddressBook
    const addressBook = await DeployIfNotExist(deployer, AddressBook);

    //let newContract = await deployer.deploy(LiquidationMgr, addressBook.address );
    

    console.log("--------------- deploy Chick -------------");

    // chick
    const chick = await DeployIfNotExist(deployer, Chick, "EURP Stable Coin", "EURP");
    if( await addressBook.getAddress( AddressBook.Name.CHICK) != chick.address ){
      console.log("set chick address");
      await addressBook.setAddress(AddressBook.Name.CHICK, chick.address);
    }

    console.log("--------------- deploy goven token -------------");

    // gov token
    block = await web3.eth.getBlock("latest");
    //console.log(block.number);
    let cur_block = block.number;//await time.latestBlock();
    const gtoken = await DeployIfNotExist(deployer, GovernToken, "supreme token", "SUP", cur_block, caps, subsides);
    if( await addressBook.getAddress( AddressBook.Name.GOVERN_TOKEN)  != gtoken.address ){
      console.log("set gtoken address");
      await addressBook.setAddress(AddressBook.Name.GOVERN_TOKEN, gtoken.address);
    }

    console.log("--------------- deploy vault token -------------");

    // vault nft
    const vtoken = await DeployIfNotExist(deployer, VToken, "EURP Vault", "EURPV", "" ); 
    if( await addressBook.getAddress( AddressBook.Name.VAULT_TOKEN )  != vtoken.address ){
      console.log("set vault nft address");

      await addressBook.setAddress(AddressBook.Name.VAULT_TOKEN, vtoken.address);
    }

    console.log("--------------- deploy  price feed -------------");
    let ethPriceFeed;
    if (network === 'development') {
      ethPriceFeed = await DeployIfNotExist(deployer, EthPriceFeed, admin);    
      await ethPriceFeed.setRoundData(0, toUnit(2500), 0, 0, 0);
    } else {
      if( network == "rinkeby" ){
        // eth/usd,  eur/usd
        ethPriceFeed = await DeployIfNotExist(deployer, ChainlinkFeed, "0x8A753747A1Fa494EC906cE90E9f37563A8AF630e", "0x78F9e60608bF48a1155b4B2A5e31F32318a1d85F" );    
      }
      if( network == "mainnet"){
        // eth/usd,  eur/usd
        ethPriceFeed = await DeployIfNotExist(deployer, ChainlinkFeed, "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", "0xb49f677943BC038e9857d61E7d053CaA2C1734C1" );    
      }
    }

    if( await addressBook.getAddress( AddressBook.Name.ETH_PRICE_FEED) != ethPriceFeed.address ){
      console.log("set ethPrice address");

      await addressBook.setAddress(AddressBook.Name.ETH_PRICE_FEED, ethPriceFeed.address);
    }

    const chickPriceFeed = await DeployIfNotExist(deployer, ChickPriceFeed, admin);    
    if( await addressBook.getAddress( AddressBook.Name.CHICK_PRICE_FEED) != chickPriceFeed.address ){
      console.log("set chickPrice address");
      await addressBook.setAddress(AddressBook.Name.CHICK_PRICE_FEED, chickPriceFeed.address);
    }

    const priceData = await chickPriceFeed.latestRoundData();
    console.log( "Chick Price: " + priceData[1].toString()  );
    if( priceData[1].toString()  != toUnit(1).toString() ){
      console.log( "Chick Price: setprice"  );
      await chickPriceFeed.setRoundData(0, toUnit(1), 0, 0, 0);
    }

    console.log("--------------- deploy  vault -------------");
    
    let liquidationRatio=1;
    let collateralRatio = 1.5;
    const vault = await DeployIfNotExist(deployer, EthVault, addressBook.address, toUnit(liquidationRatio), toUnit(collateralRatio) ); 


    console.log("--------------- deploy interest -------------");

    // intereest
    cur_block = (await web3.eth.getBlock("latest")).number;
    const interestMgr = await DeployIfNotExist(deployer, InterestMgr, toUnit('0.00'), cur_block );
    if( await addressBook.getAddress(AddressBook.Name.INTEREST_MGR )!= interestMgr.address ){
        console.log("set interestMgr address");
        await addressBook.setAddress(AddressBook.Name.INTEREST_MGR, interestMgr.address);
    }
    if( await interestMgr.hasRole(await interestMgr.VAULT_ROLE(), vault.address) == false ){
      console.log("grant vault role:"+ await interestMgr.VAULT_ROLE().toString() + ": " + vault.address.toString());
      await interestMgr.grantRole(await interestMgr.VAULT_ROLE(), vault.address);
    }
    
    console.log("--------------- deploy reward -------------");

    // reward
    cur_block = (await web3.eth.getBlock("latest")).number;
    const rewardMgr = await DeployIfNotExist(deployer, RewardMgr, addressBook.address, toUnit(InitReward), cur_block );
    if( await addressBook.getAddress( AddressBook.Name.REWARD_MGR ) != rewardMgr.address ){
      console.log("set rewarder address");

      await addressBook.setAddress(AddressBook.Name.REWARD_MGR, rewardMgr.address);
    }
    if( await rewardMgr.hasRole(await rewardMgr.VAULT_ROLE(), vault.address) == false ){
      console.log("grant vault role:"+ await rewardMgr.VAULT_ROLE().toString() + ": " + vault.address.toString());
      await rewardMgr.grantRole(await rewardMgr.VAULT_ROLE(), vault.address);
    }

    console.log("--------------- deploy liquidation -------------");
    //const liquidator = await DeployIfNotExist(deployer, UniswapLiquidationMgr, addressBook.address);
    //console.log( UniswapLiquidationMgr );
    //const liquidator = await DeployIfNotExist(deployer, UniswapLiquidationMgr, addressBook.address );
    const liquidator = await DeployIfNotExist(deployer, LiquidationMgr, addressBook.address );

    if( await addressBook.getAddress( AddressBook.Name.LIQUIDATION_MGR ) != liquidator.address ){
      console.log("set liquidator address");

      await addressBook.setAddress(AddressBook.Name.LIQUIDATION_MGR, liquidator.address);
    }
    
    if( await liquidator.hasRole( await liquidator.VAULT_ROLE(), vault.address) == false ){
      console.log("grant vault role:"+ await liquidator.VAULT_ROLE().toString() + ": " + vault.address.toString());
      await liquidator.grantRole(await liquidator.VAULT_ROLE(), vault.address);
    }
    // uniswap router v2
    const router = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
    if( await addressBook.getAddress( AddressBook.Name.ROUTER ) != router ){
      console.log("set uniswap v2 router:"+ router );
      await addressBook.setAddress(AddressBook.Name.ROUTER, router);
    }


    console.log("--------------- grant role -------------");

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

    console.log("--------------- grant goven token  -------------");
    if( await gtoken.hasRole( await gtoken.MINTER_ROLE(), rewardMgr.address ) == false ){
      console.log("grant mint role:"+ await gtoken.MINTER_ROLE().toString() + ": " + rewardMgr.address.toString());

      await gtoken.grantRole(await gtoken.MINTER_ROLE(), rewardMgr.address);
    }

    // transfer admin
    
    console.log("--------------- transfer admin  -------------");
    const DEFAULT_ADMIN_ROLE = await chick.DEFAULT_ADMIN_ROLE();
    const ADMIN_ROLE = await vault.ADMIN_ROLE();

   
    console.log("--------------- address book  -------------");
    if( await addressBook.owner() != owner ){
      console.log("transfer addressbook onwer");
      await addressBook.transferOwnership( owner );
    }

    console.log("--------------- chick  -------------");
    if( await chick.hasRole( DEFAULT_ADMIN_ROLE, owner) == false ){
      console.log("grant chick default admin role");

      await chick.grantRole( DEFAULT_ADMIN_ROLE, owner );
    }
    if( await chick.hasRole( DEFAULT_ADMIN_ROLE, admin ) ){
      console.log("remove chick default admin role from deployer");
      await chick.revokeRole( DEFAULT_ADMIN_ROLE, admin );
    }


    console.log("--------------- gtoken  -------------");
    if( await gtoken.hasRole( DEFAULT_ADMIN_ROLE, owner) == false ){
      console.log("grant gtoken default admin role");

      await gtoken.grantRole( DEFAULT_ADMIN_ROLE, owner );
    }
    if( await gtoken.hasRole( DEFAULT_ADMIN_ROLE, admin ) ){
      console.log("remove gtoken default admin role from deployer");

      await gtoken.revokeRole( DEFAULT_ADMIN_ROLE, admin );
    }

    console.log("--------------- vtoken  -------------");

    if( await vtoken.hasRole( DEFAULT_ADMIN_ROLE, owner) == false ){
      console.log("grant vtoken default admin role");

      await vtoken.grantRole( DEFAULT_ADMIN_ROLE, owner );
    }
    if( await vtoken.hasRole( DEFAULT_ADMIN_ROLE, admin ) ){
      console.log("remove vtoken default admin role from deployer");

      await vtoken.revokeRole( DEFAULT_ADMIN_ROLE, admin );
    }


    console.log("--------------- eth price  -------------");
    if( await ethPriceFeed.owner() != owner ){
      console.log("transfer ethPrice onwer");

      await ethPriceFeed.transferOwnership( owner );
    }

    console.log("--------------- chick price  -------------");
    if( await chickPriceFeed.owner() != owner ){
      console.log("transfer chickPrice onwer");

      await chickPriceFeed.transferOwnership( owner );
    }
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

    console.log("--------------- interest  -------------");
    if( await interestMgr.hasRole( ADMIN_ROLE, new_admin ) == false ){
      console.log("grant interest mgr admin role to new admin");

      await interestMgr.grantRole( ADMIN_ROLE, new_admin );
    }

    if( await interestMgr.hasRole( DEFAULT_ADMIN_ROLE, owner) == false ){
      console.log("grant default admin role");

      await interestMgr.grantRole( DEFAULT_ADMIN_ROLE, owner );
    }
    if( await interestMgr.hasRole( DEFAULT_ADMIN_ROLE, admin ) ){
      console.log("remove default admin role from deployer");

      await interestMgr.revokeRole( DEFAULT_ADMIN_ROLE, admin );
    }


    console.log("--------------- reward  -------------");
    if( await rewardMgr.hasRole( ADMIN_ROLE, new_admin ) == false ){
      console.log("grant rewarder admin role to new admin");

      await rewardMgr.grantRole( ADMIN_ROLE, new_admin );
    }

    if( await rewardMgr.hasRole( DEFAULT_ADMIN_ROLE, owner) == false ){
      console.log("grant default admin role");

      await rewardMgr.grantRole( DEFAULT_ADMIN_ROLE, owner );
    }
    if( await rewardMgr.hasRole( DEFAULT_ADMIN_ROLE, admin ) ){
      console.log("remove default admin role from deployer");

      await rewardMgr.revokeRole( DEFAULT_ADMIN_ROLE, admin );
    }


    console.log("--------------- liquidator  -------------");
    if( await liquidator.hasRole( DEFAULT_ADMIN_ROLE, owner) == false ){
      console.log("grant default admin role");

      await liquidator.grantRole( DEFAULT_ADMIN_ROLE, owner );
    }
    if( await liquidator.hasRole( DEFAULT_ADMIN_ROLE, admin ) ){
      console.log("remove default admin role from deployer");

      await liquidator.revokeRole( DEFAULT_ADMIN_ROLE, admin );
    }

    console.log("--------------- done  -------------");

  });
};
