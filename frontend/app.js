"use strict";

// 1. CONFIG 

const CONTRACT_ADDRESS = "0x2e2C3Eb8D0De5d624e74e5B742a78720FF031066";
const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_HEX = "0xaa36a7";

// Human-readable ABI. IMPORTANT: getCandidate returns a struct, so it must be
// declared as a tuple. (The same ABI is saved as docs/abi.json.)
const ABI = [
  "function owner() view returns (address)",
  "function electionOpen() view returns (bool)",
  "function electionEnded() view returns (bool)",
  "function authorizedVoters(address) view returns (bool)",
  "function hasVoted(address) view returns (bool)",

  "function addCandidate(string _name, string _position)",
  "function authorizeVoter(address _voter)",
  "function startElection()",
  "function endElection()",
  "function registerVoter(string _name, string _studentId)",
  "function vote(uint256 _candidateId)",

  "function getCandidate(uint256 _candidateId) view returns (tuple(uint256 id, string name, string position, uint256 voteCount, bool exists))",
  "function getCandidateCount() view returns (uint256)",
  "function getTotalVotes() view returns (uint256)",
  "function getElectionStatus() view returns (bool)",
  "function getRegistration(address _voter) view returns (string name, string studentId, bool requested)",
  "function getRegistrantCount() view returns (uint256)",
  "function getRegistrant(uint256 _index) view returns (address voter, string name, string studentId, bool authorized, bool voted)"
];

// 2. STATE + HELPERS

let provider, signer, contract, account;
let mode = null;        // "voter" | "admin"
let isOwner = false;

const $ = (id) => document.getElementById(id);

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") el.className = value;
    else if (key === "text") el.textContent = value;
    else if (key.startsWith("on")) el.addEventListener(key.slice(2).toLowerCase(), value);
    else el.setAttribute(key, value);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid);
  return el;
}

function shortAddress(addr) {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function notice(message, type = "info") {
  const box = $("notice");
  box.textContent = message;
  box.className = "notice" + (type === "ok" ? " notice-ok" : type === "error" ? " notice-error" : "");
  box.hidden = false;
}

function clearNotice() {
  $("notice").hidden = true;
}

function errorText(err) {
  if (err && (err.code === 4001 || err.code === "ACTION_REJECTED")) {
    return "You rejected the request in MetaMask.";
  }
  let raw =
    (err && err.error && err.error.data && err.error.data.message) ||
    (err && err.error && err.error.message) ||
    (err && err.data && err.data.message) ||
    (err && err.reason) ||
    (err && err.message) ||
    "Transaction failed.";
  const match = /reverted with reason string '([^']+)'/.exec(raw);
  if (match) raw = match[1];
  raw = raw.replace(/^execution reverted:\s*/i, "");
  return raw.length > 180 ? raw.slice(0, 180) + "…" : raw;
}

// Runs a transaction, waits for it to be mined, then refreshes the page.
async function sendTx(button, pendingLabel, successMessage, call) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = pendingLabel;
  notice("Confirm the transaction in MetaMask…");
  try {
    const tx = await call();
    notice("Transaction sent. Waiting for confirmation…");
    await tx.wait();
    await refresh();
    notice(successMessage, "ok");
    return true;
  } catch (err) {
    notice(errorText(err), "error");
    return false;
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function showView(name) {
  $("viewLogin").hidden = name !== "login";
  $("viewVoter").hidden = name !== "voter";
  $("viewAdmin").hidden = name !== "admin";
}

// 3. LOGIN (wallet connection)

async function ensureSepolia() {
  const current = await window.ethereum.request({ method: "eth_chainId" });
  if (current === SEPOLIA_HEX) return;
  await window.ethereum.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: SEPOLIA_HEX }]
  });
}

// Connects MetaMask, checks the network, and builds the contract object.
async function connectWallet() {
  if (!window.ethereum) {
    notice("MetaMask was not found. Install the MetaMask extension and reload this page.", "error");
    return false;
  }
  if (CONTRACT_ADDRESS.startsWith("PASTE")) {
    notice("Contract address missing. Paste your deployed address into CONTRACT_ADDRESS in app.js.", "error");
    return false;
  }

  await window.ethereum.request({ method: "eth_requestAccounts" });

  try {
    await ensureSepolia();
  } catch (switchErr) {
    notice("Please switch MetaMask to the Sepolia test network, then try again.", "error");
    return false;
  }

  provider = new ethers.providers.Web3Provider(window.ethereum);
  signer = provider.getSigner();
  account = await signer.getAddress();
  contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

  const owner = await contract.owner();
  isOwner = owner.toLowerCase() === account.toLowerCase();
  return true;
}

