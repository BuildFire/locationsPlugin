export const download = (csv, name) => {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
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
  var array;
  try {
    array = typeof objArray != "object" ? JSON.parse(objArray) : objArray;
  } catch (error) {
    throw "Error while reading csv";
  }
  if (!Array.isArray(array) || !array.length) {
    return;
  }
  var csvStr = "";
  if (options && options.header) {
    var header = options.header;
    for (var key in header) {
      if (header.hasOwnProperty(key)) {
        csvStr += '"' + (header[String(key)] || "").replace(/"/g, '""') + '",';
      }
    }
  } else {
    var header = array[0];
    for (var key in header) {
      if (header.hasOwnProperty(key)) {
        var value = key + "";
        csvStr += '"' + value.replace(/"/g, '""') + '",';
      }
    }
  }
  csvStr = csvStr.slice(0, -1) + "\r\n";
  for (var rowNo = 0, rowLen = array.length; rowNo < rowLen; rowNo++) {
    var line = "";
    for (var index in header) {
      if (typeof array[rowNo][index] != "object") {
        var value = (array[rowNo][index] || "") + "";
        line += '"' + value.replace(/"/g, '""') + '",';
      } else {
        var value1 = JSON.parse(angular.toJson(array[rowNo][index]));
        var line1 = "";
        angular.forEach(value1, function (val) {
          line1 += val.iconImageUrl + ",";
        });
        line += '"' + line1.replace(/"/g, '""') + '",';
      }
    }
    line = line.slice(0, -1);
    var cReturn = rowLen - 1 == rowNo ? "" : "\r\n";
    csvStr = csvStr + line + cReturn;
  }
  return csvStr;
};

const csvToArray = (strData, strDelimiter) => {
  // Check to see if the delimiter is defined. If not,
  // then default to comma.
  strDelimiter = strDelimiter || ",";
  // Create a regular expression to parse the CSV values.
  const objPattern = new RegExp(
    // Delimiters.
    "(\\" +
      strDelimiter +
      "|\\r?\\n|\\r|^)" +
      // Quoted fields.
      '(?:"([^"]*(?:""[^"]*)*)"|' +
      // Standard fields.
      '([^"\\' +
      strDelimiter +
      "\\r\\n]*))",
    "gi"
  );
  // Create an array to hold our data. Give the array
  // a default empty first row.
  const arrData = [[]];
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
