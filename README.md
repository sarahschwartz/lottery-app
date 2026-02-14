# Lottery App

A simple game where players can guess a number and win some money.
Built for Prividium™️.

## Running locally

### Setup a local Prividium

Run a local Prividium chain with [`local-prividium`](https://github.com/matter-labs/local-prividium).

### Fund your admin account

Make sure you have an admin account with funds for contract deployment.

### Install contract deps

```bash
cd contracts
bun install
```

### Run a local proxy

```bash
npx prividium proxy
```

Make sure you are logged in with your admin account.

### Deploy the game

```bash
bun deploy-game
```

### Configure contract and permissions on admin panel

Add the contract and ABI to the admin panel contracts.

`changeAdmin`: admin only
`createSession`: admin only
`pickNumber`: admin only
`pickNumber`: users only
`setWinningNumber`: admin only
`withdrawContractFunds`: admin only

All other functions should allowed for any user.

### Create a new application ID

In the admin panel add a new application under "Apps".
The whitelisted origin should be `http://localhost:5173` and the redirect URI should be `http://localhost:5173/auth-callback.html`.

### Configure the frontend `.env` file

Use the `.env.example` file as a template.
Add the deployed contract address and the app ID as the `VITE_CLIENT_ID`.

### Run the frontend

```bash
cd frontend
bun install
bun dev
```

### Create a new game session

Open the app at [`http://localhost:5173`](`http://localhost:5173`) logged in as the admin that deployed the contract.
You will see a game "admin panel".
Select the max numbers that can be guessed, the length of time the session will last, and the payout amount if there is a winner.

### Play the game

Log in to the user panel as a non-admin user.
Then open the app to guess a number for the session.

### Draw the winner

Once the time has passed for the session you can choose a winner.

> Note: without other activity on your chain, you will need to send a first transaction for the block timestamp to advance.
> An easy way to do this is to redeploy the game contract (but don't configure anything to use it).

Login as the game admin and draw the winner.
If no player chose the winning number, the payout will be returned to the admin wallet.
If a player did select the winning number,
the player will see a claim button on the app for them to claim the winning amount.
