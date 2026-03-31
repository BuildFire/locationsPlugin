import Setting from "../entities/Settings";
import constants from "../widget/js/constants";

export default class Settings {
  /**
   * Get Database Tag
   */
  static get TAG() {
    return "settings";
  }

  /**
   * @param {Boolean} autosave if settings is not initialized
   */
  static get(autosave = false) {
    return new Promise((resolve, reject) => {
      buildfire.datastore.get(Settings.TAG, (err, res) => {
        if (err) return reject(err);

        if (!res || !res.data || Object.keys(res.data).length === 0) {
          // for the new instances, subscription should be enabled by default
          // unlike the old instances, which should be disabled by default for backward compatible
          const settings = new Setting({
            subscription: {
              enabled: true,
              allowCustomNotifications: true,
            }
          });
          if (autosave) Settings.save(settings.toJSON());
          resolve(settings);
          return;
        }

        if (res.data.hasOwnProperty('showIntroductoryListView')) {
          if (!res.data.introductoryListView.visibilityOptions) {
            res.data.introductoryListView.visibilityOptions = {
              tags: [],
              value: res.data.showIntroductoryListView ? constants.IntroViewVisibilityOptions.ALL : constants.IntroViewVisibilityOptions.NONE
            }
          }

          delete res.data.showIntroductoryListView;
        }

        resolve(new Setting(res.data));
      });
    });
  }

  /**
   * Save Settings
   * @param {setting} Settings Object
   */
  static save(setting) {
    return new Promise((resolve, reject) => {
      buildfire.datastore.save(setting, Settings.TAG, (err, res) => {
        if (err || !res) {
          return reject(err);
        }
        resolve(new Setting(res.data));
      });
    });
  }
}
