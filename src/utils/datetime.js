export const convertTimeToDate = (time) => {
  const date = new Date();
  date.setFullYear(2020, 1, 1);
  time = time.split(":");
  const hour = Number(time[0]);
  const min = Number(time[1]);
  date.setHours(hour, min, 0, 0);
  return new Date(date);
};

export const convertDateToTime = (date) => {
  let time = new Date(date).toTimeString();
  time = time.split(":", 2).join(":");
  return time;
};

export const openingNowDate = () => {
  const date = new Date();
  date.setFullYear(2020, 1, 1);
  return new Date(date);
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
