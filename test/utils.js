// const Chick = artifacts.require("Chick");
// const PriceFeed = artifacts.require("PriceFeed");
// const GovernToken = artifacts.require("GovernToken");
// const OptionToken = artifacts.require("OptionToken");

const w3utils = require('web3-utils');

const { toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));
const fromUnit = amount => fromWei(amount, 'ether');
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);


function assertBNEqual(actualBN, expectedBN, context ) {
    assert.strictEqual(actualBN.toString(), expectedBN.toString(), context);
}

function assertBNDiffLess( a, b, diff ) {
    if( a.lte( b)  ){
        let c = b.sub( a );
        assert( c.lt( toBN(diff)) ,"assertBNDiffLess", diff );
    }else{
        let c = a.sub( b );
        assert( c.lt( toBN(diff)),"assertBNDiffLess", diff );
    }
}


async function getGasFee( receipt ){
    const tx = await web3.eth.getTransaction(receipt.tx);
    const gasPrice = tx.gasPrice;
    let gasFee = toBN(gasPrice).mul( toBN(receipt.receipt.cumulativeGasUsed));
    //console.log( gasFee.toString() );
    return gasFee;
}

async function assertRevert( blockOrPromise, reason ){
    let errorCaught = false;
    try {
        const result = typeof blockOrPromise === 'function' ? blockOrPromise() : blockOrPromise;
        await result;
    } catch (error) {
        assert.include(error.message, 'revert');
        if (reason) {
            assert.include(error.message, reason);
        }
        errorCaught = true;
    }

    assert.strictEqual(errorCaught, true, 'Operation did not revert as expected');
}

const toHighPreciseUnit = amount => toWei(amount, 'gether');

exports.assertBNEqual = assertBNEqual;
exports.getGasFee = getGasFee;
exports.assertRevert = assertRevert;
exports.assertBNDiffLess = assertBNDiffLess;
exports.toHighPreciseUnit = toHighPreciseUnit;
