# Campus Voting dApp

A decentralized voting application built for **End MCO: The Voting dApp** and **PB-LQ3-4: Project Presentation and System Documentation**.

Voters register a wallet, get approved by the Electoral Admin, and cast **one vote per wallet**. Results are shown only after the election is closed. Everything is enforced by a Solidity smart contract on the Sepolia testnet.

## Tech stack

| Component | File | Use |
|---|---|---|
| Solidity | `contracts/CampusVoting.sol` | Candidates, voter registration and authorization, one-vote rule, vote counting, election status |
| OpenZeppelin Ownable | imported by the contract | Restricts admin-only functions |
| Remix IDE | browser | Compile, deploy, test, copy the ABI |
| MetaMask | browser extension | Wallet login, signing, gas |
| HTML / CSS / JavaScript | `frontend/` | Purple-themed interface and logic |
| Ethers.js (v5) | loaded in `index.html` | Connects the page to MetaMask and the contract |
| Contract ABI | `docs/abi.json` | Describes the contract functions to the frontend |
| Sepolia testnet | MetaMask + Remix | Free test blockchain |

## Folder structure

```
campus-voting-dapp/
├── contracts/CampusVoting.sol
├── frontend/ (index.html, style.css, app.js)
├── docs/ (deployed-contract-address.txt, abi.json, screenshots/)
└── README.md
```

## Voting rules (enforced on-chain)

1. One election per deployed contract.
2. Only the admin (the deployer) can add candidates, authorize voters, start and close the election.
3. Voters sign up with their wallet (name and student ID), then the admin authorizes it. Log in connects the same wallet.
4. Each authorized wallet can vote once, only while the election is open.
5. Candidates and voters cannot be changed once voting starts.
6. After the election is closed, the frontend shows the final tabulation.

## Setup, step by step

### 1. MetaMask and test ETH
1. Install MetaMask in Chrome, Edge or Brave.
2. Create **three accounts**: Account 1 (Electoral Admin), Account 2 and Account 3 (voters).
3. Switch MetaMask to **Sepolia** (enable "Show test networks" in settings).
4. Get free Sepolia ETH for all three accounts from a Sepolia faucet.

### 2. Deploy the contract in Remix
1. Open https://remix.ethereum.org and create `contracts/CampusVoting.sol`. Paste the contract.
2. Compiler tab: pick Solidity `0.8.24` or newer, click **Compile**.
3. Deploy tab: Environment = **Injected Provider - MetaMask**. Make sure Account 1 is selected and the network is Sepolia.
4. Click **Deploy** and confirm in MetaMask.
5. Copy the deployed contract address and save it in `docs/deployed-contract-address.txt`.

### 3. Copy the ABI
1. In the Remix Solidity compiler tab, click the **ABI** copy button.
2. Save it as `docs/abi.json`. (A matching ABI is already included. Replace it with the Remix copy if the contract changes.)

### 4. Connect the frontend
1. Open `frontend/app.js`.
2. Replace `PASTE_DEPLOYED_CONTRACT_ADDRESS_HERE` with your address.

### 5. Run the frontend
1. Open the `frontend` folder in VS Code and install the **Live Server** extension.
2. Right-click `index.html` and choose **Open with Live Server**.
3. Open the page in a browser that has MetaMask.

## Test the full workflow (use 3 MetaMask accounts)

**Electoral Admin (Account 1)**
1. Click **Admin log in** and connect Account 1.
2. Add Candidate 1: Juan Dela Cruz, Student Council President.
3. Add Candidate 2: Maria Santos, Student Council President.

**Voter registration (Accounts 2 and 3)**
4. Click **Logout**, switch MetaMask to Account 2, open the **Sign up** tab, enter name and student ID, click **Sign up**. You are logged in automatically.
5. Click **Logout**, switch to Account 3, and sign up the same way.

**Approval and start (Account 1)**
6. **Logout**, switch to Account 1, and use **Admin log in** again. Under **Voter approvals**, click **Approve** for Account 2 and Account 3.
7. Click **Start election**.

**Voting**
8. **Logout**, switch to Account 2, open the **Log in** tab, click **Log in**, and vote for Candidate 1.
9. **Logout**, switch to Account 3, **Log in**, and vote for Candidate 2.
10. Account 2 again: no vote buttons are shown. Voting a second time also fails on-chain.

**Close and verify**
11. **Logout**, then **Admin log in** with Account 1 and click **Close election**.
12. Check that the counts and total votes are correct on the admin page and on a voter page.

## Screenshots to submit (save in `docs/screenshots/`)

Voter side:
- `01-voter-login.png`, `02-voter-signup.png`, `03-voter-pending-approval.png`
- `04-candidates-and-voting.png`, `05-vote-confirmed.png`, `06-second-vote-blocked.png`
- `07-results-after-close.png`, `07b-logout.png`

Electoral Admin side:
- `08-admin-login.png`, `09-add-candidates.png`, `10-authorize-voters.png`
- `11-start-election.png`, `12-close-election.png`, `13-admin-results.png`

## Submit to GitHub

```bash
git init
git add .
git commit -m "Campus Voting dApp"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

## Team contributions

| Member | Area of contribution |
|---|---|
| (JL Garabiles) | Smart contract | Deployment
| (Krizelle Alagadan) | Voter pages |
| (Jamaica Sindon) | Electoral Admin pages |
| (JL Garabiles) | Documentation and presentation |

## Notes

- The admin is whichever wallet deploys the contract.
- Deploying a new contract creates a new election with a new address. Update `app.js` each time.
- Never use a wallet that holds real funds. Use test accounts only.
