import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon.tsx';
import { type LoadedState } from '../../lib/query/query-state-rules.ts';
import { BODY_SKILLS, type BodySkill } from '../../lib/progress/recovery-rules.ts';
import {
  type MuscleVolume,
  VOLUME_BAND_TEXT,
  VOLUME_TARGET,
  volumeSetsLabel,
} from '../../lib/progress/weekly-volume-rules.ts';
import { VolumeBar } from './VolumeBar.tsx';
import { VolumeContributionList } from './VolumeContributionList.tsx';

interface WeeklyVolumePanelProps {
  volume: LoadedState<Record<BodySkill, MuscleVolume>>;
  nameOf: (skill: BodySkill) => string;
}

interface MuscleRowProps {
  skill: BodySkill;
  name: string;
  volume: MuscleVolume;
  open: boolean;
  onToggle: () => void;
}

function MuscleRow({ skill, name, volume, open, onToggle }: MuscleRowProps) {
  const detailsId = useId();
  return (
    <li className="volume-row">
      <button type="button" className="volume-toggle" aria-expanded={open} aria-controls={detailsId} onClick={onToggle}>
        <span className="row spread">
          <span>{name}</span>
          <span className="muted">
            {volumeSetsLabel(volume.sets)}
            <span className="visually-hidden"> this week</span> · {VOLUME_BAND_TEXT[volume.band]}
          </span>
        </span>
        <VolumeBar volume={volume} />
      </button>
      <div id={detailsId} className="volume-details" hidden={!open}>
        <VolumeContributionList name={name} volume={volume} />
        <Link className="tiny" to={`/skills/${skill}`}>
          {name} skill
          <Icon name="chevron" size={16} />
        </Link>
      </div>
    </li>
  );
}

export function WeeklyVolumePanel({ volume, nameOf }: WeeklyVolumePanelProps) {
  const headingId = useId();
  const [openSkill, setOpenSkill] = useState<BodySkill | null>(null);
  if (volume.status === 'loading') return null;
  if (volume.status === 'failed')
    return (
      <section className="panel stack" aria-labelledby={headingId}>
        <h2 id={headingId}>Sets this week</h2>
        <p className="muted">Weekly sets need a connection to load your recent sets.</p>
      </section>
    );
  return (
    <section className="panel stack" aria-labelledby={headingId}>
      <h2 id={headingId}>Sets this week</h2>
      <ul className="volume-list">
        {BODY_SKILLS.map((skill) => (
          <MuscleRow
            key={skill}
            skill={skill}
            name={nameOf(skill)}
            volume={volume.data[skill]}
            open={openSkill === skill}
            onToggle={() => setOpenSkill(openSkill === skill ? null : skill)}
          />
        ))}
      </ul>
      <p className="muted tiny">
        Working sets since Monday, split across the muscles each exercise trains. The marked band is a target of{' '}
        {VOLUME_TARGET.min} to {VOLUME_TARGET.max} sets a week per muscle.
      </p>
    </section>
  );
}
