// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title Rugbrød ($RUGBROD)
/// @notice The only rug that never gets pulled.
/// @dev Fixed supply minted once to the deployer. No owner, no mint, no tax,
///      no blacklist, no pause: there is nothing anyone can change after deploy.
contract Rugbrod is ERC20 {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 10 ** 18;

    constructor() ERC20(unicode"Rugbrød", "RUGBROD") {
        _mint(msg.sender, TOTAL_SUPPLY);
    }
}
