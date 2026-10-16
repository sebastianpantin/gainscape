export function CollectionHeading({ tab }: { tab: string }) {
  return (
    <h1 className="title" aria-label={`Collection: ${tab}`}>
      Collection
    </h1>
  );
}
