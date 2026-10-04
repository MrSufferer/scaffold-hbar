// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Local operability probe, not an invoice or proof of testnet deployment.
contract TemplateProbe {
    function purpose() external pure returns (string memory) {
        return "HBAR Invoices: local baseline only";
    }
}
