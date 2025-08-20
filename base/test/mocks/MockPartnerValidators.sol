// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IPartner} from "../../src/interfaces/IPartner.sol";

contract MockPartnerValidators is IPartner {
    Signer[] signers;

    function addSigner(Signer calldata s) external {
        signers.push(s);
    }

    function removeSigner() external {
        signers.pop();
    }

    function setSigner(uint256 idx, Signer calldata s) external {
        signers[idx] = s;
    }

    function getSigners() external view returns (Signer[] memory) {
        return signers;
    }
}
