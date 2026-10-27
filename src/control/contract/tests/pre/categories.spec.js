// categories: location categories and the subcategories kept inside them, one block per operation, after the helpers they share.
// Every operation but searchCategories is declared on the control panel only, so its block runs only in the control frame.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));

const PICTURE = 'https://example.com/pre-category-icon.png';
const LIBRARY_ICON = 'glyphicon glyphicon-cutlery';

// Calls nothing here answers, which the contract makes without waiting (the widget refresh, analytics and categoryCreated):
// each spy answers as the real call does. None of them is asserted here.
const answerSideCalls = () => {
  spyOn(buildfire.messaging, 'sendMessageToWidget');
  spyOn(buildfire.analytics, 'registerEvent');
  spyOn(buildfire.services.contract.events, 'send').and.callFake((eventName, data, callback) => (typeof callback === 'function' ? callback(null, []) : undefined));
};

// Only the control panel makes categories, and its run comes first: it makes this one, once, and the app's run finds it.
const forTheApp = 'Pre category for the app';
let madeCategory;
const categoryForTheApp = () => {
  madeCategory = madeCategory || (contract.host === 'control'
    ? call('createCategory', { title: forTheApp, subcategories: 'Pre app subcategory' })
    : call('searchCategories', { title: forTheApp }).then(({ result: [record] }) => record
      || Promise.reject(new Error(`no category titled "${forTheApp}": the control run makes it`))));
  return madeCategory;
};

// A category as createCategory, updateCategory and updateSubcategoryOrder return it.
const aCategory = (details) => jasmine.objectContaining({ id: jasmine.any(String), subcategories: jasmine.any(Array), ...details });
const aSubcategory = (details) => jasmine.objectContaining({ id: jasmine.any(String), ...details });
// A search result holding the category with that title.
const listing = (title) => jasmine.objectContaining({
  result: jasmine.arrayContaining([jasmine.objectContaining({ id: jasmine.any(String), data: jasmine.objectContaining({ title }) })]),
  totalRecord: jasmine.any(Number),
});
// A batch's declared result: one entry per entry given, in order, each with its id, and every one applied.
const batchOf = (key, ids) => jasmine.objectContaining({
  [key]: ids.map((id, index) => jasmine.objectContaining({ index, id })),
  succeeded: ids.length,
  failed: 0,
});
const createCategory = (title, details = {}) => call('createCategory', { title, ...details });

contract.describe('searchCategories', () => {
  beforeEach(answerSideCalls);

  it('finds a category by its title', async () => {
    await categoryForTheApp();
    expect(await call('searchCategories', { title: forTheApp })).toEqual(listing(forTheApp));
  });

  it('finds a category by its title, on the first page', async () => {
    await categoryForTheApp();
    expect(await call('searchCategories', { title: forTheApp, page: 0 })).toEqual(listing(forTheApp));
  });
});

// controlBackground only, as every block below: these blocks run in the control frame.
contract.describe('createCategory', () => {
  beforeEach(answerSideCalls);

  it('creates a category from its title', async () => {
    const title = `Pre category (${contract.host})`;
    expect(await createCategory(title)).toEqual(aCategory({ title }));
  });

  it('creates a category with a picture and subcategories', async () => {
    const title = `Pre category with a picture (${contract.host})`;
    expect(await createCategory(title, { icon: [PICTURE], subcategories: 'Pre pizza, Pre burgers' })).toEqual(aCategory({
      title,
      iconUrl: PICTURE,
      subcategories: [aSubcategory({ title: 'Pre pizza' }), aSubcategory({ title: 'Pre burgers' })],
    }));
  });

  it('creates a category with a library icon', async () => {
    const title = `Pre category with a library icon (${contract.host})`;
    expect(await createCategory(title, { iconClassName: LIBRARY_ICON })).toEqual(aCategory({ title, iconClassName: LIBRARY_ICON }));
  });
});

