/**
 * Settings data model
 * @class
 */
export default class Settings {
  /**
   * @param {object} data
   * @constructor
   */
  constructor(data = {}) {
    this.showIntroductoryListView = typeof data.showIntroductoryListView === undefined? true : data.showIntroductoryListView;
    this.measurementUnit = data.measurementUnit || 'metric';
    this.introductoryListView = data.introductoryListView || {
      images: [],
      description: null,
      sorting: null
    };
    this.chat = data.chat || {
      allowChat: true
    }
    this.sorting = data.sorting || {
      defaultSorting: 'distance',
      allowSortByReverseAlphabetical: true,
      allowSortByNearest: true,
      allowSortByPriceLowToHigh: true,
      allowSortByPriceHighToLow: true,
      allowSortByDate: true,
      allowSortByRating: true,
      allowSortByViews: true,
    };
    this.filter = data.filter || {
      allowFilterByArea: true,
      allowFilterByLatest: true,
      // allowFilterByBookmarks: true,
    };
    this.map = data.map || {
      distanceUnit: 'metric',
      showPointsOfInterest: true,
      initialArea: true,
      offlineAreaSelection: true, // pending
      initialAreaCoordinates: { lat: null, lng: null },
      initialAreaString: null
    };
    this.bookmarks = data.bookmarks || {
      enabled: true,
      allowForLocations: true,
      allowForFilters: true
    };
    this.design = data.design ||  {
      listViewPosition: 'expanded',
      listViewStyle: 'backgroundImage',
      defaultMapStyle: 'light',
      defaultMapType: 'streets',
      enableMapTerrainView: false,
      allowStyleSelection: true,
      detailsMapPosition: 'top',
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
      chat: this.chat,
      sorting: this.sorting,
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
