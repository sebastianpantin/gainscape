import type { ItemIconKind } from '../components/PixelArt.tsx';

export type ItemTier = 'Rookie' | 'Grinder' | 'Tempered' | 'Forged' | 'Titan';

export const TIER_COLORS: Record<ItemTier, string> = {
  Rookie: '#8a7d66',
  Grinder: '#a9b4bd',
  Tempered: '#7fd46a',
  Forged: '#e0823d',
  Titan: '#6fa8dc',
};

export interface RecipeInput {
  name: string;
  have: number;
  need: number;
}

export interface SampleItem {
  id: string;
  name: string;
  icon: ItemIconKind;
  tier?: ItemTier;
  quantity?: number;
  isNew?: boolean;
  description: string;
  craftsInto?: { name: string; inputs: RecipeInput[] };
}

export interface ItemGroup {
  title: string;
  slots: number;
  items: SampleItem[];
}

export const SAMPLE_ITEM_GROUPS: ItemGroup[] = [
  {
    title: 'Gear',
    slots: 10,
    items: [
      {
        id: 'rookie-belt',
        name: 'Rookie belt',
        icon: 'belt',
        tier: 'Rookie',
        description: 'In your collection.',
        craftsInto: {
          name: 'Grinder belt',
          inputs: [
            { name: 'Rookie belt', have: 1, need: 1 },
            { name: 'Grinder scraps', have: 11, need: 8 },
          ],
        },
      },
      {
        id: 'grinder-belt',
        name: 'Grinder belt',
        icon: 'belt',
        tier: 'Grinder',
        description: 'In your collection.',
        craftsInto: {
          name: 'Tempered belt',
          inputs: [
            { name: 'Grinder belt', have: 1, need: 1 },
            { name: 'Tempered scraps', have: 0, need: 8 },
          ],
        },
      },
      { id: 'rookie-chalk', name: 'Rookie chalk', icon: 'chalk', tier: 'Rookie', description: 'In your collection.' },
      {
        id: 'tempered-chalk',
        name: 'Tempered chalk',
        icon: 'chalk',
        tier: 'Tempered',
        isNew: true,
        description: 'New! Dropped on your last workout.',
        craftsInto: {
          name: 'Forged chalk',
          inputs: [
            { name: 'Tempered chalk', have: 1, need: 1 },
            { name: 'Forged scraps', have: 4, need: 6 },
          ],
        },
      },
      {
        id: 'rookie-straps',
        name: 'Rookie straps',
        icon: 'straps',
        tier: 'Rookie',
        description: 'In your collection.',
      },
      {
        id: 'grinder-sleeves',
        name: 'Grinder sleeves',
        icon: 'sleeves',
        tier: 'Grinder',
        description: 'In your collection.',
      },
      { id: 'rookie-shoes', name: 'Rookie shoes', icon: 'shoes', tier: 'Rookie', description: 'In your collection.' },
    ],
  },
  {
    title: 'Materials',
    slots: 5,
    items: [
      {
        id: 'grinder-scraps',
        name: 'Grinder scraps',
        icon: 'scraps',
        tier: 'Grinder',
        quantity: 11,
        description: 'Used to craft Grinder gear.',
      },
      {
        id: 'forged-scraps',
        name: 'Forged scraps',
        icon: 'scraps',
        tier: 'Forged',
        quantity: 4,
        description: 'Used to craft Forged gear.',
      },
    ],
  },
  {
    title: 'Scrolls',
    slots: 5,
    items: [
      {
        id: 'deficit-deadlift-scroll',
        name: 'Scroll: deficit deadlift',
        icon: 'scroll',
        description: 'Unlocks the deficit deadlift variation. It logs as its own exercise.',
      },
    ],
  },
];

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