contract.describe('createCategoriesAdvanced', () => {
  beforeEach(answerSideCalls);

  it('creates several categories at once', async () => {
    const categories = [
      { title: `Pre batch category one (${contract.host})` },
      { title: `Pre batch category two (${contract.host})`, icon: [PICTURE], subcategories: 'Pre batch subcategory' },
      { title: `Pre batch category three (${contract.host})`, iconClassName: LIBRARY_ICON },
    ];
    expect(await call('createCategoriesAdvanced', { categories }))
      .toEqual(batchOf('categories', [jasmine.any(String), jasmine.any(String), jasmine.any(String)]));
  });
});

contract.describe('updateCategory', () => {
  beforeEach(answerSideCalls);

  it('renames a category, naming it by its title', async () => {
    const title = `Pre category to rename (${contract.host})`;
    const newTitle = `Pre category renamed (${contract.host})`;
    const { id } = await createCategory(title);
    expect(await call('updateCategory', { title, newTitle })).toEqual(aCategory({ id, title: newTitle }));
  });

  it("changes a category's title and picture, naming it by its title", async () => {
    const title = `Pre category to update (${contract.host})`;
    const newTitle = `Pre category updated (${contract.host})`;
    const { id } = await createCategory(title, { iconClassName: LIBRARY_ICON });
    expect(await call('updateCategory', { title, newTitle, newIcon: [PICTURE] })).toEqual(aCategory({ id, title: newTitle, iconUrl: PICTURE }));
  });

  it("changes a category's library icon, naming it by its title", async () => {
    const title = `Pre category to give an icon (${contract.host})`;
    const { id } = await createCategory(title, { icon: [PICTURE] });
    expect(await call('updateCategory', { title, newIconClassName: LIBRARY_ICON })).toEqual(aCategory({ id, title, iconClassName: LIBRARY_ICON }));
  });
});

contract.describe('updateCategoryAdvanced', () => {
  beforeEach(answerSideCalls);

  it('renames a category by its id', async () => {
    const newTitle = `Pre category renamed by id (${contract.host})`;
    const { id } = await createCategory(`Pre category to rename by id (${contract.host})`);
    expect(await call('updateCategoryAdvanced', { categoryId: id, newTitle })).toEqual(aCategory({ id, title: newTitle }));
  });

  it("changes a category's title and picture by its id", async () => {
    const newTitle = `Pre category updated by id (${contract.host})`;
    const { id } = await createCategory(`Pre category to update by id (${contract.host})`);
    expect(await call('updateCategoryAdvanced', { categoryId: id, newTitle, newIcon: [PICTURE] }))
      .toEqual(aCategory({ id, title: newTitle, iconUrl: PICTURE }));
  });

  it("changes a category's library icon by its id", async () => {
    const title = `Pre category to give an icon by id (${contract.host})`;
    const { id } = await createCategory(title);
    expect(await call('updateCategoryAdvanced', { categoryId: id, newIconClassName: LIBRARY_ICON }))
      .toEqual(aCategory({ id, title, iconClassName: LIBRARY_ICON }));
  });
});

contract.describe('updateCategoriesAdvanced', () => {
  beforeEach(answerSideCalls);

  it('changes several categories at once', async () => {
    const one = await createCategory(`Pre batch category to update one (${contract.host})`);
    const two = await createCategory(`Pre batch category to update two (${contract.host})`);
    const categories = [
      { categoryId: one.id, newTitle: `Pre batch category updated one (${contract.host})`, newIcon: [PICTURE] },
      { categoryId: two.id, newIconClassName: LIBRARY_ICON },
    ];
    expect(await call('updateCategoriesAdvanced', { categories })).toEqual(batchOf('categories', [one.id, two.id]));
  });
});

contract.describe('deleteCategory', () => {
  beforeEach(answerSideCalls);

  it('removes a category, naming it by its title', async () => {
    const title = `Pre category to delete (${contract.host})`;
    const { id } = await createCategory(title);
    expect(await call('deleteCategory', { title })).toEqual(jasmine.objectContaining({ id, deletedOn: jasmine.any(String) }));
  });
});

