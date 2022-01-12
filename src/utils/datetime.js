export const convertTimeToDate = (time) => {
  // const date = new Date();
  // date.setFullYear(2020, 1, 1);
  time = time.split(":");
  const hour = Number(time[0]);
  const min = Number(time[1]);
  // date.setHours(hour, min, 0, 0);
  return new Date(Date.UTC(1970, 0, 1, hour, min));
};

export const convertDateToTime = (date) => {
  const time = new Date(date);
  let hour = time.getUTCHours();
  let mins = time.getUTCMinutes();
  hour = hour < 10 ? `0${hour}` : hour;
  mins = mins < 10 ? `0${mins}` : mins;
  return `${hour}:${mins}`;
};

export const openingNowDate = () => {
  const date = new Date();
  return new Date(Date.UTC(1970, 0, 1, date.getHours(), date.getMinutes()));
};

export const getCurrentDayName = () => {
  const dayNames = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday'
  ];

  const d = new Date();
  return dayNames[d.getDay()];
};
