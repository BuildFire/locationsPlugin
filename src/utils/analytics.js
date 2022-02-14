/* eslint-disable class-methods-use-this */
import buildfire from "buildfire";

class Analytics {

  static get LIST_VIEW() {
    return "listViewUsed";
  }

  static get MAP_LIST() {
    return "mapListUsed";
  }

  static init() {
    this.registerEvent('List View - used', this.LIST_VIEW, '');
    this.registerEvent('Map List - used', this.MAP_LIST, '');
  }

  static registerEvent(title, key, description) {
    buildfire.analytics.registerEvent({ title, key, description });
  }

  static viewed(locationId, metadata = {}) {
    const key = `locations_${locationId}_viewed`;
    buildfire.analytics.trackAction(key, {
      _buildfire: { aggregationValue: 10 },
    });
  }

  static categorySelected(categoryId) {
    const key = `categories_${categoryId}_selected`;
    buildfire.analytics.trackView(key, {
      _buildfire: { aggregationValue: 10 },
    });
  }

  static subcategorySelected(subcategoryId, metadata = {}) {
    const key = `subcategories_${subcategoryId}_selected`;
    buildfire.analytics.trackView(key, {
      _buildfire: { aggregationValue: 10 },
    });
  }

  static listViewUsed() {
    buildfire.analytics.trackAction(this.LIST_VIEW);
  }

  static mapListUsed() {
    buildfire.analytics.trackAction(this.MAP_LIST);
  }
}

export default Analytics;
