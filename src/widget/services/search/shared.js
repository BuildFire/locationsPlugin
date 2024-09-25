/* eslint-disable max-len */
import Analytics from "../../../utils/analytics";
import { getCurrentDayName, openingNowDate } from "../../../utils/datetime";
import { getCategoriesAndSubCategoriesByName } from "../../js/util/helpers";
import state from "../../js/state";

export const buildSearchCriteria = () => {
  const query = {};
  if (state.searchCriteria.searchValue && state.searchableTitles.length === 0) {
    const { subcategoryIds, categoryIds } = getCategoriesAndSubCategoriesByName(state.searchCriteria.searchValue, state.categories);
    const array1Index = [...categoryIds.map((id) => `c_${id}`), ...subcategoryIds.map((id) => `s_${id}`)];
    query.$or = [
      { "_buildfire.index.text": { $regex: state.searchCriteria.searchValue.toLowerCase(), $options: "i" } },
      { "_buildfire.index.array1.string1": { $in: array1Index } }
    ];
  }

  // categories & subcategories filter
  const categoryIds = [];
  const subcategoryIds = [];
  // eslint-disable-next-line no-restricted-syntax
  for (const key in state.filterElements) {
    if (state.filterElements[key].checked) {
      const selectedSubcategories = state.filterElements[key].subcategories;
      subcategoryIds.push(...selectedSubcategories);
      const category = state.categories.find((elem) => elem.id === key);

      // if all subcategories are selected, then add the category to the categoryIds array
      if (selectedSubcategories.length === category.subcategories.length) {
        categoryIds.push(key);
      }

      Analytics.categorySelected(category.id);
      const subcategories = category.subcategories.filter((elem) => selectedSubcategories.includes(elem.id));
      subcategories.forEach((subcategory) => {
        Analytics.subcategorySelected(subcategory.id);
      });
    }
  }
  if (categoryIds.length > 0
      || subcategoryIds.length > 0
      || state.searchCriteria.priceRange
      || state.searchableTitles.length > 0
      || state.searchCriteria.bookmarked) {
    let array1Index = [...categoryIds.map((id) => `c_${id}`), ...subcategoryIds.map((id) => `s_${id}`)];
    if (state.searchCriteria.priceRange) {
      array1Index.push(`pr_${state.searchCriteria.priceRange}`);
    }

    if (state.searchableTitles.length > 0) {
      array1Index.push(...state.searchableTitles.map((title) => `title_${title.toLowerCase()}`));
    }

    if (state.searchCriteria.bookmarked) {
      array1Index = [...array1Index, ...state.bookmarks.map((b) => `cid_${b.id}`)];
    }

    query["_buildfire.index.array1.string1"] = { $in: array1Index };
  }

  return query;
};

export const buildOpenNowCriteria = () => {
  const query = {};
  query[`openingHours.days.${getCurrentDayName()}.intervals`] = {
    $elemMatch: {
      from: { $lte: openingNowDate() },
      to: { $gt: openingNowDate() }
    }
  };
  query[`openingHours.days.${getCurrentDayName()}.active`] = true;
  return query;
};
