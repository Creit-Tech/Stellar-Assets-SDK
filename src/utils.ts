import { Address, Asset, Contract, Networks, rpc, scValToNative, StrKey, xdr } from "@stellar/stellar-sdk";
import type { IBalanceResult } from "./interfaces.ts";

export function generateBalanceLedgerKeys(params: {
  asset: Asset | Contract;
  contractId: string;
  targets: Address[];
}): xdr.LedgerKey[] {
  return params.targets.map(
    (target: Address): xdr.LedgerKey => {
      if (params.asset instanceof Asset && target.toString().charAt(0) === "G") {
        if (params.asset.isNative()) {
          return xdr.LedgerKey.account(
            new xdr.LedgerKeyAccount({
              accountId: xdr.PublicKey.publicKeyTypeEd25519(StrKey.decodeEd25519PublicKey(target.toString())),
            }),
          );
        } else {
          return xdr.LedgerKey.trustline(
            new xdr.LedgerKeyTrustLine({
              accountId: xdr.PublicKey.publicKeyTypeEd25519(StrKey.decodeEd25519PublicKey(target.toString())),
              asset: params.asset.toTrustLineXDRObject(),
            }),
          );
        }
      } else {
        return xdr.LedgerKey.contractData(
          new xdr.LedgerKeyContractData({
            contract: new Address(params.contractId).toScAddress(),
            key: xdr.ScVal.scvVec([
              xdr.ScVal.scvSymbol("Balance"),
              target.toScVal(),
            ]),
            durability: xdr.ContractDataDurability.persistent(),
          }),
        );
      }
    },
  );
}

export function parseBalanceLedgerKeys(params: {
  entries: rpc.Api.LedgerEntryResult[];
  network: Networks;
}): IBalanceResult[] {
  return params.entries.map(
    (entry: rpc.Api.LedgerEntryResult) => {
      switch (entry.val.switch().name) {
        case "account": {
          const address: string = StrKey.encodeEd25519PublicKey(entry.val.account().accountId().ed25519());
          return {
            address,
            contract: Asset.native().contractId(params.network),
            balance: {
              clawback: false,
              authorized: true,
              amount: entry.val.account().balance().toBigInt(),
            },
          };
        }

        case "trustline": {
          const address: string = StrKey.encodeEd25519PublicKey(entry.val.trustLine().accountId().ed25519());
          let contract: string;

          switch (entry.val.trustLine().asset().switch().name) {
            case "assetTypeCreditAlphanum4":
            case "assetTypeCreditAlphanum12": {
              const assetXdr = entry.val.trustLine().asset().value() as (xdr.AlphaNum4 | xdr.AlphaNum12);
              const asset: Asset = new Asset(
                assetXdr.assetCode().toString("utf8"),
                StrKey.encodeEd25519PublicKey(assetXdr.issuer().ed25519()),
              );
              contract = asset.contractId(params.network);
              break;
            }

            case "assetTypeNative":
            case "assetTypePoolShare":
            default:
              console.debug("Key:", entry.key.toXDR("base64"));
              console.debug("Value:", entry.val.toXDR("base64"));
              throw new Error(
                "Unsopported type of asset found, please contact the creator of the Stellar Assets SDK library.",
              );
          }

          return {
            address,
            contract,
            balance: {
              clawback: false,
              authorized: true,
              amount: entry.val.trustLine().balance().toBigInt(),
            },
          };
        }

        case "contractData": {
          const contract: string = StrKey.encodeContract(entry.key.contractData().contract().contractId());
          const address: string = scValToNative(entry.key.contractData().key())[1];
          let balance = scValToNative(entry.val.contractData().val());

          if (typeof balance === "bigint") {
            balance = {
              clawback: false,
              authorized: true,
              amount: balance,
            };
          } else {
            balance = {
              clawback: balance.clawback || false,
              authorized: balance.clawback || true,
              amount: balance.amount,
            };
          }

          return { address, contract, balance };
        }

        default:
          throw new Error(`Entry type: ${entry.val.switch().name} is not supported.`);
      }
    },
  );
}
