// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
/// @notice Free LOCAL/testnet asset, no real monetary value.
contract MockUSDCV02 is ERC20 {
    constructor() ERC20("MockUSDC","MockUSDC") {_mint(msg.sender,1000000*10**6);}
    function decimals() public pure override returns(uint8) {return 6;}
}