contract.describe('deleteCategoryAdvanced', () => {
  beforeEach(answerSideCalls);

  it('removes a category by its id', async () => {
    const { id } = await createCategory(`Pre category to delete by id (${contract.host})`);
    expect(await call('deleteCategoryAdvanced', { categoryId: id })).toEqual(jasmine.objectContaining({ id, deletedOn: jasmine.any(String) }));
  });
});

contract.describe('deleteCategoriesAdvanced', () => {
  beforeEach(answerSideCalls);

  it('removes several categories at once', async () => {
    const one = await createCategory(`Pre batch category to delete one (${contract.host})`);
    const two = await createCategory(`Pre batch category to delete two (${contract.host})`);
    expect(await call('deleteCategoriesAdvanced', { categories: [{ categoryId: one.id }, { categoryId: two.id }] }))
      .toEqual(batchOf('categories', [one.id, two.id]));
  });
});

contract.describe('createSubcategory', () => {
  beforeEach(answerSideCalls);

  it('adds a subcategory, naming its category by its title', async () => {
    const categoryTitle = `Pre category for a subcategory (${contract.host})`;
    const { id } = await createCategory(categoryTitle);
    expect(await call('createSubcategory', { categoryTitle, subcategoryTitle: 'Pre salads' }))
      .toEqual(aSubcategory({ categoryId: id, title: 'Pre salads' }));
  });

  it('adds a subcategory with a picture', async () => {
    const categoryTitle = `Pre category for a subcategory with a picture (${contract.host})`;
    const { id } = await createCategory(categoryTitle);
    expect(await call('createSubcategory', { categoryTitle, subcategoryTitle: 'Pre soups', icon: [PICTURE] }))
      .toEqual(aSubcategory({ categoryId: id, title: 'Pre soups', iconUrl: PICTURE }));
  });

  it('adds a subcategory with a library icon', async () => {
    const categoryTitle = `Pre category for a subcategory with an icon (${contract.host})`;
    const { id } = await createCategory(categoryTitle);
    expect(await call('createSubcategory', { categoryTitle, subcategoryTitle: 'Pre desserts', iconClassName: LIBRARY_ICON }))
      .toEqual(aSubcategory({ categoryId: id, title: 'Pre desserts', iconClassName: LIBRARY_ICON }));
  });
});

contract.describe('createSubcategoryAdvanced', () => {
  beforeEach(answerSideCalls);

  it("adds a subcategory by its category's id", async () => {
    const { id } = await createCategory(`Pre category for a subcategory by id (${contract.host})`);
    expect(await call('createSubcategoryAdvanced', { categoryId: id, subcategoryTitle: 'Pre salads' }))
      .toEqual(aSubcategory({ categoryId: id, title: 'Pre salads' }));
  });

  it("adds a subcategory with a picture by its category's id", async () => {
    const { id } = await createCategory(`Pre category for a subcategory with a picture by id (${contract.host})`);
    expect(await call('createSubcategoryAdvanced', { categoryId: id, subcategoryTitle: 'Pre soups', icon: [PICTURE] }))
      .toEqual(aSubcategory({ categoryId: id, title: 'Pre soups', iconUrl: PICTURE }));
  });

  it("adds a subcategory with a library icon by its category's id", async () => {
    const { id } = await createCategory(`Pre category for a subcategory with an icon by id (${contract.host})`);
    expect(await call('createSubcategoryAdvanced', { categoryId: id, subcategoryTitle: 'Pre desserts', iconClassName: LIBRARY_ICON }))
      .toEqual(aSubcategory({ categoryId: id, title: 'Pre desserts', iconClassName: LIBRARY_ICON }));
  });
});

