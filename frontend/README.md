# FairStream

**Pay only for the seconds you watch — never more than a subscription.**

FairStream is a pay-per-second video streaming app built on Monad. Viewers sign up with a passkey, add a small balance once, and are charged only for the time they actually watch. A smart contract guarantees they never pay more than $7.99 in a 30-day period. After that, watching is free.

No wallet app, no seed phrase, no gas fees, and no crypto vocabulary anywhere in the interface.
-

## Try it 

**No credentials needed.** Passkeys can't be shared, so every judge creates their own account in a few seconds:

1. Open in Safari or Chrome.
2. Click **Create account** and confirm with your fingerprint or face.
   - On desktop Chrome, save the passkey to **Google Password Manager** when asked.
3. Every new account receives **$10 of test funds** automatically.
4. Click **Add $5**, pick a video and press play.
5. Pause to see the cost so far, then press **Done** to see what you paid and the on-chain receipt.

> The backend runs on a free hosting tier that sleeps when idle. If the first action is slow, wait about 30 seconds and try again.

---

## The problem

Streaming subscriptions charge the same monthly price whether you watch 40 hours or 40 minutes. Light viewers subsidise heavy ones, and cancelling and re-subscribing is a chore.

Pay-per-use fixes the fairness problem but creates two new ones:

1. **Card payments can't handle tiny amounts.** Charging a few cents every few seconds isn't practical on card rails.
2. **A ticking meter ruins the film.** Watching a cost go up makes people anxious and makes them stop early.

## How FairStream solves it

| Problem | FairStream's answer |
| --- | --- |
| Paying for months you barely use | Pay $0.001 per second of actual playback |
| Fear of a runaway bill | A contract-enforced cap: never more than $7.99 per 30-day period, then free |
| Micropayments are too expensive | Free signed receipts every 10 seconds, settled on Monad in one transaction per viewing |
| The meter spoils the film | The cost stays hidden while playing, appears on pause, and the maximum price is shown before you press play |
| Crypto is confusing | Passkey login, gas paid by the app, prices in dollars, no crypto words in the UI |

---

## How it works

```
 Viewer's device                    FairStream backend            Monad testnet
 ───────────────                    ──────────────────            ─────────────
 Passkey (Mera)
  ├─ account 0: wallet ── deposit / withdraw ─────────────────▶  FairStream contract
  └─ account 1: meter key                                        (balances, cap, receipts)
        │
        │ every 10 s of playback:
        │ signs Receipt{viewer, session, total}
        └──────────────▶ checks signature + balance
                         │
                         │ session ends: submits the last receipt
                         └────────────── settle() ─────────────▶  verifies signature,
                                                                   applies cap, charges
```

1. **Sign up.** Mera derives two accounts from one passkey: a **wallet** that holds the balance (needs a fingerprint for every action) and a **meter key** that can only sign usage receipts (stays unlocked while the app is open).
2. **Add funds.** The wallet approves and deposits test USDC into the FairStream contract and registers the meter key.
3. **Watch.** The viewer's own device measures playback time. Every 10 seconds the meter key silently signs an EIP-712 receipt for the running total. Signing is free and off-chain.
4. **Settle.** When the viewer leaves, the backend submits **only the last receipt**. The contract checks the meter key's signature, makes sure the session wasn't already paid, applies the 30-day cap, and moves the charge from the viewer's balance to earnings.
5. **Withdraw.** The viewer can withdraw their remaining balance at any time, after a 2-minute waiting period that gives any final receipt time to settle.

### What the contract guarantees

- **No charge without the viewer's signature.** Only receipts signed by the viewer's registered meter key can be cashed.
- **No double charging.** Each session can be settled once.
- **Never more than the cap.** Charges stop at $7.99 per 30-day period.
- **Never more than the balance.**
- **The viewer controls their money.** Withdrawals go straight to the contract and don't depend on our server. If FairStream's backend disappeared, nobody could take a viewer's funds and they could still withdraw.

---

## How we use Mera

