// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Creation/read/cancellation slice. This deployment cannot quote or accept payments.
contract Invoices {
    enum State { Open, Expired, Cancelled }
    struct Invoice { uint256 usdCents; uint64 expiresAt; bool cancelled; }
    address public immutable merchant;
    address public immutable recipient;
    address public immutable feed;
    uint256 public nextInvoiceId = 1;
    mapping(uint256 => Invoice) private invoices;

    error InvalidIdentity();
    error MerchantOnly();
    error InvalidAmount();
    error InvalidExpiry();
    error InvoiceNotFound(uint256 invoiceId);
    error InvoiceAlreadyCancelled(uint256 invoiceId);
    event InvoiceCancelled(uint256 indexed invoiceId);
    event InvoiceCreated(uint256 indexed invoiceId, uint256 usdCents, uint64 expiresAt);

    constructor(address merchant_, address feed_) {
        if (merchant_ == address(0) || feed_ == address(0)) revert InvalidIdentity();
        merchant = merchant_;
        recipient = merchant_;
        feed = feed_;
    }

    function createInvoice(uint256 usdCents, uint64 expiresAt) external returns (uint256 invoiceId) {
        if (msg.sender != merchant) revert MerchantOnly();
        if (usdCents == 0) revert InvalidAmount();
        if (expiresAt <= block.timestamp) revert InvalidExpiry();
        invoiceId = nextInvoiceId++;
        invoices[invoiceId] = Invoice(usdCents, expiresAt, false);
        emit InvoiceCreated(invoiceId, usdCents, expiresAt);
    }

    function cancelInvoice(uint256 invoiceId) external {
        if (msg.sender != merchant) revert MerchantOnly();
        Invoice storage invoice = invoices[invoiceId];
        if (invoice.usdCents == 0) revert InvoiceNotFound(invoiceId);
        if (invoice.cancelled) revert InvoiceAlreadyCancelled(invoiceId);
        invoice.cancelled = true;
        emit InvoiceCancelled(invoiceId);
    }

    function getInvoice(uint256 invoiceId) external view returns (uint256 usdCents, uint64 expiresAt, State state) {
        Invoice memory invoice = invoices[invoiceId];
        if (invoice.usdCents == 0) revert InvoiceNotFound(invoiceId);
        return (invoice.usdCents, invoice.expiresAt, invoice.cancelled ? State.Cancelled : block.timestamp >= invoice.expiresAt ? State.Expired : State.Open);
    }
}
