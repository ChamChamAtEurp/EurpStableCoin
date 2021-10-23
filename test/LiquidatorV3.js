const w3utils = require('web3-utils');
const { toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));
const fromUnit = amount => fromWei(amount, 'ether');
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);
const { assertBNEqual, getGasFee, assertRevert, toHighPreciseUnit, assertBNDiffLess } = require("./utils.js");
const { expectRevert, time } = require('@openzeppelin/test-helpers');

const EthVault = artifacts.require("EthVault");
const Chick = artifacts.require("Chick");
const PriceFeed = artifacts.require("PriceFeed");
const AddressBook = artifacts.require("AddressBook");
const VToken = artifacts.require("VaultToken");
const InterestMgr = artifacts.require("InterestManager");
const RewardMgr = artifacts.require("GTokenRewardManager");
const GovernToken = artifacts.require("GovernToken");
const LiquidatorV3 = artifacts.require("UniswapLiquidatorV3");
const TestSwapRouter = artifacts.require("TestSwapRouter");
const TestLiquidationManager = artifacts.require("TestLiquidationManager");


const SubsidyHalvingInterval = (3600 * 24 * 365) / 15;
const InitialTokenPerBlock = 5 * 1e18; // 
let caps, subsides;

function calculate() {
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


contract('LiquidationV3', async (accounts) => {

    const admin = accounts[0];
    const ac1 = accounts[1];
    const ac2 = accounts[2];
    const ac3 = accounts[3];

    let vault, chick, addressBook, vtoken,interestMgr, rewardMgr, gtoken,liquidator, priceFeed;
    let rewardPerBlock = 100;

    let init = async ( liquidationRatio=1, collateralRatio = 1, priceError=false, answer=2000)=>{
        calculate();
        addressBook = await AddressBook.new(admin);

        priceFeed = await PriceFeed.new(admin);
        await priceFeed.setRoundData(0, toUnit(answer), 0, 0, 0);
        await priceFeed.setPriceError(priceError);
        await addressBook.setAddress(AddressBook.Name.ETH_PRICE_FEED, priceFeed.address);
        
        vault = await EthVault.new(addressBook.address, toUnit(liquidationRatio), toUnit(collateralRatio));

        // pool 
        let cur_block = (await web3.eth.getBlock("latest")).number;
        interestMgr = await InterestMgr.new( toHighPreciseUnit('0.00'), cur_block );
        await addressBook.setAddress(AddressBook.Name.INTEREST_MGR, interestMgr.address);
        await interestMgr.grantRole(await interestMgr.VAULT_ROLE(), vault.address);
    
        cur_block = (await web3.eth.getBlock("latest")).number;
        rewardMgr = await RewardMgr.new( addressBook.address, rewardPerBlock, cur_block );
        await addressBook.setAddress(AddressBook.Name.REWARD_MGR, rewardMgr.address);
        await rewardMgr.grantRole(await rewardMgr.VAULT_ROLE(), vault.address);
        
        chick = await Chick.new("Chick", "Chick");
        await addressBook.setAddress(AddressBook.Name.CHICK, chick.address);
        await chick.grantRole(await chick.MINTER_ROLE(), vault.address);
        await chick.grantRole(await chick.BURNER_ROLE(), vault.address);

        vtoken = await VToken.new("Vault", "Vault", "");
        await addressBook.setAddress(AddressBook.Name.VAULT_TOKEN, vtoken.address);
        await vtoken.grantRole(await vtoken.MINTER_ROLE(), vault.address);
        await vtoken.grantRole(await vtoken.BURNER_ROLE(), vault.address);


        gtoken = await GovernToken.new("gov", "gov", cur_block, caps, subsides);
        await addressBook.setAddress(AddressBook.Name.GOVERN_TOKEN, gtoken.address);
        await gtoken.grantRole(await gtoken.MINTER_ROLE(), rewardMgr.address);

        liquidator = await TestLiquidationManager.new();
        await addressBook.setAddress(AddressBook.Name.LIQUIDATION_MGR, liquidator.address);
        await liquidator.grantRole(await liquidator.VAULT_ROLE(), vault.address);
    };

    it('role test', async () => {
        await init(1, 1.5 );

        midToken = await Chick.new("MID", "MID");

        const router = await TestSwapRouter.new( chick.address, toUnit(2));
        
        const v3 = await LiquidatorV3.new( chick.address, midToken.address, router.address );

        await expectRevert( v3.secondaryLiquidateByMidToken( 100, 200 , {from:ac1}) ,"only admin");
        await expectRevert( v3.secondaryLiquidateDirectly( 100, 200 , {from:ac1}) ,"only admin");
        await expectRevert( v3.setLiquidateByMidToken( true , {from:ac1}) ,"only admin");
        await expectRevert( v3.liquidate( 1, admin, 100, 800, 0, 0,  {from:ac1}) ,"only vault");
    });


    it('liquidate ByMidToken', async () => {
        await init(1, 1.5 );

        midToken = await Chick.new("MID", "MID");

        const router = await TestSwapRouter.new( chick.address, toUnit(2));
        const v3 = await LiquidatorV3.new( chick.address, midToken.address, router.address );
        await v3.grantRole( await v3.ADMIN_ROLE(), admin );    
        await v3.grantRole( await v3.VAULT_ROLE(), admin );    

        await chick.grantRole(await chick.MINTER_ROLE(), admin );

        await chick.mint( router.address, toUnit(10000));

        await midToken.grantRole(await chick.MINTER_ROLE(), admin );

        await midToken.mint( router.address, toUnit(10000));

        await v3.liquidate( 1, admin, 100, 200, 0, 0, { value: 100, from: admin } );
        assertBNEqual( await v3.mOverLiquidated(), toBN(200));
        assertBNEqual( await v3.mLiquidateRequired(), toBN(0));
        assertBNEqual( await web3.eth.getBalance(v3.address), toBN(0));
        assertBNEqual( await web3.eth.getBalance(router.address), toBN(100));
    });

    it('liquidate ByDirectly', async () => {
        await init(1, 1.5 );

        midToken = await Chick.new("MID", "MID");

        const router = await TestSwapRouter.new( chick.address, toUnit(2));
        
        const v3 = await LiquidatorV3.new( chick.address, midToken.address, router.address );

        await v3.grantRole( await v3.ADMIN_ROLE(), admin );    
        await v3.grantRole( await v3.VAULT_ROLE(), admin );    
        await v3.setLiquidateByMidToken( false );

        await chick.grantRole(await chick.MINTER_ROLE(), admin );

        await chick.mint( router.address, toUnit(10000));

        await midToken.grantRole(await chick.MINTER_ROLE(), admin );

        await midToken.mint( router.address, toUnit(10000));

        await v3.liquidate( 1, admin, 100, 200, 0, 0, { value: 100, from: admin } );
        assertBNEqual( await v3.mOverLiquidated(), toBN(0));
        assertBNEqual( await v3.mLiquidateRequired(), toBN(0));
        assertBNEqual( await web3.eth.getBalance(v3.address), toBN(0));
        assertBNEqual( await web3.eth.getBalance(router.address), toBN(100));

    });


    it('secondaryLiquidate ByMidToken', async () => {
        await init(1, 1.5 );

        midToken = await Chick.new("MID", "MID");

        const router = await TestSwapRouter.new( chick.address, toUnit(2));
        
        const v3 = await LiquidatorV3.new( chick.address, midToken.address, router.address );

        await v3.grantRole( await v3.ADMIN_ROLE(), admin );    
        await v3.grantRole( await v3.VAULT_ROLE(), admin );    

        await chick.grantRole(await chick.MINTER_ROLE(), admin );

        await chick.mint( router.address, toUnit(10000));

        await midToken.grantRole(await chick.MINTER_ROLE(), admin );

        await midToken.mint( router.address, toUnit(10000));

        // first swap to mid token
        await v3.liquidate( 1, admin, 100, 800, 0, 0, { value: 100, from: admin } );
        assertBNEqual( await v3.mOverLiquidated(), toBN(0));
        assertBNEqual( await v3.mLiquidateRequired(), toBN(800));
        assertBNEqual( await midToken.balanceOf( v3.address ), toBN(200));
        assertBNEqual( await web3.eth.getBalance(v3.address), toBN(0));
        assertBNEqual( await web3.eth.getBalance(router.address), toBN(100));

        // swap to eurp manually
        await v3.secondaryLiquidateByMidToken( 100, 200 );
        assertBNEqual( await v3.mOverLiquidated(), toBN(0));
        assertBNEqual( await v3.mLiquidateRequired(), toBN(600));
        assertBNEqual( await midToken.balanceOf( v3.address ), toBN(100));

        //revert
        //await v3.secondaryLiquidateByMidToken( 100, 400 ) ;
        await expectRevert( v3.secondaryLiquidateByMidToken( 100, 400 ), "amount wrong" );

    });

    it('secondaryLiquidate directly', async () => {
        await init(1, 1.5 );

        midToken = await Chick.new("MID", "MID");

        const router = await TestSwapRouter.new( chick.address, toUnit(2));
        
        const v3 = await LiquidatorV3.new( chick.address, midToken.address, router.address );

        await v3.grantRole( await v3.ADMIN_ROLE(), admin );    
        await v3.grantRole( await v3.VAULT_ROLE(), admin );    
        await v3.setLiquidateByMidToken( false );

        await chick.grantRole(await chick.MINTER_ROLE(), admin );

        await chick.mint( router.address, toUnit(10000));

        await midToken.grantRole(await chick.MINTER_ROLE(), admin );

        await midToken.mint( router.address, toUnit(10000));

        await v3.liquidate( 1, admin, 100, 800, 0, 0, { value: 100, from: admin } );
        assertBNEqual( await v3.mOverLiquidated(), toBN(0));
        assertBNEqual( await v3.mLiquidateRequired(), toBN(800));
        assertBNEqual( await web3.eth.getBalance(v3.address), toBN(100));
        assertBNEqual( await web3.eth.getBalance(router.address), toBN(0));

        // swap to eurp manually
        await v3.secondaryLiquidateDirectly( 100, 200 );
        assertBNEqual( await v3.mOverLiquidated(), toBN(0));
        assertBNEqual( await v3.mLiquidateRequired(), toBN(600));
        assertBNEqual( await web3.eth.getBalance(v3.address), toBN(0));
        assertBNEqual( await web3.eth.getBalance(router.address), toBN(100));

        //revert out of eth
        await expectRevert( v3.secondaryLiquidateDirectly( 100, 400 ), "revert" );

    });


    it('over liquidated and liquidate required, directly', async () => {
        await init(1, 1.5 );

        midToken = await Chick.new("MID", "MID");

        const router = await TestSwapRouter.new( chick.address, toUnit(2));
        
        const v3 = await LiquidatorV3.new( chick.address, midToken.address, router.address );

        await v3.grantRole( await v3.ADMIN_ROLE(), admin );    
        await v3.grantRole( await v3.VAULT_ROLE(), admin );    
        await v3.setLiquidateByMidToken( false );

        await chick.grantRole(await chick.MINTER_ROLE(), admin );

        await chick.mint( router.address, toUnit(10000));

        await midToken.grantRole(await chick.MINTER_ROLE(), admin );

        await midToken.mint( router.address, toUnit(10000));

        // liquidateAmount , amount > required
        // subLiquidateRequired, liquidate required < amount
        await v3.liquidate( 1, admin, 100, 100, 0, 0, { value: 100, from: admin } );
        assertBNEqual( await v3.mOverLiquidated(), toBN(100));
        assertBNEqual( await v3.mLiquidateRequired(), toBN(0));
        assertBNEqual( await web3.eth.getBalance(v3.address), toBN(0));
        assertBNEqual( await web3.eth.getBalance(router.address), toBN(100));

        // liquidateAmount , amount < required
        // addLiquidateRequired, over liquidate < amount
        await v3.liquidate( 1, admin, 100, 400, 0, 0, { value: 100, from: admin } );
        assertBNEqual( await v3.mOverLiquidated(), toBN(0));
        assertBNEqual( await v3.mLiquidateRequired(), toBN(300));
        assertBNEqual( await web3.eth.getBalance(v3.address), toBN(100));
        assertBNEqual( await web3.eth.getBalance(router.address), toBN(100));

        // liquidateAmount , amount > required
        // subLiquidateRequired, liquidate required > amount
        await v3.liquidate( 1, admin, 100, 0, 0, 0, { value: 100, from: admin } );
        assertBNEqual( await v3.mOverLiquidated(), toBN(0));
        assertBNEqual( await v3.mLiquidateRequired(), toBN(100));
        assertBNEqual( await web3.eth.getBalance(v3.address), toBN(100));
        assertBNEqual( await web3.eth.getBalance(router.address), toBN(200));

        // liquidateAmount , amount > required
        // subLiquidateRequired, liquidate required < amount
        await v3.liquidate( 1, admin, 200, 0, 0, 0, { value: 200, from: admin } );
        assertBNEqual( await v3.mOverLiquidated(), toBN(300));
        assertBNEqual( await v3.mLiquidateRequired(), toBN(0));
        assertBNEqual( await web3.eth.getBalance(v3.address), toBN(100));
        assertBNEqual( await web3.eth.getBalance(router.address), toBN(400));

        // addLiquidateRequired, over liquidate > amount
        await v3.liquidate( 1, admin, 100, 250, 0, 0, { value: 100, from: admin } );
        assertBNEqual( await v3.mOverLiquidated(), toBN(50));
        assertBNEqual( await v3.mLiquidateRequired(), toBN(0));
        assertBNEqual( await web3.eth.getBalance(v3.address), toBN(200));
        assertBNEqual( await web3.eth.getBalance(router.address), toBN(400));


        // swap to eurp manually
        //await web3.eth.sendTransaction({to:receiver, from:sender, data: getData});

    });


    it('over liquidated and liquidate required, mid token', async () => {
        await init(1, 1.5 );

        midToken = await Chick.new("MID", "MID");

        const router = await TestSwapRouter.new( chick.address, toUnit(2));
        
        const v3 = await LiquidatorV3.new( chick.address, midToken.address, router.address );

        await v3.grantRole( await v3.ADMIN_ROLE(), admin );    
        await v3.grantRole( await v3.VAULT_ROLE(), admin );    

        await chick.grantRole(await chick.MINTER_ROLE(), admin );

        await chick.mint( router.address, toUnit(10000));

        await midToken.grantRole(await chick.MINTER_ROLE(), admin );

        await midToken.mint( router.address, toUnit(10000));

        // liquidateAmount , amount > required
        // subLiquidateRequired, liquidate required < amount
        await v3.liquidate( 1, admin, 100, 100, 0, 0, { value: 100, from: admin } );
        assertBNEqual( await v3.mOverLiquidated(), toBN(300));
        assertBNEqual( await v3.mLiquidateRequired(), toBN(0));
        assertBNEqual( await midToken.balanceOf(v3.address), toBN(0));

        // liquidateAmount , amount < required
        // addLiquidateRequired, over liquidate  < amount
        await v3.liquidate( 1, admin, 100, 600, 0, 0, { value: 100, from: admin } );
        assertBNEqual( await v3.mOverLiquidated(), toBN(0));
        assertBNEqual( await v3.mLiquidateRequired(), toBN(300));
        assertBNEqual( await midToken.balanceOf(v3.address), toBN(200));

        // liquidateAmount , amount > required
        // subLiquidateRequired, liquidate required > amount
        await v3.liquidate( 1, admin, 100, 200, 0, 0, { value: 100, from: admin } );
        assertBNEqual( await v3.mOverLiquidated(), toBN(0));
        assertBNEqual( await v3.mLiquidateRequired(), toBN(100));
        assertBNEqual( await midToken.balanceOf(v3.address), toBN(200));

        // prepare
        await v3.liquidate( 1, admin, 100, 0, 0, 0, { value: 100, from: admin } );
        assertBNEqual( await v3.mOverLiquidated(), toBN(300));
        assertBNEqual( await v3.mLiquidateRequired(), toBN(0));
        assertBNEqual( await midToken.balanceOf(v3.address), toBN(200));

        // liquidateAmount , amount < required
        // addLiquidateRequired, over liquidate  > amount
        await v3.liquidate( 1, admin, 10, 200, 0, 0, { value: 10, from: admin } );
        assertBNEqual( await v3.mOverLiquidated(), toBN(100));
        assertBNEqual( await v3.mLiquidateRequired(), toBN(0));
        assertBNEqual( await midToken.balanceOf(v3.address), toBN(220));

    });

});

