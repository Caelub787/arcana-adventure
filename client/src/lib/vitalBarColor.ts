// Same threshold/color rule the token's own HP and Wounds bars use — full
// green above 60%, yellow above 30%, red at or below — reused everywhere
// else a vital-resource bar (HP, Wounds, Energy) is drawn so they all read
// consistently, on the token or off it.
export function vitalBarColor(value: number, max: number): string {
  if (max <= 0) return 'bg-stone-500';
  const pct = (value / max) * 100;
  return pct > 60 ? 'bg-green-500' : pct > 30 ? 'bg-yellow-500' : 'bg-red-500';
}
