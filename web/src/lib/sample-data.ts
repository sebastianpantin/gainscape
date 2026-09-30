export type FeedEventKind = 'level' | 'pr' | 'drop';

export interface SampleFeedEvent {
  id: string;
  who: string;
  when: string;
  kind: FeedEventKind;
  badge: string;
  text: string;
  detail?: string;
  gzCount: number;
}

export const SAMPLE_FRIEND_REQUEST = { username: 'kasper_pulls' };

export const SAMPLE_FEED: SampleFeedEvent[] = [
  { id: 'e1', who: 'mira_lifts', when: '2 h', kind: 'level', badge: '70', text: 'Reached level 70 Legs', gzCount: 3 },
  {
    id: 'e2',
    who: 'dan_rows',
    when: 'yesterday',
    kind: 'pr',
    badge: 'PR',
    text: 'New 5RM Barbell Row: 92.5 kg',
    gzCount: 1,
  },
  {
    id: 'e3',
    who: 'tove',
    when: 'yesterday',
    kind: 'pr',
    badge: 'PR',
    text: 'New 8RM Leg Press',
    detail: 'Weights hidden by tove',
    gzCount: 0,
  },
  {
    id: 'e4',
    who: 'mira_lifts',
    when: '2 days',
    kind: 'drop',
    badge: 'RARE',
    text: 'Found Titan gloves',
    detail: 'Rare drop',
    gzCount: 4,
  },
  { id: 'e5', who: 'dan_rows', when: '3 days', kind: 'level', badge: '40', text: 'Reached level 40 Arms', gzCount: 2 },
];

export interface SampleFriendLevels {
  username: string;
  levelsBySkillKey: Record<string, number>;
}

export const SAMPLE_FRIENDS: SampleFriendLevels[] = [
  {
    username: 'mira_lifts',
    levelsBySkillKey: { chest: 62, back: 58, shoulders: 55, arms: 49, legs: 70, core: 44 },
  },
  {
    username: 'dan_rows',
    levelsBySkillKey: { chest: 40, back: 47, shoulders: 39, arms: 40, legs: 41, core: 28 },
  },
  {
    username: 'tove',
    levelsBySkillKey: { chest: 35, back: 33, shoulders: 30, arms: 36, legs: 45, core: 38 },
  },
];
