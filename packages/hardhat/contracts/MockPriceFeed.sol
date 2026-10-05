// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Local test double only; never a deployment feed.
contract MockPriceFeed {
    uint8 private decimalPlaces = 8;
    uint80 public roundId = 1;
    int256 public answer = 10000000;
    uint256 public startedAt;
    uint256 public updatedAt;
    uint80 public answeredInRound = 1;
    bool public failRead;
    bool public failDecimals;

    function setRound(uint80 round, int256 price, uint256 started, uint256 updated, uint80 answered) external {
        roundId = round; answer = price; startedAt = started; updatedAt = updated; answeredInRound = answered;
    }
    function setDecimals(uint8 value) external { decimalPlaces = value; }
    function setFailures(bool readFailure, bool decimalFailure) external { failRead = readFailure; failDecimals = decimalFailure; }
    function decimals() external view returns (uint8) { require(!failDecimals, "decimals unavailable"); return decimalPlaces; }
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        require(!failRead, "feed unavailable");
        return (roundId, answer, startedAt, updatedAt, answeredInRound);
    }
}
