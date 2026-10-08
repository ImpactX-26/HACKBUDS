/**
 * GigVault - Personas Index
 */

export * from './persona-types.js';
export { getRameshTransactions } from './ramesh-swiggy.js';
export { getSureshTransactions } from './suresh-uber-ola.js';
export { getImranTransactions } from './imran-cab.js';
export { getManjunathTransactions } from './manjunath-urban-company.js';
export { getVenkateshTransactions } from './venkatesh-porter.js';
export { getFarhanTransactions } from './farhan-swiggy-zomato.js';
export { getArjunTransactions } from './arjun-mehta.js';

import { PERSONAS } from './persona-types.js';
import { getRameshTransactions } from './ramesh-swiggy.js';
import { getSureshTransactions } from './suresh-uber-ola.js';
import { getImranTransactions } from './imran-cab.js';
import { getManjunathTransactions } from './manjunath-urban-company.js';
import { getVenkateshTransactions } from './venkatesh-porter.js';
import { getFarhanTransactions } from './farhan-swiggy-zomato.js';
import { getArjunTransactions } from './arjun-mehta.js';
import type { RawTransaction } from '../types.js';

export function getTransactionsForPersona(personaId: string): RawTransaction[] {
  switch (personaId) {
    case PERSONAS.RAMESH.id:
      return getRameshTransactions();
    case PERSONAS.SURESH.id:
      return getSureshTransactions();
    case PERSONAS.IMRAN.id:
      return getImranTransactions();
    case PERSONAS.MANJUNATH.id:
      return getManjunathTransactions();
    case PERSONAS.VENKATESH.id:
      return getVenkateshTransactions();
    case PERSONAS.FARHAN.id:
      return getFarhanTransactions();
    case PERSONAS.ARJUN.id:
      return getArjunTransactions();
    default:
      throw new Error(`Unknown persona ID: ${personaId}`);
  }
}
