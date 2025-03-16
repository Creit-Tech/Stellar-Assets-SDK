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
  type xdr,
} from "@stellar/stellar-sdk";
import type { IBalanceResult } from "./interfaces.ts";
import { generateBalanceLedgerKeys, parseBalanceLedgerKeys } from "./utils.ts";

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
        contract: contractId,
        balance: { amount: 0n, authorized: false, clawback: false },
      })
    );

    const ledgerKeys: xdr.LedgerKey[] = generateBalanceLedgerKeys({
      asset,
      contractId,
      targets,
    });

    const ledgerKeysResponse: rpc.Api.GetLedgerEntriesResponse = await this.rpc.getLedgerEntries(...ledgerKeys);

    const balances: IBalanceResult[] = parseBalanceLedgerKeys({
      entries: ledgerKeysResponse.entries,
      network: this.networkPassphrase,
    });

    for (const balance of balances) {
      response.set(balance.address, balance);
    }

    const values: IBalanceResult[] = response.values().toArray();
    return Array.isArray(addresses) ? values : values[0];
  }

  /**
   * An "extension" to the `balance` method, this one accepts an array with the contracts ids and target addresses instead of just one contract like with the `balance` method.
   * This method is useful for apps that need to track multiple balances for multiple accounts, for example: A wallet.
   *
   * @param targets An array with objects that represent the batches of accounts and contracts we want to fetch
   */
  async balances(
    targets: Array<{ contractIds: string[]; addresses: Array<string | Address> }>,
  ): Promise<IBalanceResult[]> {
    // The Map key is `contractId_address`
    const response: Map<string, IBalanceResult> = new Map<string, IBalanceResult>();

    const ledgerKeys: xdr.LedgerKey[] = [];
    for (const target of targets) {
      for (const contractId of target.contractIds) {
        const asset: Asset | Contract = await this.getAsset(contractId);

        target.addresses.forEach((address) =>
          response.set(`${contractId}_${address}`, {
            address: address.toString(), // The `.toString()` method includes both cases
            contract: contractId,
            balance: { amount: 0n, authorized: false, clawback: false },
          })
        );

        const keys: xdr.LedgerKey[] = generateBalanceLedgerKeys({
          targets: target.addresses.map(
            (address: string | Address) => typeof address === "string" ? new Address(address) : address,
          ),
          contractId,
          asset,
        });
        for (const key of keys) {
          ledgerKeys.push(key);
        }
      }
    }

    const ledgerKeysResponse: rpc.Api.GetLedgerEntriesResponse = await this.rpc.getLedgerEntries(...ledgerKeys);

    const balances: IBalanceResult[] = parseBalanceLedgerKeys({
      entries: ledgerKeysResponse.entries,
      network: this.networkPassphrase,
    });

    for (const balance of balances) {
      response.set(`${balance.contract}_${balance.address}`, balance);
    }

    return response.values().toArray();
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
