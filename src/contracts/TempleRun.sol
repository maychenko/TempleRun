// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract GameRunner {
    address public owner;
    uint256 public entryFee = 0.001 ether;
    uint256 public ladderPool;
    bool private _locked;
    bool public paused;

    struct Leader {
        address player;
        uint256 score;
    }

    struct PlayerProfile {
        uint256 maxScore;
        uint256 gamesPlayed;
        bool bonusClaimed100;
        bool bonusClaimed500;
        bool bonusClaimed1000;
    }

    Leader[] public leaderboard;

    mapping(address => uint256) public playerDiscountTier;
    mapping(address => PlayerProfile) public playerProfiles;

    event GameEnded(address indexed player, uint256 score, uint256 reward);
    event FeeUpdated(uint256 oldFee, uint256 newFee);
    event PoolUpdated(uint256 oldPool, uint256 newPool);
    event LadderDistributed(address[] winners, uint256[] rewards);
    event PauseToggled(bool isPaused);
    event AchievementUnlocked(address indexed player, string name, uint256 bonus);

    constructor() {
        owner = msg.sender;
        ladderPool = 0.001 ether;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier nonReentrant() {
        require(!_locked, "Reentrancy guard triggered");
        _locked = true;
        _;
        _locked = false;
    }

    modifier onlyEOA() {
        require(msg.sender == tx.origin, "No contracts allowed");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    function getEntryFeeForPlayer(address player) public view returns (uint256) {
        uint256 tier = playerDiscountTier[player];
        if (tier == 3) return (entryFee * 50) / 100;
        if (tier == 2) return (entryFee * 60) / 100;
        if (tier == 1) return (entryFee * 70) / 100;
        return entryFee;
    }

    function startGame() public payable onlyEOA whenNotPaused {
    uint256 requiredFee = getEntryFeeForPlayer(msg.sender);
    require(msg.value >= requiredFee, "Insufficent entry fee");

    ladderPool += msg.value;
    playerProfiles[msg.sender].gamesPlayed += 1;
}

    function claimReward(uint256 score) public onlyEOA whenNotPaused nonReentrant {
        uint256 reward = 0;
        PlayerProfile storage profile = playerProfiles[msg.sender];

        if (score > profile.maxScore) {
            profile.maxScore = score;
        }

        if (score >= 100 && !profile.bonusClaimed100) {
            profile.bonusClaimed100 = true;
            emit AchievementUnlocked(msg.sender, "CENTURION", 100);
        }

        if (score >= 500 && !profile.bonusClaimed500) {
            profile.bonusClaimed500 = true;
            emit AchievementUnlocked(msg.sender, "ELITE_RUNNER", 500);
        }

        if (score >= 1000 && !profile.bonusClaimed1000) {
            profile.bonusClaimed1000 = true;
            emit AchievementUnlocked(msg.sender, "IMMORTAL", 1000);
        }

        if (score > 100) {
            uint256 currentFee = getEntryFeeForPlayer(msg.sender);
            reward = currentFee * 2;
            require(address(this).balance >= reward, "Not enough funds");

            _updateLeaderboard(msg.sender, score);

            (bool success, ) = payable(msg.sender).call{value: reward}("");
            require(success, "Transfer failed");
        } else {
            _updateLeaderboard(msg.sender, score);
        }

        emit GameEnded(msg.sender, score, reward);
    }



    function _updateLeaderboard(address player, uint256 score) internal {
        bool exists = false;
        uint256 userIndex;

        for (uint256 i = 0; i < leaderboard.length; i++) {
            if (leaderboard[i].player == player) {
                exists = true;
                userIndex = i;
                break;
            }
        }

        if (exists) {
            if (score > leaderboard[userIndex].score) {
                leaderboard[userIndex].score = score;
            }
        } else {
            leaderboard.push(Leader(player, score));
        }

        uint256 length = leaderboard.length;
        for (uint256 i = 1; i < length; i++) {
            Leader memory key = leaderboard[i];
            int256 j = int256(i) - 1;

            while (j >= 0 && leaderboard[uint256(j)].score < key.score) {
                leaderboard[uint256(j) + 1] = leaderboard[uint256(j)];
                j--;
            }
            leaderboard[uint256(j) + 1] = key;
        }

        while (leaderboard.length > 1) {
            leaderboard.pop();
        }
    }

   function distributeLadderPool() public onlyOwner nonReentrant {
    uint256 length = leaderboard.length;
    require(length > 0, "No players");

    uint256 poolToDistribute = address(this).balance;

    address[] memory winners = new address[](1);
    uint256[] memory rewards = new uint256[](1);

    address champion = leaderboard[0].player;
    playerDiscountTier[champion] = 3;

    winners[0] = champion;
    rewards[0] = poolToDistribute;

    if (poolToDistribute > 0) {
        _sendValue(winners[0], rewards[0]);
    }

    emit LadderDistributed(winners, rewards);

    ladderPool = 0;
    delete leaderboard;
}

    function _sendValue(address to, uint256 value) internal {
        (bool success, ) = payable(to).call{value: value}("");
        require(success, "Transfer failed");
    }

    function getPlayerProfile(address player) public view returns (
        uint256 maxScore,
        uint256 gamesPlayed,
        bool b100,
        bool b500,
        bool b1000
    ) {
        PlayerProfile memory profile = playerProfiles[player];
        return (profile.maxScore, profile.gamesPlayed, profile.bonusClaimed100, profile.bonusClaimed500, profile.bonusClaimed1000);
    }

    function togglePause() public onlyOwner {
        paused = !paused;
        emit PauseToggled(paused);
    }

    function setEntryFee(uint256 _newFee) public onlyOwner {
        emit FeeUpdated(entryFee, _newFee);
        entryFee = _newFee;
    }

    function setLadderPool(uint256 _newPool) public onlyOwner payable {
    uint256 finalPoolValue = msg.value > 0 ? msg.value : _newPool;

    emit PoolUpdated(ladderPool, finalPoolValue);
    ladderPool = finalPoolValue;
}

    function getLeaderboard() public view returns (Leader[] memory) {
        return leaderboard;
    }

    function getContractBalance() public view returns (uint256) {
        return address(this).balance;
    }

    function withdraw() public onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        require(balance > 0, "Empty balance");
        _sendValue(owner, balance);
    }

    receive() external payable {
        revert("Direct deposits disabled");
    }

}
