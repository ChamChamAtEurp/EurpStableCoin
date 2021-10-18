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


contract('EthInterest', async (accounts) => {

    const admin = accounts[0];
    const ac1 = accounts[1];

    let vault, chick, addressBook, vtoken,interestMgr, rewardMgr, gtoken;

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
    };


    it('interest', async () => {
        await init(1, 1.5 );

        let vaultValue = await vault.newVault();
        let vaultId = await vtoken.tokenOfOwnerByIndex(admin, 0);

        let iEth = toUnit('1.5');
        let txBuy = await vault.depositEth( vaultId, { value: iEth, from: admin });

        let cur_block = (await web3.eth.getBlock("latest")).number;
        await vault.mint( vaultId, toUnit(2000) );

        let i1 = await interestMgr.getInterest( cur_block+2,  vaultId );
        //console.log( fromUnit(i1).toString() );
        assertBNEqual( i1, toUnit(2000 * ( 1 ) * 0.01) );

        await time.advanceBlockTo( toBN( cur_block +2));

        let block2 = (await web3.eth.getBlock("latest")).number;

        await vault.burn( vaultId, toUnit(1000) );

        let i2 = await interestMgr.getInterest( block2+1,  vaultId );
        //console.log( fromUnit(i2).toString() );
        // interest has burned.
        assertBNEqual( i2, toBN(0) );
        
        let info = await vault.vaultInfo( vaultId );
        assertBNEqual( info.chickAmount, toUnit('1040') );
        // console.log(" vault after burn 1");
        // console.log(" vaultInfo:"  );
        // console.log(" ethAmount:" + fromUnit(info.ethAmount).toString() );
        // console.log(" chickAmount:" + fromUnit(info.chickAmount).toString() );
        // console.log(" time:" + info.time.toString() );

        let block3 = (await web3.eth.getBlock("latest")).number;
        let i3 = await interestMgr.getInterest( block3+1,  vaultId );
        assertBNEqual( i3, toUnit('10.4') );

        await vault.burn( vaultId, toUnit(1000) );

        cur_block = (await web3.eth.getBlock("latest")).number;
        let i4 = await interestMgr.getInterest( cur_block,  vaultId );
        assertBNEqual( i4, toUnit('0') );

        
        info = await vault.vaultInfo( vaultId );
        assertBNEqual( info.chickAmount, toUnit('50.4') );

        assertBNEqual(toBN(await chick.balanceOf(interestMgr.address)), toUnit(50.4));

        // console.log(" vault after burn 2");
        // console.log(" vaultInfo:"  );
        // console.log(" ethAmount:" + fromUnit(info.ethAmount).toString() );
        // console.log(" chickAmount:" + fromUnit(info.chickAmount).toString() );
        // console.log(" time:" + info.time.toString() );
    });


    it('interest change', async () => {
        await init(1, 1.5 );

        let vaultValue = await vault.newVault();
        let vaultId = await vtoken.tokenOfOwnerByIndex(admin, 0);

        let iEth = toUnit('1.5');
        let txBuy = await vault.depositEth( vaultId, { value: iEth, from: admin });

        await vault.mint( vaultId, toUnit(2000) );
        let block1 = (await web3.eth.getBlock("latest")).number;

        let i1 = await interestMgr.getInterest( block1+1,  vaultId );
        assertBNEqual( i1, toUnit(2000 * ( 1 ) * 0.01) );

        await time.advanceBlockTo( toBN( block1 +2));

        await  interestMgr.setInterestRate( toHighPreciseUnit('0.1')  );
        let block2 = (await web3.eth.getBlock("latest")).number;
        let i2 = await interestMgr.getInterest( block2+1,  vaultId );
        assertBNEqual( i2, toUnit( (block2 - block1)*20 + 200) );
        //console.log( fromUnit(i2) );
        
        await vault.burn( vaultId, toUnit(2000) );
        let block3 = (await web3.eth.getBlock("latest")).number;
        let i3 = await interestMgr.getInterest( block3,  vaultId );
        //console.log( fromUnit(i3) );
        assertBNEqual( i3, toUnit(0) );
        info = await vault.vaultInfo( vaultId );
        assertBNEqual( info.chickAmount, toUnit( (block2 - block1)*20 + ( block3 - block2)*200) );
        //console.log( fromUnit(info.chickAmount) );
     });

     it('interest large than amount', async () => {
        await init(1, 1.5 );

        let vaultValue = await vault.newVault();
        let vaultId = await vtoken.tokenOfOwnerByIndex(admin, 0);

        let iEth = toUnit('1.5');
        let txBuy = await vault.depositEth( vaultId, { value: iEth, from: admin });

        await vault.mint( vaultId, toUnit(2000) );
        let block1 = (await web3.eth.getBlock("latest")).number;

        let i1 = await interestMgr.getInterest( block1+1,  vaultId );
        assertBNEqual( i1, toUnit(2000 * ( 1 ) * 0.01) );

        await time.advanceBlockTo( toBN( block1 +2));

        await  interestMgr.setInterestRate( toHighPreciseUnit('0.1')  );
        let block2 = (await web3.eth.getBlock("latest")).number;
        let i2 = await interestMgr.getInterest( block2+1,  vaultId );
        assertBNEqual( i2, toUnit( (block2 - block1)*20 + 200) );
        //console.log( fromUnit(i2) );
        
        // interest big than burn value, chick amount remain
        await vault.burn( vaultId, toUnit(100) );
        let block3 = (await web3.eth.getBlock("latest")).number;
        info = await vault.vaultInfo( vaultId );
        //console.log( fromUnit(info.chickAmount) );
        assertBNEqual( info.chickAmount, toUnit( 2000 ) );

        // interest = interest - 100
        let i3 = await interestMgr.getInterest( block3,  vaultId );
        //console.log( fromUnit(i3) );
        assertBNEqual( i3, toUnit((block2 - block1)*20 + ( block3 - block2)*200 - 100 ) );
        //console.log( fromUnit(info.chickAmount) );
     });


     it('only vault', async () => {
        await init(1, 1.5 );

        let vaultValue = await vault.newVault();
        let vaultId = await vtoken.tokenOfOwnerByIndex(admin, 0);
        let block1 = (await web3.eth.getBlock("latest")).number;

        await expectRevert( interestMgr.mint( block1, vaultId, toUnit(10 ),ac1, {from:ac1}) ,"only vault");
        await expectRevert( interestMgr.burn( block1, vaultId, toUnit(10 ),ac1, {from:ac1}) ,"only vault");
        await expectRevert( interestMgr.payInterest( block1, vaultId, toUnit(10 ), {from:ac1}) ,"only vault");

    });

    it('only admin', async () => {
        await init(1, 1.5 );

        await expectRevert( interestMgr.setInterestRate( toHighPreciseUnit('10' ), {from:ac1}) ,"only admin");
    });

    it('Annualized Rate', async () => {
        await init(1, 1.5 );

        let vaultValue = await vault.newVault();
        let vaultId = await vtoken.tokenOfOwnerByIndex(admin, 0);

        let iEth = toUnit('90');
        let txBuy = await vault.depositEth( vaultId, { value: iEth, from: admin });

        // 10% a year
        await interestMgr.setAnnualizedRate( toHighPreciseUnit('0.1' ) );

        await vault.mint( vaultId, toUnit(100000) );
        let cur_block = (await web3.eth.getBlock("latest")).number;

        // block for a year 2102400
        let block_a_year = 2102400;
        let i1 = await interestMgr.getInterest( cur_block+block_a_year,  vaultId );
        assertBNDiffLess( i1, toUnit( 100000 * 0.1 ), 100 );

        await vault.burn( vaultId, toUnit(100000) );
        await vault.withdrawEth( vaultId, toUnit('81') );
    });




});