contract.describe('createSubcategoriesAdvanced', () => {
  beforeEach(answerSideCalls);

  it('adds several subcategories at once', async () => {
    const { id } = await createCategory(`Pre category for batch subcategories (${contract.host})`);
    const subcategories = [
      { categoryId: id, subcategoryTitle: 'Pre batch salads' },
      { categoryId: id, subcategoryTitle: 'Pre batch soups', icon: [PICTURE] },
      { categoryId: id, subcategoryTitle: 'Pre batch desserts', iconClassName: LIBRARY_ICON },
    ];
    expect(await call('createSubcategoriesAdvanced', { subcategories }))
      .toEqual(batchOf('subcategories', [jasmine.any(String), jasmine.any(String), jasmine.any(String)]));
  });
});

contract.describe('updateSubcategory', () => {
  beforeEach(answerSideCalls);

  it('renames a subcategory, naming it and its category by their titles', async () => {
    const categoryTitle = `Pre category with a subcategory to rename (${contract.host})`;
    const { id, subcategories: [sub] } = await createCategory(categoryTitle, { subcategories: 'Pre salads' });
    expect(await call('updateSubcategory', { categoryTitle, subcategoryTitle: 'Pre salads', newTitle: 'Pre green salads' }))
      .toEqual(aSubcategory({ categoryId: id, id: sub.id, title: 'Pre green salads' }));
  });

  it("changes a subcategory's title and picture, naming it and its category by their titles", async () => {
    const categoryTitle = `Pre category with a subcategory to update (${contract.host})`;
    const { id, subcategories: [sub] } = await createCategory(categoryTitle, { subcategories: 'Pre soups' });
    expect(await call('updateSubcategory', {
      categoryTitle, subcategoryTitle: 'Pre soups', newTitle: 'Pre hot soups', newIcon: [PICTURE],
    })).toEqual(aSubcategory({ categoryId: id, id: sub.id, title: 'Pre hot soups', iconUrl: PICTURE }));
  });

  it("changes a subcategory's library icon, naming it and its category by their titles", async () => {
    const categoryTitle = `Pre category with a subcategory to give an icon (${contract.host})`;
    const { id, subcategories: [sub] } = await createCategory(categoryTitle, { subcategories: 'Pre desserts' });
    expect(await call('updateSubcategory', { categoryTitle, subcategoryTitle: 'Pre desserts', newIconClassName: LIBRARY_ICON }))
      .toEqual(aSubcategory({ categoryId: id, id: sub.id, title: 'Pre desserts', iconClassName: LIBRARY_ICON }));
  });
});

contract.describe('updateSubcategoryAdvanced', () => {
  beforeEach(answerSideCalls);

  it('renames a subcategory by its and its category’s ids', async () => {
    const { id, subcategories: [sub] } = await createCategory(`Pre category with a subcategory to rename by id (${contract.host})`, { subcategories: 'Pre salads' });
    expect(await call('updateSubcategoryAdvanced', { categoryId: id, subcategoryId: sub.id, newTitle: 'Pre green salads' }))
      .toEqual(aSubcategory({ categoryId: id, id: sub.id, title: 'Pre green salads' }));
  });

  it('changes a subcategory’s title and picture by its and its category’s ids', async () => {
    const { id, subcategories: [sub] } = await createCategory(`Pre category with a subcategory to update by id (${contract.host})`, { subcategories: 'Pre soups' });
    expect(await call('updateSubcategoryAdvanced', {
      categoryId: id, subcategoryId: sub.id, newTitle: 'Pre hot soups', newIcon: [PICTURE],
    })).toEqual(aSubcategory({ categoryId: id, id: sub.id, title: 'Pre hot soups', iconUrl: PICTURE }));
  });

  it('changes a subcategory’s library icon by its and its category’s ids', async () => {
    const { id, subcategories: [sub] } = await createCategory(`Pre category with a subcategory to give an icon by id (${contract.host})`, { subcategories: 'Pre desserts' });
    expect(await call('updateSubcategoryAdvanced', { categoryId: id, subcategoryId: sub.id, newIconClassName: LIBRARY_ICON }))
      .toEqual(aSubcategory({ categoryId: id, id: sub.id, iconClassName: LIBRARY_ICON }));
  });
});

