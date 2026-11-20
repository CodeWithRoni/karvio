// Match the server's decimal shifting, including its existing negative-tie direction.
export function roundDecimal(value, places = 2) {
  const v = Number(value) || 0;
  if (!Number.isFinite(v)) return v;
  const [mantissa, exponent = '0'] = String(v).split('e');
  const shifted = Number(mantissa + 'e' + (Number(exponent) + places));
  if (!Number.isFinite(shifted)) return v;
  const [rounded, shiftedExponent = '0'] = String(Math.round(shifted)).split('e');
  return Number(rounded + 'e' + (Number(shiftedExponent) - places));
}
