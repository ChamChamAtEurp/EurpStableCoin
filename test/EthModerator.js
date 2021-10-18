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
const EthModerator = artifacts.require("EthModerator");

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


contract('EthModerator', async (accounts) => {

    const admin = accounts[0];
    const ac1 = accounts[1];

    let vault, chick, addressBook, vtoken,interestMgr, rewardMgr, gtoken, moderator, chickPrice;

    let init = async ( liquidationRatio=1, collateralRatio = 1, priceError=false, answer=2000)=>{
        calculate();
        addressBook = await AddressBook.new(admin);

        let priceFeed = await PriceFeed.new(admin);
        await priceFeed.setRoundData(0, toUnit(answer), 0, 0, 0);
        await priceFeed.setPriceError(priceError);
        await addressBook.setAddress(AddressBook.Name.ETH_PRICE_FEED, priceFeed.address);
        
        vault = await EthVault.new(addressBook.address, toUnit(liquidationRatio), toUnit(collateralRatio));

        // pool 
        let cur_block = (await web3.eth.getBlock("latest")).number;
        interestMgr = await InterestMgr.new( toHighPreciseUnit('0.01'), cur_block );
        await addressBook.setAddress(AddressBook.Name.INTEREST_MGR, interestMgr.address);
        await interestMgr.grantRole(await interestMgr.VAULT_ROLE(), vault.address);
    
        cur_block = (await web3.eth.getBlock("latest")).number;
        rewardMgr = await RewardMgr.new( addressBook.address, 10000, cur_block );
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

        moderator = await EthModerator.new( addressBook.address, 0 );
        await rewardMgr.grantRole( await rewardMgr.ADMIN_ROLE(), moderator.address );
        await interestMgr.grantRole( await interestMgr.ADMIN_ROLE(), moderator.address );

        chickPrice = await PriceFeed.new(admin);
        await chickPrice.setRoundData(0, toUnit(1.0), 0, 0, 0);
        await chickPrice.setPriceError(priceError);
        await addressBook.setAddress(AddressBook.Name.CHICK_PRICE_FEED, chickPrice.address);
    };


    it('moderator', async () => {
        await init(1, 1.5 );

        const BLOCKS_A_YEAR = 2102400;

        await chickPrice.setRoundData( 0, toUnit(0.9), 0, 0, 0 );    
        let block1 = (await web3.eth.getBlock("latest")).number;
        await moderator.update();

        let interestPerBlock = await interestMgr.mInterestPerBlock();
        assertBNEqual( interestPerBlock, toUnit( 1 ).div( toBN(BLOCKS_A_YEAR) ) );

        let rewardPerBlock = await rewardMgr.mRewardPerBlock();
        assertBNEqual( rewardPerBlock, toUnit( 0 ) );

    });

    it('config', async () => {
        await init(1, 1.5 );

        const BLOCKS_A_YEAR = 2102400;

        await chickPrice.setRoundData( 0, toUnit(0.7), 0, 0, 0 );    
        let block1 = (await web3.eth.getBlock("latest")).number;
        await moderator.update();

        // config
        await moderator.setLowPrice( toUnit('0.8' ) );
        await moderator.setLowPrice( toUnit('1.2' ) );
        await moderator.setInterestScale( toUnit('100' ) );
        await moderator.setRewardScale( toUnit('0.5' ) );

        // update again
        await moderator.update();

        let interestPerBlock = await interestMgr.mInterestPerBlock();
        assertBNEqual( interestPerBlock, toUnit( 30 ).div( toBN(BLOCKS_A_YEAR) ) );

        let rewardPerBlock = await rewardMgr.mRewardPerBlock();
        assertBNEqual( rewardPerBlock, toUnit( 0 ) );

        await chickPrice.setRoundData( 0, toUnit(1.3), 0, 0, 0 );    
        let block2 = (await web3.eth.getBlock("latest")).number;
        await moderator.update();
        interestPerBlock = await interestMgr.mInterestPerBlock();
        assertBNEqual( interestPerBlock, toUnit( 0 )  );

        rewardPerBlock = await rewardMgr.mRewardPerBlock();
        //console.log( "reward per block: " + fromWei(rewardPerBlock).toString() + " block2: " + block2.toString() );
        assertBNEqual( rewardPerBlock, await gtoken.supplyPerBlock( block2 )/2 );
    });


    it('only admin', async () => {
        await init(1, 1.5 );

        await expectRevert( moderator.setLowPrice( toUnit('10' ), {from:ac1}) ,"only admin");
        await expectRevert( moderator.setHighPrice( toUnit('10' ), {from:ac1}) ,"only admin");
        await expectRevert( moderator.setInterestScale( toUnit('10' ), {from:ac1}) ,"only admin");
        await expectRevert( moderator.setRewardScale( toUnit('10' ), {from:ac1}) ,"only admin");
    });



});

