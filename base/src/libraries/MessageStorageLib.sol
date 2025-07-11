// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Storage layout used by this library.
///
/// @custom:storage-location erc7201:coinbase.storage.MessageStorageLib
///
/// @custom:field messages Mapping of registered message hashes.
/// @custom:field lastOutgoingNonce The last outgoing message's nonce.
/// @custom:field nodes All nodes (leaves and internal) in the MMR.
struct MessageStorageLibStorage {
    uint64 lastOutgoingNonce;
    bytes32 root;
    bytes32[] nodes;
}

/// @notice Struct representing a message to the Solana bridge.
///
/// @custom:field nonce Unique nonce for the message.
/// @custom:field sender Sender address.
/// @custom:field data Message data to be passed to the Solana bridge.
struct Message {
    uint64 nonce;
    address sender;
    bytes data;
}

library MessageStorageLib {
    //////////////////////////////////////////////////////////////
    ///                       Events                           ///
    //////////////////////////////////////////////////////////////

    /// @notice Emitted when a message is registered.
    ///
    /// @param messageHash The message's hash.
    /// @param mmrRoot The root of the MMR after the message is registered.
    /// @param message The message.
    event MessageRegistered(bytes32 indexed messageHash, bytes32 indexed mmrRoot, Message message);

    //////////////////////////////////////////////////////////////
    ///                       Errors                           ///
    //////////////////////////////////////////////////////////////

    /// @notice Thrown when failing to locate a leaf in the MMR structure
    error LeafNotFound();

    /// @notice Thrown when trying to generate a proof for an empty MMR
    error EmptyMMR();

    /// @notice Thrown when the leaf index is out of bounds
    error LeafIndexOutOfBounds();

    /// @notice Thrown when a sibling node index is out of bounds
    error SiblingNodeOutOfBounds();

    //////////////////////////////////////////////////////////////
    ///                       Constants                        ///
    //////////////////////////////////////////////////////////////

    /// @dev Slot for the `MessageStorageLibStorage` struct in storage.
    ///      Computed from:
    ///         keccak256(abi.encode(uint256(keccak256("coinbase.storage.MessageStorageLib")) - 1)) &
    ///         ~bytes32(uint256(0xff))
    ///
    ///      Follows ERC-7201 (see https://eips.ethereum.org/EIPS/eip-7201).
    bytes32 private constant _MESSAGE_STORAGE_LIB_STORAGE_LOCATION =
        0x4f00c1a67879b7469d7dd58849b9cbcdedefec3f3b862c2933a36197db136100;

    /// @notice Maximum number of peaks possible in the MMR
    uint256 private constant _MAX_PEAKS = 64;

    //////////////////////////////////////////////////////////////
    ///                       Internal Functions               ///
    //////////////////////////////////////////////////////////////

    /// @notice Helper function to get a storage reference to the `MessageStorageLibStorage` struct.
    ///
    /// @return $ A storage reference to the `MessageStorageLibStorage` struct.
    function getMessageStorageLibStorage() internal pure returns (MessageStorageLibStorage storage $) {
        assembly ("memory-safe") {
            $.slot := _MESSAGE_STORAGE_LIB_STORAGE_LOCATION
        }
    }

    /// @notice Generates a Merkle proof for a specific leaf in the MMR.
    ///
    /// @dev This function may consume significant gas for large MMRs (O(log N) storage reads).
    ///
    /// @param leafIndex The 0-indexed position of the leaf to prove.
    ///
    /// @return proof Array of sibling hashes for the proof.
    /// @return totalLeafCount The total number of leaves when proof was generated.
    function generateProof(uint64 leafIndex) internal view returns (bytes32[] memory proof, uint64 totalLeafCount) {
        MessageStorageLibStorage storage $ = getMessageStorageLibStorage();

        if ($.lastOutgoingNonce == 0) {
            revert EmptyMMR();
        }

        if (leafIndex >= $.lastOutgoingNonce) {
            revert LeafIndexOutOfBounds();
        }

        // Use optimized single-pass algorithm
        (uint256 leafNodePos, uint256 mountainHeight, uint64 leafIdxInMountain, bytes32[] memory otherPeaks) =
            _generateProofData(leafIndex);

        // Generate intra-mountain proof directly
        bytes32[] memory intraMountainProof = new bytes32[](mountainHeight);
        uint256 currentPathNodePos = leafNodePos;

        for (uint256 hClimb = 0; hClimb < mountainHeight; hClimb++) {
            bool isRightChildInSubtree = (leafIdxInMountain >> hClimb) & 1 == 1;

            uint256 siblingNodePos;
            uint256 parentNodePos;

            if (isRightChildInSubtree) {
                parentNodePos = currentPathNodePos + 1;
                siblingNodePos = parentNodePos - (1 << (hClimb + 1));
            } else {
                parentNodePos = currentPathNodePos + (1 << (hClimb + 1));
                siblingNodePos = parentNodePos - 1;
            }

            if (siblingNodePos >= $.nodes.length) {
                revert SiblingNodeOutOfBounds();
            }

            intraMountainProof[hClimb] = $.nodes[siblingNodePos];
            currentPathNodePos = parentNodePos;
        }

        // Combine proof elements
        proof = new bytes32[](intraMountainProof.length + otherPeaks.length);
        uint256 proofIndex = 0;

        for (uint256 i = 0; i < intraMountainProof.length; i++) {
            proof[proofIndex++] = intraMountainProof[i];
        }

        for (uint256 i = 0; i < otherPeaks.length; i++) {
            proof[proofIndex++] = otherPeaks[i];
        }

        totalLeafCount = $.lastOutgoingNonce;
    }

    /// @notice Sends a message to the Solana bridge.
    ///
    /// @param sender The message's sender address.
    /// @param data Message data to be passed to the Solana bridge.
    function sendMessage(address sender, bytes memory data) internal {
        MessageStorageLibStorage storage $ = getMessageStorageLibStorage();

        Message memory message = Message({nonce: $.lastOutgoingNonce, sender: sender, data: data});
        bytes32 messageHash = _hashMessage(message);
        bytes32 mmrRoot = _appendLeafToMMR({leafHash: messageHash, originalLeafCount: $.lastOutgoingNonce});

        unchecked {
            ++$.lastOutgoingNonce;
        }

        emit MessageRegistered({messageHash: messageHash, mmrRoot: mmrRoot, message: message});
    }

    //////////////////////////////////////////////////////////////
    ///                     Private Functions                  ///
    //////////////////////////////////////////////////////////////

    /// @notice Computes the hash of a message.
    ///
    /// @param message The message to hash.
    ///
    /// @return The keccak256 hash of the encoded message.
    function _hashMessage(Message memory message) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(message.nonce, message.sender, message.data));
    }

    /// @notice Appends a new leaf to the MMR.
    ///
    /// @param leafHash The hash of the leaf to append.
    /// @param originalLeafCount The amount of MMR leaves before the append.
    ///
    /// @return newRoot The new root of the MMR after the append is complete.
    function _appendLeafToMMR(bytes32 leafHash, uint64 originalLeafCount) private returns (bytes32) {
        MessageStorageLibStorage storage $ = getMessageStorageLibStorage();

        // Add the leaf to the nodes array
        $.nodes.push(leafHash);

        // The MMR position of the leaf we just added
        uint256 newLeafNodeIndex = $.nodes.length - 1;

        // Form parent nodes by merging when possible
        _createParentNodes(newLeafNodeIndex, originalLeafCount);

        // Update and return the new root
        bytes32 newRoot = _calculateRoot(originalLeafCount + 1);
        $.root = newRoot;
        return newRoot;
    }

    /// @notice Creates parent nodes by merging when the binary representation allows it.
    ///
    /// @param leafNodeIndex The index of the newly added leaf node.
    /// @param originalLeafCount The original leaf count before adding the new leaf.
    function _createParentNodes(uint256 leafNodeIndex, uint64 originalLeafCount) private {
        MessageStorageLibStorage storage $ = getMessageStorageLibStorage();

        uint256 currentNodeIndex = leafNodeIndex;
        uint256 currentHeight = 0;

        // Loop to create parent nodes when merging is possible
        while (_shouldMergeAtHeight(originalLeafCount, currentHeight)) {
            uint256 leftSiblingIndex = _calculateLeftSiblingIndex(currentNodeIndex, currentHeight);

            // Get the hashes to merge
            bytes32 leftNodeHash = $.nodes[leftSiblingIndex];
            bytes32 rightNodeHash = $.nodes[currentNodeIndex];

            // Create and store the parent node
            bytes32 parentNodeHash = _hashInternalNode(leftNodeHash, rightNodeHash);
            $.nodes.push(parentNodeHash);

            // Update for next iteration
            currentNodeIndex = $.nodes.length - 1;
            currentHeight++;
        }
    }

    /// @notice Optimized single traversal to get leaf position and other peaks.
    ///
    /// @param leafIndex The 0-indexed position of the leaf to prove.
    ///
    /// @return leafNodePos Position of the leaf in the _nodes array.
    /// @return mountainHeight Height of the mountain containing the leaf.
    /// @return leafIdxInMountain Position of leaf within its mountain.
    /// @return otherPeaks Hashes of other mountain peaks.
    function _generateProofData(uint64 leafIndex)
        private
        view
        returns (uint256 leafNodePos, uint256 mountainHeight, uint64 leafIdxInMountain, bytes32[] memory otherPeaks)
    {
        // First pass: find the leaf mountain
        (leafNodePos, mountainHeight, leafIdxInMountain) = _findLeafMountain(leafIndex);

        // Second pass: collect other peaks
        otherPeaks = _collectOtherPeaks(leafIndex);
    }

    /// @notice Finds leaf mountain with minimal local variables
    ///
    /// @param leafIndex The 0-indexed position of the leaf to prove.
    ///
    /// @return Position of the leaf in the _nodes array.
    /// @return Height of the mountain containing the leaf.
    /// @return Position of leaf within its mountain.
    function _findLeafMountain(uint64 leafIndex) private view returns (uint256, uint256, uint64) {
        MessageStorageLibStorage storage $ = getMessageStorageLibStorage();

        uint256 nodeOffset = 0;
        uint64 leafOffset = 0;
        uint256 maxHeight = _calculateMaxPossibleHeight($.lastOutgoingNonce);

        for (uint256 h = maxHeight + 1; h > 0; h--) {
            uint256 height = h - 1;

            if (($.lastOutgoingNonce >> height) & 1 == 1) {
                uint64 mountainLeaves = uint64(1 << height);

                if (leafIndex >= leafOffset && leafIndex < leafOffset + mountainLeaves) {
                    // Found the mountain
                    uint64 localLeafIdx = leafIndex - leafOffset;
                    uint256 localNodePos = 2 * uint256(localLeafIdx) - _popcount(localLeafIdx);
                    return (nodeOffset + localNodePos, height, localLeafIdx);
                }

                nodeOffset += (1 << (height + 1)) - 1;
                leafOffset += mountainLeaves;
            }
        }

        revert LeafNotFound();
    }

    /// @notice Collects other mountain peaks.
    ///
    /// @param leafIndex The 0-indexed position of the leaf to prove.
    ///
    /// @return Hashes of other mountain peaks in left-to-right order.
    function _collectOtherPeaks(uint64 leafIndex) private view returns (bytes32[] memory) {
        MessageStorageLibStorage storage $ = getMessageStorageLibStorage();

        bytes32[] memory tempPeaks = new bytes32[](_MAX_PEAKS);
        uint256 peakCount = 0;
        uint256 nodeOffset = 0;
        uint64 leafOffset = 0;
        uint256 maxHeight = _calculateMaxPossibleHeight($.lastOutgoingNonce);

        // Collect peaks in left-to-right order (largest to smallest mountain)
        for (uint256 h = maxHeight + 1; h > 0; h--) {
            uint256 height = h - 1;

            if (($.lastOutgoingNonce >> height) & 1 == 1) {
                uint64 mountainLeaves = uint64(1 << height);
                bool isLeafMountain = (leafIndex >= leafOffset && leafIndex < leafOffset + mountainLeaves);

                if (!isLeafMountain) {
                    uint256 peakPos = nodeOffset + (1 << (height + 1)) - 2;
                    tempPeaks[peakCount++] = $.nodes[peakPos];
                }

                nodeOffset += (1 << (height + 1)) - 1;
                leafOffset += mountainLeaves;
            }
        }

        // Use assembly to create exact size array without reversal
        bytes32[] memory peaks;
        assembly ("memory-safe") {
            peaks := mload(0x40)
            mstore(peaks, peakCount)
            mstore(0x40, add(peaks, add(0x20, mul(peakCount, 0x20))))
            
            // Copy elements in natural order (left-to-right)
            for { let i := 0 } lt(i, peakCount) { i := add(i, 1) } {
                let sourceIndex := add(tempPeaks, add(0x20, mul(i, 0x20)))
                let destIndex := add(peaks, add(0x20, mul(i, 0x20)))
                mstore(destIndex, mload(sourceIndex))
            }
        }
        
        return peaks;
    }

    /// @notice Calculates the current root by "bagging the peaks".
    ///
    /// @return The MMR root.
    function _calculateRoot(uint64 currentLeafCount) private view returns (bytes32) {
        MessageStorageLibStorage storage $ = getMessageStorageLibStorage();

        uint256 nodeCount = $.nodes.length;

        if (nodeCount == 0) {
            return bytes32(0);
        }

        uint256[] memory peakIndices = _getPeakNodeIndicesForLeafCount(currentLeafCount);

        if (peakIndices.length == 0) {
            return bytes32(0);
        }

        // Single peak case: return the peak directly
        if (peakIndices.length == 1) {
            return $.nodes[peakIndices[0]];
        }

        return _hashPeaksSequentially(peakIndices);
    }

    /// @notice Hashes all peaks sequentially from left to right.
    ///
    /// @param peakIndices Array of peak node indices (ordered from leftmost to rightmost).
    ///
    /// @return The final root hash after hashing all peaks.
    function _hashPeaksSequentially(uint256[] memory peakIndices) private view returns (bytes32) {
        MessageStorageLibStorage storage $ = getMessageStorageLibStorage();

        // Start with the leftmost peak (first in our left-to-right list)
        bytes32 currentRoot = $.nodes[peakIndices[0]];

        // Sequentially hash with the next peak to the right
        for (uint256 i = 1; i < peakIndices.length; i++) {
            bytes32 nextPeakHash = $.nodes[peakIndices[i]];
            currentRoot = _hashInternalNode(currentRoot, nextPeakHash);
        }

        return currentRoot;
    }

    /// @notice Gets the indices of all peak nodes in the MMR.
    ///
    /// @return The indices of the peak nodes ordered from leftmost to rightmost.
    function _getPeakNodeIndices() private view returns (uint256[] memory) {
        MessageStorageLibStorage storage $ = getMessageStorageLibStorage();
        return _getPeakNodeIndicesForLeafCount($.lastOutgoingNonce);
    }

    /// @notice Gets the indices of all peak nodes in the MMR for a specific leaf count.
    ///
    /// @param leafCount The number of leaves to calculate peaks for.
    ///
    /// @return The indices of the peak nodes ordered from leftmost to rightmost.
    function _getPeakNodeIndicesForLeafCount(uint64 leafCount) private pure returns (uint256[] memory) {
        if (leafCount == 0) {
            return new uint256[](0);
        }

        uint256[] memory tempPeakIndices = new uint256[](_MAX_PEAKS);
        uint256 peakCount = 0;
        uint256 nodeOffset = 0;

        uint256 maxHeight = _calculateMaxPossibleHeight(leafCount);

        // Process each possible height from largest to smallest (left-to-right)
        for (uint256 height = maxHeight + 1; height > 0; height--) {
            uint256 currentHeight = height - 1;
            if (_hasCompleteMountainAtHeight(leafCount, currentHeight)) {
                uint256 peakIndex = _calculatePeakIndex(nodeOffset, currentHeight);
                tempPeakIndices[peakCount] = peakIndex;
                peakCount++;

                // Update state for next iteration
                nodeOffset += _calculateMountainSize(currentHeight);
            }
        }

        // Use assembly to create exact size array without reversal
        uint256[] memory peakIndices;
        assembly ("memory-safe") {
            peakIndices := mload(0x40)
            mstore(peakIndices, peakCount)
            mstore(0x40, add(peakIndices, add(0x20, mul(peakCount, 0x20))))
            
            // Copy elements in natural order (left-to-right)
            for { let i := 0 } lt(i, peakCount) { i := add(i, 1) } {
                let sourceIndex := add(tempPeakIndices, add(0x20, mul(i, 0x20)))
                let destIndex := add(peakIndices, add(0x20, mul(i, 0x20)))
                mstore(destIndex, mload(sourceIndex))
            }
        }
        
        return peakIndices;
    }

    /// @notice Checks if nodes should be merged at the given height based on leaf count.
    ///
    /// @param leafCount The number of leaves in the MMR.
    /// @param height The height at which to check for merging.
    ///
    /// @return True if nodes should be merged at this height.
    function _shouldMergeAtHeight(uint64 leafCount, uint256 height) private pure returns (bool) {
        return (leafCount >> height) & 1 == 1;
    }

    /// @notice Calculates the index of the left sibling node
    ///
    /// @param currentNodeIndex The index of the current node
    /// @param height The height of the current level
    ///
    /// @return leftSiblingIndex The index of the left sibling node
    function _calculateLeftSiblingIndex(uint256 currentNodeIndex, uint256 height) private pure returns (uint256) {
        uint256 leftSubtreeSize = (1 << (height + 1)) - 1;
        return currentNodeIndex - leftSubtreeSize;
    }

    /// @notice Calculates the maximum possible height for the given number of leaves.
    ///
    /// @param leafCount Number of leaves in the MMR.
    ///
    /// @return The maximum possible height.
    function _calculateMaxPossibleHeight(uint64 leafCount) private pure returns (uint256) {
        if (leafCount == 0) return 0;

        uint256 maxHeight = 0;
        uint64 temp = leafCount;
        while (temp > 0) {
            maxHeight++;
            temp >>= 1;
        }
        return maxHeight > 0 ? maxHeight - 1 : 0;
    }

    /// @notice Checks if there's a complete mountain at the given height.
    ///
    /// @param leafCount Number of remaining leaves.
    /// @param height Height to check.
    ///
    /// @return True if there's a complete mountain at this height.
    function _hasCompleteMountainAtHeight(uint64 leafCount, uint256 height) private pure returns (bool) {
        return (leafCount >> height) & 1 == 1;
    }

    /// @notice Calculates the peak index for a mountain at the given height.
    ///
    /// @param nodeOffset Current offset in the nodes array.
    /// @param height Height of the mountain.
    ///
    /// @return Index of the peak node.
    function _calculatePeakIndex(uint256 nodeOffset, uint256 height) private pure returns (uint256) {
        uint256 mountainSize = _calculateMountainSize(height);
        return nodeOffset + mountainSize - 1;
    }

    /// @notice Calculates the number of nodes in a complete mountain of given height.
    ///
    /// @param height Height of the mountain.
    ///
    /// @return Number of nodes in the mountain.
    function _calculateMountainSize(uint256 height) private pure returns (uint256) {
        return (1 << (height + 1)) - 1;
    }



    /// @notice Hashes two node hashes together.
    ///
    /// @dev Uses sorted inputs for commutative hashing: H(left, right) == H(right, left).
    ///
    /// @param left The left node hash.
    /// @param right The right node hash.
    ///
    /// @return The hash of the two node hashes.
    function _hashInternalNode(bytes32 left, bytes32 right) private pure returns (bytes32) {
        if (left < right) {
            return keccak256(abi.encodePacked(left, right));
        }
        return keccak256(abi.encodePacked(right, left));
    }

    /// @notice Calculates the population count (number of 1 bits) in a uint64.
    ///
    /// @param x The number to count bits in.
    ///
    /// @return The number of 1 bits.
    function _popcount(uint64 x) private pure returns (uint256) {
        uint256 count = 0;
        while (x != 0) {
            count += x & 1;
            x >>= 1;
        }
        return count;
    }
}
