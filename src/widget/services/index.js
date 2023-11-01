/* eslint-disable max-len */
import state from "../js/state";

export const calculateLocationDistance = (address) => {
  const mainPoint = state.userPosition;
  if (!mainPoint) return null;

  const destination = { latitude: address.lat, longitude: address.lng };
  const distance = buildfire.geo.calculateDistance(mainPoint, destination, { decimalPlaces: 5 });

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
