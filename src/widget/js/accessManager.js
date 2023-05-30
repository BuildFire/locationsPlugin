import state from './state';

export default {
  canCreateLocations() {
    const { currentUser } = state;
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
  }
};
