import { Address, rpc, scValToNative } from "@stellar/stellar-sdk";
import { type Invocation, StellarRouterSdk } from "@creit-tech/stellar-router-sdk";
import type { IBalanceResult } from "./types.ts";

export class Sdk {
  routerSdk: StellarRouterSdk;
  rpc: rpc.Server;

  /**
   * @param params
   */
  constructor(params: {
    rpcUrl: string;
    allowHttp?: boolean;
    routerContract?: string;
  }) {
    this.routerSdk = new StellarRouterSdk({ rpcUrl: params.rpcUrl, routerContract: params.routerContract });
    this.rpc = new rpc.Server(params.rpcUrl, { allowHttp: !!params.allowHttp });
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

    const balances: IBalanceResult[] = [];
    while (targets.length > 0) {
      // We use chunks of 25 balances to avoid hitting simulation limits
      const currentTargets: Address[] = targets.splice(0, 25);
      const balancesResult: bigint[] = await this.routerSdk.simResult(currentTargets.map((target) => ({
        contract: contractId,
        method: "balance",
        args: [target.toScVal()],
      } satisfies Invocation)));

      for (let i = 0; i < balancesResult.length; i++) {
        balances.push({
          contract: contractId.toString(),
          address: currentTargets[i].toString(),
          balance: balancesResult[i],
        });
      }
    }

    return Array.isArray(addresses) ? balances : balances[0];
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
    const invocations: Invocation[] = targets.reduce((all: Invocation[], current) => {
      for (const contractId of current.contractIds) {
        for (const address of current.addresses) {
          all.push({
            contract: contractId,
            method: "balance",
            args: [typeof address === "string" ? new Address(address).toScVal() : address.toScVal()],
          });
        }
      }
      return all;
    }, []);

    const balances: IBalanceResult[] = [];
    while (invocations.length > 0) {
      // We use chunks of 25 balances to avoid hitting simulation limits
      const currentBatch: Invocation[] = invocations.splice(0, 25);
      const balancesResult: bigint[] = await this.routerSdk.simResult(currentBatch);

      for (let i = 0; i < balancesResult.length; i++) {
        balances.push({
          contract: currentBatch[i].contract.toString(),
          address: scValToNative(currentBatch[i].args[0]),
          balance: balancesResult[i],
        });
      }
    }

    return balances;
  }
}
