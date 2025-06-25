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
   * The balance held by the `address` that can be spent by a contract
   */
  balance: bigint;

  /**
   * In the case the balance comes from a classic asset, this will be set to true (this also includes the native asset)
   */
  isClassic: boolean;

  /**
   * TrustLine
   */
  trustLine: {
    balance: bigint;
    selling: bigint;
    buying: bigint;
  } | null;
}
