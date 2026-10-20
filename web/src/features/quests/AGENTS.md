# Quests Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-14 · **Updated:** 2026-10-14

## Purpose

The quest board at `/skills/quests`, linked from the Skills tab (a sibling of the Body page and the skill pages in `../skills/`): quest points, then every quest grouped in progress, available, locked and completed, with its requirements (your level against the required one, prerequisite quests), steps and progress, rewards (quest points, XP per skill) and the quests it unlocks. Available quests have a Start button that calls the `start-quest` Edge Function.

## Map

- `QuestsScreen.tsx`: loads `questsQuery` (cache-first quest log) and `useStanding` (skill XP and names), builds the board with `questBoard`, starts quests.
- `QuestCard.tsx`: one quest as an `article` named by its heading, with `Requirements`, `Steps` and `Rewards` lists.
- Every decision and text lives in `../../lib/quests/quest-rules.ts`; I/O in `../../lib/quests/quests.ts`.

## Rules and gotchas

- The server is authoritative. The board's status comes from the domain `questStatus`, the same rule `start-quest` checks with `questStartProblems`, so a card shows Start only when the server would accept it. A refused start still maps every error code to a sentence (`startQuestProblemText`) and refetches the log.
- Start is enabled only for an available quest while online (`canStartQuest`). Offline the saved log shows with its notice and Start stays disabled with "Connect to start this quest."
- A successful start announces `quest-started`; a synced workout refreshes the `quests` root through `workout-changed`.
- A retired quest shows only if it is in progress or completed. Progress only counts workouts finished after the start, which the available card says.
- The Train home shows the first quest in progress, in catalog order, with its current step and a bar over all steps (`activeQuestLine`); it links here.
- Requirements are labelled `Met`/`Not met` in text, so colour is not the only cue.

## Testing

- Unit: `tests/web/quest-rules.test.ts`, `tests/web/quests-cache.test.ts`, the quest load in `tests/web/screen-cache-saves.test.ts`.
- E2E (stack): `e2e/quests.spec.ts` (start, seeded progress via `seedQuestProgress`, completion on the reveal, profile and feed, offline, refused start), `e2e/a11y.spec.ts`.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
