# Changelog

All notable changes to this project will be documented in this file. See
[standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## 0.3.0 (2025-06-25)

### Change

- Return to using ledger keys instead of simulations of the contracts
- `IBalanceResult` now include more values to make the identification of classic assets and real available balances easier

## 0.2.1 (2025-04-25)

### Change

- Bring back the `StellarAssetsSdk` name for the SDK's class that was automatically changed.
- Update README.md and github action so it only publish with new tags instead of pushes to the main branch

## 0.2.0 (2025-04-25)

### Add

- Add new dependency `@creit-tech/stellar-router-sdk`.

### Change

- Change the IBalanceResult so its `balance` value is just the amount instead of including both `authorized` and
  `clawback`.
- Move from getting the keys and instead use

### 0.1.0 (2025-03-16)

### Add

- Add the method `balances` to allow fetching multiple balances from multiple accounts and multiple contracts at the
  same time

## 0.0.1 (2025-03-15)

### Add

- Start the library with the method `balance`.
