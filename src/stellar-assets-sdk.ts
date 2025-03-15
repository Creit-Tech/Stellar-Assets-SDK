import {
  Account,
  Address,
  Asset,
  Contract,
  Networks,
  rpc,
  scValToNative,
  StrKey,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import type { IBalanceResult } from "./interfaces.ts";

const SIMULATION_ACCOUNT: string = "GALAXYVOIDAOPZTDLHILAJQKCVVFMD4IKLXLSZV5YHO7VY74IWZILUTO";

export class StellarAssetsSdk {
  cachedAssets: Map<string, Asset | Contract> = new Map<string, Asset | Contract>();
  networkPassphrase: Networks;
  rpc: rpc.Server;

  constructor(params: {
    rpcUrl: string;
    allowHttp?: boolean;
    networkPassphrase?: Networks;
  }) {
    this.networkPassphrase = params?.networkPassphrase || Networks.PUBLIC;
    this.rpc = new rpc.Server(params.rpcUrl, { allowHttp: !!params.allowHttp });
  }

  /**
   * @param contractId The contract id of the asset to check
   * @param addresses The address or addresses you would like to get their balances
   */
  async balance(contractId: string, addresses: string | Address): Promise<IBalanceResult>;
  async balance(contractId: string, addresses: string[] | Address[]): Promise<IBalanceResult[]>;
  async balance(
    contractId: string,
    addresses: string | Address | string[] | Address[],
  ): Promise<IBalanceResult | IBalanceResult[]> {
    const asset: Asset | Contract = await this.getAsset(contractId);
    const response: Map<string, IBalanceResult> = new Map<string, IBalanceResult>();

    const targets: Address[] = Array.isArray(addresses)
      ? addresses.map((address: string | Address): Address =>
        (typeof address === "string") ? new Address(address) : address
      )
      : [(typeof addresses === "string") ? new Address(addresses) : addresses satisfies Address];

    targets.forEach((target) =>
      response.set(target.toString(), {
        address: target.toString(),
        balance: { amount: 0n, authorized: false, clawback: false },
      })
    );

    const ledgerKeys: xdr.LedgerKey[] = targets.map(
      (target: Address): xdr.LedgerKey => {
        if (asset instanceof Asset && target.toString().charAt(0) === "G") {
          if (asset.isNative()) {
            return xdr.LedgerKey.account(
              new xdr.LedgerKeyAccount({
                accountId: xdr.PublicKey.publicKeyTypeEd25519(StrKey.decodeEd25519PublicKey(target.toString())),
              }),
            );
          } else {
            return xdr.LedgerKey.trustline(
              new xdr.LedgerKeyTrustLine({
                accountId: xdr.PublicKey.publicKeyTypeEd25519(StrKey.decodeEd25519PublicKey(target.toString())),
                asset: asset.toTrustLineXDRObject(),
              }),
            );
          }
        } else {
          return xdr.LedgerKey.contractData(
            new xdr.LedgerKeyContractData({
              contract: new Address(contractId).toScAddress(),
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

    const ledgerKeysResponse: rpc.Api.GetLedgerEntriesResponse = await this.rpc.getLedgerEntries(...ledgerKeys);

    ledgerKeysResponse.entries.forEach(
      (entry: rpc.Api.LedgerEntryResult) => {
        switch (entry.val.switch().name) {
          case "account": {
            const address: string = StrKey.encodeEd25519PublicKey(entry.val.account().accountId().ed25519());
            response.set(address, {
              address,
              balance: {
                clawback: false,
                authorized: true,
                amount: entry.val.account().balance().toBigInt(),
              },
            });
            break;
          }

          case "trustline": {
            const address: string = StrKey.encodeEd25519PublicKey(entry.val.trustLine().accountId().ed25519());
            response.set(address, {
              address,
              balance: {
                clawback: false,
                authorized: true,
                amount: entry.val.trustLine().balance().toBigInt(),
              },
            });
            break;
          }
          case "contractData": {
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

            response.set(address, { address, balance });
            break;
          }

          default:
            throw new Error(`Entry type: ${entry.val.switch().name} is not supported.`);
        }
      },
    );

    const values: IBalanceResult[] = response.values().toArray();
    return Array.isArray(addresses) ? values : values[0];
  }

  /**
   * This method checks if we have the asset cached and if not it fetches it before returning the Asset|Contract
   *
   * @param id The asset contract id
   * @private
   */
  private async getAsset(id: string): Promise<Asset | Contract> {
    if (!this.cachedAssets.has(id)) {
      await this.cacheAsset(id);
    }

    return this.cachedAssets.get(id)!;
  }

  /**
   * This method gets the metadata of an asset to identify if the asset is a classic or a soroban asset and keeps it on the class as a cache for faster invocations that involve that specific asset.
   * @param id The contract id of the asset to load
   */
  async cacheAsset(id: string): Promise<void> {
    // If the id is from the native asset, we skip the rest of the process
    if (id === Asset.native().contractId(this.networkPassphrase)) {
      this.cachedAssets.set(id, Asset.native());
      return;
    }

    const contract: Contract = new Contract(id);
    const simResponse = await this.simulate({
      method: "name",
      contract,
      args: [],
    });

    const [code, issuer] = scValToNative(simResponse.result!.retval).split(":");

    // If issuer is defined, we try to see if is a classic asset
    if (!!issuer && StrKey.isValidEd25519PublicKey(issuer)) {
      // We confirm this is the real asset
      const asset: Asset = new Asset(code, issuer);
      if (asset.contractId(this.networkPassphrase) !== id) {
        throw new Error("This asset is not the real stellar classic asset");
      }

      this.cachedAssets.set(id, asset);
    } else {
      const contract: Contract = new Contract(id);
      this.cachedAssets.set(id, contract);
    }
  }

  async simulate(params: {
    contract: Contract;
    method: string;
    args: xdr.ScVal[];
  }): Promise<rpc.Api.SimulateTransactionSuccessResponse> {
    const builder: TransactionBuilder = new TransactionBuilder(
      new Account(SIMULATION_ACCOUNT, "0"),
      { networkPassphrase: this.networkPassphrase, fee: "0" },
    )
      .setTimeout(0)
      .addOperation(params.contract.call(params.method, ...params.args));

    const sim = await this.rpc.simulateTransaction(builder.build());

    if (rpc.Api.isSimulationError(sim)) {
      throw { message: "Simulation failed", events: sim.events };
    }

    return sim as rpc.Api.SimulateTransactionSuccessResponse;
  }
}
