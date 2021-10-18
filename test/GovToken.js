const w3utils = require('web3-utils');
const { expectRevert, time } = require('@openzeppelin/test-helpers');
const { toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));
const fromUnit = amount => fromWei(amount, 'ether');
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);
const { assertBNEqual, getGasFee, assertRevert } = require("./utils.js");
const { inTransaction } = require('@openzeppelin/test-helpers/src/expectEvent');

const GovernToken = artifacts.require("GovernToken");


contract('GovToken', async (accounts) => {

    const admin = accounts[0];
    const ac1 = accounts[1];
    const ac2 = accounts[2];
    const ac3 = accounts[3];
    const ac4 = accounts[4];

    const SubsidyHalvingInterval = (3600 * 24 * 365) / 15;
    const InitialTokenPerBlock = 5 * 1e18; // 
    //const InitialTokenPerBlock = 300; // 

    function calcCap(startBlock, curBlock) {
        //console.log( "Calc Cap" );
        let gen = toBN(InitialTokenPerBlock);
        let runBlock = curBlock - startBlock;
        let amount = toBN(0);
        while (runBlock > SubsidyHalvingInterval) {
            amount = amount.add(gen.mul(toBN(SubsidyHalvingInterval)));
            // console.log( "amount in while:" + amount.toString() );
            // console.log( "gen in while:" + gen.toString() );
            // console.log( "times in while: " + amount.div( gen ).div( toBN(SubsidyHalvingInterval)).toString() );

            // console.log( "times end" );
            gen = gen.div(toBN(2));
            runBlock -= SubsidyHalvingInterval;
            //console.log( amount.toString() );
        }
        //console.log( "amount before mod:" + amount.toString() );
        amount = amount.add(gen.mul(toBN(runBlock)));
        //console.log( "amount: " + amount.toString() );
        //console.log( "gen: " + gen.toString() );
        // console.log( "times: " + amount.div( gen.mul(toBN(2)) ).div( toBN(SubsidyHalvingInterval)).toString() );

        return amount;
    }

    let caps, subsides;

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

    function cap(startBlock, blockNumb) {
        //console.log( "Cap" );

        let runBlock = toBN(blockNumb - startBlock);
        let i = runBlock.div(toBN(SubsidyHalvingInterval));
        if (i < 64) {
            let amount = caps[i];
            amount = amount.add(subsides[i].mul(runBlock.mod(toBN(SubsidyHalvingInterval))));
            return amount;
        } else {
            return caps[63];
        }
    }

    it('cap', async () => {
        init();
        let gtoken = await GovernToken.new("gov", "gov", 100, caps, subsides);
        for (let i = 0; i <= 65; ++i) {
            //console.log( "new round: " + i );

            v = cap(100, 101 + SubsidyHalvingInterval * i);
            calc = calcCap(100, 101 + SubsidyHalvingInterval * i);
            capv = await gtoken.cap(101 + SubsidyHalvingInterval * i);
            // console.log( i );
            // console.log( v.toString() );
            // console.log( calc.toString() );
            // console.log( capv.toString() );

            assertBNEqual(v, calc);
            assertBNEqual(v, capv);

            v = cap(100, 10100 + SubsidyHalvingInterval * i);
            calc = calcCap(100, 10100 + SubsidyHalvingInterval * i);
            capv = await gtoken.cap(10100 + SubsidyHalvingInterval * i);
            assertBNEqual(v, calc);
            assertBNEqual(v, capv);

        }

    });


});

