/**
 * Settings data model
 * @class
 */
export default class Setting {
  /**
   * @param {object} data
   * @constructor
   */
  constructor(data = {}) {
    this.showIntroductoryListView = data.showIntroductoryListView || true;
    this.measurementUnit = data.measurementUnit || 'metric';
    this.introductoryListView = data.introductoryListView || {
      images: [],
      description: null,
      sorting: null
    };
    this.listView = data.listView || {
      defaultSorting: null,
      allowSortByReverseAlphabetical: true,
      allowSortByPriceHighToLow: true,
      allowSortByPriceLowToHigh: true,
      allowSortByViews: true,
      allowSortByDate: true,
      allowSortByRating: true,
    };
    this.filter = data.filter || {
      allowFilterByArea: true,
      allowFilterByBookmarks: true,
      allowFilterByLatest: true
    };
    this.map = data.map || {
      showPointsOfInterest: true,
      initialArea: true,
      offlineAreaSelection: true, // pending
      initialAreaCoordinates: { latitude: null, longitude: null },
      initialAreaString: null
    };
    this.bookmarks = data.bookmarks || {
      enabled: true,
      allowForLocations: true,
      allowForFilters: true
    };
    this.design = data.design ||  {
      listViewPosition: null,
      listViewStyle: null,
      defaultMapStyle: null,
      allowStyleSelection: true,
      detailsMapPosition: null,
      showDetailsCategory: true
    };
    this.owner = data.owner || {};
    this.createdOn = data.createdOn || new Date();
    this.createdBy = data.createdBy || null;
    this.lastUpdatedOn = data.lastUpdatedOn || new Date();
    this.lastUpdatedBy = data.lastUpdatedBy || null;
    this.deletedOn = data.deletedOn || null;
    this.deletedBy = data.deletedBy || null;
    this.isActive = [0, 1].includes(data.isActive) ? data.isActive : 1;
  }

  toJSON() {
    return {
      showIntroductoryListView: this.showIntroductoryListView,
      measurementUnit: this.measurementUnit,
      introductoryListView: this.introductoryListView,
      listView: this.listView,
      filter: this.filter,
      map: this.map,
      bookmarks: this.bookmarks,
      design: this.design,
      owner: this.owner,
      createdOn: this.createdOn,
      createdBy: this.createdBy,
      lastUpdatedOn: this.lastUpdatedOn,
      lastUpdatedBy: this.lastUpdatedBy,
      deletedOn: this.deletedOn,
      deletedBy: this.deletedBy,
      isActive: this.isActive,
      _buildfire: {
        index: {}
      }
    };
  }
}
