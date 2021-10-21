// SPDX-License-Identifier: MIT

pragma solidity ^0.6.0;

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
import "./LiquidationManager.sol";
import './interface/IUniswapV2Router.sol';
import './interface/IWeth9.sol';



contract UniswapLiquidatorV2 is LiquidationManager {
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    AddressBook mAddressBook;
    IERC20 public mMidToken;
    uint public mLiquidateRequired;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    modifier onlyAdmin() {
        require(hasRole(ADMIN_ROLE, _msgSender()), "only admin");
        _;
    }

    constructor( AddressBook addressBook, IERC20 midToken ) public {
        mAddressBook = addressBook;
        mMidToken = IERC20(midToken);
    }

    event liquidateEvent( 
            uint256 vaultId,
            address addr,
            uint256 ethAmount,
            uint256 chickAmount,
            uint256 interest,
            uint256 reward,
            uint256 ethValue,
            address wethAddress,
            address chickAddress,
            uint timeStamp
            );

    event liquidateResult( 
        uint256 ethAmount,
        uint256 chickAmount
    );

    event liquidateMidTokenEvent( 
            uint256 vaultId,
            address addr,
            uint256 ethAmount,
            uint256 chickAmount,
            uint256 interest,
            uint256 reward,
            uint256 ethValue,
            address wethAddress,
            address chickAddress,
            uint timeStamp
            );

    event liquidateMidTokenResult( 
        uint256 ethAmount,
        uint256 chickAmount
    );

    function liquidate(  
            uint256 vaultId,
            address addr,
            uint256 ethAmount,
            uint256 chickAmount,
            uint256 interest,
            uint256 reward ) payable external override  onlyVault {

        //IUniswapV2Router02 UniswapV2Router02 = IUniswapV2Router02( 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D  );
        Chick chick = AddressBookLib.chick(mAddressBook);
        IUniswapV2Router02 UniswapV2Router02 = AddressBookLib.router( mAddressBook );

        // sell eth for chick
        address[] memory path = new address[](3);
        path[0] = UniswapV2Router02.WETH();
        path[1] = address(mMidToken);
        path[2] = address(chick);
        uint[] memory amounts;
        amounts = UniswapV2Router02.getAmountsOut( msg.value, path );

        // if we got sufficient amount
        if( amounts[2] >= chickAmount ){
            emit liquidateEvent( vaultId, addr, ethAmount, chickAmount, interest, reward, msg.value, path[0], path[2], block.timestamp );

            amounts = UniswapV2Router02.swapExactETHForTokens{ value: msg.value }(0, path, address( this ), block.timestamp+15 );

            emit liquidateResult( amounts[0], amounts[2]); 

            // burn chick
            chick.burn( amounts[2]);
            
            // refund leftover ETH to user
            // (bool success,) = msg.sender.call{ value: address(this).balance }("");
            // require(success, "refund failed");
        }
        else{
            // assume mid token can full liquidated
            address[] memory midPath = new address[](2);
            midPath[0] = UniswapV2Router02.WETH();
            midPath[1] = address(mMidToken);

            emit liquidateMidTokenEvent( vaultId, addr, ethAmount, chickAmount, interest, reward, msg.value, midPath[0], midPath[1], block.timestamp );

           uint[] memory midAmounts;

            midAmounts = UniswapV2Router02.swapExactETHForTokens{ value: msg.value }(0, midPath, address( this ), block.timestamp+15 );

            emit liquidateMidTokenResult( midAmounts[0], midAmounts[1]); 

            mLiquidateRequired = mLiquidateRequired.add( chickAmount );

            // refund leftover ETH to user
            // (bool success,) = msg.sender.call{ value: address(this).balance }("");
            // require(success, "refund failed");
        }


    }

    event SecondaryLiquidateEvent( uint midAmount, uint chickAmount, uint midAmountResult, uint chickAmountResult, uint remainLiquidation );

    function secondaryLiquidate( uint midAmount, uint chickAmount ) external onlyAdmin {
        Chick chick = AddressBookLib.chick(mAddressBook);
        IUniswapV2Router02 UniswapV2Router02 = AddressBookLib.router( mAddressBook );

        // sell eth for chick
        address[] memory path = new address[](2);
        path[0] = address(mMidToken);
        path[1] = address(chick);
        uint[] memory amounts;
        // amounts = UniswapV2Router02.getAmountsOut( midAmount, path );
        // require( amounts[1] >= chickAmount );

        // liquidate
        mMidToken.approve( address(UniswapV2Router02), midAmount );
        amounts = UniswapV2Router02.swapExactTokensForTokens( midAmount, chickAmount, path, address( this ), block.timestamp+15 );

        chick.burn( amounts[1]);
        if( amounts[1] > mLiquidateRequired ){
             mLiquidateRequired = 0;           
        }else{
            mLiquidateRequired = mLiquidateRequired.sub( amounts[1] );
        }
        emit SecondaryLiquidateEvent( midAmount, chickAmount, amounts[0], amounts[1], mLiquidateRequired );
    }


    receive() payable external {}

}
