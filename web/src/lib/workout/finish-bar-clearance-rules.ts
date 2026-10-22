interface VerticalBox {
  top: number;
  bottom: number;
}

export function scrollToClearFinishBar(field: VerticalBox, barTop: number, gap: number): number {
  const overlap = field.bottom - (barTop - gap);
  if (overlap <= 0) return 0;
  return Math.max(0, Math.min(overlap, field.top));
}
