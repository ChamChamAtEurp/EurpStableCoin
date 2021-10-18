// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

import "./SafeDecimalMath.sol";
import "./EthReward.sol";
import './interface/IPriceFeed.sol';
import './interface/IEthVault.sol';
import "./AddressBook.sol";
import "./lib/AddressBookLib.sol";

import "./token/Chick.sol";
import "./token/GovernToken.sol";


// According to the current price, the interest rate is automatically adjusted regularly
contract EthModerator  is AccessControl {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    uint256 public constant BLOCKS_A_DAY = 5760;

    uint256 public mLastBlock = 0;  
    uint256 public mAdjustGap = BLOCKS_A_DAY;  
    uint256 public mLowPrice = 0.95 ether;  
    uint256 public mHighPrice = 0.96 ether;  
    uint256 public mInterestScale = 10 ether;  
    uint256 public mRewardScale = 1.0 ether;  

    AddressBook mAddressBook;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    modifier onlyAdmin() {
        require(hasRole(ADMIN_ROLE, _msgSender()), "only admin");
        _;
    }

    constructor( AddressBook addressBook, uint256 adjustGap ) public {
        mAddressBook = addressBook;
        mAdjustGap = adjustGap;
        _setupRole(ADMIN_ROLE, _msgSender());
    }

    event SetLowPriceEvent( uint256 uprice );
    event SetHighPriceEvent( uint256 urpice );
    event setInterestScaleEvent( uint256 scale );
    event SetRewardScaleEvent( uint256 scale );

    function setLowPrice( uint256 uprice ) public onlyAdmin {
        require( uprice > 0 );
        mLowPrice = uprice;
        emit SetLowPriceEvent( uprice );
    }

    function setHighPrice( uint256 uprice ) public onlyAdmin {
        require( uprice > 0 );
        mHighPrice = uprice;
        emit SetHighPriceEvent( uprice );
    }

    function setInterestScale( uint256 scale ) public onlyAdmin {
        require( scale > 0 );
        mInterestScale = scale;
        emit setInterestScaleEvent( scale );
    }

    function setRewardScale( uint256 scale ) public onlyAdmin {
        require( scale > 0 );
        mRewardScale = scale;
        emit SetRewardScaleEvent( scale );
    }


    function update() public  {
        require( block.number >= mLastBlock );
        if( block.number.sub( mLastBlock) < mAdjustGap ){
            return;
        }

        mLastBlock = block.number;
        
        IPriceFeed priceFeed = AddressBookLib.chickPriceFeed(mAddressBook);
        int256 price = 0;
        (, price, , , ) = priceFeed.latestRoundData();
        require(price >= 0, "price should >= 0");

        IInterestManager interestMgr = AddressBookLib.interestMgr( mAddressBook);
        if( uint256(price) < mLowPrice ){
//            interestMgr.setAnnualizedRate( uint256(1.0 ether - price).multiplyDecimal(  mInterestScale ) );
            interestMgr.setAnnualizedRate( uint256(1.0 ether).sub( uint256(price)).multiplyDecimal(  mInterestScale ) );

        }
        else{
            interestMgr.setInterestRate( 0 );
        }

        IGTokenRewardManager rewarder = AddressBookLib.gTokenRewardMgr( mAddressBook);
        if( uint256(price) < mHighPrice ){
            rewarder.setRewardPerBlock( 0 );
        }
        else{
            GovernToken govToken = AddressBookLib.governToken(mAddressBook);
            rewarder.setRewardPerBlock( govToken.supplyPerBlock( block.number ).multiplyDecimal( mRewardScale) );
        }
    }
}