async function enter(role) {
  mode = role;
  $("walletStatus").textContent = (role === "admin" ? "Admin · " : "Voter · ") + shortAddress(account);
  $("networkBadge").textContent = "Sepolia";
  $("networkBadge").className = "badge";
  $("networkBadge").hidden = false;
  $("logoutButton").hidden = false;
  showView(role);
  await refresh();
}

// LOG IN - voters must already be signed up; the admin must be the deployer.
async function login(role) {
  clearNotice();
  try {
    if (!(await connectWallet())) return;

    if (role === "admin") {
      if (!isOwner) {
        notice("This wallet is not the Electoral Admin. Switch to the account that deployed the contract.", "error");
        return;
      }
    } else {
      const [authorized, reg] = await Promise.all([
        contract.authorizedVoters(account),
        contract.getRegistration(account)
      ]);
      if (!reg.requested && !authorized) {
        notice("This wallet is not signed up yet. Open the Sign up tab first.", "error");
        showAuthTab("signup");
        return;
      }
    }
    await enter(role);
  } catch (err) {
    notice(errorText(err), "error");
  }
}

// SIGN UP - records the voter's name and student ID on-chain.
async function signUp() {
  clearNotice();
  const name = $("regName").value.trim();
  const studentId = $("regStudentId").value.trim();
  if (!name || !studentId) {
    notice("Enter your full name and student ID.", "error");
    return;
  }

  try {
    if (!(await connectWallet())) return;

    const [open, ended, reg] = await Promise.all([
      contract.getElectionStatus(),
      contract.electionEnded(),
      contract.getRegistration(account)
    ]);
    if (reg.requested) {
      notice("This wallet is already signed up. Use the Log in tab.", "error");
      showAuthTab("login");
      return;
    }
    if (open || ended) {
      notice("Sign up is closed because the election has already started.", "error");
      return;
    }
  } catch (err) {
    notice(errorText(err), "error");
    return;
  }

  const ok = await sendTx($("signUpButton"), "Signing up…", "Signed up. You are now logged in. Wait for the Electoral Admin to approve your wallet.",
    () => contract.registerVoter(name, studentId));
  if (ok) {
    $("regName").value = "";
    $("regStudentId").value = "";
    await enter("voter");
    notice("Signed up. You are now logged in. Wait for the Electoral Admin to approve your wallet.", "ok");
  }
}

function showAuthTab(which) {
  const signup = which === "signup";
  $("loginPane").hidden = signup;
  $("signupPane").hidden = !signup;
  $("tabLogin").classList.toggle("tab-active", !signup);
  $("tabSignup").classList.toggle("tab-active", signup);
  $("tabLogin").setAttribute("aria-selected", String(!signup));
  $("tabSignup").setAttribute("aria-selected", String(signup));
}

function logout() {
  mode = null;
  contract = signer = provider = account = undefined;
  isOwner = false;
  $("walletStatus").textContent = "Wallet not connected";
  $("networkBadge").hidden = true;
  $("logoutButton").hidden = true;
  clearNotice();
  showAuthTab("login");
  showView("login");
}

// 4. LOAD DATA FROM THE CONTRACT + RENDER

async function loadCandidates(count) {
  const ids = [];
  for (let i = 1; i <= count; i++) ids.push(i);
  const list = await Promise.all(ids.map((id) => contract.getCandidate(id)));
  return list.map((c) => ({
    id: c.id.toNumber(),
    name: c.name,
    position: c.position,
    votes: c.voteCount.toNumber()
  }));
}

async function refresh() {
  if (!contract) return;

  const [open, ended, countBN, totalBN] = await Promise.all([
    contract.getElectionStatus(),
    contract.electionEnded(),
    contract.getCandidateCount(),
    contract.getTotalVotes()
  ]);

  const phase = ended ? "ended" : open ? "open" : "setup";
  const candidates = await loadCandidates(countBN.toNumber());
  const data = { phase, candidates, totalVotes: totalBN.toNumber() };

  if (mode === "voter") await renderVoter(data);
  if (mode === "admin") await renderAdmin(data);
}

