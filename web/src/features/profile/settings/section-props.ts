import { type Profile } from '../../../lib/profile/profile.ts';
import { type ProfileUpdate } from '../../../lib/profile/saved-profile.ts';

export interface SectionProps {
  userId: string;
  profile: Profile;
  replaceProfile: (update: ProfileUpdate) => void;
}
