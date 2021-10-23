// SPDX-License-Identifier: MIT

pragma solidity ^0.6.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import '../interface/IUniswapV3Router.sol';
import '../SafeDecimalMath.sol';

contract TestSwapRouter is ISwapRouter
{
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    IERC20 mOut;
    uint mPrice;
    address public constant WETH9 = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    constructor( IERC20 out, uint price ) public {
        mOut = out;
        mPrice = price;
    }

    function setPrice( uint price ) public {
        mPrice = price;
    }


    /// @inheritdoc ISwapRouter
    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        override
        returns (uint256 amountOut)
    {
        amountOut = params.amountIn.multiplyDecimal( mPrice);
        require( amountOut >= params.amountOutMinimum,"amount wrong" );
        IERC20 token = IERC20( params.tokenOut);
        token.transfer( params.recipient, amountOut);
        if( params.tokenIn != WETH9 ){
            IERC20 tokenIn = IERC20( params.tokenIn);
            tokenIn.transferFrom( msg.sender, address(this), params.amountIn);
        }
    }

    /// @inheritdoc ISwapRouter
    function exactInput(ExactInputParams memory params)
        external
        payable
        override
        returns (uint256 amountOut)
    {
        // assume only swap eth to chick
        amountOut = params.amountIn.multiplyDecimal(mPrice);
        require( amountOut >= params.amountOutMinimum,"amount wrong" );
        mOut.transfer( params.recipient, amountOut);
    }


    /// @inheritdoc ISwapRouter
    function exactOutputSingle(ExactOutputSingleParams calldata params)
        external
        payable
        override
        returns (uint256 amountIn)
    {
    }

    /// @inheritdoc ISwapRouter
    function exactOutput(ExactOutputParams calldata params)
        external
        payable
        override
        returns (uint256 amountIn)
    {
        // it's okay that the payer is fixed to msg.sender here, as they're only paying for the "final" exact output
    }

    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata data
    ) external override {

    }

}

