import Setting from "../data/Settings";
import constants from "../constants";

export default class Settings {
  /**
   * Get Database Tag
   */
  static get TAG() {
    return "settings";
  }

  /**
   * Migrate old field properties to new structure
   */
  static migrateFieldSettings(data) {
    if (data.globalEntries) {
      if (data.globalEntries.allowPriceRange != null) {
        data.globalEntries.priceRange = {
          enabled: data.globalEntries.allowPriceRange,
          inAppEnabled: data.globalEntries.allowPriceRange ? 'all' : 'none',
          tags: [],
        };
        delete data.globalEntries.allowPriceRange;
      }

      if (data.globalEntries.allowOpenHours != null) {
        data.globalEntries.openHours = {
          enabled: data.globalEntries.allowOpenHours,
          inAppEnabled: data.globalEntries.allowPriceRange ? 'all' : 'none',
          tags: [],
        };
        delete data.globalEntries.allowOpenHours;
      }
    }
    return data;
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

        // Migrate old field properties to new structure
        const migratedData = Settings.migrateFieldSettings(res.data);
        if (buildfire.getContext().type === "control") {
          // Settings.save(migratedData);
        }
        resolve(new Setting(migratedData));
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
