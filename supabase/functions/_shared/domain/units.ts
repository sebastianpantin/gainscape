export type WeightUnit = 'kg' | 'lb';

export const KG_PER_LB = 0.45359237;

export const STORED_KG_DECIMALS = 2;

export interface UnitAmount {
  kg: number;
  lb: number;
}

export const unitToKg: (value: number, unit: WeightUnit) => number = () => {
  throw new Error('not implemented');
};

export const kgToUnit: (kg: number, unit: WeightUnit) => number = () => {
  throw new Error('not implemented');
};

export const amountInUnit: (amount: UnitAmount, unit: WeightUnit) => number = () => {
  throw new Error('not implemented');
};
