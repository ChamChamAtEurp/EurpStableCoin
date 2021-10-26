const w3utils = require('web3-utils');
const { toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));
const fromUnit = amount => fromWei(amount, 'ether');
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);
const { assertBNEqual, getGasFee, assertRevert, toHighPreciseUnit, assertBNDiffLess } = require("./utils.js");
const { expectRevert, time } = require('@openzeppelin/test-helpers');

const EthVault = artifacts.require("EthVaultV2");
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

contract('EthVault V2', async (accounts) => {

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
        interestMgr = await InterestMgr.new( 1, cur_block );
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



    it('create vault', async () => {
        await init();
       
        let vaultValue = await vault.newVault();
    });

    it('depositEth', async () => {
        await init();

        let vaultValue = await vault.newVault();
        let vaultId = await vtoken.tokenOfOwnerByIndex(admin, 0);

        let ethBalance = await web3.eth.getBalance(admin);

        let iEth = toUnit('1');
        let txBuy = await vault.depositEth( vaultId, { value: iEth, from: admin });

        let ethBalance2 = await web3.eth.getBalance(admin);
        let bnBalance = toBN(ethBalance);
        bnBalance = bnBalance.sub(iEth);
        bnBalance = bnBalance.sub(await getGasFee(txBuy));
        assertBNEqual(bnBalance, toBN(ethBalance2));
    });
    
    it('mint', async () => {
        await init(1, 1.5 );

        let vaultValue = await vault.newVault();
        let vaultId = await vtoken.tokenOfOwnerByIndex(admin, 0);

        let ethBalance = await web3.eth.getBalance(admin);

        let iEth = toUnit('1.5');
        let txBuy = await vault.depositEth( vaultId, { value: iEth, from: admin });

        let ethBalance2 = await web3.eth.getBalance(admin);
        let bnBalance = toBN(ethBalance);
        bnBalance = bnBalance.sub(iEth);
        bnBalance = bnBalance.sub(await getGasFee(txBuy));
        assertBNEqual(bnBalance, toBN(ethBalance2));


        await vault.mint( vaultId, toUnit(2000) );
        assertBNEqual(toBN(await chick.balanceOf(admin)), toUnit(2000));
    });

    it('mint2', async () => {
        await init( 1, 1.5 );

        let vaultValue = await vault.newVault();
        let vaultId = await vtoken.tokenOfOwnerByIndex(admin, 0);

        let ethBalance = await web3.eth.getBalance(admin);

        let iEth = toUnit('1.5');
        let txBuy = await vault.depositEth( vaultId, { value: iEth, from: admin });

        let ethBalance2 = await web3.eth.getBalance(admin);
        let bnBalance = toBN(ethBalance);
        bnBalance = bnBalance.sub(iEth);
        bnBalance = bnBalance.sub(await getGasFee(txBuy));
        assertBNEqual(bnBalance, toBN(ethBalance2));


        assertRevert(vault.mint( vaultId, toUnit(2001) ));
    });

    it('mint multi times', async () => {
        await init( 1, 1.5 );

        let vaultValue = await vault.newVault();
        let vaultId = await vtoken.tokenOfOwnerByIndex(admin, 0);

        let ethBalance = await web3.eth.getBalance(admin);

        let iEth = toUnit('1.5');
        let txBuy = await vault.depositEth( vaultId, { value: iEth, from: admin });

        let ethBalance2 = await web3.eth.getBalance(admin);
        let bnBalance = toBN(ethBalance);
        bnBalance = bnBalance.sub(iEth);
        bnBalance = bnBalance.sub(await getGasFee(txBuy));
        assertBNEqual(bnBalance, toBN(ethBalance2));


        await vault.mint( vaultId, toUnit(1500) );
        assertBNEqual(toBN(await chick.balanceOf(admin)), toUnit(1500));

        await vault.mint( vaultId, toUnit(500) );
        assertBNEqual(toBN(await chick.balanceOf(admin)), toUnit(2000));

        assertRevert(vault.mint( vaultId, toUnit(1) ));
    });

    it('burn', async () => {
        await init(1, 1.5 );

        let vaultValue = await vault.newVault();
        let vaultId = await vtoken.tokenOfOwnerByIndex(admin, 0);

        let ethBalance = await web3.eth.getBalance(admin);

        let iEth = toUnit('1.5');
        let txBuy = await vault.depositEth( vaultId, { value: iEth, from: admin });

        let ethBalance2 = await web3.eth.getBalance(admin);
        let bnBalance = toBN(ethBalance);
        bnBalance = bnBalance.sub(iEth);
        bnBalance = bnBalance.sub(await getGasFee(txBuy));
        assertBNEqual(bnBalance, toBN(ethBalance2));


        let cur_block = (await web3.eth.getBlock("latest")).number;

        await vault.mint( vaultId, toUnit(2000) );
        assertBNEqual(toBN(await chick.balanceOf(admin)), toUnit(2000));

        let block2 = (await web3.eth.getBlock("latest")).number;
        await vault.burn( vaultId, toUnit(1000) );
        assertBNEqual(toBN(await chick.balanceOf(admin)), toUnit(1000));


        let block3 = (await web3.eth.getBlock("latest")).number;
        await vault.burn( vaultId, toUnit(1000) );
        assertBNEqual(toBN(await chick.balanceOf(admin)), toUnit(0));
    });

    it('withdrawEth', async () => {
        await init(1, 2 );

        let vaultValue = await vault.newVault();
        let vaultId = await vtoken.tokenOfOwnerByIndex(admin, 0);

        let ethBalance = await web3.eth.getBalance(admin);

        let iEth = toUnit('2');
        let txBuy = await vault.depositEth( vaultId, { value: iEth, from: admin });

        let ethBalance2 = await web3.eth.getBalance(admin);
        let bnBalance = toBN(ethBalance);
        bnBalance = bnBalance.sub(iEth);
        bnBalance = bnBalance.sub(await getGasFee(txBuy));
        assertBNEqual(bnBalance, toBN(ethBalance2));


        await vault.mint( vaultId, toUnit(1000) );
        assertBNEqual(toBN(await chick.balanceOf(admin)), toUnit(1000));

        ethBalance2 = await web3.eth.getBalance(admin);

        let iWidthdraw = toUnit('1');
        let txWithdraw = await vault.withdrawEth( vaultId, iWidthdraw);

        let ethBalance3 = await web3.eth.getBalance(admin);
        let bnBalance2 = toBN(ethBalance2);
        bnBalance2 = bnBalance2.add( iWidthdraw );
        bnBalance2 = bnBalance2.sub(await getGasFee(txWithdraw));
        assertBNEqual(bnBalance2, toBN(ethBalance3));

        assertRevert(vault.withdrawEth( vaultId, toUnit('0.00000000000000001') ));
    });

    it('withdrawEth multi times', async () => {
        await init(1, 2 );

        let vaultValue = await vault.newVault();
        let vaultId = await vtoken.tokenOfOwnerByIndex(admin, 0);

        let ethBalance = await web3.eth.getBalance(admin);

        let iEth = toUnit('2');
        let txBuy = await vault.depositEth( vaultId, { value: iEth, from: admin });

        let ethBalance2 = await web3.eth.getBalance(admin);
        let bnBalance = toBN(ethBalance);
        bnBalance = bnBalance.sub(iEth);
        bnBalance = bnBalance.sub(await getGasFee(txBuy));
        assertBNEqual(bnBalance, toBN(ethBalance2));


        await vault.mint( vaultId, toUnit(1000) );
        assertBNEqual(toBN(await chick.balanceOf(admin)), toUnit(1000));

        ethBalance2 = await web3.eth.getBalance(admin);

        let iWidthdraw = toUnit('0.6');
        let txWithdraw = await vault.withdrawEth( vaultId, iWidthdraw);

        let ethBalance3 = await web3.eth.getBalance(admin);
        let bnBalance2 = toBN(ethBalance2);
        bnBalance2 = bnBalance2.add( iWidthdraw );
        bnBalance2 = bnBalance2.sub(await getGasFee(txWithdraw));
        assertBNEqual(bnBalance2, toBN(ethBalance3));


        ethBalance2 = await web3.eth.getBalance(admin);

        iWidthdraw = toUnit('0.4');
        txWithdraw = await vault.withdrawEth( vaultId, iWidthdraw);

        ethBalance3 = await web3.eth.getBalance(admin);
        bnBalance2 = toBN(ethBalance2);
        bnBalance2 = bnBalance2.add( iWidthdraw );
        bnBalance2 = bnBalance2.sub(await getGasFee(txWithdraw));
        assertBNEqual(bnBalance2, toBN(ethBalance3));

        assertRevert(vault.withdrawEth( vaultId, toUnit('0.00000000000000001') ));
    });

    it('access check', async () => {
        await init(1, 1.5 );

        let vaultValue = await vault.newVault();
        let vaultId = await vtoken.tokenOfOwnerByIndex(admin, 0);
        let block1 = (await web3.eth.getBlock("latest")).number;

        await expectRevert( vault.setLiquidationRatio( 1, {from:ac1}) ,"only admin");
        await expectRevert( vault.setCollateralRatio( 1, {from:ac1}) ,"only admin");
        await expectRevert( vault.withdrawInterest( ac1, 1, {from:ac1}) ,"only admin");
        await expectRevert( vault.liquidate( vaultId, {from:ac1}) ,"only liquidator");
    });


    it('interest', async () => {
        await init(1, 1.5 );
        await  interestMgr.setInterestRate( toHighPreciseUnit('0.01')  );

        await vault.grantRole( await vault.ADMIN_ROLE(), admin );
        
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

        assertBNEqual(toBN(await chick.balanceOf(vault.address)), toUnit(50.4));

        await vault.withdrawInterest( interestMgr.address, toUnit(50.234) );
        assertBNEqual(toBN(await chick.balanceOf(interestMgr.address)), toUnit(50.234));

        // console.log(" vault after burn 2");
        // console.log(" vaultInfo:"  );
        // console.log(" ethAmount:" + fromUnit(info.ethAmount).toString() );
        // console.log(" chickAmount:" + fromUnit(info.chickAmount).toString() );
        // console.log(" time:" + info.time.toString() );
    });

});

