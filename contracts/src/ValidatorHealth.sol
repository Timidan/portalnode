// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// Validator health on Portaldot, written each era by a PortalNode keeper and readable by any contract.
contract ValidatorHealth {
    struct Status {
        uint32 era; // active era when reported
        uint32 paidThrough; // last era whose payouts are all claimed; type(uint32).max = none yet
        bool online; // authored a block or sent a heartbeat this session
        uint64 reportedAt; // block timestamp, seconds
    }

    address public immutable reporter;
    mapping(bytes32 => Status) public statusOf; // keyed by the stash's 32-byte public key

    event Reported(bytes32 indexed stash, uint32 era, uint32 paidThrough, bool online);

    error NotReporter();
    error LengthMismatch();

    constructor() {
        reporter = msg.sender;
    }

    function report(bytes32[] calldata stashes, uint32 era, uint32[] calldata paidThrough, bool[] calldata online)
        external
    {
        if (msg.sender != reporter) revert NotReporter();
        if (stashes.length != paidThrough.length || stashes.length != online.length) revert LengthMismatch();
        for (uint256 i; i < stashes.length; i++) {
            statusOf[stashes[i]] = Status(era, paidThrough[i], online[i], uint64(block.timestamp));
            emit Reported(stashes[i], era, paidThrough[i], online[i]);
        }
    }

    /// True when the stash was reported online in `era` or later and is paid through at least `minPaidThrough`.
    function isHealthy(bytes32 stash, uint32 era, uint32 minPaidThrough) external view returns (bool) {
        Status memory s = statusOf[stash];
        return s.era >= era && s.online && s.paidThrough != type(uint32).max && s.paidThrough >= minPaidThrough;
    }
}
