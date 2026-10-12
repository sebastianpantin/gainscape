export function CollectionHeading({ tab }: { tab: string }) {
  return (
    <h1 className="title" aria-label={`Collection log: ${tab}`}>
      Collection log
    </h1>
  );
}
