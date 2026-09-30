import { SegmentedNav } from '../../components/SegmentedNav.tsx';

export function FriendsTabs() {
  return (
    <SegmentedNav
      label="Friends"
      links={[
        { to: '/friends', label: 'Feed' },
        { to: '/friends/hiscores', label: 'Hiscores' },
      ]}
    />
  );
}
