# Stellar Assets SDK

A library to handle all kinds of Stellar assets easily on the Soroban smart contract platform.

### Why making this SDK?

Currently, if you want to get the balance of multiple addresses for multiple assets (something we need to do in for
example xBull Wallet), you will need to check if you need to get three different types of ledger keys, and based on the
value in those ledgers you will need to decide how to parse the value based on the type of data so you can get the
correct balance. An option is using simulations but because our wallet handles multiple accounts with multiple assets
that's just not efficient... And so since we are repeating this over and over across all of our apps, we decided to just
make a simple library for that.

Some people might say "why not using a service for fetching those balances?"... Well, because our wallets are free to
use and open source, we don't make money from them directly and so we need to do stuffs without relying on paying a
third party. Plus we don't think it makes sense to pay for such a basic task as getting a simple balance.

## Installing the library

Our library is an ESM library (it doesn't support Commonjs projects because Commonjs is a cancer), you can install the
library based on your environment this way:

```text
# Deno
deno add jsr:@creit-tech/stellar-assets-sdk

# NPM and Yarn
npx jsr add @creit-tech/stellar-assets-sdk
npx jsr add @creit-tech/stellar-assets-sdk

# PNPM
pnpm dlx jsr add @creit-tech/stellar-assets-sdk

# Bun
bunx jsr add @creit-tech/stellar-assets-sdk
```

## How to use

Using the library is pretty simple, basically you only need to create a new instance of the `StellarAssetsSdk` class
with an RPC url and you are good to go. You can check all the methods available in the
[docs](https://jsr.io/@creit-tech/stellar-assets-sdk/doc/~/StellarAssetsSdk).

```typescript
import { StellarAssetsSdk } from "@creit-tech/stellar-assets-sdk";

const assetsSDK = new StellarAssetsSdk({ rpcUrl: "RPC_URL" });
const balance = await assetsSDK.balance("CONTRACT_ID", "ADDRESS");

console.log(balance.amount); // 1550000000n
```

## License

![](https://img.shields.io/badge/License-MIT-lightgrey)

Licensed under the MIT License, Copyright © 2025-present Creit Technologies LLP.

Check the `LICENSE.md` file for more details.
