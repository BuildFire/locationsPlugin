import authManager from '../../UserAccessControl/authManager';
import state from './state';

export default {
  canCreateLocations() {
    const { currentUser } = authManager;
    const { allowAdding, tags } = state.settings.globalEntries.locations;

    if (!currentUser || allowAdding === 'none') {
      return false;
    } if (allowAdding === 'all') {
      return true;
    } if (allowAdding === 'limited') {
      const tagNames = tags.map((t) => t.tagName);
      let userTagNames = [];
      Object.keys(currentUser.tags).forEach((key) => {
        userTagNames = userTagNames.concat(currentUser.tags[key].map((t) => t.tagName));
      });
      return userTagNames.some((r) => tagNames.includes(r));
    }
  },
  canAddLocationPhotos() {
    const { currentUser } = authManager;
    const { allowAdding, tags } = state.settings.globalEntries.photos;

    if (!currentUser || allowAdding === 'none') {
      return false;
    } if (allowAdding === 'all') {
      return true;
    } if (allowAdding === 'limited') {
      const tagNames = tags.map((t) => t.tagName);
      let userTagNames = [];
      Object.keys(currentUser.tags).forEach((key) => {
        userTagNames = userTagNames.concat(currentUser.tags[key].map((t) => t.tagName));
      });
      return userTagNames.some((r) => tagNames.includes(r));
    }
  },
  canEditLocations() {
    let authed = false;
    const { currentUser } = authManager;
    const { selectedLocation } = state;
    if (!currentUser) return authed;

    const { globalEditors, locationEditors } = state.settings;
    const userId = currentUser._id;

    if (globalEditors.enabled && globalEditors.allowLocationCreatorsToEdit && selectedLocation.createdBy?._id === userId) {
      authed = true;
      return authed;
    }

    let userTags = [];
    let tags = [];
    let editors = [];

    if (globalEditors.enabled) {
      editors = globalEditors.users;
      tags = globalEditors.tags.map((t) => t.tagName);
    }

    if (locationEditors.enabled && selectedLocation.editingPermissions?.active) {
      editors = [...editors, ...selectedLocation.editingPermissions.editors];
      tags = [...tags, ...selectedLocation.editingPermissions.tags.map((t) => t.tagName)];
    }

    for (const key in currentUser.tags) {
      if (currentUser.tags[key]) {
        userTags = userTags.concat(currentUser.tags[key].map((t) => t.tagName));
      }
    }

    if (editors.indexOf(userId) > -1 || userTags.some((r) => tags.includes(r))) {
      authed = true;
    }
    return authed;
  },
};