FairStream uses [Mera](https://docs.monad.xyz/guides/mera) for all sign-up and login. **One passkey, two keys:**

| Key | Derived from | Purpose | Unlocked |
| --- | --- | --- | --- |
| Wallet | Passkey, account index 0 | Holds the balance; deposits and withdrawals | Only for one action, with a fingerprint, then locked again |
| Meter key | Passkey, account index 1 | Signs usage receipts | While the app is open, so playback is never interrupted |

Splitting the keys means the key that touches money is almost never in memory, while the key that is in memory can only sign receipts for FairStream, limited by the viewer's balance and the monthly cap.

## How we use Monad

Monad's fast, cheap transactions make it practical to settle every single viewing on-chain, rather than batching days of usage. Each viewing is one `settle` transaction, visible on MonadVision.

## How we use Alchemy

The backend connects to Monad testnet through Alchemy's RPC. *[Delete this section if you stayed on the public RPC.]*

## How we use Envio

Viewing history and spending totals on the account page are indexed from FairStream's on-chain events with Envio, so they're permanent and verifiable rather than stored on our server. *[Delete this section if Envio wasn't added.]*

---

## Tech stack

| Part | Technology |
| --- | --- |
| Smart contracts | Solidity, Foundry, OpenZeppelin (ERC-20, EIP-712, SignatureChecker, Ownable, SafeERC20) |
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS, viem, Mera |
| Backend | Node.js, Express, TypeScript, viem |
| Indexer | Envio HyperIndex *[if added]* |
| Hosting | Vercel (frontend), Render (backend) |
| Network | Monad Testnet |

## Repository structure

```
fairstream/
├── contracts/   Foundry project: MockUSDC.sol, FairStream.sol, tests, deploy script
├── backend/     Express API: onboarding, sessions, receipt checks, settlement
├── frontend/    Next.js app: login, library, player, account
├── indexer/     Envio indexer [if added]
└── shared/      deployments.json: contract addresses, ABIs, deploy blocks
```

## Contract details

| Setting | Value |
| --- | --- |
| Price | $0.001 per second of playback ($0.01 per 10-second receipt) |
| Cap | $7.99 per 30-day period |
| Withdrawal delay | 2 minutes |
| Test currency | MockUSDC, 6 decimals |
| Receipt type | `Receipt(address viewer, bytes32 sessionId, uint256 amount)`, EIP-712 domain "FairStream", version "1" |

**Tests:** 8 Foundry tests covering valid settlement, wrong signer, double settlement, the monthly cap, charges never exceeding balance, withdrawal before and after the delay, and owner-only settlement.

```bash
cd contracts
forge test
```

---

## Run it locally

**Requirements:** Node 20+, Foundry, a Monad testnet RPC URL, and a funded testnet wallet that owns the deployed contracts.

```bash
# 1. Backend
cd backend
cp .env.example .env      # set RELAYER_PRIVATE_KEY, MONAD_RPC, PORT
npm install
npm run dev               # http://localhost:4000

# 2. Frontend (new terminal)
cd frontend
cp .env.example .env.local  # set NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
npm install
npm run dev               # http://localhost:3000
```

Never commit `.env` files. The relayer key owns the contracts.

---

## Known limitations

This is a testnet prototype built in a few days. We'd rather list its limits than have judges discover them.

- **Test money only.** MockUSDC has no value. A real launch needs a way to buy stablecoins, which brings identity checks and payments regulation.
- **The backend submits settlements.** It can't charge more than the viewer signed for or more than the cap, but if it goes offline, sessions aren't settled until it's back.
- **The meter key lives in browser memory** while the app is open. A security bug in the site could let an attacker sign receipts, limited to the viewer's balance and the cap.
- **Videos aren't protected.** Anyone with a video file's URL could watch it without paying. Production would use expiring signed links or DRM.
- **The cap resets every 30 days**, counted from a fixed point, not on the 1st of each calendar month.
- **Passkeys are tied to the website's domain.** A passkey created on one domain can't be used on another.
- **Linter warnings:** `forge build` warns about an event emitted after the signature check (that check is read-only and safe) and about using `block.timestamp` for the 2-minute delay (a few seconds of drift doesn't matter here).

## What's next

- Creator payouts: send each viewing's charge to the video's creator
- Course and lecture content, where per-minute pricing fits naturally
- Daily spending limits set by the viewer
- Calendar-month caps
- Real stablecoin top-ups

---

## Credits and inspiration

- Videos: *Big Buck Bunny*, *Sintel* and *Tears of Steel* © Blender Foundation, licensed [CC BY](https://creativecommons.org/licenses/by/3.0/).
- Inspired by earlier pay-per-second streaming projects, including StreamFlow (ETHOnline 2025) and TickPay (Monad Rebel in Paradise). FairStream differs in passkey-only accounts, a contract-enforced spending cap, and a viewing experience designed so the cost doesn't distract from the film.

## Team

- **Renisha Ensalaita**: smart contracts, backend · [GitHub: renisha18](https://github.com/renisha18)