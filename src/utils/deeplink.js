import buildfire from "buildfire";

class DeepLink {
  static generateDeeplinkUrl = (location, type) => {
    const link = {};
    link.title = location.title;
    link.description = location.subtitle || undefined;
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
  }

  static registerDeeplink = (location) => {
    buildfire.deeplink.registerDeeplink(
        {
          id: "location-" + location.id,
          name: location.title,
          deeplinkData: {locationId: location.id},
        },
        (err, result) => {
          if (err) {
            console.error(err);
          }
        });
  }

  static unregisterDeeplink = (locationId) => {
    buildfire.deeplink.unregisterDeeplink("location-" + locationId, (err, result) => {
      if (err) {
        console.error(err);
      }
    });
  }
}

export default DeepLink;