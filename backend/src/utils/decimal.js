import { Prisma } from "@prisma/client";

export const ZERO_DECIMAL = new Prisma.Decimal(0);

export function toDecimal(value) {
  if (value instanceof Prisma.Decimal) {
    return value;
  }

  if (value == null || value === "") {
    return ZERO_DECIMAL;
  }

  return new Prisma.Decimal(value);
}

export function decimalToNumber(value) {
  if (value == null) {
    return null;
  }

  if (value instanceof Prisma.Decimal) {
    return Number(value);
  }

  return Number(value);
}

export function roundCurrency(value) {
  return Number(toDecimal(value).toFixed(2));
}
