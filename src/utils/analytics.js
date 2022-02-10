/* eslint-disable class-methods-use-this */
import buildfire from "buildfire";

class Analytics {

  static get LIST_VIEW() {
    return "listView";
  }

  static get MAP_LIST() {
    return "mapList";
  }

  static init() {
    this.registerEvent(this.LIST_VIEW, 'List View', '');
    this.registerEvent(this.MAP_LIST, 'Map List', '');
  }

  static registerEvent(title, key, description) {
    buildfire.analytics.registerEvent({ title, key, description });
  }

  static viewed(title, metadata = {}) {
    title = `${title} - viewed`;
    buildfire.analytics.trackAction(title);
  }

  static categorySelected(category) {
    category = `${category} - category selected`;
    buildfire.analytics.trackAction(category);
  }

  static subcategorySelected(subcategory, metadata = {}) {
    subcategory = `${subcategory} - subcategory selected`;
    buildfire.analytics.trackAction(subcategory);
  }

  static listViewUsed() {
    buildfire.analytics.trackAction(this.LIST_VIEW);
  }

  static mapListUsed() {
    buildfire.analytics.trackAction(this.MAP_LIST);
  }
}

export default Analytics;
