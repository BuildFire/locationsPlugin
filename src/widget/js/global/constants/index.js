import MAP_STYLES from './mapStyles';

const getMapStyle = (name) => {
  let style;

  switch (name) {
    case 'nightMode':
      style = MAP_STYLES.NIGHT_MODE;
      break;
    default:
      style = [];
  }

  return style;
};

const getDefaultLocation = () => ({ lat: 32.7182625, lng: -117.1601157 });

const SearchLocationsModes = {
  All: "All",
  UserPosition: "UserPosition",
  AreaRadius: "AreaRadius",
  MyLocations: "MyLocations",
};

const SortingOptions = {
  Distance: "distance",
  Alphabetical: "alphabetical",
  Newest: "newest",
}

const IntroViewVisibilityOptions = {
  ALL: "ALL",
  TAGS: "TAGS",
  NONE: "NONE",
};

const QuickActionsOptions = {
  URL: "URL",
  PHONE: "PHONE",
  EMAIL: "EMAIL",
}

const ContentOptions = {
  TEXT: "TEXT",
  RICH_TEXT: "RICH_TEXT",
  URL: "URL",
  PHONE: "PHONE",
  EMAIL: "EMAIL",
}

export default { getMapStyle, getDefaultLocation, SearchLocationsModes, SortingOptions, IntroViewVisibilityOptions, QuickActionsOptions, ContentOptions, QuickActionsOptions, ContentOptions };
