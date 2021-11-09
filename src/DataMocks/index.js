import Location from './location';
import Category from './category';

// https://www.npmjs.com/package/faker
// https://rawgit.com/Marak/faker.js/master/examples/browser/index.html

const _mock = (entity) => {
  switch (entity) {
    case 'LOCATION':
      return Location();
    case 'CATEGORY':
      return Category();
    default:
      return null;
  }
};

const generate = (entity, count = 1) => [...Array(count)].map(() => _mock(entity));

export default { generate };
