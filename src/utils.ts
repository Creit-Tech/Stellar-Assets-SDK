import {
  Address,
  Asset,
  type Contract,
  type Networks,
  type rpc,
  scValToNative,
  StrKey,
  xdr,
} from "@stellar/stellar-sdk";
import type { IBalanceResult } from "./types.ts";

export function generateBalanceLedgerKeys(params: {
  networks: Networks;
  targets: Address[];
  assets: Array<Asset | Contract>;
}): xdr.LedgerKey[] {
  const results: xdr.LedgerKey[] = [];

  for (const asset of params.assets) {
    for (const target of params.targets) {
      if (asset instanceof Asset && target.toString().charAt(0) === "G") {
        if (asset.getAssetType() === "liquidity_pool_shares") {
          throw new Error("Classic Liquidity pool shares are not supported by this library");
        }

        if (asset.isNative()) {
          results.push(xdr.LedgerKey.account(
            new xdr.LedgerKeyAccount({
              accountId: xdr.PublicKey.publicKeyTypeEd25519(StrKey.decodeEd25519PublicKey(target.toString())),
            }),
          ));
        } else {
          results.push(xdr.LedgerKey.trustline(
            new xdr.LedgerKeyTrustLine({
              accountId: xdr.PublicKey.publicKeyTypeEd25519(StrKey.decodeEd25519PublicKey(target.toString())),
              asset: asset.toTrustLineXDRObject(),
            }),
          ));
        }
      } else {
        results.push(xdr.LedgerKey.contractData(
          new xdr.LedgerKeyContractData({
            contract: asset instanceof Asset
              ? new Address(asset.contractId(params.networks)).toScAddress()
              : asset.address().toScAddress(),
            key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Balance"), target.toScVal()]),
            durability: xdr.ContractDataDurability.persistent(),
          }),
        ));
      }
    }
  }

  return results.flat();
}

export function parseBalanceLedgerKeys(params: {
  cachedAssets: Map<string, Asset | Contract>;
  entries: rpc.Api.LedgerEntryResult[];
  network: Networks;
}): IBalanceResult[] {
  return params.entries.map(
    (entry: rpc.Api.LedgerEntryResult) => {
      switch (entry.val.switch().name) {
        case "account": {
          const val: xdr.AccountEntry = entry.val.account();
          const address: string = StrKey.encodeEd25519PublicKey(val.accountId().ed25519());
          const trustLine: IBalanceResult["trustLine"] = val.ext().switch() === 0
            ? {
              balance: val.balance().toBigInt(),
              buying: 0n,
              selling: 0n,
            }
            : {
              balance: val.balance().toBigInt(),
              buying: val.ext().v1().liabilities().buying().toBigInt(),
              selling: val.ext().v1().liabilities().selling().toBigInt(),
            };

          // Here we calculate the min amount of XLMs the account must hold and so are not part of the usable balance.
          let minimumBase: bigint = 2n * (10n ** 7n);
          minimumBase += BigInt(val.numSubEntries()) * (10n ** 7n);
          if (val.ext().switch() === 1) {
            if (val.ext().v1().ext().switch() === 2) {
              const v2: xdr.AccountEntryExtensionV2 = val.ext().v1().ext().v2();
              minimumBase += BigInt(v2.numSponsoring()) * (10n ** 7n);
              minimumBase -= BigInt(v2.numSponsored()) * (10n ** 7n);
            }
          }
          minimumBase = minimumBase / 2n;

          return {
            address,
            contract: Asset.native().contractId(params.network),
            balance: val.balance().toBigInt() - minimumBase - trustLine.selling,
            isClassic: true,
            trustLine,
          } satisfies IBalanceResult;
        }

        case "trustline": {
          const val: xdr.TrustLineEntry = entry.val.trustLine();
          const address: string = StrKey.encodeEd25519PublicKey(val.accountId().ed25519());
          const trustLine: IBalanceResult["trustLine"] = val.ext().switch() === 0
            ? {
              balance: val.balance().toBigInt(),
              buying: 0n,
              selling: 0n,
            }
            : {
              balance: val.balance().toBigInt(),
              buying: val.ext().v1().liabilities().buying().toBigInt(),
              selling: val.ext().v1().liabilities().selling().toBigInt(),
            };

          let contract: string;
          switch (val.asset().switch().name) {
            case "assetTypeCreditAlphanum4":
            case "assetTypeCreditAlphanum12": {
              const assetXdr: xdr.AlphaNum4 | xdr.AlphaNum12 = val.asset().value() as (xdr.AlphaNum4 | xdr.AlphaNum12);
              const asset: Asset = new Asset(
                assetXdr.assetCode().toString("utf8").replace(new RegExp('\0', 'g'), ''),
                StrKey.encodeEd25519PublicKey(assetXdr.issuer().ed25519()),
              );
              contract = asset.contractId(params.network);
              break;
            }

            case "assetTypeNative":
            case "assetTypePoolShare":
            default:
              throw new Error(
                "Unsopported type of asset found, please contact the creator of the Stellar Assets SDK library.",
              );
          }

          return {
            address,
            contract,
            balance: val.balance().toBigInt() - trustLine.selling,
            isClassic: true,
            trustLine,
          } satisfies IBalanceResult;
        }

        case "contractData": {
          const contract: string = StrKey.encodeContract(entry.key.contractData().contract().contractId());
          const address: string = scValToNative(entry.key.contractData().key())[1];
          let balance = scValToNative(entry.val.contractData().val());
          balance = typeof balance === "bigint" ? balance : balance.amount;

          const cachedAsset: Asset | Contract | undefined = params.cachedAssets.get(contract);
          if (!cachedAsset) throw new Error(`Asset ${contract} has not been cached, please contact support.`);

          return {
            address,
            contract,
            balance,
            isClassic: cachedAsset instanceof Asset,
            trustLine: null,
          } satisfies IBalanceResult;
        }

        default:
          throw new Error(`Entry type: ${entry.val.switch().name} is not supported.`);
      }
    },
  );
}
