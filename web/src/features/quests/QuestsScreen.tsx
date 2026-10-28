import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ScreenProblem } from '../../components/ScreenProblem.tsx';
import { ScreenSkeleton } from '../../components/ScreenSkeleton.tsx';
import { formatCount } from '../../lib/format.ts';
import { usePreferences } from '../../lib/profile/preferences.ts';
import { useStanding } from '../../lib/progress/standing.ts';
import { useIsOffline } from '../../lib/platform/use-online.ts';
import { announceDataChange } from '../../lib/query/data-changes.ts';
import { questsQuery } from '../../lib/query/queries.ts';
import { loadedState } from '../../lib/query/query-state-rules.ts';
import { type CatalogQuest, questBoard, type QuestSkill, startQuestProblemText } from '../../lib/quests/quest-rules.ts';
import { startQuest } from '../../lib/quests/quests.ts';
import { useToast } from '../../lib/ui/toast.ts';
import { cacheFirstNotice } from '../../offline/cache-first.ts';
import { OFFLINE_QUESTS_NOTICE } from '../../offline/quests-cache.ts';
import { BackToSkills } from '../skills/BackToSkills.tsx';
import { QuestCard } from './QuestCard.tsx';

interface QuestsScreenProps {
  userId: string;
}

export function QuestsScreen({ userId }: QuestsScreenProps) {
  const quests = useQuery(questsQuery(userId));
  const standing = useStanding(userId);
  const offline = useIsOffline();
  const { unitPref } = usePreferences();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const loaded = loadedState(quests.data, quests.error);
  const retry = () => Promise.all([quests.refetch(), standing.status === 'failed' && standing.retry()]);
  const heading = <h1 className="title">Quests</h1>;
  if (loaded.status === 'failed') return <ScreenProblem heading={heading} problem={loaded.problem} onRetry={retry} />;
  if (standing.status === 'failed')
    return <ScreenProblem heading={heading} problem={standing.problem} onRetry={retry} />;
  if (loaded.status === 'loading' || standing.status === 'loading') return <ScreenSkeleton title="Quests" />;

  const log = loaded.data.loaded;
  const skills: QuestSkill[] = standing.standing.skills.map(({ skill }) => skill);
  const skillXp = Object.fromEntries(standing.standing.skills.map(({ skill, progress }) => [skill.id, progress.xp]));
  const board = questBoard(log, skills, skillXp, unitPref);
  const notice = cacheFirstNotice(loaded.data, OFFLINE_QUESTS_NOTICE);
  const firstAvailableId = board.find((group) => group.status === 'available')?.cards[0]?.quest.questId;
  const names = {
    skillName: (skillId: string) => skills.find((skill) => skill.id === skillId)?.name ?? 'a skill',
    questName: (questId: string) => log.quests.find((quest) => quest.questId === questId)?.name ?? 'another quest',
  };

  const start = async (quest: CatalogQuest): Promise<string | null> => {
    const outcome = await startQuest(userId, quest.questId);
    if (outcome.kind === 'ok') {
      showToast(`Started ${quest.name}`);
      await announceDataChange(queryClient, 'quest-started');
      return null;
    }
    if (outcome.kind === 'http_error') void queryClient.invalidateQueries({ queryKey: questsQuery(userId).queryKey });
    return startQuestProblemText(outcome, names);
  };

  return (
    <main className="screen stack">
      <BackToSkills />
      <h1 className="title">Quests</h1>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <dl className="panel row spread">
        <dt>Quest points</dt>
        <dd className="pixel accent-text">
          <strong>{log.questPoints}</strong>
        </dd>
      </dl>
      {board.length === 0 && <p className="panel muted">No quests yet.</p>}
      {board.map((group) => {
        const cards = (
          <ul className="quest-cards">
            {group.cards.map((card) => (
              <li key={card.quest.questId}>
                <QuestCard
                  card={card}
                  offline={offline}
                  primary={card.quest.questId === firstAvailableId}
                  onStart={() => start(card.quest)}
                />
              </li>
            ))}
          </ul>
        );
        return (
          <section className="stack" key={group.status} aria-labelledby={`quests-${group.status}`}>
            <h2 id={`quests-${group.status}`}>{group.title}</h2>
            {group.status === 'available' && !offline && (
              <p className="muted tiny">Only workouts you finish after starting a quest count toward it.</p>
            )}
            {group.folded ? (
              <details>
                <summary className="button">
                  Show {formatCount(group.cards.length, `${group.title.toLowerCase()} quest`)}
                </summary>
                {cards}
              </details>
            ) : (
              cards
            )}
          </section>
        );
      })}
      <p className="muted tiny">
        Finish a quest for quest points and bonus XP. Every workout moves your started quests along.
      </p>
    </main>
  );
}