contract.describe('updateSubcategoriesAdvanced', () => {
  beforeEach(answerSideCalls);

  it('changes several subcategories at once', async () => {
    const { id, subcategories } = await createCategory(`Pre category with batch subcategories to update (${contract.host})`, {
      subcategories: 'Pre batch salads, Pre batch soups',
    });
    const entries = [
      { categoryId: id, subcategoryId: subcategories[0].id, newTitle: 'Pre batch green salads', newIcon: [PICTURE] },
      { categoryId: id, subcategoryId: subcategories[1].id, newIconClassName: LIBRARY_ICON },
    ];
    expect(await call('updateSubcategoriesAdvanced', { subcategories: entries }))
      .toEqual(batchOf('subcategories', subcategories.map((sub) => sub.id)));
  });
});

contract.describe('deleteSubcategory', () => {
  beforeEach(answerSideCalls);

  it('removes a subcategory, naming it and its category by their titles', async () => {
    const categoryTitle = `Pre category with a subcategory to delete (${contract.host})`;
    const { id, subcategories: [sub] } = await createCategory(categoryTitle, { subcategories: 'Pre salads, Pre soups' });
    expect(await call('deleteSubcategory', { categoryTitle, subcategoryTitle: 'Pre salads' }))
      .toEqual(jasmine.objectContaining({ categoryId: id, id: sub.id }));
  });
});

contract.describe('deleteSubcategoryAdvanced', () => {
  beforeEach(answerSideCalls);

  it('removes a subcategory by its and its category’s ids', async () => {
    const { id, subcategories: [sub] } = await createCategory(`Pre category with a subcategory to delete by id (${contract.host})`, {
      subcategories: 'Pre salads, Pre soups',
    });
    expect(await call('deleteSubcategoryAdvanced', { categoryId: id, subcategoryId: sub.id }))
      .toEqual(jasmine.objectContaining({ categoryId: id, id: sub.id }));
  });
});

contract.describe('deleteSubcategoriesAdvanced', () => {
  beforeEach(answerSideCalls);

  it('removes several subcategories at once', async () => {
    const { id, subcategories } = await createCategory(`Pre category with batch subcategories to delete (${contract.host})`, {
      subcategories: 'Pre batch salads, Pre batch soups, Pre batch desserts',
    });
    const entries = subcategories.slice(0, 2).map((sub) => ({ categoryId: id, subcategoryId: sub.id }));
    expect(await call('deleteSubcategoriesAdvanced', { subcategories: entries }))
      .toEqual(batchOf('subcategories', entries.map((entry) => entry.subcategoryId)));
  });
});

contract.describe('updateSubcategoryOrder', () => {
  beforeEach(answerSideCalls);

  it('moves a subcategory to the top, naming it and its category by their titles', async () => {
    const categoryTitle = `Pre category with subcategories to reorder (${contract.host})`;
    const { id } = await createCategory(categoryTitle, { subcategories: 'Pre first, Pre second' });
    expect(await call('updateSubcategoryOrder', { categoryTitle, subcategoryTitle: 'Pre second', position: 1 })).toEqual(aCategory({
      id, title: categoryTitle, subcategories: [aSubcategory({ title: 'Pre second' }), aSubcategory({ title: 'Pre first' })],
    }));
  });
});

contract.describe('updateSubcategoryOrderAdvanced', () => {
  beforeEach(answerSideCalls);

  it('moves a subcategory to the top by its and its category’s ids', async () => {
    const title = `Pre category with subcategories to reorder by id (${contract.host})`;
    const { id, subcategories } = await createCategory(title, { subcategories: 'Pre first, Pre second' });
    expect(await call('updateSubcategoryOrderAdvanced', { categoryId: id, subcategoryId: subcategories[1].id, position: 1 })).toEqual(aCategory({
      id, title, subcategories: [aSubcategory({ id: subcategories[1].id }), aSubcategory({ id: subcategories[0].id })],
    }));
  });
});
