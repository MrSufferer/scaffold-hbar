// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import "./Invoices.sol";

/// @notice Controllable recipient used only in deterministic local settlement tests.
contract SettlementRecipient {
    Invoices private invoices;
    bool private reject;
    bool private reenter;
    bool public reentryBlocked;
    uint256 public deliveries;
    function create(address target, uint64 expiry) external {
        invoices = Invoices(target);
        invoices.createInvoice(125, expiry);
        invoices.createInvoice(125, expiry);
    }
    function configure(bool reject_, bool reenter_) external { reject = reject_; reenter = reenter_; }
    receive() external payable {
        if (reject) revert();
        ++deliveries;
        if (reenter) {
            Invoices.Quote memory quote = invoices.getQuote(2);
            try invoices.payInvoice{value: quote.amountTinybars}(quote) { revert("reentry succeeded"); }
            catch (bytes memory reason) {
                reentryBlocked = bytes4(reason) == Invoices.ReentrantPayment.selector;
                require(reentryBlocked, "unexpected reentry failure");
            }
        }
    }
}
