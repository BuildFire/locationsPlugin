import faker from 'faker';
import Category from '../entities/Category';

function instance() {
  const payload = {
    title: faker.random.words(),
    iconUrl: faker.random.image(),
    iconClassName: 'fmd_good',
    quickAccess: faker.random.arrayElement([0, 1]),
    subcategories: [{ title: faker.random.words, icon: 'fmd_good' }],
    createdOn: faker.date.past(),
    createdBy: faker.random.number(),
    lastUpdatedOn: faker.date.past(),
    lastUpdatedBy: faker.random.number(),
    deletedOn: undefined,
    deletedBy: undefined,
    isActive: true,
    get _buildfire() {
      return {
        index: {
          string1: this.title.toLowerCase(),
        }
      };
    }
  };

  return new Category(payload).toJSON();
}

export default instance;
