/* eslint-disable no-restricted-syntax */
/* eslint-disable max-len */
import Location from '../../../../widget/js/global/repository/Locations';
import Analytics from '../../../../utils/analytics';
import DeepLink from '../../../../utils/deeplink';
import SearchEngine from '../../../../widget/js/global/repository/searchEngine';
import authManager from '../../../../UserAccessControl/authManager';
import { generateUUID } from '../../../../widget/js/global/helpers';
import Settings from '../../../../widget/js/global/repository/Settings';

export default {
  createLocation(location) {
    location.clientId = generateUUID();
    location.createdOn = new Date();
    location.createdBy = authManager.sanitizedCurrentUser;
    return Location.add(location.toJSON()).then((result) => {
      if (buildfire.services && buildfire.services.contract && buildfire.services.contract.events) {
        buildfire.services.contract.events.send('locationCreated', {
          locationId: result.id,
          title: result.title,
          subtitle: result.subtitle || null,
          address: result.address,
          latitude: result.coordinates.lat,
          longitude: result.coordinates.lng,
          listImage: result.listImage,
          createdOn: result.createdOn ? new Date(result.createdOn).toISOString() : null,
          createdBy: result.createdBy ? { userId: result.createdBy._id || null, displayName: result.createdBy.displayName || null } : null
        });
      }
      Analytics.registerLocationViewedEvent(result.id, result.title);
      DeepLink.registerDeeplink(result);
      return SearchEngine.add(Location.TAG, result.id, result).then(() => result);
    });
  },
  bulkCreateLocation(locations) {
    return Location.bulkAdd(locations).then((insertedLocations) => {
      const newDataCount = insertedLocations.length;
      for (let skip = 0; skip < newDataCount; skip += 50) {
        this.searchLocations({ skip, limit: 50, sort: { "_buildfire.index.date1": -1 } }).then(({ result, totalRecord }) => {
          for (const location of result) {
            Analytics.registerLocationViewedEvent(location.id, location.title);
            DeepLink.registerDeeplink(location);
            SearchEngine.add(Location.TAG, location.id, location).catch(console.error);
          }
        }).catch(console.error);
      }
      return insertedLocations;
    });
  },
  searchLocations(options = {}) {
    options.recordCount = true;
    return Location.search(options);
  },
  updateLocation(locationId, location) {
    location.lastUpdatedOn = new Date();
    location.lastUpdatedBy = authManager.sanitizedCurrentUser;
    const promiseChain = [
      Location.update(locationId, location.toJSON()),
      DeepLink.registerDeeplink(location),
      SearchEngine.update(Location.TAG, locationId, location.toJSON())
    ];
    return Promise.all(promiseChain).then((results) => {
      if (buildfire.services && buildfire.services.contract && buildfire.services.contract.events) {
        buildfire.services.contract.events.send('locationUpdated', {
          locationId,
          title: location.title,
          subtitle: location.subtitle || null,
          address: location.address,
          latitude: location.coordinates.lat,
          longitude: location.coordinates.lng,
          listImage: location.listImage,
          lastUpdatedOn: location.lastUpdatedOn.toISOString(),
          lastUpdatedBy: location.lastUpdatedBy ? { userId: location.lastUpdatedBy._id || null, displayName: location.lastUpdatedBy.displayName || null } : null
        });
      }
      return results;
    });
  },
  getPinnedLocation() {
    const options = {};
    options.sort = { "_buildfire.index.number1": 1 };

    options.filter = {
      "_buildfire.index.number1": { $in: [1, 2, 3] }
    };
    return this.searchLocations(options);
  },
  deleteLocation(locationId) {
    const promiseChain = [
      Location.delete(locationId),
      DeepLink.unregisterDeeplink(locationId),
      SearchEngine.delete(Location.TAG, locationId)
    ];
    return Promise.allSettled(promiseChain).then((results) => {
      if (results[0].status === 'fulfilled' && buildfire.services && buildfire.services.contract && buildfire.services.contract.events) {
        buildfire.services.contract.events.send('locationDeleted', { locationId });
      }
      return results;
    });
  },
  saveSettings(settings) {
    settings.lastUpdatedOn = new Date();
    settings.lastUpdatedBy = authManager.sanitizedCurrentUser;
    return Settings.save(settings.toJSON());
  },
  getById(id) {
    return Location.getById(id);
  }
};
