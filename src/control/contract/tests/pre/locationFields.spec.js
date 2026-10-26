// locationFields: the extra fields people fill in for a location, kept in the settings and made in the control panel only.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
// The plugin allows 10 fields in all, so each spec removes the fields it made once its call is checked.
let made = [];
const make = async (label, section) => {
  const field = await call('createLocationField', { label, section });
  made.push(field.id);
  return field;
};
const cleanUp = async () => {
  const ids = made;
  made = [];
  for (const fieldId of ids) {
    await call('deleteLocationFieldAdvanced', { fieldId }).catch(() => null);
  }
};
const field = jasmine.objectContaining({ id: jasmine.any(String) });

contract.describe('createLocationField', () => {
  beforeEach(() => spyOn(buildfire.messaging, 'sendMessageToWidget'));
  afterEach(cleanUp);

  it('adds a field from its name and section', async () => {
    const created = await call('createLocationField', { label: `Pre field (${contract.host})`, section: 'content' });
    made.push(created.id);
    expect(created).toEqual(jasmine.objectContaining({ id: jasmine.any(String), label: `Pre field (${contract.host})`, section: 'content' }));
  });

  it('adds a field with every option', async () => {
    const created = await call('createLocationField', {
      label: `Pre phone field (${contract.host})`, section: 'quickActions', type: 'PHONE', required: true, allowCustomLabel: true
    });
    made.push(created.id);
    expect(created).toEqual(jasmine.objectContaining({ id: jasmine.any(String), type: 'PHONE', required: true, allowCustomLabel: true }));
  });
});

contract.describe('updateLocationField', () => {
  beforeEach(() => spyOn(buildfire.messaging, 'sendMessageToWidget'));
  afterEach(cleanUp);

  it('renames a field, naming it by its name', async () => {
    await make(`Pre field to rename (${contract.host})`, 'content');
    expect(await call('updateLocationField', { label: `Pre field to rename (${contract.host})`, newLabel: `Pre field renamed (${contract.host})` })).toEqual(field);
  });

  it('changes everything about a field', async () => {
    await make(`Pre field to change (${contract.host})`, 'content');
    expect(await call('updateLocationField', {
      label: `Pre field to change (${contract.host})`, newLabel: `Pre field changed (${contract.host})`, newType: 'RICH_TEXT', required: true, allowCustomLabel: true
    })).toEqual(field);
  });
});

contract.describe('updateLocationFieldAdvanced', () => {
  beforeEach(() => spyOn(buildfire.messaging, 'sendMessageToWidget'));
  afterEach(cleanUp);

  it('changes a field by its id', async () => {
    const { id } = await make(`Pre field to change by id (${contract.host})`, 'quickActions');
    expect(await call('updateLocationFieldAdvanced', { fieldId: id, required: true })).toEqual(field);
    expect(await call('updateLocationFieldAdvanced', {
      fieldId: id, newLabel: `Pre field changed by id (${contract.host})`, newType: 'URL', required: false, allowCustomLabel: true
    })).toEqual(field);
  });
});

contract.describe('deleteLocationField', () => {
  beforeEach(() => spyOn(buildfire.messaging, 'sendMessageToWidget'));

  it('removes a field, naming it by its name', async () => {
    const label = `Pre field to remove (${contract.host})`;
    await call('createLocationField', { label, section: 'content' });
    expect(await call('deleteLocationField', { label })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), deleted: true }));
  });
});

contract.describe('deleteLocationFieldAdvanced', () => {
  beforeEach(() => spyOn(buildfire.messaging, 'sendMessageToWidget'));

  it('removes a field by its id', async () => {
    const { id } = await call('createLocationField', { label: `Pre field to remove by id (${contract.host})`, section: 'content' });
    expect(await call('deleteLocationFieldAdvanced', { fieldId: id })).toEqual(jasmine.objectContaining({ id, deleted: true }));
  });
});

contract.describe('updateLocationFieldOrder', () => {
  beforeEach(() => spyOn(buildfire.messaging, 'sendMessageToWidget'));
  afterEach(cleanUp);

  it('moves a field to the top of its section', async () => {
    await make(`Pre field first (${contract.host})`, 'content');
    await make(`Pre field second (${contract.host})`, 'content');
    expect(await call('updateLocationFieldOrder', { label: `Pre field second (${contract.host})`, position: 1 }))
      .toEqual(jasmine.objectContaining({ section: 'content', fields: jasmine.any(Array) }));
  });
});

contract.describe('updateLocationFieldOrderAdvanced', () => {
  beforeEach(() => spyOn(buildfire.messaging, 'sendMessageToWidget'));
  afterEach(cleanUp);

  it('moves a field by its id', async () => {
    await make(`Pre field first by id (${contract.host})`, 'quickActions');
    const { id } = await make(`Pre field second by id (${contract.host})`, 'quickActions');
    expect(await call('updateLocationFieldOrderAdvanced', { fieldId: id, position: 1 }))
      .toEqual(jasmine.objectContaining({ section: 'quickActions', fields: jasmine.any(Array) }));
  });
});
