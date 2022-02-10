export default {
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
  introSort: {
    sortBy: 'distance',
    order: 1
  },
  mapBounds: null,
  firstSearchInit: false,
  fetchingNextPage: false,
  fetchingEndReached: false,
  filterElements: {},
  currentFilterElements: {},
  searchableTitles: [],
  nearestLocation: null,
  checkNearLocation: true,
  isMapIdle: false,
  firstRender: true
};
