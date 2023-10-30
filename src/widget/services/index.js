/* eslint-disable max-len */
import state from "../js/state";

export const calculateLocationDistance = (address) => {
  const { userPosition } = state;
  if (!userPosition) return null;

  const destination = { latitude: address.lat, longitude: address.lng };
  const distance = buildfire.geo.calculateDistance(userPosition, destination, { decimalPlaces: 5 });

  return distance;
};

export const getCategoriesAndSubCategoriesByName = (name) => {
  name = name.toLowerCase();
  const subcategoryIds = [];
  const categoryIds = [];

  state.categories.forEach((category) => {
    if (name === category.title.toLowerCase()) {
      categoryIds.push(category.id);
    }

    category.subcategories.forEach((subcategory) => {
      if (name === subcategory.title.toLowerCase()) {
        subcategoryIds.push(subcategory.id);
      }
    });
  });

  return { subcategoryIds, categoryIds };
};

export const setDefaultSorting = () => {
  const { showIntroductoryListView, introductoryListView, sorting } = state.settings;
  if (showIntroductoryListView && introductoryListView.sorting) {
    if (introductoryListView.sorting === 'distance') {
      state.introSort = { sortBy: 'distance', order: 1 };
    } else if (introductoryListView.sorting === 'alphabetical') {
      state.introSort = { sortBy: '_buildfire.index.text', order: 1 };
    } else if (introductoryListView.sorting === 'newest') {
      state.introSort = { sortBy: '_buildfire.index.date1', order: -1 };
    }
  }

  if (sorting.defaultSorting === 'distance') {
    state.searchCriteria.sort = { sortBy: 'distance', order: 1 };
  } else if (sorting.defaultSorting === 'alphabetical') {
    state.searchCriteria.sort = { sortBy: '_buildfire.index.text', order: 1 };
  }
};

export const setSortMode = (sortType) => {
  if (sortType === 'distance') {
    state.searchCriteria.sort = { sortBy: 'distance', order: 1 };
  } else if (sortType === 'A-Z') {
    state.searchCriteria.sort = { sortBy: '_buildfire.index.text', order: 1 };
  } else if (sortType === 'Z-A') {
    state.searchCriteria.sort = { sortBy: '_buildfire.index.text', order: -1 };
  } else if (sortType === 'date') {
    state.searchCriteria.sort = { sortBy: '_buildfire.index.date1', order: 1 };
  } else if (sortType === 'price-low-high') {
    state.searchCriteria.sort = { sortBy: 'price.range', order: -1 };
  } else if (sortType === 'price-high-low') {
    state.searchCriteria.sort = { sortBy: 'price.range', order: 1 };
  } else if (sortType === 'rating') {
    state.searchCriteria.sort = { sortBy: 'rating.average', order: -1 };
  } else if (sortType === 'views') {
    state.searchCriteria.sort = { sortBy: 'views', order: 1 };
  }
};
