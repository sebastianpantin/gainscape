export type IconName = 'train' | 'skills' | 'log' | 'friends' | 'search' | 'check' | 'chevron' | 'profile';

const PATHS: Record<IconName, string[]> = {
  train: ['M6 6v12M2.5 9v6M18 6v12M21.5 9v6M6 12h12'],
  skills: ['M5 20v-7M12 20V4M19 20v-11M2 20h20'],
  log: ['M5 3h12l2 2v16H7l-2-2z', 'M9 8h6M9 12h6'],
  friends: [
    'M5.5 8a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0',
    'M2.5 20a6.5 6.5 0 0 1 13 0',
    'M16 4.8a3.5 3.5 0 0 1 0 6.4M21.5 20a6.5 6.5 0 0 0-3.5-5.8',
  ],
  search: ['M5 11a6 6 0 1 0 12 0a6 6 0 1 0 -12 0', 'M16 16l5 5'],
  check: ['M4 12l5 5L20 6'],
  chevron: ['M9 5l7 7-7 7'],
  profile: ['M8 8a4 4 0 1 0 8 0a4 4 0 1 0 -8 0', 'M4 21a8 8 0 0 1 16 0'],
};

interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}

export function Icon({ name, size = 24, strokeWidth = 2.5 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="square"
      aria-hidden="true"
    >
      {PATHS[name].map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}
