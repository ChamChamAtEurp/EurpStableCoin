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
const LpReward = artifacts.require("LpRewardManager");

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


contract('EthReward', async (accounts) => {

    const admin = accounts[0];
    const ac1 = accounts[1];
    const ac2 = accounts[2];
    const ac3 = accounts[3];

    let vault, chick, addressBook, vtoken,interestMgr, rewardMgr, gtoken;
    let rewardPerBlock = 100;
    let lpReward, lpToken;

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

        cur_block = (await web3.eth.getBlock("latest")).number;
        lpReward = await LpReward.new( addressBook.address, rewardPerBlock, cur_block );
        await gtoken.grantRole(await gtoken.MINTER_ROLE(), lpReward.address);

        lpToken = await Chick.new("LP", "LP");
        await addressBook.setAddress(AddressBook.Name.LP, lpToken.address);
    };


    it('only admin', async () => {
        await init(1, 1.5 );

        await expectRevert( lpReward.setRewardPerBlock( toHighPreciseUnit('10' ), {from:ac1}) ,"only admin");
    });

    it('reward', async () => {
        await init(1, 1.5 );

        await lpToken.mint( ac1, 100 );
        await lpToken.mint( ac2, 100 );

        await lpToken.approve( lpReward.address, 100, {from:ac1});
        await lpToken.approve( lpReward.address, 100, {from:ac2});
        
        let block1 = (await web3.eth.getBlock("latest")).number;
        await lpReward.deposit( 100, { from:ac1});
        
        let block2 = (await web3.eth.getBlock("latest")).number;
        await lpReward.deposit( 100, { from:ac2});


        let block3 = (await web3.eth.getBlock("latest")).number;
        await lpReward.claim( {from:ac2} );
        assert.equal( rewardPerBlock*(block3-block2)/2, await gtoken.balanceOf( ac2) );

        let block4 = (await web3.eth.getBlock("latest")).number;
        await lpReward.claim( {from:ac1} );
        assertBNEqual( toBN(rewardPerBlock*(block4-block1) - rewardPerBlock*(block4-block2)/2), toBN(await gtoken.balanceOf( ac1)) );

        let block5 = (await web3.eth.getBlock("latest")).number;
        await lpReward.withdraw( 75, { from:ac2});

        let block6 = (await web3.eth.getBlock("latest")).number;
        await lpReward.withdraw( 25, { from:ac2});

        let block7 = (await web3.eth.getBlock("latest")).number;
        await lpReward.withdraw( 100, { from:ac1});

        await lpReward.claim( {from:ac1} );
        await lpReward.claim( {from:ac2} );
        assertBNEqual( toBN(rewardPerBlock*(block5-block2)/2 + rewardPerBlock*(block6-block5)/5 ), toBN(await gtoken.balanceOf( ac2)) );
        assertBNEqual( toBN( rewardPerBlock*(block7-block1) - rewardPerBlock*(block5-block2)/2 - rewardPerBlock*(block6-block5)/5 ), toBN(await gtoken.balanceOf( ac1)) );
  
    });

   });

