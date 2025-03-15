import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import {
  Account,
  Address,
  Contract,
  Networks,
  rpc,
  scValToBigInt,
  type Transaction,
  TransactionBuilder,
  type xdr,
} from "@stellar/stellar-sdk";
import { StellarAssetsSdk } from "../src/stellar-assets-sdk.ts";
import type { IBalanceResult } from "../src/interfaces.ts";


describe("Test method 'balance'", () => {
  const XlmContract: Contract = new Contract("CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA");
  const UsdcContract: Contract = new Contract("CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75");
  const account: Account = new Account("GBAIA5U6E3FSRUW55AXACIVGX2QR5JYAS74OWLED3S22EGXVYEHPLGPA", "0");
  const rpcUrl: string = "https://mainnet.sorobanrpc.com";
  const sdk: StellarAssetsSdk = new StellarAssetsSdk({ rpcUrl });

  async function simTx(
    contract: Contract,
    method: string,
    args: xdr.ScVal[],
  ): Promise<rpc.Api.SimulateTransactionSuccessResponse> {
    const tx: Transaction = new TransactionBuilder(account, {
      networkPassphrase: Networks.PUBLIC,
      fee: "100000",
    })
      .setTimeout(0)
      .addOperation(contract.call(method, ...args))
      .build();

    const sim = await new rpc.Server(rpcUrl).simulateTransaction(tx);

    if (rpc.Api.isSimulationError(sim)) {
      throw { message: "Simulation failed", events: sim.events };
    }

    return sim as rpc.Api.SimulateTransactionSuccessResponse;
  }

  it("should fetch the native balance owned by a Stellar account", async (): Promise<void> => {
    const simBalance: bigint = await simTx(XlmContract, "balance", [
      new Address(account.accountId()).toScVal(),
    ])
      .then((sim) => scValToBigInt(sim.result!.retval));

    const result: IBalanceResult = await sdk.balance(
      XlmContract.contractId(),
      account.accountId(),
    );

    assertEquals(result.balance.amount, simBalance);
  });

  it("should fetch the non-native balance owned by a stellar account", async (): Promise<void> => {
    const simBalance: bigint = await simTx(UsdcContract, "balance", [
      new Address(account.accountId()).toScVal(),
    ])
      .then((sim) => scValToBigInt(sim.result!.retval));

    const result: IBalanceResult = await sdk.balance(
      UsdcContract.contractId(),
      account.accountId(),
    );

    assertEquals(result.balance.amount, simBalance);
  });

  it("should fetch the native balance owned by a soroban contract", async (): Promise<void> => {
    const simBalance: bigint = await simTx(XlmContract, "balance", [
      new Address(XlmContract.contractId()).toScVal(),
    ])
      .then((sim) => scValToBigInt(sim.result!.retval));

    const result: IBalanceResult = await sdk.balance(
      XlmContract.contractId(),
      XlmContract.contractId(),
    );

    assertEquals(result.balance.amount, simBalance);
  });

  it("should fetch the soroban asset balance owned by a soroban contract", async (): Promise<void> => {
    const usdxUsdcPool: string = "CA73MQDXDHT7Z37KIWP5BCRGAKOXDK2FLR3OPVKNUJUEHK5SWL74SE4K";
    const contractHolder: string = "CDCART6WRSM2K4CKOAOB5YKUVBSJ6KLOVS7ZEJHA4OAQ2FXX7JOHLXIP";

    const simBalance: bigint = await simTx(new Contract(usdxUsdcPool), "balance", [
      new Address(contractHolder).toScVal(),
    ])
      .then((sim) => scValToBigInt(sim.result!.retval));

    const result: IBalanceResult = await sdk.balance(usdxUsdcPool, contractHolder);
    assertEquals(result.balance.amount, simBalance);
  });
});
