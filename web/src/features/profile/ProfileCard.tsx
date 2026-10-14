import { BADGE_COLORS, type BadgeColor, initialsFor, TRAINING_FOCUS_LABELS } from '../../lib/profile/profile.ts';
import type { CardProfile } from '../../lib/profile/profile-view.ts';

interface ProfileCardProps {
  profile: CardProfile;
  totalLevel: number | null;
  combatLevel: number | null;
  collectionPercent: number | null;
  questPoints: number | null;
  nameIsPageTitle?: boolean;
}

function joinedLabel(createdAt: string): string {
  return `Joined ${new Date(createdAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-tile">
      <dt className="muted tiny">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

interface ProfileBadgeProps {
  color: BadgeColor;
  initials: string;
  size?: number;
  named?: boolean;
}

export function ProfileBadge({ color, initials, size = 72, named }: ProfileBadgeProps) {
  const swatch = BADGE_COLORS[color];
  return (
    <span
      className="profile-badge"
      {...(named ? { role: 'img', 'aria-label': `${swatch.label} badge` } : { 'aria-hidden': true })}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: swatch.fill,
        boxShadow: `inset 3px 3px 0 ${swatch.light}, inset -3px -3px 0 ${swatch.dark}, 3px 3px 0 #000`,
      }}
    >
      {initials}
    </span>
  );
}

function detailLine(profile: CardProfile): string {
  const parts = [
    profile.trainingSince !== null && `Training since ${profile.trainingSince}`,
    profile.trainingFocus !== null && `${TRAINING_FOCUS_LABELS[profile.trainingFocus]} focus`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : joinedLabel(profile.createdAt);
}

export function ProfileCard({
  profile,
  totalLevel,
  combatLevel,
  collectionPercent,
  questPoints,
  nameIsPageTitle = false,
}: ProfileCardProps) {
  const NameHeading = nameIsPageTitle ? 'h1' : 'h2';
  return (
    <section className="panel stack profile-card" aria-label="Profile">
      <div className="row" style={{ gap: 14 }}>
        <ProfileBadge named color={profile.badgeColor} initials={initialsFor(profile.displayName, profile.username)} />
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <NameHeading className="profile-name">{profile.displayName}</NameHeading>
          <span className="muted">@{profile.username}</span>
          <span className="tiny">{detailLine(profile)}</span>
        </div>
      </div>
      {profile.bio && <p>{profile.bio}</p>}
      <dl className="stat-tiles">
        <StatTile label="Total" value={totalLevel === null ? '—' : String(totalLevel)} />
        <StatTile label="Combat" value={combatLevel === null ? '—' : String(combatLevel)} />
        <StatTile label="Collection" value={collectionPercent === null ? '—' : `${collectionPercent}%`} />
        <StatTile label="Quest points" value={questPoints === null ? '—' : String(questPoints)} />
      </dl>
    </section>
  );
}
