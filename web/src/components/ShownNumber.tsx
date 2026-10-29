interface ShownNumberProps {
  shown: number;
  value: number;
  format?: (value: number) => string;
}

export function ShownNumber({ shown, value, format = String }: ShownNumberProps) {
  if (shown === value) return format(value);
  return (
    <>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="visually-hidden">{format(value)}</span>
    </>
  );
}
