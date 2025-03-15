export interface IBalanceResult {
  address: string;
  balance: {
    amount: bigint;
    authorized: boolean;
    clawback: boolean;
  };
}
