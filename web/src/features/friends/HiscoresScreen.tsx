import { combatLevel, totalLevel } from '@domain/index.ts';
import { useEffect, useState } from 'react';
import { SampleNote } from '../../components/SampleNote.tsx';
import { fetchSkills, fetchSkillXp, type Skill } from '../../lib/catalog.ts';
import { SAMPLE_FRIENDS } from '../../lib/sample-data.ts';
import { standingFrom } from '../../lib/standing.ts';
import { supabase } from '../../lib/supabase.ts';
import { FriendsTabs } from './FriendsTabs.tsx';

interface HiscoresScreenProps {
  userId: string;
}

interface Contender {
  name: string;
  me: boolean;
  levelsBySkillKey: Record<string, number>;
  totalLevel: number;
  combatLevel: number;
}

type Metric = string;

async function fetchOwnUsername(userId: string): Promise<string> {
  const { data, error } = await supabase.from('profiles').select('username').eq('id', userId).single();
  if (error) throw error;
  return data.username as string;
}

function friendContender(skills: Skill[], friend: (typeof SAMPLE_FRIENDS)[number]): Contender {
  const levels = skills.map((skill) => friend.levelsBySkillKey[skill.key] ?? 1);
  return {
    name: friend.username,
    me: false,
    levelsBySkillKey: friend.levelsBySkillKey,
    totalLevel: totalLevel(levels),
    combatLevel: combatLevel(skills.map((skill, index) => ({ level: levels[index], weight: skill.combatWeight }))),
  };
}

function valueFor(contender: Contender, metric: Metric): number {
  if (metric === 'total') return contender.totalLevel;
  if (metric === 'combat') return contender.combatLevel;
  return contender.levelsBySkillKey[metric] ?? 1;
}

export function HiscoresScreen({ userId }: HiscoresScreenProps) {
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [me, setMe] = useState<Contender | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>('total');

  useEffect(() => {
    let active = true;
    Promise.all([fetchSkills(), fetchSkillXp(userId), fetchOwnUsername(userId).catch(() => 'you')]).then(
      ([loadedSkills, xpBySkillId, username]) => {
        if (!active) return;
        const standing = standingFrom(loadedSkills, xpBySkillId);
        setSkills(loadedSkills);
        setMe({
          name: `${username} (you)`,
          me: true,
          levelsBySkillKey: Object.fromEntries(
            standing.skills.map(({ skill, progress }) => [skill.key, progress.level]),
          ),
          totalLevel: standing.totalLevel,
          combatLevel: standing.combatLevel,
        });
      },
      (error: Error) => active && setProblem(error.message),
    );
    return () => {
      active = false;
    };
  }, [userId]);

  const metrics: { key: Metric; label: string }[] = [
    { key: 'total', label: 'Total' },
    { key: 'combat', label: 'Combat' },
    ...(skills ?? []).map((skill) => ({ key: skill.key, label: skill.name })),
  ];
  const contenders = skills && me ? [me, ...SAMPLE_FRIENDS.map((friend) => friendContender(skills, friend))] : [];
  const ranked = [...contenders].sort((a, b) => valueFor(b, metric) - valueFor(a, metric));
  const metricLabel = metrics.find((entry) => entry.key === metric)?.label ?? 'Total';

  return (
    <main className="screen stack">
      <h1 className="title">Friends</h1>
      <FriendsTabs />
      <SampleNote feature="Friends and hiscores" />
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
      {!skills && !problem && <p>Loading…</p>}
      {skills && (
        <>
          <div className="metric-grid" role="radiogroup" aria-label="Rank by">
            {metrics.map((entry) => (
              <button
                key={entry.key}
                type="button"
                role="radio"
                aria-checked={metric === entry.key}
                className={`effort-option ${metric === entry.key ? 'selected' : ''}`}
                onClick={() => setMetric(entry.key)}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <ol className="panel hiscores" aria-label={`Ranked by ${metricLabel}`}>
            {ranked.map((contender, index) => (
              <li className={contender.me ? 'hiscore-row me' : 'hiscore-row'} key={contender.name}>
                <span className="hiscore-rank">{index + 1}</span>
                <span className="hiscore-name">{contender.name}</span>
                <span className="hiscore-value">{valueFor(contender, metric)}</span>
              </li>
            ))}
          </ol>
          <p className="muted">Only you and your friends. Hiscores rank levels, never weights.</p>
        </>
      )}
    </main>
  );
}
