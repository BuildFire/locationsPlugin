// eslint-disable-next-line max-len
/**
 * Starting from version 3.60 (released in February 2025), Google Maps introduces a new Camera control
 * which replaces the traditional Zoom control as part of the default UI.
 * This version check function  is necessary because the behavior of the controls changes:
 * If the version is 3.60 or higher, the new Camera control will be the default
 * If the version is below 3.60, the legacy Zoom control will still be applicable.
 * By determining the version, this function allows the code to handle the transition smoothly, ensuring compatibility with both
 * the old and new controls.
 */

// eslint-disable-next-line import/prefer-default-export
export const isCameraControlVersion = function () {
  const parseVersion = function (versionString) {
    const parts = versionString.split('.');
    return parts.map((part) => {
      const numericPart = part.replace(/\D/g, ''); // Extract the number
      const suffix = part.replace(/\d/g, ''); // Extract non-numeric suffix (e.g., 'beta')

      return {
        number: parseInt(numericPart, 10) || 0,
        suffix: suffix || null
      };
    });
  };

  const compareVersions = function (currentVersion, requiredVersion) {
    const length = Math.max(currentVersion.length, requiredVersion.length);

    for (let i = 0; i < length; i++) {
      const curr = currentVersion[i] || { number: 0, suffix: null };
      const req = requiredVersion[i] || { number: 0, suffix: null };

      if (curr.number > req.number) return 1;
      if (curr.number < req.number) return -1;

      if (curr.suffix && !req.suffix) return -1; // beta is considered lower than stable
      if (!curr.suffix && req.suffix) return 1;
      if (curr.suffix && req.suffix && curr.suffix > req.suffix) return 1;
      if (curr.suffix && req.suffix && curr.suffix < req.suffix) return -1;
    }

    return 0;
  };
  const VersionCheckService = function () {
    const currentVersionString = google.maps.version;
    const currentVersion = parseVersion(currentVersionString);
    const requiredVersion = parseVersion('3.60');
    return compareVersions(currentVersion, requiredVersion) >= 0;
  };
  return VersionCheckService();
};
