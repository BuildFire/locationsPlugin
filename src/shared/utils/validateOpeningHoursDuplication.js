const _isLocationTimeDuplicated = (intervals) => {
    const fromTime = [];
    const toTime = [];
    let isValid = true;
    intervals.forEach((element) => {
      const timeFrom = new Date(element.from).getUTCHours();
      const timeTo = new Date(element.to).getUTCHours();
      if (fromTime.includes(timeFrom) || toTime.includes(timeTo)) {
        isValid = false;
      }
      fromTime.push(timeFrom);
      toTime.push(timeTo);
    });
    return isValid;
};
  
const validateOpeningHoursDuplication = (openingHours) => {
    let isValid = true;
    Object.entries(openingHours.days).forEach((element) => {
      const timeday = element[1];
      if (isValid && timeday.intervals.length > 1) {
        isValid = _isLocationTimeDuplicated(timeday.intervals);
      }
    });
    return isValid;
};

export default validateOpeningHoursDuplication;