import { type Collection } from '../../lib/collection/collection-data.ts';
import { type Profile } from '../../lib/profile/profile-rules.ts';
import { sbdTotalFor } from '../../lib/stats/sbd-total-rules.ts';
import { formatWeight } from '../../lib/units.ts';
import { localDateIn } from '../../lib/ui/date-bucket-rules.ts';

export function SbdTotalCard({
  profile,
  collection,
  standalone = false,
}: {
  profile: Profile;
  collection: Collection;
  standalone?: boolean;
}) {
  const card = sbdTotalFor(collection);
  const unit = profile.unitPref;
  return (
    <section className={standalone ? 'panel stack' : 'stack'} aria-labelledby="sbd-total-heading">
      {standalone ? <h2 id="sbd-total-heading">Total</h2> : <h3 id="sbd-total-heading">Total</h3>}
      {card.kind === 'missing-lifts' && <p className="muted">{card.text}</p>}
      {card.kind === 'ready' && (
        <dl className="stack">
          <div className="row spread">
            <dt>Estimated total</dt>
            <dd>{formatWeight(card.estimatedKg, unit)}</dd>
          </div>
          <div className="row spread">
            <dt>Best lifted total</dt>
            <dd>
              {card.bestKg === null
                ? 'Log each lift to see your best lifted total'
                : card.bestAchievedAt === null
                  ? formatWeight(card.bestKg, unit)
                  : `${formatWeight(card.bestKg, unit)}, oldest lift from ${localDateIn(profile.timezone, Date.parse(card.bestAchievedAt))}`}
            </dd>
          </div>
          {card.lifts.map((lift) => (
            <div className="row spread" key={lift.key}>
              <dt>{lift.name}</dt>
              <dd>
                {formatWeight(lift.currentKg, unit)} estimated,{' '}
                {lift.bestKg === null ? 'none logged' : `${formatWeight(lift.bestKg, unit)} heaviest`}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
