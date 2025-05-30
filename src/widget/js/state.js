import authManager from "../../UserAccessControl/authManager";

export default {
  bookmarkLoading: false,
  get sanitizedCurrentUser() {
    if (!authManager.currentUser) return null;
    const sanitizedUser = { ...authManager.currentUser };

    // List of properties to remove
    const propertiesToRemove = [
      "email", "username", "accessToken", "accessTokenExpiresIn",
      "externalApps", "lastUsedIPAddress", "userToken", "loginProviderType",
      "failedAttemptCount",
    ];

    propertiesToRemove.forEach((prop) => {
      if (sanitizedUser.hasOwnProperty(prop)) {
        delete sanitizedUser[prop];
      }
    });

    return sanitizedUser;
  },
  clearLocations() {
    this.listLocations = [];
    this.searchCriteria.page = 0;
    this.searchCriteria.page2 = 0;
    this.fetchingNextPage = false;
    this.fetchingEndReached = false;
    this.fetchingAllNearReached = false;
    this.printOtherLocationMessage = false;
    this.separateListItemsMessageShown = false;
    this.searchableTitles = [];
    this.nearestLocation = null;
    this.isMapIdle = false;
    if (this.maps.map) this.maps.map.clearMarkers();
  },
  maps: {
    map: null,
    detail: null
  },
  breadcrumbs: [],
  introCarousel: null,
  settings: null,
  categories: null,
  userPosition: null,
  selectedLocation: null,
  currentLocation: null,
  searchCriteria: {
    searchValue: '',
    openingNow: false,
    bookmarked: false,
    priceRange: null,
    sort: {
      sortBy: 'distance',
      order: 1
    },
    page: 0,
    page2: 0,
    pageSize: 50,
  },
  pinnedLocations: [],
  listLocations: [],
  nearLocations: [],
  introSort: {
    sortBy: 'distance',
    order: 1
  },
  mapBounds: null,
  firstSearchInit: false,
  fetchingNextPage: false,
  fetchingEndReached: false,
  fetchingAllNearReached: false,
  printOtherLocationMessage: false,
  separateListItemsMessageShown: false,
  filterElements: {},
  currentFilterElements: {},
  searchableTitles: [],
  nearestLocation: null,
  checkNearLocation: true,
  isMapIdle: false,
  firstRender: true,
  bookmarks: [],
  deepLinkData: null,
  viewportHasChanged: false,
};
