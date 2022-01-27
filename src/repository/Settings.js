import Setting from "../entities/Settings";

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
          const settings = new Setting();
          if (autosave) Settings.save(settings.toJSON());
          resolve(settings);
          return;
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