function renderPhase(el, phase) {
  el.className = "phase" + (phase === "open" ? " phase-open" : phase === "ended" ? " phase-ended" : "");
  el.textContent =
    phase === "setup"
      ? "Voting has not started yet. Registration and candidate setup are in progress."
      : phase === "open"
      ? "Voting is open."
      : "Voting is closed. Final results are below.";
}

// Candidate rows. canVote adds a vote button; showCounts adds result bars.
function renderCandidateList(container, candidates, { canVote }) {
  container.replaceChildren();
  if (candidates.length === 0) {
    container.append(h("p", { class: "empty", text: "No candidates have been added yet." }));
    return;
  }
  for (const c of candidates) {
    const row = h(
      "div",
      { class: "ballot-row" },
      h("div", { class: "ballot-info" },
        h("div", { class: "ballot-name", text: c.name }),
        h("div", { class: "ballot-position", text: c.position || "No position listed" })
      )
    );
    if (canVote) {
      const button = h("button", { class: "vote-bubble", text: "Vote" });
      button.addEventListener("click", () => castVote(button, c));
      row.append(button);
    }
    container.append(row);
  }
}

function renderResults(container, candidates, totalVotes) {
  container.replaceChildren();
  if (candidates.length === 0) {
    container.append(h("p", { class: "empty", text: "No candidates were added." }));
    return;
  }
  const sorted = [...candidates].sort((a, b) => b.votes - a.votes);
  const top = sorted[0].votes;
  const leaders = sorted.filter((c) => c.votes === top && top > 0).length;

  container.append(h("p", { class: "muted", text: "Total votes cast: " + totalVotes }));

  for (const c of sorted) {
    const pct = totalVotes > 0 ? Math.round((c.votes / totalVotes) * 100) : 0;
    const isLeader = top > 0 && c.votes === top;
    const name = h("span", { class: "result-name", text: c.name + (c.position ? " · " + c.position : "") });
    if (isLeader) name.append(h("span", { class: "tag", text: leaders > 1 ? "Tie" : "Winner" }));

    container.append(
      h("div", { class: "result-row" },
        h("div", { class: "result-head" },
          name,
          h("span", { class: "result-count", text: c.votes + (c.votes === 1 ? " vote" : " votes") + " (" + pct + "%)" })
        ),
        h("div", { class: "bar-track" },
          h("div", { class: "bar-fill" + (isLeader ? " bar-fill-win" : ""), style: "width:" + pct + "%" })
        )
      )
    );
  }
}

//  voter
async function renderVoter({ phase, candidates, totalVotes }) {
  renderPhase($("phaseBannerVoter"), phase);

  const [authorized, voted, reg] = await Promise.all([
    contract.authorizedVoters(account),
    contract.hasVoted(account),
    contract.getRegistration(account)
  ]);
  const registered = reg.requested;

  const status = $("voterStatus");

  if (voted) {
    status.textContent = "You have voted. Thank you for taking part.";
  } else if (authorized) {
    status.textContent =
      phase === "open"
        ? "You are approved to vote. Choose one candidate below."
        : phase === "setup"
        ? "You are approved to vote. Voting has not opened yet."
        : "You were approved, but the election is now closed.";
  } else if (registered) {
    status.textContent = "Registered as " + reg.name + " (" + reg.studentId + "). Waiting for the Electoral Admin to approve your wallet.";
  } else {
    status.textContent = "This wallet is not approved, so you cannot vote in this election.";
  }

  const canVote = phase === "open" && authorized && !voted;
  $("ballotHint").textContent = canVote
    ? "You can vote for one candidate. This cannot be changed."
    : phase === "ended"
    ? "Voting has ended."
    : "Candidates are listed here. The vote buttons appear once you are approved and voting is open.";
  renderCandidateList($("ballotList"), candidates, { canVote });

  const resultsBox = $("voterResults");
  if (phase === "ended") {
    renderResults(resultsBox, candidates, totalVotes);
  } else {
    resultsBox.replaceChildren(h("p", { class: "empty", text: "Results will appear here after the Electoral Admin closes the election." }));
  }
}

async function castVote(button, candidate) {
  await sendTx(button, "Sending…", "Your vote for " + candidate.name + " was recorded.",
    () => contract.vote(candidate.id));
}

