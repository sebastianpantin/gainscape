interface SampleNoteProps {
  feature: string;
}

export function SampleNote({ feature }: SampleNoteProps) {
  return (
    <p className="sample-note" role="note">
      <strong>Sample data.</strong> {feature} aren't built yet, so this screen shows made-up examples.
    </p>
  );
}
