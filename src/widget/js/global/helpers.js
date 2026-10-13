export const generateUUID = () => {
	let dt = new Date().getTime();
	const uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
		const replace = (dt + Math.random() * 16) % 16 | 0;
		dt = Math.floor(dt / 16);
		return (c == "x" ? replace : (replace & 0x3) | 0x8).toString(16);
	});

	return uuid;
};

/**
 * Fire a plugin contract event (see contract/plugin.contract.json). The contract service in this
 * workspace's SDK ships no events API, so every send is feature-checked rather than
 * letting a missing service throw inside a user action.
 */
export const sendContractEvent = (name, data) => {
  if (buildfire.services && buildfire.services.contract && buildfire.services.contract.events) {
    buildfire.services.contract.events.send(name, data);
  }
};

/** A date as contract events send it, or null when there is none. */
export const contractEventDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/** A person as contract events carry them: the stored (sanitized) user's id and name only. */
export const contractEventUser = (user) => (user
  ? { userId: user._id || user.userId || null, displayName: user.displayName || null }
  : null);

/**
 * What every location event says about the location, read off the location already in hand
 * (a saved record's data or a Location model). Values it doesn't have are sent as null.
 */
export const contractLocationDetails = (locationId, location) => {
  const loc = location || {};
  const coordinates = loc.coordinates || {};
  return {
    locationId,
    title: loc.title || null,
    subtitle: loc.subtitle || null,
    address: loc.address || null,
    latitude: typeof coordinates.lat === 'number' ? coordinates.lat : null,
    longitude: typeof coordinates.lng === 'number' ? coordinates.lng : null,
    listImage: loc.listImage || null
  };
};
