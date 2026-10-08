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
