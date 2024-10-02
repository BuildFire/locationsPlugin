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
};

export default { getMapStyle, getDefaultLocation, SearchLocationsModes };
