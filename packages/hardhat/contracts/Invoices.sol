// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Minimal Chainlink-compatible read interface.
interface ReferenceFeed {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

/// @notice Immutable USD-reference invoices with atomic native HBAR settlement.
contract Invoices {
    uint256 public constant MAX_PRICE_AGE = 24 hours;
    uint256 public constant QUOTE_WINDOW = 5 minutes;
    uint256 public constant MAX_TINYBARS = uint256(uint64(type(int64).max));
    struct Quote {
        uint256 invoiceId;
        uint80 roundId;
        uint256 amountTinybars;
        uint256 deadline;
        uint256 window;
        uint256 priceUpdatedAt;
        int256 price;
        uint8 feedDecimals;
    }
    error InvoiceIneligible(uint256 invoiceId);
    error FeedUnavailable();
    error InvalidPrice();
    error IncompleteRound();
    error InvalidPriceTimestamp();
    error StalePrice();
    error UnsupportedFeedDecimals();
    error QuoteAmountOutOfRange();
    error QuoteExpired();
    error QuoteChanged();
    enum State { Open, Expired, Cancelled, Settled }
    struct Invoice { uint256 usdCents; uint64 expiresAt; bool cancelled; address payer; uint256 paidTinybars; uint80 acceptedRound; }
    address public immutable merchant;
    address public immutable recipient;
    address public immutable feed;
    uint256 public nextInvoiceId = 1;
    mapping(uint256 => Invoice) private invoices;
    bool private paying;

    error InvalidIdentity();
    error MerchantOnly();
    error InvalidAmount();
    error InvalidExpiry();
    error InvoiceNotFound(uint256 invoiceId);
    error InvoiceAlreadyCancelled(uint256 invoiceId);
    error InvoiceAlreadySettled(uint256 invoiceId);
    error IncorrectPayment();
    error RecipientDeliveryFailed();
    error ReentrantPayment();
    event InvoiceSettled(uint256 indexed invoiceId, address indexed payer, uint256 amountTinybars, uint80 roundId);
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
        invoices[invoiceId] = Invoice(usdCents, expiresAt, false, address(0), 0, 0);
        emit InvoiceCreated(invoiceId, usdCents, expiresAt);
    }

    function cancelInvoice(uint256 invoiceId) external {
        if (msg.sender != merchant) revert MerchantOnly();
        Invoice storage invoice = invoices[invoiceId];
        if (invoice.usdCents == 0) revert InvoiceNotFound(invoiceId);
        if (invoice.payer != address(0)) revert InvoiceAlreadySettled(invoiceId);
        if (invoice.cancelled) revert InvoiceAlreadyCancelled(invoiceId);
        invoice.cancelled = true;
        emit InvoiceCancelled(invoiceId);
    }

    function getInvoice(uint256 invoiceId) external view returns (uint256 usdCents, uint64 expiresAt, State state) {
        Invoice memory invoice = invoices[invoiceId];
        if (invoice.usdCents == 0) revert InvoiceNotFound(invoiceId);
        return (invoice.usdCents, invoice.expiresAt, invoice.payer != address(0) ? State.Settled : invoice.cancelled ? State.Cancelled : block.timestamp >= invoice.expiresAt ? State.Expired : State.Open);
    }
    function getSettlement(uint256 invoiceId) external view returns (address payer, uint256 amountTinybars, uint80 roundId) {
        Invoice memory invoice = invoices[invoiceId];
        if (invoice.usdCents == 0) revert InvoiceNotFound(invoiceId);
        return (invoice.payer, invoice.paidTinybars, invoice.acceptedRound);
    }
    function getQuote(uint256 invoiceId) public view returns (Quote memory quote) {
        Invoice memory invoice = invoices[invoiceId];
        if (invoice.usdCents == 0) revert InvoiceNotFound(invoiceId);
        if (invoice.payer != address(0) || invoice.cancelled || block.timestamp >= invoice.expiresAt) revert InvoiceIneligible(invoiceId);
        quote.invoiceId = invoiceId;
        uint80 answered;
        uint256 started;
        try ReferenceFeed(feed).latestRoundData() returns (uint80 round, int256 price, uint256 start, uint256 updated, uint80 complete) {
            quote.roundId = round; quote.price = price; started = start;
            quote.priceUpdatedAt = updated; answered = complete;
        } catch { revert FeedUnavailable(); }
        if (quote.price <= 0) revert InvalidPrice();
        if (quote.roundId == 0 || answered < quote.roundId) revert IncompleteRound();
        if (started == 0 || started > quote.priceUpdatedAt || quote.priceUpdatedAt == 0 || quote.priceUpdatedAt > block.timestamp) revert InvalidPriceTimestamp();
        if (block.timestamp - quote.priceUpdatedAt > MAX_PRICE_AGE) revert StalePrice();
        try ReferenceFeed(feed).decimals() returns (uint8 decimals_) { quote.feedDecimals = decimals_; }
        catch { revert FeedUnavailable(); }
        // Explicit supported scale, read from the feed rather than assumed to be eight.
        if (quote.feedDecimals > 18) revert UnsupportedFeedDecimals();
        uint256 scale = 10 ** (uint256(quote.feedDecimals) + 6); // cents -> HBAR -> tinybars
        if (invoice.usdCents > type(uint256).max / scale) revert QuoteAmountOutOfRange();
        uint256 numerator = invoice.usdCents * scale;
        uint256 denominator = uint256(quote.price);
        quote.amountTinybars = numerator / denominator;
        if (numerator % denominator != 0) ++quote.amountTinybars;
        if (quote.amountTinybars == 0 || quote.amountTinybars > MAX_TINYBARS) revert QuoteAmountOutOfRange();
        // Consensus-derived fixed windows need no trusted browser issuance timestamp.
        quote.window = block.timestamp / QUOTE_WINDOW;
        quote.deadline = (quote.window + 1) * QUOTE_WINDOW;
        if (invoice.expiresAt < quote.deadline) quote.deadline = invoice.expiresAt;
        uint256 freshUntil = quote.priceUpdatedAt + MAX_PRICE_AGE;
        if (freshUntil < quote.deadline) quote.deadline = freshUntil;
    }

    /// @notice A changed window, round, amount or deadline is a new quote, requiring new approval.
    function validateQuote(Quote calldata approved) public view returns (bool) {
        if (block.timestamp >= approved.deadline) revert QuoteExpired();
        Quote memory current = getQuote(approved.invoiceId);
        if (keccak256(abi.encode(approved)) != keccak256(abi.encode(current))) revert QuoteChanged();
        return true;
    }

    /// @dev Hedera EVM msg.value and internal native transfers use tinybars.
    /// JSON-RPC wallets transport value in weibars; conversion belongs at that boundary.
    function payInvoice(Quote calldata approved) external payable {
        if (paying) revert ReentrantPayment();
        validateQuote(approved);
        if (msg.value != approved.amountTinybars) revert IncorrectPayment();
        paying = true;
        Invoice storage invoice = invoices[approved.invoiceId];
        invoice.payer = msg.sender;
        invoice.paidTinybars = approved.amountTinybars;
        invoice.acceptedRound = approved.roundId;
        (bool delivered,) = payable(recipient).call{value: msg.value}("");
        if (!delivered) revert RecipientDeliveryFailed();
        emit InvoiceSettled(approved.invoiceId, msg.sender, approved.amountTinybars, approved.roundId);
        paying = false;
    }

}
