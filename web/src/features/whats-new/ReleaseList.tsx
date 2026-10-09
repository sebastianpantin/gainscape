import { useId } from 'react';
import type { Release } from '../../lib/changelog-rules.ts';
import { formatSessionDate } from '../../lib/format.ts';

type HeadingLevel = 2 | 3;

function ReleaseSection({ release, headingLevel }: { release: Release; headingLevel: HeadingLevel }) {
  const headingId = useId();
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section className="stack release" aria-labelledby={headingId}>
      <Heading id={headingId}>{release.title}</Heading>
      <p className="muted">
        Version {release.version} · {formatSessionDate(release.date)}
      </p>
      <ul className="release-items">
        {release.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export function ReleaseList({ releases, headingLevel }: { releases: readonly Release[]; headingLevel: HeadingLevel }) {
  return (
    <div className="stack release-list">
      {releases.map((release) => (
        <ReleaseSection key={release.version} release={release} headingLevel={headingLevel} />
      ))}
    </div>
  );
}
