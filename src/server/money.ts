import Decimal from "decimal.js";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

export function D(value: Decimal.Value | { toString(): string }): Decimal {
  return new Decimal(value.toString());
}

export function roundMoney(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function roundPrice(value: Decimal): Decimal {
  return value.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

export function lineAmount(quantity: Decimal, unitPrice: Decimal, discount = new Decimal(0)): Decimal {
  return roundMoney(quantity.mul(unitPrice).minus(discount));
}

export function priceFromTarget(quantity: Decimal, targetTotal: Decimal): {
  unitPrice: Decimal;
  lineTotal: Decimal;
  adjustment: Decimal;
} {
  if (quantity.lte(0)) {
    throw new Error("რაოდენობა ნულზე მეტი უნდა იყოს");
  }
  const unitPrice = roundPrice(targetTotal.div(quantity));
  const raw = roundMoney(quantity.mul(unitPrice));
  const adjustment = roundMoney(targetTotal.minus(raw));
  return { unitPrice, lineTotal: roundMoney(raw.plus(adjustment)), adjustment };
}

export function monthlyMaintenanceFee(base: Decimal, percent: Decimal): Decimal {
  return roundMoney(base.mul(percent).div(100));
}

export function moneyText(value: Decimal): string {
  return roundMoney(value).toFixed(2);
}
