import Settings from '../../../../repository/Settings';
import authManager from '../../../../UserAccessControl/authManager';

export default {
  timeoutId: null,

  getSettings() {
    return Settings.get(true);
  },
  saveSettings(settings) {
    settings.lastUpdatedOn = new Date();
    settings.lastUpdatedBy = authManager.sanitizedCurrentUser;
    return Settings.save(settings.toJSON());
  },
};
