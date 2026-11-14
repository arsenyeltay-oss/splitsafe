/** Money is handled in integer cents internally to avoid float drift. */
export const toCents = (dollars: number): number => Math.round(dollars * 100);
export const toDollars = (cents: number): number => cents / 100;
export const roundMoney = (dollars: number): number => toDollars(toCents(dollars));
export const sumMoney = (values: number[]): number =>
  toDollars(values.reduce((acc, v) => acc + toCents(v), 0));
