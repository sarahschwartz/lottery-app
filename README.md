# Lottery App

A simple game where players can guess a number and win some money.
Built for Prividium™️.

## Running locally

### Setup a local Prividium

Run a local Prividium chain with [`local-prividium`](https://github.com/matter-labs/local-prividium).

### Sign in and fund your admin account

In your metamask wallet add an account from this private key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`.

Then go to [`http://localhost:3001/`](http://localhost:3001/) and sign in with this wallet.

Click on the "Wallets" tab in the user panel and then click on the "Add Network to Wallet" button.
If you have previously added the network to your metamask, you may have to edit the network configuration to make sure the correct RPC Access token is being used by deleting the old RPC urls.

Finally, run the command below to ensure the account has some funds:

```bash
cast send -r http://localhost:5050 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266  --value 10000000000000000000 --private-key 0x7726827caac94a7f9e1b160f7ea819f172f7b6f9d2a97f992c38edeab82d4110
```

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

> To copy the abi, go into the `contracts/artifacts/contracts/NumberGuessingGame.sol/NumberGuessingGame.json` file
> and copy the entire array for the `"abi"`.

You can configure the permissions of all contract functions to allow all users.

### Create a new application ID

In the admin panel add a new application under "Apps".
The whitelisted origin should be `http://localhost:5173` and the redirect URI should be `http://localhost:5173/auth-callback.html`.

### Configure the frontend `.env` file

Use the `.env.example` file as a template.
Add the deployed contract address and the OAuth Client ID as the `VITE_CLIENT_ID`.

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

Log in to the user panel as a non-admin user, ideally using another browser to make it easier to switch between the admin and the user.
Use the keycloak login `user@local.dev` with the password `password` to login, then add a wallet to associate with the account.

Follows the same setup steps as the admin to add the network to metamask and fund the wallet (just change the destination address in the `cast` command).

Make sure in the admin panel that this user has the role `user`,
or else an error will occur when trying to pick a number.
Then open the app to guess a number for the session.

### Draw the winner

Once the time has passed for the session you can choose a winner.

> Note: without other activity on your chain, you will need to send a first transaction for the block timestamp to advance.
> An easy way to do this is to redeploy the game contract (but don't configure anything to use it).

Login as the game admin and draw the winner.
If no player chose the winning number, the payout will be returned to the admin wallet.
If a player did select the winning number,
the player will see a claim button on the app for them to claim the winning amount.
