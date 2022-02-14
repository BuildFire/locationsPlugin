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

  static viewed(title, metadata = {}) {
    title = `${title} - viewed`;
    buildfire.analytics.trackView(title, {
      _buildfire: { aggregationValue: 10 },
    });
  }

  static categorySelected(category) {
    category = `${category} - category selected`;
    buildfire.analytics.trackView(category, {
      _buildfire: { aggregationValue: 10 },
    });
  }

  static subcategorySelected(subcategory, metadata = {}) {
    subcategory = `${subcategory} - subcategory selected`;
    buildfire.analytics.trackView(subcategory, {
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
