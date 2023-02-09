/* eslint-disable no-restricted-syntax */
/* eslint-disable prefer-template */
/* eslint-disable prefer-destructuring */
const csvToArray = (strData, strDelimiter) => {
  // Check to see if the delimiter is defined. If not,
  // then default to comma.
  strDelimiter = strDelimiter || ",";
  // Create a regular expression to parse the CSV values.
  const objPattern = new RegExp(`(\\${strDelimiter}|\\r?\\n|\\r|^)(?:"([^"]*(?:""[^"]*)*)"|([^"\\${strDelimiter}\\r\\n]*))`, "gi");
  // Create an array to hold our data. Give the array
  // a default empty first row.
  const arrData = [
    []
  ];
  // Create an array to hold our individual pattern
  // matching groups.
  let arrMatches = null;
  // Keep looping over the regular expression matches
  // until we can no longer find a match.
  while ((arrMatches = objPattern.exec(strData))) {
    // Get the delimiter that was found.
    const strMatchedDelimiter = arrMatches[1];
    // Check to see if the given delimiter has a length
    // (is not the start of string) and if it matches
    // field delimiter. If id does not, then we know
    // that this delimiter is a row delimiter.
    if (strMatchedDelimiter.length && strMatchedDelimiter !== strDelimiter) {
      // Since we have reached a new row of data,
      // add an empty row to our data array.
      arrData.push([]);
    }
    // Now that we have our delimiter out of the way,
    // let's check to see which kind of value we
    // captured (quoted or unquoted).
    let strMatchedValue;
    if (arrMatches[2]) {
      // We found a quoted value. When we capture
      // this value, unescape any double quotes.
      strMatchedValue = arrMatches[2].replace(new RegExp('""', "g"), '"');
    } else {
      // We found a non-quoted value.
      strMatchedValue = arrMatches[3];
    }
    // Now that we have our value string, let's add
    // it to the data array.
    arrData[arrData.length - 1].push(strMatchedValue);
  }
  if (arrData[arrData.length - 1] && arrData[arrData.length - 1].length < 2) {
    arrData.pop();
  }
  // Return the parsed data.
  return arrData;
};

export const downloadCsv = (csv, name) => {
  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;"
  });
  if (navigator.msSaveBlob) {
    // IE 10+
    navigator.msSaveBlob(blob, name);
  } else {
    var link = document.createElement("a");
    if (link.download !== undefined) {
      var url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", name);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      window.open(
        "data:attachment/csv;charset=utf-8," + encodeURI([csv]),
        "_self"
      ); //for safari only
    }
  }
};

export const jsonToCsv = (objArray, options) => {
  let array;
  try {
    array = typeof objArray != "object" ? JSON.parse(objArray) : objArray;
  } catch (error) {
    throw "Error while reading csv";
  }
  if (!Array.isArray(array) || !array.length) {
    return;
  }
  let csvStr = "";
  let header = null;
  let locationInfoRowHeader = null;
  if (options && options.header) {
    header = options.header;
    for (const key in header) {
      if (header.hasOwnProperty(key)) {
        let value = (header[String(key)] || "").replace(/"/g, '""');
        // remove �
        value = value.replace(/\uFFFD/g, '');
        csvStr += `"${value.trim()}",`;
      }
    }
    if(options.locationInfoRowHeader && array.length == 1 && typeof(array[0]) == 'object'){
      csvStr = csvStr.slice(0, -1) + "\r\n";
      locationInfoRowHeader = options.locationInfoRowHeader;
      for (const key in header) {
        if (locationInfoRowHeader.hasOwnProperty(key)) {
          let value = (locationInfoRowHeader[String(key)] || "").replace(/"/g, '""');
          value = value.replace(/\uFFFD/g, '');
          csvStr += `"${value.trim()}",`;
        }
      }
    }
   
  } else {
    header = array[0];
    for (const key in header) {
      if (header.hasOwnProperty(key)) {
        let value = key.toString().replace(/"/g, '""');
        // remove �
        value = value.replace(/\uFFFD/g, '');
        csvStr += `"${value.trim()}", `;
      }
    }
  }
  csvStr = csvStr.slice(0, -1) + "\r\n";
  // eslint-disable-next-line no-plusplus
  for (let rowNo = 0, rowLen = array.length; rowNo < rowLen; rowNo++) {
    let line = "";
    for (const index in header) {
      if (!array[rowNo][index] || typeof array[rowNo][index] !== "object") {
        const value = (array[rowNo][index] || "").toString();
        line += '"' + value.replace(/"/g, '""').replace(/\uFFFD/g, '') + '",';
      } else {
        const value1 = JSON.parse(JSON.stringify(array[rowNo][index]));
        let line1 = "";
        value1.forEach((val,index) => {
          line1 += (val.title || val.imageUrl);
          line1 += index != value1.length - 1 ? ", " : ""
        });
        line += '"' + line1.replace(/"/g, '""').replace(/\uFFFD/g, '') + '",';
      }
    }
    line = line.slice(0, -1);
    const cReturn = rowLen - 1 === rowNo ? "" : "\r\n";
    csvStr = csvStr + line + cReturn;
  }
  return csvStr;
};

export const csvToJson = (csv, options) => {
  const rows = csvToArray(csv);
  
  if (!Array.isArray(rows) || !rows.length) {
    return;
  }
  let header = rows[0];
  // if (options && options.header) {
  //   header = options.header;
  // }
  if (!Array.isArray(header) || !header.length) {
    return;
  }
  let items = [];
  let dataRowsStartFrom = 1;
  if(rows[1] && rows[1][0] == "[!Reserved-Field!]"){
    dataRowsStartFrom = 2;
  }

  for (let row = dataRowsStartFrom; row < rows.length; row++) {
    let item = {};
    for (let col = 0; col < header.length && col < rows[row].length; col++) {
      let key = header[col];
      item[key] = rows[row][col];
    }
    items.push(item);
  }
  return JSON.stringify(items).replace(/\uFFFD/g, '');
};

export const readCSVFile = (file, callback) => {
  if (!file) {
    callback(null, null);
    return;
  }

  const fileReader = new FileReader();
  fileReader.onload = () => {
    console.log(fileReader.result);
    const rows = JSON.parse(csvToJson(fileReader.result));
    callback(null, rows);
  };

  fileReader.readAsText(file);
};
