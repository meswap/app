// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {
    Math
} from "@openzeppelin/contracts/utils/math/Math.sol";

contract ME is ERC20, Ownable, ReentrancyGuard {

    // =============================================================
    //                      TOKENOMICS
    // =============================================================

    uint256 public constant TOTAL_SUPPLY =
        100_000_000_000 ether;

    // Virtual initial MON anchor.
    // This is mathematical only.
    // Deployer does NOT deposit this amount.
    uint256 public constant BASE_MON =
        100_000 ether;

    // K = BASE_MON * TOTAL_SUPPLY
    //
    // Curve invariant:
    //
    //     virtualReserve * remainingME ~= K
    //
    uint256 public constant CURVE_K =
        BASE_MON * TOTAL_SUPPLY;

    // Actual MON deposited by buyers,
    // minus MON already paid to sellers.
    uint256 public reserveMON;

    // Used only during the internal sell transfer.
    //
    // sellME() is nonReentrant, so this temporary
    // authorization cannot be externally nested.
    bool private _inSell;


    // =============================================================
    //                           EVENTS
    // =============================================================

    event Buy(
        address indexed buyer,
        uint256 monIn,
        uint256 meOut,
        uint256 reserveAfter,
        uint256 remainingMEAfter
    );

    event Sell(
        address indexed seller,
        uint256 meIn,
        uint256 monOut,
        uint256 reserveAfter,
        uint256 remainingMEAfter
    );

    event SurplusRescued(
        address indexed to,
        uint256 amount
    );


    // =============================================================
    //                           ERRORS
    // =============================================================

    error ZeroAmount();
    error NoMEAvailable();
    error AmountTooSmall();
    error InsufficientME();
    error InsufficientReserve();
    error InsufficientMON();
    error DirectMONNotAllowed();
    error DirectMEToContractNotAllowed();
    error MONTransferFailed();
    error InvalidState();
    error SlippageExceeded();
    error DeadlineExpired();
    error NothingToRescue();
    error ZeroAddress();


    // =============================================================
    //                        CONSTRUCTOR
    // =============================================================

    constructor()
        ERC20("ME", "ME")
        Ownable(msg.sender)
    {
        // Entire fixed supply starts inside the curve.
        //
        // No MON is required from deployer.
        _mint(address(this), TOTAL_SUPPLY);
    }


    // =============================================================
    //                      ERC20 CONFIG
    // =============================================================

    function decimals()
        public
        pure
        override
        returns (uint8)
    {
        return 18;
    }


    // =============================================================
    //                    CURVE STATE VIEWS
    // =============================================================

    /// @notice ME still held by the bonding curve.
    function remainingME()
        public
        view
        returns (uint256)
    {
        return balanceOf(address(this));
    }

    /// @notice ME currently circulating outside the curve.
    function circulatingME()
        public
        view
        returns (uint256)
    {
        return TOTAL_SUPPLY - remainingME();
    }

    /// @notice Mathematical MON reserve including the
    ///         100,000 MON virtual anchor.
    function virtualReserveMON()
        public
        view
        returns (uint256)
    {
        return BASE_MON + reserveMON;
    }

    /// @notice Actual native MON held by this contract.
    function actualMON()
        public
        view
        returns (uint256)
    {
        return address(this).balance;
    }

    /// @notice Native MON forced into the contract outside
    ///         the bonding curve (e.g. via selfdestruct or
    ///         block.coinbase). NOT counted by reserveMON,
    ///         and NOT usable by traders — only rescuable by
    ///         the owner via rescueSurplusMON().
    function surplusMON()
        public
        view
        returns (uint256)
    {
        uint256 balance = address(this).balance;

        if (balance <= reserveMON) {
            return 0;
        }

        return balance - reserveMON;
    }

    /// @notice Whether the actual MON balance can cover
    ///         the recorded curve reserve.
    function reserveSolvent()
        public
        view
        returns (bool)
    {
        return address(this).balance >= reserveMON;
    }

    /// @notice Current marginal price.
    ///
    /// Return value:
    /// MON per ME, scaled by 1e18.
    ///
    /// This is NOT the average execution price of a large trade.
    function currentPrice()
        public
        view
        returns (uint256)
    {
        uint256 meLeft = remainingME();

        if (meLeft == 0) {
            revert NoMEAvailable();
        }

        return Math.mulDiv(
            virtualReserveMON(),
            1 ether,
            meLeft
        );
    }


    // =============================================================
    //                      CURVE MATH
    // =============================================================

    /// @dev Calculates remaining ME after increasing
    ///      virtual MON reserve.
    ///
    ///      Uses CEIL rounding to avoid giving away
    ///      excess ME because of integer truncation.
    function _remainingForReserve(
        uint256 newVirtualReserve
    )
        internal
        pure
        returns (uint256)
    {
        return Math.mulDiv(
            CURVE_K,
            1,
            newVirtualReserve,
            Math.Rounding.Ceil
        );
    }

    /// @dev Calculates virtual reserve required for
    ///      a given remaining ME amount.
    ///
    ///      Uses CEIL rounding.
    function _reserveForRemainingME(
        uint256 meLeft
    )
        internal
        pure
        returns (uint256)
    {
        return Math.mulDiv(
            CURVE_K,
            1,
            meLeft,
            Math.Rounding.Ceil
        );
    }


    // =============================================================
    //                    SHARED QUOTE LOGIC
    // =============================================================
    //
    // Both the public quote*() views AND the state-changing
    // buyME()/sellME() call these same internal helpers, so the
    // math can never drift out of sync between "preview" and
    // "execute" paths.

    function _computeBuy(
        uint256 monIn
    )
        internal
        view
        returns (
            uint256 meOut,
            uint256 meLeft
        )
    {
        if (monIn == 0) {
            revert ZeroAmount();
        }

        meLeft = remainingME();

        if (meLeft == 0) {
            revert NoMEAvailable();
        }

        uint256 oldVirtualReserve =
            virtualReserveMON();

        uint256 newVirtualReserve =
            oldVirtualReserve + monIn;

        uint256 newRemainingME =
            _remainingForReserve(
                newVirtualReserve
            );

        if (newRemainingME >= meLeft) {
            revert AmountTooSmall();
        }

        meOut = meLeft - newRemainingME;

        if (meOut == 0) {
            revert AmountTooSmall();
        }
    }

    function _computeSell(
        address seller,
        uint256 meIn
    )
        internal
        view
        returns (uint256 monOut)
    {
        if (seller == address(0)) {
            revert InvalidState();
        }

        if (meIn == 0) {
            revert ZeroAmount();
        }

        if (balanceOf(seller) < meIn) {
            revert InsufficientME();
        }

        uint256 meLeft = remainingME();

        uint256 newRemainingME =
            meLeft + meIn;

        uint256 oldVirtualReserve =
            virtualReserveMON();

        uint256 newVirtualReserve =
            _reserveForRemainingME(
                newRemainingME
            );

        if (
            oldVirtualReserve <=
            newVirtualReserve
        ) {
            revert AmountTooSmall();
        }

        monOut =
            oldVirtualReserve -
            newVirtualReserve;

        if (monOut == 0) {
            revert AmountTooSmall();
        }

        if (monOut > reserveMON) {
            revert InsufficientReserve();
        }

        if (monOut > address(this).balance) {
            revert InsufficientMON();
        }
    }


    // =============================================================
    //                         BUY QUOTE
    // =============================================================

    function quoteBuy(
        uint256 monIn
    )
        external
        view
        returns (uint256 meOut)
    {
        (meOut, ) = _computeBuy(monIn);
    }


    // =============================================================
    //                            BUY
    // =============================================================

    /// @param minMeOut Minimum ME the caller will accept.
    ///        Protects against price movement / sandwich attacks
    ///        between signing and execution. Compute off-chain via
    ///        quoteBuy() and subtract your slippage tolerance.
    /// @param deadline  Unix timestamp after which the tx reverts
    ///        instead of executing at a stale, unintended price.
    function buyME(
        uint256 minMeOut,
        uint256 deadline
    )
        external
        payable
        nonReentrant
        returns (uint256 meOut)
    {
        if (block.timestamp > deadline) {
            revert DeadlineExpired();
        }

        uint256 monIn = msg.value;

        (meOut, ) = _computeBuy(monIn);

        if (meOut < minMeOut) {
            revert SlippageExceeded();
        }

        // EFFECTS
        reserveMON += monIn;

        // TRANSFER ME FROM CURVE TO BUYER
        _transfer(
            address(this),
            msg.sender,
            meOut
        );

        _checkCurveState();

        emit Buy(
            msg.sender,
            monIn,
            meOut,
            reserveMON,
            remainingME()
        );
    }


    // =============================================================
    //                         SELL QUOTE
    // =============================================================

    function quoteSell(
        uint256 meIn
    )
        external
        view
        returns (uint256 monOut)
    {
        return _computeSell(
            msg.sender,
            meIn
        );
    }

    /// @notice Quote a sell for an arbitrary holder (e.g. for a
    ///         frontend checking on behalf of a connected wallet
    ///         that differs from msg.sender in a simulated call).
    function quoteSellFor(
        address seller,
        uint256 meIn
    )
        external
        view
        returns (uint256 monOut)
    {
        return _computeSell(
            seller,
            meIn
        );
    }


    // =============================================================
    //                    INTERNAL SELL TRANSFER
    // =============================================================

    function _transferForSell(
        address seller,
        uint256 meIn
    )
        internal
    {
        _inSell = true;

        _transfer(
            seller,
            address(this),
            meIn
        );

        _inSell = false;
    }


    // =============================================================
    //                            SELL
    // =============================================================

    /// @param minMonOut Minimum MON the caller will accept.
    ///        Protects against price movement / sandwich attacks
    ///        between signing and execution. Compute off-chain via
    ///        quoteSell() and subtract your slippage tolerance.
    /// @param deadline  Unix timestamp after which the tx reverts
    ///        instead of executing at a stale, unintended price.
    function sellME(
        uint256 meIn,
        uint256 minMonOut,
        uint256 deadline
    )
        external
        nonReentrant
        returns (uint256 monOut)
    {
        if (block.timestamp > deadline) {
            revert DeadlineExpired();
        }

        monOut = _computeSell(
            msg.sender,
            meIn
        );

        if (monOut < minMonOut) {
            revert SlippageExceeded();
        }

        // EFFECTS:
        // Return ME to the curve.
        _transferForSell(
            msg.sender,
            meIn
        );

        // Reduce only actual reserve.
        reserveMON -= monOut;

        // Run invariant checks BEFORE the external call so that
        // any inconsistency reverts prior to sending value out.
        _checkCurveState();

        // INTERACTION:
        // Pay seller with actual accumulated MON.
        (bool success, ) =
            payable(msg.sender).call{
                value: monOut
            }("");

        if (!success) {
            revert MONTransferFailed();
        }

        emit Sell(
            msg.sender,
            meIn,
            monOut,
            reserveMON,
            remainingME()
        );
    }


    // =============================================================
    //                    CURVE STATE CHECK
    // =============================================================

    /// @dev Internal sanity checks.
    ///
    /// These do not modify economics.
    ///
    /// Main requirements:
    /// - remaining ME never exceeds total supply
    /// - actual MON must cover recorded reserve
    /// - reserve cannot be negative (uint256)
    function _checkCurveState()
        internal
        view
    {
        uint256 meLeft = remainingME();

        if (meLeft > TOTAL_SUPPLY) {
            revert InvalidState();
        }

        if (address(this).balance < reserveMON) {
            revert InvalidState();
        }

        uint256 virtualReserve =
            virtualReserveMON();

        // If ME remains, verify the mathematical
        // curve values remain within the expected domain.
        if (meLeft > 0) {
            uint256 requiredReserve =
                _reserveForRemainingME(
                    meLeft
                );

            if (virtualReserve < requiredReserve) {
                revert InvalidState();
            }
        }
    }


    // =============================================================
    //                     ERC20 TRANSFER GUARD
    // =============================================================

    /// @dev Prevent arbitrary ME transfers directly
    ///      into the curve.
    ///
    /// Allowed:
    /// 1. Constructor mint.
    /// 2. Controlled transfer during sellME().
    ///
    /// This prevents someone from sending ME to the
    /// contract without simultaneously updating reserveMON.
    function _update(
        address from,
        address to,
        uint256 value
    )
        internal
        override
    {
        if (to == address(this)) {

            bool constructorMint =
                from == address(0) &&
                value == TOTAL_SUPPLY &&
                totalSupply() == 0;

            bool authorizedSell =
                from != address(0) &&
                _inSell;

            if (
                !constructorMint &&
                !authorizedSell
            ) {
                revert DirectMEToContractNotAllowed();
            }
        }

        super._update(
            from,
            to,
            value
        );
    }


    // =============================================================
    //                  DIRECT MON PROTECTION
    // =============================================================

    /// @dev Users must buy through buyME().
    receive()
        external
        payable
    {
        revert DirectMONNotAllowed();
    }

    fallback()
        external
        payable
    {
        revert DirectMONNotAllowed();
    }


    // =============================================================
    //                    OWNER MAINTENANCE
    // =============================================================
    //
    // Owner has NO control over trading, pricing, pausing, or
    // user balances. The only privileged action is recovering
    // native MON that was forced into the contract outside the
    // normal buyME() path (e.g. via selfdestruct of another
    // contract, or as a block reward if this were a miner/
    // validator address). This can NEVER touch reserveMON, so it
    // can never affect a seller's ability to redeem ME for MON.

    /// @notice Rescue MON that sits above the recorded curve
    ///         reserve. Cannot withdraw any MON owed to sellers.
    function rescueSurplusMON(
        address to
    )
        external
        onlyOwner
        nonReentrant
    {
        if (to == address(0)) {
            revert ZeroAddress();
        }

        uint256 amount = surplusMON();

        if (amount == 0) {
            revert NothingToRescue();
        }

        (bool success, ) =
            payable(to).call{
                value: amount
            }("");

        if (!success) {
            revert MONTransferFailed();
        }

        emit SurplusRescued(to, amount);
    }
}
