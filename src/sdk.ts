import { Address, Asset, Contract, type Networks, rpc, scValToNative, StrKey, xdr } from "@stellar/stellar-sdk";
import { InvocationV0, StellarRouterContract, StellarRouterSdk } from "@creit-tech/stellar-router-sdk";
import type { IBalanceResult } from "./types.ts";
import { generateBalanceLedgerKeys, parseBalanceLedgerKeys } from "./utils.ts";

export class StellarAssetsSdk {
  /**
   * This is a map of the contract id and the type of asset, this helps to know if a contract id belongs to a classic or soroban asset.
   */
  cachedAssets: Map<string, Asset | Contract> = new Map<string, Asset | Contract>();
  routerSdk: StellarRouterSdk;
  rpc: rpc.Server;
  networkPassphrase?: Networks;

  /**
   * @param params
   */
  constructor(params: {
    rpcUrl: string;
    allowHttp?: boolean;
    routerContract?: string;
    networkPassphrase?: Networks;
  }) {
    this.routerSdk = new StellarRouterSdk({
      rpcUrl: params.rpcUrl,
      routerContract: params.routerContract || StellarRouterContract.v0,
    });
    this.rpc = new rpc.Server(params.rpcUrl, { allowHttp: !!params.allowHttp });
    this.networkPassphrase = params.networkPassphrase;
  }

  /**
   * @param contractId The contract id of the asset to check
   * @param addresses The address or addresses you would like to get their balances
   */
  async balance(contractId: string | Address, addresses: string | Address): Promise<IBalanceResult>;
  async balance(contractId: string | Address, addresses: string[] | Address[]): Promise<IBalanceResult[]>;
  async balance(
    contractId: string | Address,
    addresses: string | Address | string[] | Address[],
  ): Promise<IBalanceResult | IBalanceResult[]> {
    const targets: Address[] = Array.isArray(addresses)
      ? addresses.map((address: string | Address): Address =>
        (typeof address === "string") ? new Address(address) : address
      )
      : [(typeof addresses === "string") ? new Address(addresses) : addresses satisfies Address];

    await this.cacheAssets([contractId.toString()]);

    const ledgerKeys: xdr.LedgerKey[] = generateBalanceLedgerKeys({
      networks: this.networkPassphrase!,
      assets: [this.cachedAssets.get(contractId.toString())!],
      targets,
    });

    const result: rpc.Api.GetLedgerEntriesResponse = await this.rpc.getLedgerEntries(...ledgerKeys);
    const parsedResult: IBalanceResult[] = parseBalanceLedgerKeys({
      cachedAssets: this.cachedAssets,
      network: this.networkPassphrase!,
      entries: result.entries,
    });

    const balancesMap: Map<string, IBalanceResult> = new Map<string, IBalanceResult>();
    for (const entry of parsedResult) {
      balancesMap.set(entry.address, entry);
    }

    const balances: IBalanceResult[] = [];
    for (const target of targets) {
      if (balancesMap.has(target.toString())) {
        balances.push(balancesMap.get(target.toString())!);
      } else {
        balances.push({
          address: target.toString(),
          contract: contractId.toString(),
          isClassic: this.cachedAssets.get(contractId.toString())! instanceof Asset,
          balance: 0n,
          trustLine: null,
        });
      }
    }

    return Array.isArray(addresses) ? balances : balances[0];
  }

  async fetchOwnedNFTs(contractId: string | Address, address: string): Promise<number[]> {
    const [supply] = await this.routerSdk.simResult<number[]>([new InvocationV0({
      contract: contractId,
      method: 'total_supply',
      args: [],
    })]);

    const ledgerKeysGroups: xdr.LedgerKey[] = [];

    for (let i = 1; i <= supply; i++) {
      ledgerKeysGroups.push(xdr.LedgerKey.contractData(
        new xdr.LedgerKeyContractData({
          contract: typeof contractId === 'string' ? new Address(contractId).toScAddress() : contractId.toScAddress(),
          key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Owner"), xdr.ScVal.scvU32(i)]),
          durability: xdr.ContractDataDurability.persistent(),
        }),
      ));
    }

    const results: rpc.Api.LedgerEntryResult[] = [];
    while (ledgerKeysGroups.length > 0) {
      const chunk: xdr.LedgerKey[] = ledgerKeysGroups.splice(0, 200);
      const result: rpc.Api.GetLedgerEntriesResponse = await this.rpc.getLedgerEntries(...chunk);
      for (const entry of result.entries) {
        results.push(entry);
      }
    }

    const entries: Array<{ id: number; owner: string; }> = [];
    for (const result of results) {
      const key = scValToNative(result.key.contractData().key());
      entries.push({ id: key[1], owner: scValToNative(result.val.contractData().val()) });
    }

    const filteredEntries: number[] = [];
    for (const entry of entries) {
      if (entry.owner === address) {
        filteredEntries.push(entry.id);
      }
    }

    return filteredEntries;
  }


