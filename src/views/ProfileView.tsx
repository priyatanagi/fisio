import React from 'react';
import { UserProfileForm } from '../components/UserProfileForm';
import type { UserProfile } from '../types/profile';
import type { UniversalRules } from '../config/universalRules';

interface ProfileViewProps {
  profile: UserProfile;
  onSave: (profile: UserProfile) => void;
  universalRules: UniversalRules;
  onSaveRules: (rules: UniversalRules) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  profile,
  onSave,
  universalRules,
  onSaveRules,
}) => (
  <div className="p-4 sm:p-6 lg:p-8">
    <UserProfileForm
      profile={profile}
      onSave={onSave}
      universalRules={universalRules}
      onSaveRules={onSaveRules}
    />
  </div>
);
