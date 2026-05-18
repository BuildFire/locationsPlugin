import authManager from '../../UserAccessControl/authManager';
import constants from './global/constants';
import state from './state';
import Purchase from '../../shared/services/purchase';

const getUserTagNames = (user) => {
  if (!user || !user.tags) return [];
  let tagNames = [];
  Object.keys(user.tags).forEach((key) => {
    tagNames = tagNames.concat(user.tags[key].map((t) => t.tagName));
  });
  return tagNames;
};

const checkPermission = (permission, tags, currentUser) => {
  // Check if user has permission based on config: 'none', 'all', or 'limited' (by tags)
  if (!currentUser || permission === 'none') {
    return false;
  }
  if (permission === 'all') {
    return true;
  }
  if (permission === 'limited') {
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
    return checkPermission(allowAdding, tags, currentUser);
  },
  canAddLocationPhotos() {
    const { currentUser } = authManager;
    const { allowAdding, tags } = state.settings.globalEntries.photos;
    return checkPermission(allowAdding, tags, currentUser);
  },
  canAddEditOpenHours() {
    const { currentUser } = authManager;
    const { openHours } = state.settings.globalEntries;

    if (!openHours?.enabled) {
      return false;
    }

    const { inAppEnabled, tags } = openHours;
    return checkPermission(inAppEnabled, tags, currentUser);
  },
  canAddEditPriceRange() {
    const { currentUser } = authManager;
    const { priceRange } = state.settings.globalEntries;

    if (!priceRange?.enabled) {
      return false;
    }

    const { inAppEnabled, tags } = priceRange;
    return checkPermission(inAppEnabled, tags, currentUser);
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
  hasCustomFieldsAccess(customField) {
    const { currentUser } = authManager;
    if (!currentUser) return false;

    const userTags = getUserTagNames(currentUser);

    if (customField.visibility && customField.visibility.value === constants.CustomFieldVisibilityOptions.TAGS) {
      const fieldTags = customField.visibility.tags || [];
      return fieldTags.some(tag => userTags.includes(tag.tagName));
    }
    return true;
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
      return Promise.resolve({ isSubscribed: true, error: null });
    }

    if (charging.enabled === 'limited' && currentUser) {
      const tagNames = charging.tags.map((t) => t.tagName);
      let userTagNames = [];
      Object.keys(currentUser.tags).forEach((key) => {
        userTagNames = userTagNames.concat(currentUser.tags[key].map((t) => t.tagName));
      });
      if (!userTagNames.some((r) => tagNames.includes(r))) {
        return Promise.resolve({ isSubscribed: true, error: null });
      }
    }

    const subscriptionOptions = charging.subscriptionOptions || [];
    if (subscriptionOptions.length === 0) {
      return Promise.resolve({ isSubscribed: false, error: window.strings.get('general.noSubscriptionsFound').v });
    }

    // Check if platform supports subscriptions before fetching
    if (buildfire.getContext().device.platform === 'web') {
      return Promise.resolve({ isSubscribed: false, error: window.strings.get('general.pwaUnsupported').v });
    }

    // Get available subscriptions and filter options
    return Purchase.getSubscriptions()
      .then((availableSubscriptions) => {
        if (!availableSubscriptions || availableSubscriptions.length === 0) {
          return { isSubscribed: false, error: window.strings.get('general.noSubscriptionsFound').v };
        }

        // Filter subscription options to only include those that exist in available subscriptions
        const validSubscriptionIds = availableSubscriptions.map((sub) => sub.id);
        const validSubscriptionOptions = subscriptionOptions.filter(
          (sub) => sub.subscriptionId && validSubscriptionIds.includes(sub.subscriptionId)
        );

        if (validSubscriptionOptions.length === 0) {
          return { isSubscribed: false, error: window.strings.get('general.noSubscriptionsFound').v };
        }

        // Check if user has purchased any of the valid subscriptions
        const purchaseValidationPromises = validSubscriptionOptions
          .map((sub) => Purchase.checkIsPurchased(sub.subscriptionId));

        return Promise.all(purchaseValidationPromises)
          .then((results) => {
            const hasValidPurchase = results.some((isPurchased) => isPurchased);
            return { isSubscribed: hasValidPurchase, error: null };
          });
      })
      .catch((error) => {
        console.error('Error checking subscription:', error);
        return { isSubscribed: false, error: null };
      });
  }
};
