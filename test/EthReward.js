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


contract('EthReward', async (accounts) => {

    const admin = accounts[0];
    const ac1 = accounts[1];
    const ac2 = accounts[2];
    const ac3 = accounts[3];

    let vault, chick, addressBook, vtoken,interestMgr, rewardMgr, gtoken;
    let rewardPerBlock = 100;

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
    };


     it('only vault', async () => {
        await init(1, 1.5 );

        let vaultValue = await vault.newVault();
        let vaultId = await vtoken.tokenOfOwnerByIndex(admin, 0);
        let block1 = (await web3.eth.getBlock("latest")).number;

        await expectRevert( rewardMgr.mint( block1, vaultId, toUnit(10 ),ac1, {from:ac1}) ,"only vault");
        await expectRevert( rewardMgr.burn( block1, vaultId, toUnit(10 ),ac1, {from:ac1}) ,"only vault");
        await expectRevert( rewardMgr.claim( vaultId, ac1, {from:ac1}) ,"only vault");
    });

    it('only admin', async () => {
        await init(1, 1.5 );

        await expectRevert( rewardMgr.setRewardPerBlock( toHighPreciseUnit('10' ), {from:ac1}) ,"only admin");
    });

    it('reward', async () => {
        await init(1, 1.5 );

        let vaultValue = await vault.newVault();
        let vaultId = await vtoken.tokenOfOwnerByIndex(admin, 0);

        let ethBalance = await web3.eth.getBalance(admin);

        let iEth = toUnit('1.5');
        await vault.depositEth( vaultId, { value: iEth, from: admin });


        let cur_block = (await web3.eth.getBlock("latest")).number;
        await vault.mint( vaultId, toUnit(2000) );

        await vault.burn( vaultId, toUnit(1000) );

        let block2 = (await web3.eth.getBlock("latest")).number;
        await vault.claim( vaultId );
   
        let reward1 = await gtoken.balanceOf( admin  ) ;
        //console.log("Reward1: " + reward1.valueOf().toString() );
        assertBNEqual(toBN( reward1), toBN( rewardPerBlock*( block2 - cur_block) ));

        let block3 = (await web3.eth.getBlock("latest")).number;
        await vault.burn( vaultId, toUnit(1000) );

        await vault.claim( vaultId );

        let reward2 = await gtoken.balanceOf( admin  ) ;
        //console.log("Reward2: " + reward2.valueOf().toString() );
        assertBNEqual(toBN( reward2), toBN( rewardPerBlock*( block3 - cur_block) ));
    });

    it('reward change', async () => {
        await init(1, 1.5 );

        let vaultValue = await vault.newVault();
        let vaultId = await vtoken.tokenOfOwnerByIndex(admin, 0);

        let ethBalance = await web3.eth.getBalance(admin);

        let iEth = toUnit('1.5');
        await vault.depositEth( vaultId, { value: iEth, from: admin });


        let cur_block = (await web3.eth.getBlock("latest")).number;
        await vault.mint( vaultId, toUnit(2000) );
   
        await vault.burn( vaultId, toUnit(1000) );
   
        let block2 = (await web3.eth.getBlock("latest")).number;
        await vault.claim( vaultId );
   
        let reward1 = await gtoken.balanceOf( admin  ) ;
        //console.log("Reward1: " + reward1.valueOf().toString() );
        assertBNEqual(toBN( reward1), toBN( rewardPerBlock*( block2 - cur_block) ));

        let block3 = (await web3.eth.getBlock("latest")).number;
        let rewardPerBlock2 = 2000;
        await rewardMgr.setRewardPerBlock( rewardPerBlock2 );

        let block4 = (await web3.eth.getBlock("latest")).number;
        await vault.burn( vaultId, toUnit(1000) );

        await vault.claim( vaultId );

        let reward2 = await gtoken.balanceOf( admin  ) ;
        //console.log("Reward2: " + reward2.valueOf().toString() );
        assertBNEqual(toBN( reward2), toBN( rewardPerBlock*( block3 - cur_block) + rewardPerBlock2 * ( block4 - block3 ) ));
    });

    it('mint multi times', async () => {
        await init(1, 1.5 );

        let vaultValue = await vault.newVault();
        let vaultId = await vtoken.tokenOfOwnerByIndex(admin, 0);

        let ethBalance = await web3.eth.getBalance(admin);

        let iEth = toUnit('1.5');
        await vault.depositEth( vaultId, { value: iEth, from: admin });


        let cur_block = (await web3.eth.getBlock("latest")).number;
        await vault.mint( vaultId, toUnit(500) );

        await vault.mint( vaultId, toUnit(1500) );

        await vault.burn( vaultId, toUnit(1000) );

        let block2 = (await web3.eth.getBlock("latest")).number;
        await vault.claim( vaultId );
   
        let reward1 = await gtoken.balanceOf( admin  ) ;
        //console.log("Reward1: " + reward1.valueOf().toString() );
        assertBNEqual(toBN( reward1), toBN( rewardPerBlock*( block2 - cur_block) ));

        let block3 = (await web3.eth.getBlock("latest")).number;
        let rewardPerBlock2 = 2000;
        await rewardMgr.setRewardPerBlock( rewardPerBlock2 );

        let block4 = (await web3.eth.getBlock("latest")).number;
        await vault.burn( vaultId, toUnit(1000) );

        await vault.claim( vaultId );

        let reward2 = await gtoken.balanceOf( admin  ) ;
        //console.log("Reward2: " + reward2.valueOf().toString() );
        assertBNEqual(toBN( reward2), toBN( rewardPerBlock*( block3 - cur_block) + rewardPerBlock2 * ( block4 - block3 ) ));
    });

    it('multi vaults', async () => {
        await init(1, 1.5 );

        let vaultValue = await vault.newVault();
        let vaultId = await vtoken.tokenOfOwnerByIndex(admin, 0);

        let vault2 = await vault.newVault();
        let vaultId2 = await vtoken.tokenOfOwnerByIndex(admin, 1);

        let vault3 = await vault.newVault( { from: ac1 });
        let vaultId3 = await vtoken.tokenOfOwnerByIndex(ac1, 0);

        let iEth = toUnit('1.5');
        await vault.depositEth( vaultId, { value: iEth, from: admin });
        await vault.depositEth( vaultId2, { value: iEth, from: admin });
        await vault.depositEth( vaultId3, { value: iEth, from: ac1 });


        let block1 = (await web3.eth.getBlock("latest")).number;
        await vault.mint( vaultId, toUnit(25) );

        let block2 = (await web3.eth.getBlock("latest")).number;
        await vault.mint( vaultId2, toUnit(25) );
        let block3 = (await web3.eth.getBlock("latest")).number;
        await vault.mint( vaultId3, toUnit(50), { from: ac1 } );


        let block4 = (await web3.eth.getBlock("latest")).number;
        await vault.burn( vaultId3, toUnit(50),{ from:ac1} );
   
        let block5 = (await web3.eth.getBlock("latest")).number;
        await vault.burn( vaultId, toUnit(25) );

        let block6 = (await web3.eth.getBlock("latest")).number;
        await vault.burn( vaultId2, toUnit(25) );


        // vault1: block2 - block1 : 100
        // vault1: block3 - block2 : 50
        // vault1: block4 - block3 : 25
        // vault1: block5 - block4 : 50

        // 225

        // vault2: block3 - block2 : 50
        // vault2: block4 - block3 : 25
        // vault2: block5 - block4 : 50
        // vault2: block6 - block5 : 100

        // 225

        await vault.claim( vaultId );
        await vault.claim( vaultId2 );
        await vault.claim( vaultId3, { from:ac1} );

        let reward1 = await gtoken.balanceOf( admin  ) ;
        //console.log("Reward1: " + reward1.valueOf().toString() );
        assertBNEqual(toBN( reward1), toBN( 
            rewardPerBlock*( block3 - block1) + 
            rewardPerBlock*( block4 - block3)*0.5 + 
            rewardPerBlock*( block6 - block4)) );

        let reward2 = await gtoken.balanceOf( ac1  ) ;
        //console.log("Reward2: " + reward2.valueOf().toString() );
        assertBNEqual(toBN( reward2), toBN( rewardPerBlock*( block4 - block3)*0.5 ));
    });


    it('multi vaults + reward change', async () => {
        await init(1, 1.5 );

        let vaultValue = await vault.newVault();
        let vaultId = await vtoken.tokenOfOwnerByIndex(admin, 0);

        let vault2 = await vault.newVault();
        let vaultId2 = await vtoken.tokenOfOwnerByIndex(admin, 1);

        let vault3 = await vault.newVault( { from: ac1 });
        let vaultId3 = await vtoken.tokenOfOwnerByIndex(ac1, 0);

        let iEth = toUnit('1.5');
        await vault.depositEth( vaultId, { value: iEth, from: admin });
        await vault.depositEth( vaultId2, { value: iEth, from: admin });
        await vault.depositEth( vaultId3, { value: iEth, from: ac1 });


        let block1 = (await web3.eth.getBlock("latest")).number;
        await vault.mint( vaultId, toUnit(25) );

        let block2 = (await web3.eth.getBlock("latest")).number;
        await vault.mint( vaultId2, toUnit(25) );

        let block3 = (await web3.eth.getBlock("latest")).number;
        let rewardPerBlock2 = 1000;
        await rewardMgr.setRewardPerBlock( rewardPerBlock2 );

        let block3_2 = (await web3.eth.getBlock("latest")).number;
        await vault.mint( vaultId3, toUnit(50), { from: ac1 } );


        let block4 = (await web3.eth.getBlock("latest")).number;
        await vault.burn( vaultId3, toUnit(50),{ from:ac1} );
   
        let block5 = (await web3.eth.getBlock("latest")).number;
        await vault.burn( vaultId, toUnit(25) );

        let block6 = (await web3.eth.getBlock("latest")).number;
        await vault.burn( vaultId2, toUnit(25) );


        // vault1: block2 - block1 : 100
        // vault1: block3 - block2 : 50
        // vault1: block32 - block3 : 500
        // vault1: block4 - block32 : 250
        // vault1: block5 - block4 : 500

        // 1400

        // vault2: block3 - block2 : 50
        // vault2: block32 - block3 : 500
        // vault2: block4 - block32 : 250
        // vault2: block5 - block4 : 500
        // vault2: block6 - block5 : 1000

        // 1300
        await vault.claim( vaultId );
        await vault.claim( vaultId2 );
        await vault.claim( vaultId3, { from:ac1} );


        let reward1 = await gtoken.balanceOf( admin  ) ;
        //console.log("Reward1: " + reward1.valueOf().toString() );
        assertBNEqual(toBN( reward1), toBN( 
            rewardPerBlock*( block3 - block1) + 
            rewardPerBlock2*( block3_2 - block3) + 
            rewardPerBlock2*( block4 - block3_2)*0.5 + 
            rewardPerBlock2*( block6 - block4)) );

        let reward2 = await gtoken.balanceOf( ac1  ) ;
        //console.log("Reward2: " + reward2.valueOf().toString() );
        assertBNEqual(toBN( reward2), toBN( rewardPerBlock2*( block4 - block3_2)*0.5 ));
    });

    it('multi vaults + reward change + multi accounts', async () => {
        await init(1, 1.5 );

        let vaultValue = await vault.newVault();
        let vaultId = await vtoken.tokenOfOwnerByIndex(admin, 0);

        let vault2 = await vault.newVault( { from:ac2});
        let vaultId2 = await vtoken.tokenOfOwnerByIndex(ac2, 0);

        let vault3 = await vault.newVault( { from: ac3 });
        let vaultId3 = await vtoken.tokenOfOwnerByIndex(ac3, 0);

        let iEth = toUnit('1.5');
        await vault.depositEth( vaultId, { value: iEth, from: admin });
        await vault.depositEth( vaultId2, { value: iEth, from: ac2 });
        await vault.depositEth( vaultId3, { value: iEth, from: ac3 });


        let block1 = (await web3.eth.getBlock("latest")).number;
        await vault.mint( vaultId, toUnit(25) );

        let block2 = (await web3.eth.getBlock("latest")).number;
        await vault.mint( vaultId2, toUnit(25) ,{ from:ac2});

        let block3 = (await web3.eth.getBlock("latest")).number;
        let rewardPerBlock2 = 1000;
        await rewardMgr.setRewardPerBlock( rewardPerBlock2 );

        let block3_2 = (await web3.eth.getBlock("latest")).number;
        await vault.mint( vaultId3, toUnit(50), { from: ac3 } );


        let block4 = (await web3.eth.getBlock("latest")).number;
        await vault.burn( vaultId3, toUnit(50),{ from:ac3} );
   
        let block5 = (await web3.eth.getBlock("latest")).number;
        await vault.burn( vaultId, toUnit(25) );

        let block6 = (await web3.eth.getBlock("latest")).number;
        await vault.burn( vaultId2, toUnit(25) ,{ from:ac2});


        // vault1: block2 - block1 : 100
        // vault1: block3 - block2 : 50
        // vault1: block32 - block3 : 500
        // vault1: block4 - block32 : 250
        // vault1: block5 - block4 : 500

        // 1400

        // vault2: block3 - block2 : 50
        // vault2: block32 - block3 : 500
        // vault2: block4 - block32 : 250
        // vault2: block5 - block4 : 500
        // vault2: block6 - block5 : 1000

        // 2300
        await vault.claim( vaultId );
        await vault.claim( vaultId2, { from:ac2 } );
        await vault.claim( vaultId3, { from:ac3} );


        let reward1 = await gtoken.balanceOf( admin  ) ;
        //console.log("Reward1: " + reward1.valueOf().toString() );
        assertBNEqual(toBN( reward1), toBN( 
            rewardPerBlock*( block2 - block1) + 
            rewardPerBlock*( block3 - block2) * 0.5 + 
            rewardPerBlock2*( block3_2 - block3) * 0.5 + 
            rewardPerBlock2*( block4 - block3_2)*0.25 + 
            rewardPerBlock2*( block5 - block4)*0.5 ) );

        let reward2 = await gtoken.balanceOf( ac2  ) ;
        //console.log("Reward2: " + reward2.valueOf().toString() );
        assertBNEqual(toBN( reward2), toBN( 
            rewardPerBlock*( block3 - block2) * 0.5 + 
            rewardPerBlock2*( block3_2 - block3) * 0.5 + 
            rewardPerBlock2*( block4 - block3_2)*0.25 + 
            rewardPerBlock2*( block5 - block4)*0.5  + 
            rewardPerBlock2*( block6 - block5)*1 ) );

   
        let reward3 = await gtoken.balanceOf( ac3  ) ;
        //console.log("Reward3: " + reward3.valueOf().toString() );
        assertBNEqual(toBN( reward3), toBN( rewardPerBlock2*( block4 - block3_2)*0.5 ));
    });
});

