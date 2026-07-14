// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract GameRunner {
    address public owner;
    uint256 public entryFee = 0.001 ether;

    event GameEnded(address indexed player, uint256 score, uint256 reward);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    function startGame() public payable {
        require(msg.value == entryFee, "Wrong entry fee");
    }

    function claimReward(uint256 score) public {
        uint256 reward = 0;
        if (score > 10) {
            reward = entryFee * 2;
            require(address(this).balance >= reward, "Not enough funds in contract");
            (bool success, ) = payable(msg.sender).call{value: reward}("");
            require(success, "Transfer failed");
        }
        emit GameEnded(msg.sender, score, reward);
    }

    receive() external payable {}

    function getContractBalance() public view returns (uint256) {
        return address(this).balance;
    }

    function withdraw() public onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No money");

        (bool success, ) = payable(owner).call{value: balance}("");
        require(success, "Transfer failed");
    }
}