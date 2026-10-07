interface ListSkeletonProps {
  panels?: number;
  tiles?: number;
}

interface ScreenSkeletonProps extends ListSkeletonProps {
  title?: string;
}

function placeholders(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

export function ListSkeleton({ panels = 3, tiles = 0 }: ListSkeletonProps) {
  return (
    <>
      <p className="visually-hidden" role="status">
        Loading…
      </p>
      {tiles > 0 && (
        <div className="skill-grid" aria-hidden="true">
          {placeholders(tiles).map((index) => (
            <div key={index} className="skeleton skeleton-tile" />
          ))}
        </div>
      )}
      {placeholders(panels).map((index) => (
        <div key={index} className="skeleton skeleton-panel" aria-hidden="true" />
      ))}
    </>
  );
}

export function ScreenSkeleton({ title, ...layout }: ScreenSkeletonProps) {
  return (
    <main className="screen stack" aria-busy="true">
      {title ? <h1 className="title">{title}</h1> : <div className="skeleton skeleton-title" aria-hidden="true" />}
      <ListSkeleton {...layout} />
    </main>
  );
}
