import Settings from '../../../../repository/Settings';
import authManager from '../../../../UserAccessControl/authManager';

export default {
  
  getSettings() {
    return Settings.get();
  },
  saveSettings(settings) {
    settings.lastUpdatedOn = new Date();
    settings.lastUpdatedBy = authManager.currentUser;
    return Settings.save(settings.toJSON());
  },
 
};
