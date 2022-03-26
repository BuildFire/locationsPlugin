/* eslint-disable class-methods-use-this */
import buildfire from "buildfire";

class Analytics {
  static get LIST_VIEW() {
    return "listViewUsed";
  }

  static get MAP_LIST() {
    return "mapListUsed";
  }

  static get LOCATION_BOOKMARK() {
    return "locationBookmarkUsed";
  }

  static get RESULTS_BOOKMARK() {
    return "resultsBookmarkUsed";
  }

  static get LOCATION_EDIT() {
    return "inAppEditUsed";
  }

  static get LOCATION_SHARE() {
    return "locationShareUsed";
  }

  static get LOCATION_DIRECTIONS() {
    return "locationDirectionsUsed";
  }

  static init() {
    this.registerEvent('List View (Used)', this.LIST_VIEW, '');
    this.registerEvent('Map List (Used)', this.MAP_LIST, '');
    this.registerEvent('Location Bookmark (Used)', this.LOCATION_BOOKMARK, '');
    this.registerEvent('Results Bookmark (Used)', this.RESULTS_BOOKMARK, '');
    this.registerEvent('Location In-App Edit (Used)', this.LOCATION_EDIT, '');
    this.registerEvent('Location Share (Used)', this.LOCATION_SHARE, '');
    this.registerEvent('Location Directions (Used)', this.LOCATION_DIRECTIONS, '');
  }

  static registerEvent(title, key, description) {
    buildfire.analytics.registerEvent({ title, key, description },  { silentNotification: true });
  }

  static registerCategoryEvent(categoryId, title) {
    this.registerEvent(`${title} (Category Selected)`, `categories_${categoryId}_selected`, '');
  }

  static registerSubcategoryEvent(subcategoryId, title) {
    this.registerEvent(`${title} (Subcategory Selected)`, `subcategories_${subcategoryId}_selected`, '');
  }

  static registerLocationViewedEvent(locationId, title) {
    this.registerEvent(`${title} (Viewed)`, `locations_${locationId}_viewed`, '');
  }

  static viewed(locationId, metadata = {}) {
    const key = `locations_${locationId}_viewed`;
    buildfire.analytics.trackAction(key, {
      _buildfire: { aggregationValue: 10 },
    });
  }

  static categorySelected(categoryId) {
    const key = `categories_${categoryId}_selected`;
    buildfire.analytics.trackAction(key, {
      _buildfire: { aggregationValue: 10 },
    });
  }

  static subcategorySelected(subcategoryId, metadata = {}) {
    const key = `subcategories_${subcategoryId}_selected`;
    buildfire.analytics.trackAction(key, {
      _buildfire: { aggregationValue: 10 },
    });
  }

  static listViewUsed() {
    buildfire.analytics.trackAction(this.LIST_VIEW);
  }

  static mapListUsed() {
    buildfire.analytics.trackAction(this.MAP_LIST);
  }

  static locationBookmarkUsed() {
    buildfire.analytics.trackAction(this.LOCATION_BOOKMARK);
  }

  static resultsBookmarkUsed() {
    buildfire.analytics.trackAction(this.RESULTS_BOOKMARK);
  }

  static inAppEditUsed() {
    buildfire.analytics.trackAction(this.LOCATION_EDIT);
  }

  static locationShareUsed() {
    buildfire.analytics.trackAction(this.LOCATION_SHARE);
  }

  static locationDirectionsUsed() {
    buildfire.analytics.trackAction(this.LOCATION_DIRECTIONS);
  }
}

export default Analytics;
