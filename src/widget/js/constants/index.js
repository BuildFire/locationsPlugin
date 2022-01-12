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

export default { getMapStyle };
