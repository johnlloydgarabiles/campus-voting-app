// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title CampusVoting
/// @notice One election per deployed contract. The deployer is the Electoral Admin.
/// @dev Based on the provided voting.sol, extended with on-chain voter registration
///      (registerVoter) and an electionEnded flag so results only show after closing.
contract CampusVoting is Ownable {
    struct Candidate {
        uint256 id;
        string name;
        string position;
        uint256 voteCount;
        bool exists;
    }

    struct Registration {
        string name;
        string studentId;
        bool requested;
    }

    uint256 public candidateCount;
    uint256 public totalVotes;
    bool public electionOpen;
    bool public electionEnded;

    mapping(uint256 => Candidate) public candidates;
    mapping(address => bool) public authorizedVoters;
    mapping(address => bool) public hasVoted;

    mapping(address => Registration) private registrations;
    address[] private registrants;

    event CandidateAdded(uint256 indexed candidateId, string name);
    event VoterRegistered(address indexed voter, string name);
    event VoterAuthorized(address indexed voter);
    event VoteCast(address indexed voter, uint256 indexed candidateId);
    event ElectionStatusChanged(bool isOpen);

    constructor() Ownable(msg.sender) {
        electionOpen = false;
    }

    // ---------------------------------------------------------------- Admin

    function addCandidate(
        string calldata _name,
        string calldata _position
    ) external onlyOwner {
        require(bytes(_name).length > 0, "Candidate name is required");
        require(!electionOpen, "Cannot add candidates after election starts");
        require(!electionEnded, "Election has already ended");

        candidateCount++;

        candidates[candidateCount] = Candidate({
            id: candidateCount,
            name: _name,
            position: _position,
            voteCount: 0,
            exists: true
        });

        emit CandidateAdded(candidateCount, _name);
    }

    function authorizeVoter(address _voter) external onlyOwner {
        require(_voter != address(0), "Invalid voter address");
        require(!electionOpen, "Cannot authorize voters after election starts");
        require(!electionEnded, "Election has already ended");

        authorizedVoters[_voter] = true;

        emit VoterAuthorized(_voter);
    }

    function startElection() external onlyOwner {
        require(!electionEnded, "Election has already ended");
        require(candidateCount >= 2, "Add at least two candidates");
        require(!electionOpen, "Election is already open");

        electionOpen = true;

        emit ElectionStatusChanged(true);
    }

    function endElection() external onlyOwner {
        require(electionOpen, "Election is not open");

        electionOpen = false;
        electionEnded = true;

        emit ElectionStatusChanged(false);
    }

    // ---------------------------------------------------------------- Voter

    /// @notice A voter registers their wallet; the admin then authorizes it.
    function registerVoter(
        string calldata _name,
        string calldata _studentId
    ) external {
        require(bytes(_name).length > 0, "Name is required");
        require(bytes(_studentId).length > 0, "Student ID is required");
        require(!electionOpen && !electionEnded, "Registration is closed");
        require(!registrations[msg.sender].requested, "Already registered");

        registrations[msg.sender] = Registration(_name, _studentId, true);
        registrants.push(msg.sender);

        emit VoterRegistered(msg.sender, _name);
    }

    function vote(uint256 _candidateId) external {
        require(electionOpen, "Election is not open");
        require(authorizedVoters[msg.sender], "You are not authorized to vote");
        require(!hasVoted[msg.sender], "You have already voted");
        require(candidates[_candidateId].exists, "Invalid candidate");

        hasVoted[msg.sender] = true;
        candidates[_candidateId].voteCount++;
        totalVotes++;

        emit VoteCast(msg.sender, _candidateId);
    }

    // ---------------------------------------------------------------- Views

    function getCandidate(
        uint256 _candidateId
    ) external view returns (Candidate memory) {
        require(candidates[_candidateId].exists, "Invalid candidate");
        return candidates[_candidateId];
    }

    function getCandidateCount() external view returns (uint256) {
        return candidateCount;
    }

    function getTotalVotes() external view returns (uint256) {
        return totalVotes;
    }

    function getElectionStatus() external view returns (bool) {
        return electionOpen;
    }

    function getRegistration(
        address _voter
    )
        external
        view
        returns (string memory name, string memory studentId, bool requested)
    {
        Registration storage r = registrations[_voter];
        return (r.name, r.studentId, r.requested);
    }

    function getRegistrantCount() external view returns (uint256) {
        return registrants.length;
    }

    function getRegistrant(
        uint256 _index
    )
        external
        view
        returns (
            address voter,
            string memory name,
            string memory studentId,
            bool authorized,
            bool voted
        )
    {
        require(_index < registrants.length, "Invalid index");
        address a = registrants[_index];
        Registration storage r = registrations[a];
        return (a, r.name, r.studentId, authorizedVoters[a], hasVoted[a]);
    }
}
