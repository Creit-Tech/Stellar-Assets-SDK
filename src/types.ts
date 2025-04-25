export interface IBalanceResult {
  /**
   * The address of the owner of this balance without matter if is a stellar account or a soroban contract
   */
  address: string;

  /**
   * The contract id (address) this balance is coming from
   */
  contract: string;

  /**
   * The balance held by the `address` in this `contract`
   */
  balance: bigint;
}
