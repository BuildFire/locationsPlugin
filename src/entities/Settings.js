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
    this.showIntroductoryListView = typeof data.showIntroductoryListView === 'undefined' ? true : data.showIntroductoryListView;
    this.measurementUnit = data.measurementUnit || 'metric';
    this.introductoryListView = data.introductoryListView || {
      images: [],
      description: null,
      sorting: null,
      searchOptions: {
        mode: null,
        areaRadiusOptions: {}
      }
    };
    this.chat = data.chat || {
      allowChat: true
    };
    this.sorting = data.sorting || {
      defaultSorting: 'distance',
      hideSorting: false,
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
      allowFilterByBookmarks: false,
      hideOpeningHoursFilter: false,
      hidePriceFilter: false,
    };
    this.map = data.map || {
      distanceUnit: 'metric',
      initialArea: true,
      offlineAreaSelection: true, // pending
      initialAreaCoordinates: { lat: null, lng: null },
      initialAreaDisplayAddress: null
    };
    this.bookmarks = data.bookmarks || {
      enabled: true,
      allowForLocations: true,
      allowForFilters: true
    };
    this.design = data.design ||  {
      listViewPosition: 'collapsed',
      listViewStyle: 'backgroundImage',
      defaultMapType: 'streets',
      enableMapTerrainView: false,
      hideQuickFilter: false,
      allowStyleSelection: true,
      detailsMapPosition: 'top',
      showDetailsCategory: true,
      showContributorName: false,
    };
    this.globalEntries = data.globalEntries || {
      locations: {
        allowAdding:  'none', // all || none || limited
        tags: [],
      },
      photos: {
        allowAdding: 'none', // all || none || limited
        tags: [],
      },
      allowOpenHours: true,
      allowPriceRange: true,
    };
    this.globalEditors = data.globalEditors || {
      enabled: true,
      allowLocationCreatorsToEdit: true,
      tags: [],
      users: []
    };
    this.locationEditors = data.locationEditors || {
      enabled: true,
      time: "12H"
    };
    this.categoriesSortBy =  data.categoriesSortBy || "Asc";
    this.createdOn = data.createdOn || new Date();
    this.createdBy = data.createdBy || null;
    this.lastUpdatedOn = data.lastUpdatedOn || new Date();
    this.lastUpdatedBy = data.lastUpdatedBy || null;
    this.deletedOn = data.deletedOn || null;
    this.deletedBy = data.deletedBy || null;
    this.isActive = [0, 1].includes(data.isActive) ? data.isActive : 1;

    if (typeof this.globalEditors.allowLocationCreatorsToEdit === 'undefined') {
      this.globalEditors.allowLocationCreatorsToEdit = true;
    }
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
      globalEntries: this.globalEntries,
      globalEditors: this.globalEditors,
      locationEditors: this.locationEditors,
      categoriesSortBy: this.categoriesSortBy,
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