  /**
   * An "extension" to the `balance` method, this one accepts an array with the contracts ids and target addresses instead of just one contract like with the `balance` method.
   * This method is useful for apps that need to track multiple balances for multiple accounts, for example: A wallet.
   *
   * @param targets An array with objects that represent the batches of accounts and contracts we want to fetch
   */
  async balances(
    targets: Array<{ contractIds: Array<string | Address>; addresses: Array<string | Address> }>,
  ): Promise<IBalanceResult[]> {
    const allAccounts: Array<string | Address> = targets.map((target) => target.addresses).flat();
    const allAssets: Array<string | Address> = targets.map((target) => target.contractIds).flat();

    await this.cacheAssets(allAssets);

    const ledgerKeysGroups: xdr.LedgerKey[][] = [];

    for (const target of targets) {
      ledgerKeysGroups.push(
        generateBalanceLedgerKeys({
          networks: this.networkPassphrase!,
          targets: target.addresses.map((address) => typeof address === "string" ? new Address(address) : address),
          assets: target.contractIds.map((asset: string | Address) => this.cachedAssets.get(asset.toString())!),
        }),
      );
    }

    const result: rpc.Api.GetLedgerEntriesResponse = await this.rpc.getLedgerEntries(...ledgerKeysGroups.flat());
    const parsedResult: IBalanceResult[] = parseBalanceLedgerKeys({
      entries: result.entries,
      network: this.networkPassphrase!,
      cachedAssets: this.cachedAssets,
    });

    const balancesMap: Map<string, IBalanceResult> = new Map<string, IBalanceResult>();
    for (const entry of parsedResult) {
      balancesMap.set(`${entry.address}:${entry.contract}`, entry);
    }

    const balances: IBalanceResult[] = [];
    for (const account of allAccounts) {
      for (const asset of allAssets) {
        const key: string = `${account.toString()}:${asset.toString()}`;
        if (balancesMap.has(key)) {
          balances.push(balancesMap.get(key)!);
        } else {
          balances.push({
            address: account.toString(),
            contract: asset.toString(),
            isClassic: this.cachedAssets.get(asset.toString())! instanceof Asset,
            balance: 0n,
            trustLine: null,
          });
        }
      }
    }

    return balances;
  }

  /**
   * This method gets data from an asset to identify if the asset is a classic or a soroban asset and keeps it on the class as a cache for faster invocations that involve that specific asset.
   * @param ids The contract ids of the assets to load
   */
  async cacheAssets(ids: Array<string | Address>): Promise<void> {
    if (!this.networkPassphrase) {
      const network = await this.rpc.getNetwork();
      this.networkPassphrase = network.passphrase as Networks;
    }

    const filteredIds: Array<string | Address> = ids.filter((id: string | Address): boolean => {
      if (id === Asset.native().contractId(this.networkPassphrase!)) {
        this.cachedAssets.set(id, Asset.native());
        return false;
      }
      return !this.cachedAssets.has(id.toString());
    });

    // We remove the native asset it's in the list
    const invocations: InvocationV0[] = [];
    for (const id of filteredIds) {
      invocations.push(
        new InvocationV0({
          contract: id,
          method: "name",
          args: [],
        }),
      );
    }

    if (invocations.length === 0) return;

    const simResponse: string[] = await this.routerSdk.simResult<string[]>(invocations);

    let i: number = 0;
    for (const name of simResponse) {
      const id: string | Address = filteredIds[i];
      const [code, issuer] = name.split(":");
      // If issuer is defined, we try to see if is a classic asset
      if (!!issuer && StrKey.isValidEd25519PublicKey(issuer)) {
        // We confirm this is the real asset
        const asset: Asset = new Asset(code, issuer);
        if (asset.contractId(this.networkPassphrase) !== id) {
          throw new Error("This asset is not the real stellar classic asset");
        }

        this.cachedAssets.set(id.toString(), asset);
      } else {
        const contract: Contract = new Contract(id.toString());
        this.cachedAssets.set(id.toString(), contract);
      }

      i++;
    }
  }
}
