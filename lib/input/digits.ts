const PERSIAN_ZERO = "۰".charCodeAt(0);
const ARABIC_ZERO = "٠".charCodeAt(0);

export function normalizeLocalizedDigits(value: string) {
  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const code = digit.charCodeAt(0);
    const offset = code >= ARABIC_ZERO && code <= ARABIC_ZERO + 9
      ? code - ARABIC_ZERO
      : code - PERSIAN_ZERO;

    return String(offset);
  });
}

export function keepAsciiDigits(value: string) {
  return normalizeLocalizedDigits(value).replace(/\D/g, "");
}
