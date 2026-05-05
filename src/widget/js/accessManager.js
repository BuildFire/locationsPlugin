import authManager from '../../UserAccessControl/authManager';
import constants from './global/constants';
import state from './state';
import UserPurchases from './global/repository/UserPurchases';
import Purchase from '../../shared/utils/purchase';

const getUserTagNames = (user) => {
  if (!user || !user.tags) return [];
  let tagNames = [];
  Object.keys(user.tags).forEach((key) => {
    tagNames = tagNames.concat(user.tags[key].map((t) => t.tagName));
  });
  return tagNames;
};

const checkAddingPermission = (allowAdding, tags, currentUser) => {
  if (!currentUser || allowAdding === 'none') {
    return false;
  }
  if (allowAdding === 'all') {
    return true;
  }
  if (allowAdding === 'limited') {
    const tagNames = tags.map((t) => t.tagName);
    const userTagNames = getUserTagNames(currentUser);
    return userTagNames.some((r) => tagNames.includes(r));
  }
  return false;
};

export default {
  canCreateLocations() {
    const { currentUser } = authManager;
    const { allowAdding, tags } = state.settings.globalEntries.locations;
    return checkAddingPermission(allowAdding, tags, currentUser);
  },
  canAddLocationPhotos() {
    const { currentUser } = authManager;
    const { allowAdding, tags } = state.settings.globalEntries.photos;
    return checkAddingPermission(allowAdding, tags, currentUser);
  },
  canAddEditOpenHours() {
    const { currentUser } = authManager;
    const { openHours } = state.settings.globalEntries;

    if (!openHours?.inAppEnabled) {
      return false;
    }

    const { allowAdding, tags } = openHours;
    return checkAddingPermission(allowAdding, tags, currentUser);
  },
  canAddEditPriceRange() {
    const { currentUser } = authManager;
    const { priceRange } = state.settings.globalEntries;

    if (!priceRange?.inAppEnabled) {
      return false;
    }

    const { allowAdding, tags } = priceRange;
    return checkAddingPermission(allowAdding, tags, currentUser);
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
  hasIntroScreenAccess() {
    const { currentUser } = authManager;
    const { visibilityOptions } = state.settings.introductoryListView;

    if (visibilityOptions.value === constants.IntroViewVisibilityOptions.ALL) return true;

    const appId = buildfire.getContext().appId;
    if (currentUser && currentUser.tags && currentUser.tags[appId] && visibilityOptions.value === constants.IntroViewVisibilityOptions.TAGS) {
      const allowedTagNames = visibilityOptions.tags.map((t) => t.tagName);

      const userTagNames = currentUser.tags[appId].map((tag) => tag.tagName);

      return userTagNames.some((tagName) => allowedTagNames.includes(tagName));
    }
    return false;
  },
  checkSubscriptionAndPurchases() {
    const { currentUser } = authManager;
    const { charging } = state.settings.globalEntries;

    if (!charging || !charging.enabled || (charging.enabled !== 'all' && charging.enabled !== 'limited')) {
      return Promise.resolve({ isValid: true, shouldNavigateToPurchases: false });
    }

    if (charging.enabled === 'limited' && currentUser) {
      const tagNames = charging.tags.map((t) => t.tagName);
      let userTagNames = [];
      Object.keys(currentUser.tags).forEach((key) => {
        userTagNames = userTagNames.concat(currentUser.tags[key].map((t) => t.tagName));
      });
      if (!userTagNames.some((r) => tagNames.includes(r))) {
        return Promise.resolve({ isValid: true, shouldNavigateToPurchases: false });
      }
    }

    return UserPurchases.search()
      .then((result) => {
        if (!result) {
          return { isValid: false, shouldNavigateToPurchases: true };
        }

        if (!result.purchase || result.purchase.length === 0) {
          return { isValid: false, shouldNavigateToPurchases: true };
        }

        const { productId } = result.purchase[0];
        const subscriptionOptions = charging.subscriptionOptions || [];
        const productExists = subscriptionOptions.some((sub) => sub.subscriptionId === productId);

        if (!productExists) {
          return { isValid: false, shouldNavigateToPurchases: true };
        }

        return Purchase.validateSubscription(productId)
          .then((isPurchased) => {
            if (!isPurchased) {
              UserPurchases.save([]);
            }
            return {
              isValid: isPurchased,
              shouldNavigateToPurchases: !isPurchased
            };
          });
      })
      .catch((error) => {
        console.error('Error checking subscription:', error);
        return { isValid: false, shouldNavigateToPurchases: true };
      });
  }
};