//  admin
async function renderAdmin({ phase, candidates, totalVotes }) {
  renderPhase($("phaseBannerAdmin"), phase);

  const regCount = (await contract.getRegistrantCount()).toNumber();
  $("statCandidates").textContent = candidates.length;
  $("statRegistered").textContent = regCount;
  $("statVotes").textContent = totalVotes;

  $("startElectionButton").disabled = !(phase === "setup" && candidates.length >= 2);
  $("endElectionButton").disabled = phase !== "open";
  $("controlHint").textContent =
    phase === "setup"
      ? candidates.length < 2
        ? "Add at least two candidates before starting the election."
        : "Everything is ready. Start the election when voters have been approved."
      : phase === "open"
      ? "Voting is open. Candidates and voters can no longer be changed."
      : "The election has ended. This contract cannot run another election.";

  const setup = phase === "setup";
  $("addPanel").hidden = !setup;
  $("voterPanel").hidden = false;
  $("authorizeVoterButton").disabled = !setup;
  $("voterAddress").disabled = !setup;

  // registrants
  const list = $("registrantList");
  list.replaceChildren();
  if (regCount === 0) {
    list.append(h("p", { class: "empty", text: "No voters have registered yet." }));
  } else {
    const indexes = Array.from({ length: regCount }, (_, i) => i);
    const regs = await Promise.all(indexes.map((i) => contract.getRegistrant(i)));
    for (const r of regs) {
      const right = r.voted
        ? h("span", { class: "status-pill", text: "Voted" })
        : r.authorized
        ? h("span", { class: "status-pill", text: "Approved" })
        : (() => {
            const b = h("button", { class: "btn btn-outline", text: "Approve" });
            b.disabled = !setup;
            b.addEventListener("click", () => approve(b, r.voter));
            return b;
          })();
      list.append(
        h("div", { class: "registrant" },
          h("div", {},
            h("div", { class: "registrant-name", text: r.name + " · " + r.studentId }),
            h("div", { class: "registrant-meta", text: r.voter })
          ),
          right
        )
      );
    }
  }

  // candidates + results
  const box = $("adminResults");
  if (phase === "ended") {
    renderResults(box, candidates, totalVotes);
  } else {
    renderCandidateList(box, candidates, { canVote: false });
  }
}

async function approve(button, voterAddress) {
  await sendTx(button, "Approving…", "Voter approved.", () => contract.authorizeVoter(voterAddress));
}

async function addCandidate() {
  const name = $("candidateName").value.trim();
  const position = $("candidatePosition").value.trim();
  if (!name) {
    notice("Enter the candidate's name.", "error");
    return;
  }
  const ok = await sendTx($("addCandidateButton"), "Adding…", "Candidate added.",
    () => contract.addCandidate(name, position));
  if (ok) { $("candidateName").value = ""; $("candidatePosition").value = ""; }
}

async function authorizeVoter() {
  const addr = $("voterAddress").value.trim();
  if (!ethers.utils.isAddress(addr)) {
    notice("Enter a valid wallet address that starts with 0x.", "error");
    return;
  }
  const ok = await sendTx($("authorizeVoterButton"), "Authorizing…", "Wallet authorized.",
    () => contract.authorizeVoter(addr));
  if (ok) $("voterAddress").value = "";
}

async function startElection() {
  await sendTx($("startElectionButton"), "Starting…", "Election started. Voters can now vote.",
    () => contract.startElection());
}

async function endElection() {
  await sendTx($("endElectionButton"), "Closing…", "Election closed. Results are now public.",
    () => contract.endElection());
}

// 5. EVENTS

$("loginVoterButton").addEventListener("click", () => login("voter"));
$("loginAdminButton").addEventListener("click", () => login("admin"));
$("logoutButton").addEventListener("click", logout);
$("signUpButton").addEventListener("click", signUp);
$("tabLogin").addEventListener("click", () => showAuthTab("login"));
$("tabSignup").addEventListener("click", () => showAuthTab("signup"));
$("addCandidateButton").addEventListener("click", addCandidate);
$("authorizeVoterButton").addEventListener("click", authorizeVoter);
$("startElectionButton").addEventListener("click", startElection);
$("endElectionButton").addEventListener("click", endElection);

// Reload the page state when the user switches MetaMask account or network.
if (window.ethereum) {
  window.ethereum.on("accountsChanged", () => window.location.reload());
  window.ethereum.on("chainChanged", () => window.location.reload());
}
