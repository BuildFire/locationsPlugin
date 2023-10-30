import Settings from '../../../../repository/Settings';
import authManager from '../../../../UserAccessControl/authManager';

export default {
  timeoutId: null,

  getSettings() {
    return Settings.get(true);
  },
  saveSettings(settings) {
    settings.lastUpdatedOn = new Date();
    settings.lastUpdatedBy = authManager.currentUser;
    return Settings.save(settings.toJSON());
  },
  saveSettingsWithDelay(settings) {
    clearTimeout(this.timeoutId);
    this.timeoutId = setTimeout(() => {
      this.saveSettings(settings).then(this.triggerWidgetOnListViewUpdate).catch(console.error);
    }, 300);
  },
  triggerWidgetOnListViewUpdate() {
    buildfire.messaging.sendMessageToWidget({
      cmd: 'sync',
      scope: 'intro'
    });
  },
};
