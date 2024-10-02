const isCameraControlVersion = function () {
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
export default isCameraControlVersion;
