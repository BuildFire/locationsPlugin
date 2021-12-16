import buildfire from "buildfire";

const generateDeeplinkUrl = (location, type) => {
  const link = {};
  link.title = location.title;
  link.type = "website";
  link.description = location.description;
  link.imageUrl = location.listImage;

  link.data = {
    locationId: location.id,
    type
  };

  return new Promise((resolve, reject) => {
    buildfire.deeplink.generateUrl(link, (err, result) => {
      if (err) {
        console.error(err);
        reject(err);
      } else {
        //  result.url,
        resolve(result);
      }
    });
  });
};

export default generateDeeplinkUrl;
