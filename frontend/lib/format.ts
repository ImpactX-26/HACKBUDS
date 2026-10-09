import type { Bar } from "./roles";

export const inr = (n: number): string => "Rs " + n.toLocaleString("en-IN");

export const shortHash = (h: string, head = 10, tail = 4): string =>
  h.length <= head + tail ? h : `${h.slice(0, head)}…${h.slice(-tail)}`;

export const barText = (b: Bar): string =>
  `${b.minTenure} months, ${b.minPeriods} paid weeks, ` +
  `${b.maxMissed === 0 ? "no missed weeks" : `up to ${b.maxMissed} missed`}, ` +
  `${inr(b.minIncome)} a month`;
