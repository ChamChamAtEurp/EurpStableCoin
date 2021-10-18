// SPDX-License-Identifier: MIT

pragma solidity ^0.6.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

import "./SafeDecimalMath.sol";
import "./token/Chick.sol";
import "./token/VaultToken.sol";
import "./token/GovernToken.sol";
import './interface/IPriceFeed.sol';
import './interface/IEthVault.sol';
import "./AddressBook.sol";
import "./lib/AddressBookLib.sol";
import "./EthReward.sol";


contract TestLpToken is Chick{
    constructor(string memory name, string memory symbol) public Chick(name, symbol) {
    }

}


contract LpRewardManager is AccessControl, RewardManagerForVault {

    AddressBook mAddressBook;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    modifier onlyAdmin() {
        require(hasRole(ADMIN_ROLE, _msgSender()), "only admin");
        _;
    }

    constructor( AddressBook addressBook, uint256 rewardPerBlock, uint256 startBlock ) public 
        RewardManagerForVault( rewardPerBlock, startBlock ) {
        mAddressBook = addressBook;
        _setupRole(ADMIN_ROLE, _msgSender());
    }

    function setRewardPerBlock( uint256 rewardPerBlock ) public onlyAdmin {
        _update( block.number );
        mRewardPerBlock = rewardPerBlock;
        emit LogSetRewardPerBlock( block.number, rewardPerBlock );
    }

    function getRewardPerBlock( ) external view returns (uint256 rewardPerBlock ){
        rewardPerBlock = mRewardPerBlock;
    }


    function deposit( uint256 amount ) external {
        address addr = msg.sender;

        AddressBookLib.lp(mAddressBook).transferFrom( addr, address(this), amount);

        _deposit( block.number, uint(addr), amount );
        emit LogDeposit( block.number, amount, addr, mAccRewardPerShare, mRewardPerBlock );
    }

    function withdraw( uint256 amount ) external {
        address addr = msg.sender;
        AddressBookLib.lp(mAddressBook).transfer( addr, amount);

        _withdraw( block.number, uint(addr), amount );
        emit LogWithdraw( block.number, amount, addr, mAccRewardPerShare, mRewardPerBlock );
    }

    function claim( ) external {
        address addr = msg.sender;
        uint reward = _claim( block.number, uint(addr) );
        if( reward > 0 ){
            GovernToken govToken = AddressBookLib.governToken(mAddressBook);
            govToken.mint( addr, reward );
        }
        emit LogClaim( block.number, addr, reward );
    } 

    function getReward( ) external view returns (uint256 reward ){
        return calcReward( block.number,uint(msg.sender) );
    }


    event LogDeposit(
        uint256 curBlock,
        uint256 amount,
        address addr,
        uint256 accRewardPerShare,
        uint256 rewardPerBlock
    );

    event LogWithdraw(
        uint256 curBlock,
        uint256 amount,
        address addr,
        uint256 accRewardPerShare,
        uint256 rewardPerBlock
    );

    event LogClaim(
        uint256 curBlock,
        address addr,
        uint256 reward
    );

    event LogSetRewardPerBlock(
        uint256 blockNb,
        uint256 rewardPerBlock
    );

}
