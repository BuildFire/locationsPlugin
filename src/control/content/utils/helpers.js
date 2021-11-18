export const generateUUID = () => {
  let dt = new Date().getTime();
  const uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const replace = (dt + Math.random() * 16) % 16 | 0;
    dt = Math.floor(dt / 16);
    return (c == "x" ? replace : (replace & 0x3) | 0x8).toString(16);
  });

  return uuid;
};

export const createTemplate = (templateId) => {
  const template = document.getElementById(`${templateId}`);
  return document.importNode(template.content, true);
};
